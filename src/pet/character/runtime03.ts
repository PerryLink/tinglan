/**
 * FCI 0.3 runtime preview: consumes the declaration blocks for a character
 * (currently Tinglan) without rendering. This is intentionally headless and
 * deterministic so the page/runtime can adopt it later:
 *
 *   zones       pointer canvas coords -> interaction event
 *   idle        weighted micro-action scheduler (anti-repeat + conditions)
 *   priority    rule priority / interrupt / after / timeout / cooldown
 *   responses   presentation override + voice line reference
 *   voice gate  L0–L3, cooldowns/quotas/line dedupe, mute, focus/quiet rules
 *
 * No code execution, no network, no audio playback; all data comes from the
 * validated FCI 0.3 document and voice-line library.
 */
import type {
  BehaviorProfileV03,
  BehaviorRuleV03,
  BehaviorStateV03,
  CharacterDocumentV03,
  IdleVariant,
  ResponseCondition,
  ResponseSpec,
  VoiceLineLibrary,
  ZoneSpec,
} from './v03.ts'

export type RuntimeLevel = 'L0' | 'L1' | 'L2' | 'L3'

export interface RuntimeContext {
  /** Monotonic ms clock; required for deterministic tests. */
  nowMs: number
  muted?: boolean
  briefAvailable?: boolean
  focus?: number
  energy?: number
  mood?: number
  /** Host capability ids (e.g. `brief`, `tts`). */
  capabilities?: string[]
}

export interface RuntimeDecision {
  event: string
  state: string
  tag: string
  priority: number
  ruleIndex: number
  ignored?: boolean
  reason?: string
  /** Presentation selected for this event (response block / rule fields). */
  response?: ResponseSpec
  voiceLineId?: string
  sfx?: string
  emote?: string
}

export interface VoiceGateResult {
  allowed: boolean
  level: RuntimeLevel
  lineId?: string
  text?: string
  reason?: string
}

export interface CharacterRuntime03Options {
  /** Seeded PRNG; defaults to mulberry32(1). */
  rng?: () => number
  /** Idle scheduler global interval window in ms. */
  idleIntervalMs?: [number, number]
  initialState?: string
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value]
}

function inRange(value: number | undefined, range: { min?: number; max?: number } | undefined): boolean {
  if (!range) return true
  if (typeof value !== 'number') return false
  if (range.min !== undefined && value < range.min) return false
  if (range.max !== undefined && value > range.max) return false
  return true
}

function periodIdAt(document: CharacterDocumentV03, nowMs: number): string | undefined {
  const d = new Date(nowMs)
  const minute = d.getHours() * 60 + d.getMinutes()
  for (const period of document.timeOfDay?.periods ?? []) {
    const [fh, fm] = period.from.split(':').map(Number)
    const [th, tm] = period.to.split(':').map(Number)
    if (fh === undefined || fm === undefined || th === undefined || tm === undefined) continue
    const from = fh * 60 + fm
    const to = th * 60 + tm
    if (minute >= from && minute < to) return period.id
  }
  return undefined
}

function pointInRect(x: number, y: number, shape: { x: number; y: number; w: number; h: number }): boolean {
  return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h
}

function pointInPolygon(x: number, y: number, points: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (!a || !b) continue
    const [xi, yi] = a
    const [xj, yj] = b
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function zoneArea(zone: ZoneSpec): number {
  if (zone.shape.type === 'rect') return zone.shape.w * zone.shape.h
  let area = 0
  const pts = zone.shape.points
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a && b) area += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(area) / 2
}

export class CharacterRuntime03 {
  readonly document: CharacterDocumentV03
  readonly behavior: BehaviorProfileV03
  readonly voiceLines?: VoiceLineLibrary
  state: string
  tag: string
  private readonly rng: () => number
  private readonly idleInterval: [number, number]
  private stateSince = 0
  private lastInteractionAt = 0
  private lastIdleAt = 0
  private readonly ruleCooldownUntil = new Map<number, number>()
  private readonly idleHistory: string[] = []
  private readonly speakTimes: number[] = []
  private readonly lastLineAt = new Map<string, number>()
  private lastLevel: RuntimeLevel = 'L0'
  private pending: { state: string; tag: string; event: string; priority: number } | null = null
  private lastSpeakAt = -Infinity
  private dayKey = ''
  private dayCount = 0

  constructor(document: CharacterDocumentV03, behavior: BehaviorProfileV03, voiceLines?: VoiceLineLibrary, options: CharacterRuntime03Options = {}) {
    this.document = document
    this.behavior = behavior
    this.voiceLines = voiceLines
    this.rng = options.rng ?? mulberry32(1)
    this.idleInterval = options.idleIntervalMs ?? [12_000, 30_000]
    const initial = options.initialState ?? 'idle'
    const state = behavior.states[initial]
    if (!state) throw new Error(`initial state "${initial}" is not declared`)
    this.state = initial
    this.tag = state.tag
  }

  private currentState(): BehaviorStateV03 | undefined {
    return this.behavior.states[this.state]
  }

  private currentPriority(): number {
    return this.currentState()?.priority ?? 0
  }

  private contextMatches(condition: ResponseCondition | undefined, ctx: RuntimeContext): boolean {
    if (!condition) return true
    if (condition.state && !condition.state.includes(this.state)) return false
    if (!inRange(ctx.mood, condition.mood)) return false
    if (!inRange(ctx.focus, condition.focus)) return false
    if (!inRange(ctx.energy, condition.energy)) return false
    if (condition.timeOfDay && !condition.timeOfDay.includes(periodIdAt(this.document, ctx.nowMs) ?? '')) return false
    return true
  }

  private ruleMatches(rule: BehaviorRuleV03, ctx: RuntimeContext): boolean {
    const when = rule.when
    if (!when) return true
    if (when.state && !when.state.includes(this.state)) return false
    if (!inRange(ctx.mood, when.mood)) return false
    if (!inRange(ctx.focus, when.focus)) return false
    if (!inRange(ctx.energy, when.energy)) return false
    if (when.secrecyMax !== undefined && (ctx as { secrecy?: number }).secrecy !== undefined) {
      if (((ctx as { secrecy?: number }).secrecy ?? 0) > when.secrecyMax) return false
    }
    return true
  }

  private rulePriority(rule: BehaviorRuleV03): number {
    return rule.priority ?? this.behavior.states[rule.to]?.priority ?? 0
  }

  private canInterrupt(targetPriority: number, targetState: string): boolean {
    const current = this.currentState()
    if (!current) return true
    const currentPriority = current.priority ?? 0
    // While dragged, only landing/being startled may take over; a pat must not
    // interrupt the drag loop even though drag.interrupt is "immediate".
    if (this.state === 'drag') return targetState === 'land' || targetState === 'startle'
    if (current.interrupt === 'immediate') return targetPriority >= currentPriority
    if (current.interrupt === 'never') {
      // Sleep only wakes for a deliberate wake/drag/pat, never for talk/remind/refuse.
      return this.state === 'sleep' && ['wake', 'drag', 'pat'].includes(targetState) && targetPriority >= 40
    }
    return targetPriority > currentPriority
  }

  private chooseRule(event: string, ctx: RuntimeContext): { rule: BehaviorRuleV03; index: number } | undefined {
    const candidates: Array<{ rule: BehaviorRuleV03; index: number }> = []
    for (const [index, rule] of this.behavior.rules.entries()) {
      if (!asArray(rule.on).includes(event)) continue
      if (!this.ruleMatches(rule, ctx)) continue
      const until = this.ruleCooldownUntil.get(index) ?? 0
      if (ctx.nowMs < until) continue
      if (rule.requiresBrief === true && ctx.briefAvailable !== true) continue
      if (rule.requiresAny && rule.requiresAny.length > 0) {
        const caps = new Set(ctx.capabilities ?? [])
        if (!rule.requiresAny.some((cap) => caps.has(cap))) continue
      }
      candidates.push({ rule, index })
    }
    candidates.sort((a, b) => this.rulePriority(b.rule) - this.rulePriority(a.rule))
    for (const candidate of candidates) {
      if (candidate.rule.probability !== undefined && this.rng() > candidate.rule.probability) continue
      return candidate
    }
    return undefined
  }

  responseFor(event: string, ctx: RuntimeContext): ResponseSpec | undefined {
    const candidates = (this.document.responses ?? [])
      .filter((response) => asArray(response.on).includes(event) && this.contextMatches(response.when, ctx))
      .filter((response) => {
        if (!response.requiresAny || response.requiresAny.length === 0) return true
        const caps = new Set(ctx.capabilities ?? [])
        return response.requiresAny.some((cap) => caps.has(cap))
      })
    candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    return candidates[0]
  }

  dispatch(event: string, ctx: RuntimeContext): RuntimeDecision {
    this.lastInteractionAt = ctx.nowMs
    const hasRuleForEvent = this.behavior.rules.some((rule) => asArray(rule.on).includes(event))
    const match = this.chooseRule(event, ctx)
    if (!match) {
      // If a rule exists but was filtered by cooldown/probability/when, do not
      // bypass the rule via slots (that would defeat priority/cooldown).
      if (hasRuleForEvent) {
        return { event, state: this.state, tag: this.tag, priority: 0, ruleIndex: -1, ignored: true, reason: 'rules matched but were filtered' }
      }
      const slot = this.behavior.slots?.[event]
      const fallback = slot && this.behavior.states[slot] ? this.behavior.states[slot] : undefined
      if (fallback) {
        this.state = slot as string
        this.tag = fallback.tag
        this.stateSince = ctx.nowMs
        const response = this.responseFor(event, ctx)
        return {
          event,
          state: this.state,
          tag: this.tag,
          priority: fallback.priority ?? 0,
          ruleIndex: -1,
          ...(response ? { response } : {}),
          ...(response?.voiceLineId ? { voiceLineId: response.voiceLineId } : {}),
        }
      }
      return { event, state: this.state, tag: this.tag, priority: 0, ruleIndex: -1, ignored: true, reason: 'no matching rule/slot' }
    }

    const target = this.behavior.states[match.rule.to]
    if (!target) throw new Error(`rule target "${match.rule.to}" vanished`)
    if (!this.canInterrupt(this.rulePriority(match.rule), match.rule.to)) {
      const current = this.currentState()
      const targetPriority = this.rulePriority(match.rule)
      if (current?.interrupt === 'at-end' && !current.loop && targetPriority < (current.priority ?? 0)) {
        this.pending = { state: match.rule.to, tag: target.tag, event, priority: targetPriority }
        return {
          event,
          state: this.state,
          tag: this.tag,
          priority: targetPriority,
          ruleIndex: match.index,
          ignored: true,
          reason: `queued at-end: ${match.rule.to}`,
        }
      }
      return {
        event,
        state: this.state,
        tag: this.tag,
        priority: targetPriority,
        ruleIndex: match.index,
        ignored: true,
        reason: `current state "${this.state}" cannot be interrupted (priority ${targetPriority})`,
      }
    }

    const cooldown = match.rule.cooldownMs ?? target.cooldownMs ?? 0
    if (cooldown > 0) this.ruleCooldownUntil.set(match.index, ctx.nowMs + cooldown)
    // Presentation conditions are evaluated against the state the event arrived
    // in, not the state after the transition.
    const response = this.responseFor(event, ctx)
    this.state = match.rule.to
    this.tag = target.tag
    this.stateSince = ctx.nowMs
    this.lastIdleAt = ctx.nowMs
    const voiceLineId = response?.voiceLineId ?? match.rule.voiceLineId
    return {
      event,
      state: this.state,
      tag: this.tag,
      priority: this.rulePriority(match.rule),
      ruleIndex: match.index,
      ...(response ? { response } : {}),
      ...(voiceLineId ? { voiceLineId } : {}),
      ...(response?.sfx ?? (typeof match.rule.sfx === 'string' ? match.rule.sfx : undefined)
        ? { sfx: response?.sfx ?? (typeof match.rule.sfx === 'string' ? match.rule.sfx : undefined) }
        : {}),
      ...(response?.emote ?? match.rule.emote ? { emote: response?.emote ?? match.rule.emote } : {}),
    }
  }

  /** Resolve a pointer position to the smallest matching zone (normalized preferred). */
  hitZone(x: number, y: number): ZoneSpec | undefined {
    const [width, height] = this.document.canvas
    const matches = (this.document.zones ?? []).filter((zone) => {
      let px = x
      let py = y
      if (zone.space === 'normalized') {
        px = x / width
        py = y / height
      } else if (zone.space === 'anchor') {
        px = x - this.document.anchor.x
        py = y - this.document.anchor.y
      }
      if (zone.shape.type === 'rect') return pointInRect(px, py, zone.shape)
      return pointInPolygon(px, py, zone.shape.points)
    })
    matches.sort((a, b) => zoneArea(a) - zoneArea(b))
    return matches[0]
  }

  zoneEventAt(x: number, y: number): string | undefined {
    return this.hitZone(x, y)?.on
  }

  private idleCandidates(ctx: RuntimeContext): IdleVariant[] {
    return (this.document.idle?.variants ?? []).filter((variant) => {
      if (!this.contextMatches(variant.when, ctx)) return false
      if (variant.when?.state && !variant.when.state.includes(this.state)) return false
      return true
    })
  }

  /** Choose an idle micro-action. `force` bypasses the global interval for tests. */
  pickIdle(ctx: RuntimeContext, force = false): { tag: string; state?: string } | undefined {
    if (!force && ctx.nowMs - this.lastIdleAt < this.idleInterval[0] + this.rng() * (this.idleInterval[1] - this.idleInterval[0])) {
      return undefined
    }
    const candidates = this.idleCandidates(ctx)
    if (candidates.length === 0) return undefined
    const recent = this.idleHistory.slice(-2)
    const filtered = candidates.filter((variant) => !(variant.tag !== undefined && recent.includes(variant.tag)))
    const pool = filtered.length > 0 ? filtered : candidates
    const weighted = pool.map((variant) => ({ variant, weight: variant.weight }))
    const total = weighted.reduce((sum, item) => sum + item.weight, 0)
    if (total <= 0) return undefined
    let roll = this.rng() * total
    let chosen = weighted[weighted.length - 1]?.variant
    for (const item of weighted) {
      roll -= item.weight
      if (roll <= 0) {
        chosen = item.variant
        break
      }
    }
    if (!chosen) return undefined
    this.lastIdleAt = ctx.nowMs
    if (chosen.state) {
      const state = this.behavior.states[chosen.state]
      if (state) {
        this.state = chosen.state
        this.tag = state.tag
        this.stateSince = ctx.nowMs
        return { tag: this.tag, state: this.state }
      }
    }
    if (chosen.tag) {
      const tag = chosen.tag
      this.tag = tag
      this.idleHistory.push(tag)
      if (this.idleHistory.length > 4) this.idleHistory.shift()
      return { tag }
    }
    return undefined
  }

  /** Advance one-shot states and optionally pick an idle micro-action. */
  tick(ctx: RuntimeContext): { state: string; tag: string; changed: boolean; idle?: string } {
    const current = this.currentState()
    if (!current) return { state: this.state, tag: this.tag, changed: false }
    const elapsed = ctx.nowMs - this.stateSince
    const duration = current.timeoutMs ?? 600
    const timedOut = current.timeoutMs !== undefined && elapsed >= current.timeoutMs
    if (timedOut || (!current.loop && elapsed >= duration)) {
      const next = current.after && this.behavior.states[current.after] ? current.after : 'idle'
      const nextState = this.behavior.states[next]
      if (nextState) {
        if (this.pending) {
          const queued = this.pending
          this.pending = null
          const queuedState = this.behavior.states[queued.state]
          if (queuedState) {
            this.state = queued.state
            this.tag = queuedState.tag
            this.stateSince = ctx.nowMs
            return { state: this.state, tag: this.tag, changed: true }
          }
        }
        this.state = next
        this.tag = nextState.tag
        this.stateSince = ctx.nowMs
        return { state: this.state, tag: this.tag, changed: true }
      }
    }
    if (this.state === 'idle' || current.category === 'idle') {
      const idle = this.pickIdle(ctx)
      if (idle) return { state: this.state, tag: this.tag, changed: this.tag !== current.tag || this.state !== 'idle', idle: idle.tag }
    }
    return { state: this.state, tag: this.tag, changed: false }
  }

  /** Voice gate: L0/L3 never speak; L1/L2 obey state/gap/quotas/line dedupe. */
  gateSpeech(level: RuntimeLevel, lineId: string | undefined, ctx: RuntimeContext): VoiceGateResult {
    if (level === 'L0' || level === 'L3') return { allowed: false, level, ...(lineId ? { lineId } : {}), reason: level === 'L0' ? 'action-only' : 'silent-by-design' }
    if (ctx.muted === true) {
      const text = lineId ? this.voiceLines?.lines[lineId]?.text : undefined
      return { allowed: false, level, ...(lineId ? { lineId } : {}), ...(text ? { text } : {}), reason: 'muted' }
    }
    const current = this.currentState()
    if (current?.category === 'sleep' || this.state === 'drag' || this.state === 'focus' || this.state === 'talk') {
      if (level !== 'L2') return { allowed: false, level, ...(lineId ? { lineId } : {}), reason: `quiet state ${this.state}` }
    }
    const date = new Date(ctx.nowMs)
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    if (key !== this.dayKey) {
      this.dayKey = key
      this.dayCount = 0
    }
    const recent = this.speakTimes.filter((time) => ctx.nowMs - time <= 3_600_000)
    const last60 = recent.filter((time) => ctx.nowMs - time <= 60_000).length
    if (last60 >= 2 || recent.length >= 20 || this.dayCount >= 120) {
      return { allowed: false, level, ...(lineId ? { lineId } : {}), reason: 'quota' }
    }
    const gap = level === 'L1' ? 6_000 : 20_000
    if (ctx.nowMs - this.lastSpeakAt < gap) return { allowed: false, level, ...(lineId ? { lineId } : {}), reason: 'gap' }
    if (lineId) {
      const last = this.lastLineAt.get(lineId)
      if (last !== undefined && ctx.nowMs - last < 600_000) return { allowed: false, level, lineId, reason: 'line-dedupe' }
      this.lastLineAt.set(lineId, ctx.nowMs)
    }
    this.lastSpeakAt = ctx.nowMs
    this.lastLevel = level
    this.speakTimes.push(ctx.nowMs)
    this.dayCount += 1
    const text = lineId ? this.voiceLines?.lines[lineId]?.text : undefined
    return { allowed: true, level, ...(lineId ? { lineId } : {}), ...(text ? { text } : {}) }
  }

  /** Resolve response and gate its voice line in one call. */
  speakFor(event: string, ctx: RuntimeContext, level: RuntimeLevel = 'L1'): { response?: ResponseSpec; voice: VoiceGateResult } {
    const response = this.responseFor(event, ctx)
    const lineId = response?.voiceLineId
    const voice = this.gateSpeech(level, lineId, ctx)
    return { ...(response ? { response } : {}), voice }
  }

  /** Host calls when the current voice/TTS line ends. */
  endSpeech(nowMs: number): void {
    if (this.state !== 'talk') return
    const current = this.currentState()
    const next = current?.after && this.behavior.states[current.after] ? current.after : 'idle'
    const state = this.behavior.states[next]
    if (state) {
      this.state = next
      this.tag = state.tag
      this.stateSince = nowMs
    }
  }

  snapshot(): { state: string; tag: string; stateSince: number; lastIdleAt: number } {
    return { state: this.state, tag: this.tag, stateSince: this.stateSince, lastIdleAt: this.lastIdleAt }
  }

  restore(snapshot: { state: string; tag: string; stateSince: number; lastIdleAt: number }): void {
    if (!this.behavior.states[snapshot.state]) throw new Error(`cannot restore unknown state "${snapshot.state}"`)
    this.state = snapshot.state
    this.tag = snapshot.tag
    this.stateSince = snapshot.stateSince
    this.lastIdleAt = snapshot.lastIdleAt
  }
}

export { mulberry32, periodIdAt, pointInRect, pointInPolygon, zoneArea }
