/**
 * Famling/Pearl multi-object scene runtime (headless).
 *
 * Responsibility split:
 * - `src/pet/character/` = FCI 0.1 data interface + minimal `Actor`/`Scene`
 *   protocol. It owns `CharacterDocument`, `BehaviorProfile`, `BehaviorRuntime`
 *   and the per-actor behaviour decision, but has no clock/layout/persistence.
 * - this module = a runnable scene *above* that protocol: deterministic fixed
 *   tick (4 Hz behaviour, host drives 60 Hz render), z-order/layout, event
 *   routing, interaction arbitration counters and per-object snapshots.
 * - future layers (NOT in this round): a renderer reads `listByZ()` +
 *   `SceneActor.{x,y,zIndex,scale,state,tag}`; a save layer plugs a `SceneStore`
 *   adapter backed by Rust `write_save/read_save`; UI wires `emit()`/`broadcast()`.
 *
 * Determinism rules: no `Date.now()`, no `Math.random()`. The host passes
 * `nowMs`/`dtMs` to `tick()`; seeded streams (`SceneRng`, `BehaviorRuntime` seed)
 * make the same call sequence reproduce the same snapshot and trace.
 */
import { BehaviorRuntime } from '../character/behavior.ts'
import type { BehaviorDecision, BehaviorProfile, CharacterDocument } from '../character/types.ts'
import { createSceneClock, hashSeed, normalizeSeed, SceneRng } from './clock.ts'
import { InteractionArbiter } from './interactions.ts'
import { compareIds, overlapPairs, sceneBounds, sortById } from './layout.ts'
import { cloneSnapshot } from './store.ts'
import {
  SCENE_RUNTIME_VERSION,
  SCENE_SNAPSHOT_SCHEMA,
  SceneRuntimeError,
  type ActorScale,
  type InteractionEvent,
  type SceneActorInit,
  type SceneActorSnapshot,
  type SceneBounds,
  type SceneBroadcastOptions,
  type SceneClock,
  type SceneDelivery,
  type SceneEmitOptions,
  type SceneEvent,
  type SceneInteractionStats,
  type SceneRuntimeOptions,
  type SceneRuntimeStats,
  type SceneSendOptions,
  type SceneSkippedDelivery,
  type SceneSnapshot,
  type SceneStore,
  type SceneTickResult,
  type SceneTickTransition,
  type SceneTransitionReason,
} from './types.ts'
import {
  assertActorId,
  assertBehaviorProfileRuntime,
  assertDocumentRuntime,
  assertEventName,
  assertFiniteNumber,
  assertInteger,
  assertScaleValue,
  assertSeedValue,
  isRecord,
} from './validate.ts'

const DEFAULT_SEED = 1
const DEFAULT_BEHAVIOR_INTERVAL_MS = 250
const DEFAULT_MAX_CATCH_UP_STEPS = 8
const DEFAULT_MAX_ACTORS = 32
const DEFAULT_ONE_SHOT_MS = 1000
const DEFAULT_NEAR_RANGE = 64
const DEFAULT_MAX_CONCURRENT_INTERACTIONS = 2
const DEFAULT_INTERACTION_COOLDOWN_MS = 0
const DEFAULT_MAX_TRACE_ENTRIES = 1024
const DEFAULT_MAX_INTERACTION_TRACE_ENTRIES = 512

/** Derive the scene scheduling RNG seed (separate stream from behaviour decisions). */
function actorRngSeed(seed: number, id: string): number {
  return hashSeed(`scene:${seed >>> 0}:${id}`)
}

/** One live instance of a character/pet in the scene. Mutated only by `SceneRuntime`. */
export class SceneActor {
  readonly id: string
  readonly document: CharacterDocument
  /** Behaviour profile (`SceneActorInit.behavior`). */
  readonly profile: BehaviorProfile
  /** FCI behaviour runtime; `state`/`decide` live there. */
  readonly behavior: BehaviorRuntime
  readonly seed: number
  readonly scale: ActorScale
  /** World anchor position. Use `SceneRuntime.move()`; direct writes break arbitration. */
  x: number
  y: number
  /** Draw order; higher draws later/on top. */
  zIndex: number
  /** Timestamp (scene clock) at which the current behaviour state was entered. */
  stateEnteredAtMs: number
  /** Next ambient-fire time while idle, or `null` when ambient is not armed. */
  nextAmbientAtMs: number | null
  /** @internal Scene scheduling RNG (snapshot-able cursor). */
  readonly rng: SceneRng
  /** Last decision produced by an event delivery (for trace/tests). */
  lastDecision: BehaviorDecision | null

  constructor(init: {
    id: string
    document: CharacterDocument
    profile: BehaviorProfile
    behavior: BehaviorRuntime
    seed: number
    scale: ActorScale
    x: number
    y: number
    zIndex: number
    stateEnteredAtMs: number
    nextAmbientAtMs: number | null
    rng: SceneRng
    lastDecision: BehaviorDecision | null
  }) {
    this.id = init.id
    this.document = init.document
    this.profile = init.profile
    this.behavior = init.behavior
    this.seed = init.seed
    this.scale = init.scale
    this.x = init.x
    this.y = init.y
    this.zIndex = init.zIndex
    this.stateEnteredAtMs = init.stateEnteredAtMs
    this.nextAmbientAtMs = init.nextAmbientAtMs
    this.rng = init.rng
    this.lastDecision = init.lastDecision
  }

  /** Current behaviour state name (`BehaviorRuntime.state`). */
  get state(): string {
    return this.behavior.state
  }

  /** Animation tag the renderer should play for the current state. */
  get tag(): string {
    return this.profile.states[this.behavior.state]?.tag ?? 'idle'
  }

  get type(): CharacterDocument['type'] {
    return this.document.type
  }
}

/**
 * Multi-object scene runtime. See module header for boundaries.
 *
 * Typical host loop (single window, shared rAF):
 * ```ts
 * const scene = new SceneRuntime({ seed: 7 })
 * scene.spawn({ id: 'pearl', document, behavior, x: 96, y: 120, zIndex: 1 })
 * scene.spawn({ id: 'cat', document: catDoc, behavior: catBehavior, x: 148, y: 120, zIndex: 2 })
 * const r = scene.tick(nowMs, dtMs)        // every rAF frame; behaviour steps at 4 Hz
 * renderer.draw(scene.listByZ(), r)        // future renderer layer
 * scene.emit('pat', { actorId: 'pearl' })  // pointer/host input
 * await scene.saveTo(new MemorySceneStore())
 * ```
 */
export class SceneRuntime {
  /** Deterministic clock, updated by `tick()`. The injected object is mutated in place. */
  readonly clock: SceneClock
  readonly behaviorIntervalMs: number
  readonly nearRange: number

  private seedValue: number
  private readonly maxCatchUpSteps: number
  private readonly maxActors: number
  private readonly oneShotMs: number
  private readonly maxTraceEntries: number
  private readonly maxInteractionTraceEntries: number
  private readonly arbiter: InteractionArbiter
  private readonly actors = new Map<string, SceneActor>()
  private readonly events: SceneEvent[] = []
  private readonly interactionEvents: InteractionEvent[] = []
  private lastBehaviorStepMsValue: number
  private tickCount = 0
  private behaviorStepTotal = 0
  private droppedBehaviorSteps = 0
  private eventSeq = 0
  private droppedEvents = 0

  constructor(options: SceneRuntimeOptions = {}) {
    this.seedValue = normalizeSeed(
      options.seed === undefined ? DEFAULT_SEED : assertSeedValue(options.seed, 'options.seed', 'config-invalid'),
    )
    this.behaviorIntervalMs =
      options.behaviorIntervalMs === undefined
        ? DEFAULT_BEHAVIOR_INTERVAL_MS
        : assertInteger(options.behaviorIntervalMs, 'options.behaviorIntervalMs', 'config-invalid', 1)
    this.maxCatchUpSteps =
      options.maxCatchUpSteps === undefined
        ? DEFAULT_MAX_CATCH_UP_STEPS
        : assertInteger(options.maxCatchUpSteps, 'options.maxCatchUpSteps', 'config-invalid', 1)
    this.maxActors =
      options.maxActors === undefined
        ? DEFAULT_MAX_ACTORS
        : assertInteger(options.maxActors, 'options.maxActors', 'config-invalid', 1)
    this.oneShotMs =
      options.oneShotMs === undefined
        ? DEFAULT_ONE_SHOT_MS
        : assertFiniteNumber(options.oneShotMs, 'options.oneShotMs', 'config-invalid')
    if (this.oneShotMs < 0) throw new SceneRuntimeError('config-invalid', 'options.oneShotMs must be >= 0')
    this.nearRange =
      options.nearRange === undefined
        ? DEFAULT_NEAR_RANGE
        : assertFiniteNumber(options.nearRange, 'options.nearRange', 'config-invalid')
    if (this.nearRange < 0) throw new SceneRuntimeError('config-invalid', 'options.nearRange must be >= 0')
    const maxConcurrent =
      options.maxConcurrentInteractions === undefined
        ? DEFAULT_MAX_CONCURRENT_INTERACTIONS
        : assertInteger(options.maxConcurrentInteractions, 'options.maxConcurrentInteractions', 'config-invalid', 0)
    const interactionCooldownMs =
      options.interactionCooldownMs === undefined
        ? DEFAULT_INTERACTION_COOLDOWN_MS
        : assertFiniteNumber(options.interactionCooldownMs, 'options.interactionCooldownMs', 'config-invalid')
    if (interactionCooldownMs < 0) {
      throw new SceneRuntimeError('config-invalid', 'options.interactionCooldownMs must be >= 0')
    }
    this.maxTraceEntries =
      options.maxTraceEntries === undefined
        ? DEFAULT_MAX_TRACE_ENTRIES
        : assertInteger(options.maxTraceEntries, 'options.maxTraceEntries', 'config-invalid', 1)
    this.maxInteractionTraceEntries =
      options.maxInteractionTraceEntries === undefined
        ? DEFAULT_MAX_INTERACTION_TRACE_ENTRIES
        : assertInteger(options.maxInteractionTraceEntries, 'options.maxInteractionTraceEntries', 'config-invalid', 1)

    const clock = options.clock ?? createSceneClock()
    if (!isRecord(clock)) throw new SceneRuntimeError('config-invalid', 'options.clock must be an object')
    const nowMs = assertFiniteNumber(clock.nowMs, 'options.clock.nowMs', 'config-invalid')
    const tick = assertInteger(clock.tick, 'options.clock.tick', 'config-invalid', 0)
    const dtMs = assertFiniteNumber(clock.dtMs, 'options.clock.dtMs', 'config-invalid')
    if (nowMs < 0 || dtMs < 0) throw new SceneRuntimeError('config-invalid', 'options.clock times must be >= 0')
    this.clock = clock
    this.clock.nowMs = nowMs
    this.clock.tick = tick
    this.clock.dtMs = dtMs
    this.lastBehaviorStepMsValue = nowMs

    this.arbiter = new InteractionArbiter({ nearRange: this.nearRange, maxConcurrent, cooldownMs: interactionCooldownMs })
  }

  /** Register one actor. Throws `actor-*` codes on invalid/duplicate/limit violations. */
  spawn(init: SceneActorInit): SceneActor {
    const id = assertActorId(init.id)
    if (this.actors.has(id)) throw new SceneRuntimeError('actor-duplicate', `duplicate actor id: ${id}`)
    if (this.actors.size >= this.maxActors) {
      throw new SceneRuntimeError('actor-limit', `scene actor limit reached (${this.maxActors})`)
    }
    const document = assertDocumentRuntime(init.document, `actor "${id}"`)
    const profile = assertBehaviorProfileRuntime(init.behavior, `actor "${id}"`)
    const initialState = init.initialState ?? 'idle'
    if (typeof initialState !== 'string' || !(initialState in profile.states)) {
      throw new SceneRuntimeError('actor-invalid', `initial state "${String(initialState)}" is not declared`)
    }
    const x = assertFiniteNumber(init.x, `actor "${id}".x`, 'actor-invalid')
    const y = assertFiniteNumber(init.y, `actor "${id}".y`, 'actor-invalid')
    const zIndex =
      init.zIndex === undefined ? 0 : assertInteger(init.zIndex, `actor "${id}".zIndex`, 'actor-invalid')
    let scale: ActorScale
    if (init.scale !== undefined) {
      scale = assertScaleValue(init.scale)
    } else if (document.display?.scale !== undefined) {
      scale = assertScaleValue(document.display.scale)
    } else {
      scale = 1
    }
    const seed = normalizeSeed(
      init.seed === undefined
        ? hashSeed(`actor:${this.seedValue}:${id}`)
        : assertSeedValue(init.seed, `actor "${id}".seed`, 'actor-invalid'),
    )
    const behavior = new BehaviorRuntime(profile, { seed, initialState })
    const rng = new SceneRng(actorRngSeed(seed, id))
    const actor = new SceneActor({
      id,
      document,
      profile,
      behavior,
      seed,
      scale,
      x,
      y,
      zIndex,
      stateEnteredAtMs: this.clock.nowMs,
      nextAmbientAtMs: null,
      rng,
      lastDecision: null,
    })
    this.actors.set(id, actor)
    this.rescheduleAmbient(actor, this.clock.nowMs)
    return actor
  }

  /** Remove an actor (and its interaction pair state). Returns false when unknown. */
  despawn(id: string): boolean {
    if (!this.actors.has(id)) return false
    this.actors.delete(id)
    this.arbiter.removeActor(id)
    return true
  }

  get(id: string): SceneActor {
    const actor = this.actors.get(id)
    if (!actor) throw new SceneRuntimeError('actor-unknown', `unknown actor: ${id}`)
    return actor
  }

  has(id: string): boolean {
    return this.actors.has(id)
  }

  list(): SceneActor[] {
    return [...this.actors.values()]
  }

  /** Draw-order list: `zIndex` ascending, ties by actor id (deterministic). */
  listByZ(): SceneActor[] {
    return [...this.actors.values()].sort((left, right) => left.zIndex - right.zIndex || compareIds(left.id, right.id))
  }

  /** Update world anchor position (world-space semantic, same unit as `footBox`). */
  move(id: string, x: number, y: number): SceneActor {
    const actor = this.get(id)
    actor.x = assertFiniteNumber(x, `actor "${id}".x`, 'actor-invalid')
    actor.y = assertFiniteNumber(y, `actor "${id}".y`, 'actor-invalid')
    return actor
  }

  setZ(id: string, zIndex: number): SceneActor {
    const actor = this.get(id)
    actor.zIndex = assertInteger(zIndex, `actor "${id}".zIndex`, 'actor-invalid')
    return actor
  }

  /** Union of actor foot-prints in world pixels, or null for an empty scene. */
  bounds(): SceneBounds | null {
    return sceneBounds(this.actors.values())
  }

  /** Overlapping foot-print pairs (sorted, deterministic; scale-aware). */
  overlapPairs(): Array<{ a: string; b: string }> {
    return overlapPairs([...this.actors.values()])
  }

  /** Anchor-distance neighbours within `rangePx` (default `nearRange`), nearest first. */
  neighbors(id: string, rangePx?: number): Array<{ actor: SceneActor; distPx: number }> {
    const actor = this.get(id)
    const range =
      rangePx === undefined ? this.nearRange : assertFiniteNumber(rangePx, 'neighbors rangePx', 'actor-invalid')
    if (range < 0) throw new SceneRuntimeError('actor-invalid', 'neighbors rangePx must be >= 0')
    const result: Array<{ actor: SceneActor; distPx: number }> = []
    for (const other of this.actors.values()) {
      if (other.id === id) continue
      const distPx = Math.hypot(actor.x - other.x, actor.y - other.y)
      if (distPx <= range) result.push({ actor: other, distPx })
    }
    result.sort((left, right) => left.distPx - right.distPx || compareIds(left.actor.id, right.actor.id))
    return result
  }

  /**
   * Advance the scene. `nowMs` is monotonic scene time; `dtMs` is the host frame
   * delta (informational). Behaviour steps are anchored to fixed boundaries of
   * `behaviorIntervalMs`, with catch-up capped by `maxCatchUpSteps`.
   */
  tick(nowMs: number, dtMs: number): SceneTickResult {
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new SceneRuntimeError('clock-invalid', `tick nowMs must be a finite number >= 0, got ${String(nowMs)}`)
    }
    if (!Number.isFinite(dtMs) || dtMs < 0) {
      throw new SceneRuntimeError('clock-invalid', `tick dtMs must be a finite number >= 0, got ${String(dtMs)}`)
    }
    if (nowMs < this.clock.nowMs) {
      throw new SceneRuntimeError(
        'clock-invalid',
        `scene clock is monotonic (last ${this.clock.nowMs}ms, got ${nowMs}ms)`,
      )
    }
    this.clock.nowMs = nowMs
    this.clock.dtMs = dtMs
    this.clock.tick += 1
    this.tickCount += 1

    const transitions: SceneTickTransition[] = []
    let behaviorSteps = 0
    while (
      this.lastBehaviorStepMsValue + this.behaviorIntervalMs <= nowMs &&
      behaviorSteps < this.maxCatchUpSteps
    ) {
      this.lastBehaviorStepMsValue += this.behaviorIntervalMs
      this.runBehaviorStep(this.lastBehaviorStepMsValue, transitions)
      behaviorSteps += 1
    }
    if (this.lastBehaviorStepMsValue + this.behaviorIntervalMs <= nowMs) {
      // Catch-up cap reached (e.g. long window hide): skip the backlog
      // deterministically instead of spiralling.
      const pendingSteps = Math.floor((nowMs - this.lastBehaviorStepMsValue) / this.behaviorIntervalMs)
      this.lastBehaviorStepMsValue += pendingSteps * this.behaviorIntervalMs
      this.droppedBehaviorSteps += pendingSteps
    }

    const interactions = this.arbiter.step(sortById([...this.actors.values()]), nowMs)
    if (interactions.length > 0) this.recordInteractions(interactions)
    this.behaviorStepTotal += behaviorSteps
    return { nowMs, dtMs, behaviorSteps, transitions, interactions }
  }

  /** Host event. With `actorId` it targets one actor; without it behaves like `broadcast`. */
  emit(event: string, options: SceneEmitOptions = {}): SceneEvent {
    const name = assertEventName(event)
    const atMs = this.resolveEventTime(options.atMs)
    const source = options.source ?? 'host'
    if (options.actorId !== undefined) {
      const actor = this.get(options.actorId)
      const delivery = this.deliver(actor, name, atMs, source)
      return this.recordEvent({
        kind: 'emit',
        event: name,
        atMs,
        source,
        target: actor.id,
        payload: options.payload,
        deliveries: [delivery],
        skipped: [],
      })
    }
    return this.routeBroadcast('emit', name, atMs, source, options.payload)
  }

  /** Host broadcast: every actor whose profile does not disable `multiObject`. */
  broadcast(event: string, options: SceneBroadcastOptions = {}): SceneEvent {
    const name = assertEventName(event)
    return this.routeBroadcast('broadcast', name, this.resolveEventTime(options.atMs), options.source ?? 'host', options.payload)
  }

  /**
   * Peer event (reuses the `character/Scene` capability checks):
   * sender needs `capabilities.behaviors` containing `social`; receiver must not
   * set `abilities.multiObject === false`.
   */
  send(from: string, to: string, event: string, options: SceneSendOptions = {}): SceneEvent {
    const name = assertEventName(event)
    const fromActor = this.get(from)
    const toActor = this.get(to)
    const behaviors = fromActor.document.capabilities?.behaviors
    if (!Array.isArray(behaviors) || !behaviors.includes('social')) {
      throw new SceneRuntimeError('capability-denied', `${fromActor.id} cannot send peer events (missing social capability)`)
    }
    if (toActor.profile.abilities?.multiObject === false) {
      throw new SceneRuntimeError('capability-denied', `${toActor.id} does not accept multi-object events`)
    }
    const atMs = this.resolveEventTime(options.atMs)
    const delivery = this.deliver(toActor, name, atMs, fromActor.id)
    return this.recordEvent({
      kind: 'send',
      event: name,
      atMs,
      source: fromActor.id,
      from: fromActor.id,
      target: toActor.id,
      payload: options.payload,
      deliveries: [delivery],
      skipped: [],
    })
  }

  /** Bounded routed-event log (deterministic; replay = same seed/clock/call sequence). */
  trace(): readonly SceneEvent[] {
    return [...this.events]
  }

  /** Bounded interaction trace (grants/denials/ends only; no per-tick spam). */
  interactionLog(): readonly InteractionEvent[] {
    return [...this.interactionEvents]
  }

  clearTrace(): void {
    this.events.length = 0
    this.interactionEvents.length = 0
  }

  stats(): SceneRuntimeStats {
    const interactions: SceneInteractionStats = {
      active: this.arbiter.activeCount,
      ...this.arbiter.counters,
    }
    return {
      actors: this.actors.size,
      ticks: this.tickCount,
      behaviorSteps: this.behaviorStepTotal,
      droppedBehaviorSteps: this.droppedBehaviorSteps,
      events: this.eventSeq,
      droppedEvents: this.droppedEvents,
      interactions,
    }
  }

  /**
   * Serialisable snapshot: per-object state/layout/behaviour resume fields,
   * sorted by actor id. Interaction arbitration is deliberately not persisted
   * (transient, rebuilt from positions on the next tick).
   */
  snapshot(): SceneSnapshot {
    const actors: SceneActorSnapshot[] = sortById([...this.actors.values()]).map((actor) => ({
      id: actor.id,
      document: actor.document,
      behavior: actor.profile,
      seed: actor.seed,
      state: actor.behavior.state,
      x: actor.x,
      y: actor.y,
      zIndex: actor.zIndex,
      scale: actor.scale,
      stateEnteredAtMs: actor.stateEnteredAtMs,
      nextAmbientAtMs: actor.nextAmbientAtMs,
      rngState: actor.rng.state,
      lastDecision: actor.lastDecision,
    }))
    return cloneSnapshot({
      schema: SCENE_SNAPSHOT_SCHEMA,
      runtime: SCENE_RUNTIME_VERSION,
      seed: this.seedValue,
      clock: { ...this.clock },
      lastBehaviorStepMs: this.lastBehaviorStepMsValue,
      actors,
    })
  }

  /** Replace scene state from a snapshot (idempotent: `restore(snapshot())` then `snapshot()` is equal). */
  restore(snapshot: SceneSnapshot): void {
    const cloned = cloneSnapshot(snapshot)
    this.assertSnapshot(cloned)
    this.actors.clear()
    this.arbiter.reset()
    this.seedValue = normalizeSeed(cloned.seed)
    this.clock.nowMs = cloned.clock.nowMs
    this.clock.tick = cloned.clock.tick
    this.clock.dtMs = cloned.clock.dtMs
    this.lastBehaviorStepMsValue = cloned.lastBehaviorStepMs
    for (const entry of cloned.actors) {
      const seed = normalizeSeed(entry.seed)
      const behavior = new BehaviorRuntime(entry.behavior, { seed, initialState: entry.state })
      const rng = new SceneRng(actorRngSeed(seed, entry.id))
      rng.state = entry.rngState
      const actor = new SceneActor({
        id: entry.id,
        document: entry.document,
        profile: entry.behavior,
        behavior,
        seed,
        scale: entry.scale,
        x: entry.x,
        y: entry.y,
        zIndex: entry.zIndex,
        stateEnteredAtMs: entry.stateEnteredAtMs,
        nextAmbientAtMs: entry.nextAmbientAtMs,
        rng,
        lastDecision: entry.lastDecision,
      })
      this.actors.set(actor.id, actor)
    }
  }

  /** Snapshot then write through the adapter; returns the persisted snapshot. */
  async saveTo(store: SceneStore): Promise<SceneSnapshot> {
    const snapshot = this.snapshot()
    await store.write(snapshot)
    return snapshot
  }

  /** Read through the adapter and restore; returns false when the store is empty. */
  async loadFrom(store: SceneStore): Promise<boolean> {
    const snapshot = await store.read()
    if (snapshot === null) return false
    this.restore(snapshot)
    return true
  }

  private routeBroadcast(
    kind: 'emit' | 'broadcast',
    event: string,
    atMs: number,
    source: string,
    payload: unknown,
  ): SceneEvent {
    const deliveries: SceneDelivery[] = []
    const skipped: SceneSkippedDelivery[] = []
    for (const actor of sortById([...this.actors.values()])) {
      if (actor.profile.abilities?.multiObject === false) {
        skipped.push({ actorId: actor.id, reason: 'multiObject-disabled' })
        continue
      }
      deliveries.push(this.deliver(actor, event, atMs, source))
    }
    return this.recordEvent({ kind, event, atMs, source, payload, deliveries, skipped })
  }

  private deliver(actor: SceneActor, event: string, atMs: number, source: string): SceneDelivery {
    const previous = actor.behavior.state
    const decision = actor.behavior.decide(event, { nowMs: atMs, state: previous, source })
    actor.lastDecision = decision
    if (decision.state !== previous) {
      if (!(decision.state in actor.profile.states)) {
        throw new SceneRuntimeError('actor-invalid', `actor "${actor.id}" decided unknown state "${decision.state}"`)
      }
      actor.behavior.state = decision.state
      actor.stateEnteredAtMs = atMs
      this.rescheduleAmbient(actor, atMs)
    }
    return { actorId: actor.id, decision }
  }

  private resolveEventTime(atMs: number | undefined): number {
    if (atMs === undefined) return this.clock.nowMs
    const value = assertFiniteNumber(atMs, 'event atMs', 'event-invalid')
    if (value < 0) throw new SceneRuntimeError('event-invalid', 'event atMs must be >= 0')
    return value
  }

  private recordEvent(entry: Omit<SceneEvent, 'seq'>): SceneEvent {
    this.eventSeq += 1
    const event: SceneEvent = { seq: this.eventSeq, ...entry }
    this.events.push(event)
    if (this.events.length > this.maxTraceEntries) {
      const dropped = this.events.length - this.maxTraceEntries
      this.events.splice(0, dropped)
      this.droppedEvents += dropped
    }
    return event
  }

  private recordInteractions(events: readonly InteractionEvent[]): void {
    for (const event of events) this.interactionEvents.push(event)
    if (this.interactionEvents.length > this.maxInteractionTraceEntries) {
      const dropped = this.interactionEvents.length - this.maxInteractionTraceEntries
      this.interactionEvents.splice(0, dropped)
    }
  }

  private runBehaviorStep(atMs: number, transitions: SceneTickTransition[]): void {
    for (const actor of sortById([...this.actors.values()])) {
      this.stepActorBehavior(actor, atMs, transitions)
    }
  }

  /** One fixed behaviour step: timeout/fallback first, then idle ambient. */
  private stepActorBehavior(actor: SceneActor, atMs: number, transitions: SceneTickTransition[]): void {
    const current = actor.behavior.state
    const state = actor.profile.states[current]
    if (!state) throw new SceneRuntimeError('actor-invalid', `actor "${actor.id}" is in unknown state "${current}"`)

    const duration = this.transientDuration(actor, current)
    if (duration !== null && atMs - actor.stateEnteredAtMs >= duration) {
      const target = state.after ?? 'idle'
      const reason: SceneTransitionReason = state.timeoutMs !== undefined ? 'timeout' : 'after'
      this.transitionTo(actor, target, atMs, reason, transitions)
      return
    }

    if (current !== 'idle') return
    if (!this.hasAmbient(actor)) {
      actor.nextAmbientAtMs = null
      return
    }
    if (actor.nextAmbientAtMs === null) {
      actor.nextAmbientAtMs = atMs + this.drawAmbientInterval(actor)
      return
    }
    if (atMs < actor.nextAmbientAtMs) return
    const ambient = this.chooseAmbient(actor)
    if (ambient === null) {
      actor.nextAmbientAtMs = null
      return
    }
    if (ambient === current) {
      actor.nextAmbientAtMs = atMs + this.drawAmbientInterval(actor)
      return
    }
    this.transitionTo(actor, ambient, atMs, 'ambient', transitions)
  }

  private transitionTo(
    actor: SceneActor,
    to: string,
    atMs: number,
    reason: SceneTransitionReason,
    transitions: SceneTickTransition[],
  ): void {
    if (!(to in actor.profile.states)) {
      throw new SceneRuntimeError('actor-invalid', `actor "${actor.id}" fallback target "${to}" is not declared`)
    }
    const from = actor.behavior.state
    actor.behavior.state = to
    actor.stateEnteredAtMs = atMs
    this.rescheduleAmbient(actor, atMs)
    transitions.push({ actorId: actor.id, from, to, reason, atMs })
  }

  private rescheduleAmbient(actor: SceneActor, nowMs: number): void {
    if (actor.behavior.state !== 'idle' || !this.hasAmbient(actor)) {
      actor.nextAmbientAtMs = null
      return
    }
    actor.nextAmbientAtMs = nowMs + this.drawAmbientInterval(actor)
  }

  private hasAmbient(actor: SceneActor): boolean {
    const ambient = actor.profile.ambient
    return ambient !== undefined && ambient.choices.length > 0
  }

  private drawAmbientInterval(actor: SceneActor): number {
    const ambient = actor.profile.ambient
    if (!ambient) return 0
    const min = ambient.intervalMs[0]
    const max = ambient.intervalMs[1]
    if (max <= min) return min
    return min + Math.floor(actor.rng.next() * (max - min + 1))
  }

  private chooseAmbient(actor: SceneActor): string | null {
    const ambient = actor.profile.ambient
    if (!ambient || ambient.choices.length === 0) return null
    const total = ambient.choices.reduce((sum, choice) => sum + choice.weight, 0)
    if (total <= 0) return null
    let roll = actor.rng.next() * total
    let fallback: string | null = null
    for (const choice of ambient.choices) {
      if (choice.state in actor.profile.states) fallback = choice.state
      roll -= choice.weight
      if (roll <= 0 && choice.state in actor.profile.states) return choice.state
    }
    return fallback
  }

  /** Duration after which a state auto-falls back (`timeoutMs` > tag duration > `oneShotMs`). */
  private transientDuration(actor: SceneActor, stateName: string): number | null {
    const state = actor.profile.states[stateName]
    if (!state) return null
    if (state.timeoutMs !== undefined) return state.timeoutMs
    if (state.after === undefined) return null
    const tags: unknown = actor.document.tags
    if (isRecord(tags)) {
      const rawTag = tags[state.tag]
      if (isRecord(rawTag)) {
        const frames = rawTag.frames
        const fps = rawTag.fps
        if (
          typeof frames === 'number' &&
          Number.isFinite(frames) &&
          frames > 0 &&
          typeof fps === 'number' &&
          Number.isFinite(fps) &&
          fps > 0
        ) {
          return (frames / fps) * 1000
        }
      }
    }
    return this.oneShotMs
  }

  private assertSnapshot(snapshot: unknown): asserts snapshot is SceneSnapshot {
    if (!isRecord(snapshot)) throw new SceneRuntimeError('snapshot-invalid', 'snapshot must be an object')
    if (snapshot.schema !== SCENE_SNAPSHOT_SCHEMA) {
      throw new SceneRuntimeError(
        'snapshot-invalid',
        `unsupported snapshot schema ${String(snapshot.schema)} (runtime supports ${SCENE_SNAPSHOT_SCHEMA})`,
      )
    }
    if (typeof snapshot.runtime !== 'string') {
      throw new SceneRuntimeError('snapshot-invalid', 'snapshot.runtime must be a version string')
    }
    assertSeedValue(snapshot.seed, 'snapshot.seed', 'snapshot-invalid')
    const clock = snapshot.clock
    if (!isRecord(clock)) throw new SceneRuntimeError('snapshot-invalid', 'snapshot.clock must be an object')
    const nowMs = assertFiniteNumber(clock.nowMs, 'snapshot.clock.nowMs', 'snapshot-invalid')
    assertInteger(clock.tick, 'snapshot.clock.tick', 'snapshot-invalid', 0)
    const dtMs = assertFiniteNumber(clock.dtMs, 'snapshot.clock.dtMs', 'snapshot-invalid')
    if (nowMs < 0 || dtMs < 0) throw new SceneRuntimeError('snapshot-invalid', 'snapshot.clock times must be >= 0')
    const lastBehaviorStepMs = assertFiniteNumber(
      snapshot.lastBehaviorStepMs,
      'snapshot.lastBehaviorStepMs',
      'snapshot-invalid',
    )
    if (lastBehaviorStepMs < 0 || lastBehaviorStepMs > nowMs + Number.EPSILON * Math.max(1, nowMs)) {
      throw new SceneRuntimeError('snapshot-invalid', 'snapshot.lastBehaviorStepMs must be within [0, clock.nowMs]')
    }
    if (!Array.isArray(snapshot.actors)) {
      throw new SceneRuntimeError('snapshot-invalid', 'snapshot.actors must be an array')
    }
    if (snapshot.actors.length > this.maxActors) {
      throw new SceneRuntimeError('snapshot-invalid', `snapshot has more actors than the limit (${this.maxActors})`)
    }
    const seen = new Set<string>()
    for (const [index, raw] of snapshot.actors.entries()) {
      const context = `snapshot.actors[${index}]`
      if (!isRecord(raw)) throw new SceneRuntimeError('snapshot-invalid', `${context} must be an object`)
      const id = assertActorId(raw.id, `${context}.id`)
      if (seen.has(id)) throw new SceneRuntimeError('snapshot-invalid', `duplicate actor id in snapshot: ${id}`)
      seen.add(id)
      assertDocumentRuntime(raw.document, context)
      const behavior = assertBehaviorProfileRuntime(raw.behavior, context)
      assertSeedValue(raw.seed, `${context}.seed`, 'snapshot-invalid')
      assertFiniteNumber(raw.x, `${context}.x`, 'snapshot-invalid')
      assertFiniteNumber(raw.y, `${context}.y`, 'snapshot-invalid')
      assertInteger(raw.zIndex, `${context}.zIndex`, 'snapshot-invalid')
      if (raw.scale !== 1 && raw.scale !== 2) {
        throw new SceneRuntimeError('snapshot-invalid', `${context}.scale must be 1 or 2`)
      }
      if (typeof raw.state !== 'string' || !(raw.state in behavior.states)) {
        throw new SceneRuntimeError('snapshot-invalid', `${context}.state is not declared in its behaviour profile`)
      }
      assertFiniteNumber(raw.stateEnteredAtMs, `${context}.stateEnteredAtMs`, 'snapshot-invalid')
      if (raw.nextAmbientAtMs !== null) {
        assertFiniteNumber(raw.nextAmbientAtMs, `${context}.nextAmbientAtMs`, 'snapshot-invalid')
      }
      assertInteger(raw.rngState, `${context}.rngState`, 'snapshot-invalid', 0, 0xffffffff)
      if (raw.lastDecision !== null && !isRecord(raw.lastDecision)) {
        throw new SceneRuntimeError('snapshot-invalid', `${context}.lastDecision must be null or an object`)
      }
    }
  }
}
