/**
 * Interaction placeholder: declaration matching + near-range detection +
 * arbitration counters. The runtime does NOT execute any outcome here (no
 * behaviour command, no cross-actor state write) — grants are observed in
 * `interactionLog()` / `tick().interactions` and can be wired to a future
 * outcome layer.
 *
 * Declaration semantics for the committed FCI v0.1 flat shape
 * `document.interactions = [{ id, on, actors: string[], outcome? }]`:
 *
 * - A declaration on actor A is eligible for pair (A, B) when **every** matcher
 *   in `actors` matches A or B, and **at least one** matcher matches B. In other
 *   words `actors` names the accepted participants (self may be included), and a
 *   declaration can never fire against a peer it does not accept.
 * - A matcher matches `'*'`, a document id, a character type (`pet`/`humanoid`/
 *   `object`), a species, or a trait.
 * - Both directions are considered; the deterministic winner is the declaration
 *   with the smallest `(id, ownerId, on)` tuple.
 * - Declarations are proximity-triggered in v0.1; `on` is preserved for the
 *   future outcome router and is not used as an event filter yet.
 */
import type { CharacterDocument } from '../character/types.ts'
import { anchorDistance, compareIds, sortById } from './layout.ts'
import type { InteractionEvent, InteractionReason } from './types.ts'

export interface InteractionActor {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly document: CharacterDocument
}

export interface InteractionDeclaration {
  readonly id: string
  readonly on: string
  readonly actors: readonly string[]
}

export interface InteractionArbiterOptions {
  nearRange: number
  maxConcurrent: number
  cooldownMs: number
}

export interface InteractionCounters {
  granted: number
  denied: number
  unmatched: number
  ended: number
}

interface PairState {
  inRange: boolean
  active: boolean
  attempted: boolean
  declarationId: string | null
  on: string | null
  cooldownUntilMs: number
}

function matchesActor(matcher: string, actor: InteractionActor): boolean {
  if (matcher === '*') return true
  const document = actor.document
  if (matcher === document.id || matcher === document.type) return true
  if (document.species !== undefined && matcher === document.species) return true
  const traits: unknown = document.traits
  return Array.isArray(traits) && traits.includes(matcher)
}

function declarationsFor(owner: InteractionActor, peer: InteractionActor): InteractionDeclaration[] {
  const declarations = owner.document.interactions
  if (!declarations) return []
  const result: InteractionDeclaration[] = []
  for (const declaration of declarations) {
    if (declaration.actors.length === 0) continue
    let everyMatch = true
    let peerMatch = false
    for (const matcher of declaration.actors) {
      const self = matchesActor(matcher, owner)
      const other = matchesActor(matcher, peer)
      if (!self && !other) {
        everyMatch = false
        break
      }
      if (other) peerMatch = true
    }
    if (everyMatch && peerMatch) {
      result.push({ id: declaration.id, on: declaration.on, actors: [...declaration.actors] })
    }
  }
  return result
}

/** Deterministic declaration match for a pair (see module header for rules). */
export function findInteractionDeclaration(
  left: InteractionActor,
  right: InteractionActor,
): InteractionDeclaration | null {
  const candidates: Array<{ ownerId: string; declaration: InteractionDeclaration }> = []
  for (const declaration of declarationsFor(left, right)) {
    candidates.push({ ownerId: left.id, declaration })
  }
  for (const declaration of declarationsFor(right, left)) {
    candidates.push({ ownerId: right.id, declaration })
  }
  candidates.sort((a, b) => {
    const byId = compareIds(a.declaration.id, b.declaration.id)
    if (byId !== 0) return byId
    const byOwner = compareIds(a.ownerId, b.ownerId)
    if (byOwner !== 0) return byOwner
    return compareIds(a.declaration.on, b.declaration.on)
  })
  return candidates[0]?.declaration ?? null
}

/**
 * Proximity arbiter. Counters are the "人数上限" (slot cap) arbitration:
 * - `maxConcurrent` limits active interaction pairs globally;
 * - an actor may participate in at most one active interaction at a time;
 * - `cooldownMs` delays re-engagement after a pair separates.
 */
export class InteractionArbiter {
  private readonly options: InteractionArbiterOptions
  private readonly pairs = new Map<string, PairState>()
  private readonly busy = new Set<string>()
  private active = 0
  private seqCounter = 0
  private grantedValue = 0
  private deniedValue = 0
  private unmatchedValue = 0
  private endedValue = 0

  constructor(options: InteractionArbiterOptions) {
    this.options = { ...options }
  }

  get activeCount(): number {
    return this.active
  }

  get counters(): InteractionCounters {
    return {
      granted: this.grantedValue,
      denied: this.deniedValue,
      unmatched: this.unmatchedValue,
      ended: this.endedValue,
    }
  }

  /** Drop all pair states and participants; interaction seq keeps growing. */
  reset(): void {
    this.pairs.clear()
    this.busy.clear()
    this.active = 0
    this.grantedValue = 0
    this.deniedValue = 0
    this.unmatchedValue = 0
    this.endedValue = 0
  }

  /** Remove an actor's pair state; active pairs it belongs to are ended. */
  removeActor(id: string): void {
    for (const [key, state] of [...this.pairs]) {
      const [left, right] = key.split('\u0000')
      if (left !== id && right !== id) continue
      if (state.active) {
        this.active -= 1
        this.endedValue += 1
      }
      this.pairs.delete(key)
    }
    this.busy.delete(id)
  }

  /** One proximity scan (called once per `SceneRuntime.tick`). */
  step(actors: readonly InteractionActor[], nowMs: number): InteractionEvent[] {
    const sorted = sortById(actors)
    const events: InteractionEvent[] = []
    for (let i = 0; i < sorted.length; i++) {
      const left = sorted[i]
      if (!left) continue
      for (let j = i + 1; j < sorted.length; j++) {
        const right = sorted[j]
        if (!right) continue
        const key = `${left.id}\u0000${right.id}`
        let state = this.pairs.get(key)
        if (!state) {
          state = { inRange: false, active: false, attempted: false, declarationId: null, on: null, cooldownUntilMs: 0 }
          this.pairs.set(key, state)
        }
        const distance = anchorDistance(left, right)
        const inRange = distance <= this.options.nearRange

        if (inRange) {
          if (!state.inRange) {
            state.inRange = true
            state.attempted = false
          }
          if (state.active || state.attempted) continue
          state.attempted = true

          if (nowMs < state.cooldownUntilMs) {
            this.deniedValue += 1
            events.push(this.record('deny', nowMs, left.id, right.id, state.declarationId, state.on, 'cooldown', distance))
            continue
          }

          const declaration = findInteractionDeclaration(left, right)
          if (!declaration) {
            this.unmatchedValue += 1
            events.push(this.record('deny', nowMs, left.id, right.id, null, null, 'no-declaration', distance))
            continue
          }
          state.declarationId = declaration.id
          state.on = declaration.on

          if (this.active >= this.options.maxConcurrent) {
            this.deniedValue += 1
            events.push(
              this.record('deny', nowMs, left.id, right.id, declaration.id, declaration.on, 'interaction-limit', distance),
            )
            continue
          }
          if (this.busy.has(left.id) || this.busy.has(right.id)) {
            this.deniedValue += 1
            events.push(
              this.record('deny', nowMs, left.id, right.id, declaration.id, declaration.on, 'actor-busy', distance),
            )
            continue
          }

          state.active = true
          this.active += 1
          this.busy.add(left.id)
          this.busy.add(right.id)
          this.grantedValue += 1
          events.push(this.record('grant', nowMs, left.id, right.id, declaration.id, declaration.on, 'granted', distance))
          continue
        }

        if (!state.inRange) continue
        state.inRange = false
        state.attempted = false
        if (state.active) {
          state.active = false
          this.active -= 1
          this.busy.delete(left.id)
          this.busy.delete(right.id)
          this.endedValue += 1
          events.push(
            this.record('end', nowMs, left.id, right.id, state.declarationId, state.on, 'left-range', distance),
          )
          if (this.options.cooldownMs > 0) state.cooldownUntilMs = nowMs + this.options.cooldownMs
        }
      }
    }
    return events
  }

  private record(
    kind: InteractionEvent['kind'],
    atMs: number,
    a: string,
    b: string,
    declarationId: string | null,
    on: string | null,
    reason: InteractionReason,
    distPx: number,
  ): InteractionEvent {
    this.seqCounter += 1
    return { seq: this.seqCounter, kind, atMs, a, b, declarationId, on, reason, distPx }
  }
}
