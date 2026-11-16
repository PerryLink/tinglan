import {
  CharacterInterfaceError,
  type BehaviorDecision,
  type BehaviorProfile,
  type BehaviorRule,
  type Guard,
} from './types.ts'

export interface DecisionContext {
  /** Monotonic clock in ms (caller supplies; tests use a fake clock). */
  nowMs: number
  state?: string
  mood?: number
  bond?: number
  hunger?: number
  energy?: number
  fun?: number
  briefAvailable?: boolean
  source?: string
}

export interface BehaviorRuntimeOptions {
  seed?: number
  initialState?: string
}

function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Deterministic PRNG (mulberry32) so behaviour traces are replayable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function asArray(ruleOn: string | string[]): string[] {
  return Array.isArray(ruleOn) ? ruleOn : [ruleOn]
}

function evaluateGuard(guard: Guard | undefined, ctx: DecisionContext): boolean {
  if (!guard) return true
  const raw = ctx[guard.input]
  if (typeof raw !== 'number') return false
  switch (guard.op) {
    case '>=': return raw >= guard.value
    case '<=': return raw <= guard.value
    case '==': return raw === guard.value
    case '!=': return raw !== guard.value
    default: return false
  }
}

/**
 * Data-driven behaviour runtime: explicit state + rule table + weighted ambient.
 * The renderer is not involved; it only maps `decision.tag` to an animation tag.
 */
export class BehaviorRuntime {
  readonly profile: BehaviorProfile
  state: string
  private readonly seed: number
  private readonly rng: () => number
  private readonly lastFired = new Map<number, number>()
  private counter = 0

  constructor(profile: BehaviorProfile, options: BehaviorRuntimeOptions = {}) {
    if (!profile.states[options.initialState ?? 'idle']) {
      throw new CharacterInterfaceError(`initial state "${options.initialState ?? 'idle'}" is not declared`)
    }
    this.profile = profile
    this.state = options.initialState ?? 'idle'
    this.seed = options.seed ?? 1
    this.rng = mulberry32(this.seed)
  }

  private rulePriority(rule: BehaviorRule): number {
    return rule.priority ?? this.profile.states[rule.to]?.priority ?? this.profile.defaults?.priority ?? 0
  }

  private isOnCooldown(ruleIndex: number, rule: BehaviorRule, nowMs: number): boolean {
    const cd = rule.cooldownMs ?? this.profile.states[rule.to]?.cooldownMs ?? this.profile.defaults?.cooldownMs ?? 0
    if (cd <= 0) return false
    const last = this.lastFired.get(ruleIndex)
    return last !== undefined && nowMs - last < cd
  }

  /** Resolve one event into a state/tag decision. Pure except for deterministic RNG/cooldown bookkeeping. */
  decide(event: string, ctx: DecisionContext): BehaviorDecision {
    const now = ctx.nowMs
    const current = ctx.state ?? this.state
    const candidates: Array<{ rule: BehaviorRule; index: number }> = []
    let hasRuleForEvent = false
    for (const [index, rule] of this.profile.rules.entries()) {
      if (!asArray(rule.on).includes(event)) continue
      hasRuleForEvent = true
      if (this.isOnCooldown(index, rule, now)) continue
      if (rule.when?.state && !rule.when.state.includes(current)) continue
      if (rule.requiresBrief === true && ctx.briefAvailable !== true) continue
      if (!evaluateGuard(rule.guard, { ...ctx, state: current })) continue
      candidates.push({ rule, index })
    }
    candidates.sort((a, b) => this.rulePriority(b.rule) - this.rulePriority(a.rule))

    for (const { rule, index } of candidates) {
      // Draw a deterministic random number per candidate even when probability is 1.
      const roll = this.rng()
      if (rule.probability !== undefined && roll > rule.probability) continue
      this.lastFired.set(index, now)
      this.counter += 1
      const targetState = this.profile.states[rule.to]
      if (!targetState) throw new CharacterInterfaceError(`rule target "${rule.to}" vanished`)
      this.state = rule.to
      return {
        event,
        state: rule.to,
        tag: targetState.tag,
        priority: this.rulePriority(rule),
        ruleIndex: index,
      }
    }

    // Slot fallback only for events with no rule at all. If a rule exists but was
    // filtered (cooldown/probability/when/guard), the event is ignored instead of
    // bypassing the rule's cooldown via the slot path.
    if (hasRuleForEvent) {
      return { event, state: this.state, tag: this.profile.states[this.state]?.tag ?? 'idle', priority: 0, ruleIndex: -1, ignored: true, reason: 'rules matched but were filtered' }
    }
    // Slot fallback: event name matches a declared state/slot (e.g. "pat" -> slot pat).
    const slot = this.profile.slots?.[event] ?? (this.profile.states[event] ? event : undefined)
    if (slot) {
      const target = slot === event ? this.profile.states[event] : this.profile.states[slot]
      if (target) {
        this.state = slot
        return { event, state: slot, tag: target.tag, priority: target.priority ?? 0, ruleIndex: -1 }
      }
    }
    return { event, state: this.state, tag: this.profile.states[this.state]?.tag ?? 'idle', priority: 0, ruleIndex: -1, ignored: true, reason: 'no matching rule/slot' }
  }

  /** Weighted ambient state choice for idle scheduling. */
  ambientState(): string {
    const ambient = this.profile.ambient
    if (!ambient || ambient.choices.length === 0) return 'idle'
    const total = ambient.choices.reduce((sum, c) => sum + c.weight, 0)
    if (total <= 0) return 'idle'
    let roll = this.rng() * total
    for (const choice of ambient.choices) {
      roll -= choice.weight
      if (roll <= 0) return choice.state
    }
    return ambient.choices[ambient.choices.length - 1]?.state ?? 'idle'
  }

  /** Deterministic trace for golden tests (event -> tag sequence). */
  trace(events: string[], startMs = 0, stepMs = 1000): BehaviorDecision[] {
    const out: BehaviorDecision[] = []
    let now = startMs
    for (const event of events) {
      out.push(this.decide(event, { nowMs: now }))
      now += stepMs
    }
    return out
  }
}

/** Required animation tags mentioned by states, in first-use order. */
export function requiredTags(profile: BehaviorProfile): string[] {
  const tags = new Set<string>()
  for (const state of Object.values(profile.states)) tags.add(state.tag)
  return [...tags]
}

/** Verify every state tag is provided by a tag map (or by an explicit fallback). */
export function missingTags(profile: BehaviorProfile, availableTags: string[], fallback: Record<string, string[]> = {}): string[] {
  const available = new Set(availableTags)
  const missing: string[] = []
  for (const tag of requiredTags(profile)) {
    if (available.has(tag)) continue
    const chain = fallback[tag] ?? []
    if (chain.some((t) => available.has(t))) continue
    missing.push(tag)
  }
  return missing
}
