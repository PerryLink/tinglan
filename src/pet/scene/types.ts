/**
 * Famling/Pearl multi-object scene runtime — public contracts.
 *
 * Pure types + the shared error class; the runnable implementation is
 * `runtime.ts`. This module sits *above* `src/pet/character/` (FCI 0.1):
 *
 * - `character/Scene` is the minimal protocol skeleton (Actor/Scene:
 *   spawn/despawn/emit/broadcast/send). It has no clock, no layout, no
 *   persistence and no arming of per-actor behaviour ticks.
 * - `scene/SceneRuntime` is the runnable superset: deterministic clock/RNG,
 *   4 Hz behaviour ticks (ambient / timeout / fallback), z-order & layout
 *   queries, interaction arbitration and per-object snapshots through a
 *   `SceneStore` adapter. It still does no rendering.
 *
 * Determinism contract: the runtime never calls `Date.now()` or
 * `Math.random()`; time arrives through `tick(nowMs, dtMs)` and randomness
 * from seeded streams. Same seed + clock + call sequence ⇒ same snapshot.
 */
import {
  CharacterInterfaceError,
  type BehaviorDecision,
  type BehaviorProfile,
  type CharacterDocument,
} from '../character/types.ts'

export const SCENE_RUNTIME_VERSION = '0.1.0' as const
export const SCENE_SNAPSHOT_SCHEMA = 1 as const

/** Rendering scale, mirroring hero.ts `PixelScale` (integer only). */
export type ActorScale = 1 | 2

/** World-space anchor position (the document anchor point, e.g. foot-center). */
export interface Vec2 {
  x: number
  y: number
}

/** Axis-aligned world rectangle, used for foot-print bounds/overlap queries. */
export interface SceneRect {
  x: number
  y: number
  w: number
  h: number
}

/** Union of every actor foot-print, in world pixels. */
export interface SceneBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Deterministic scene clock. The host owns time: `SceneRuntime.tick(nowMs,
 * dtMs)` writes into this object. `dtMs` is informational for the renderer;
 * behaviour scheduling is anchored to `nowMs`, `tick` and `lastBehaviorStepMs`.
 */
export interface SceneClock {
  nowMs: number
  tick: number
  dtMs: number
}

export type SceneErrorCode =
  | 'config-invalid'
  | 'actor-invalid-id'
  | 'actor-duplicate'
  | 'actor-unknown'
  | 'actor-limit'
  | 'actor-invalid'
  | 'event-invalid'
  | 'capability-denied'
  | 'clock-invalid'
  | 'snapshot-invalid'

/**
 * Scene-level error. Extends `CharacterInterfaceError` so hosts that already
 * catch FCI errors keep working; `code` gives machine-readable causes.
 */
export class SceneRuntimeError extends CharacterInterfaceError {
  readonly code: SceneErrorCode

  constructor(code: SceneErrorCode, message: string) {
    super(message)
    this.name = 'SceneRuntimeError'
    this.code = code
  }
}

/** Options accepted by `SceneRuntime.spawn()`. */
export interface SceneActorInit {
  /** Live instance id (`^[a-z0-9][a-z0-9._-]{0,63}$`). */
  id: string
  /** FCI document; treated as read-only JSON data (data-only packs). */
  document: CharacterDocument
  /** Behaviour profile, normally loaded from `behavior.json` / document.behavior. */
  behavior: BehaviorProfile
  /** World anchor x (same unit as `footBox`, i.e. logical pixels). */
  x: number
  /** World anchor y. */
  y: number
  /** Draw order; higher draws later/on top. Default 0. */
  zIndex?: number
  /** Integer display scale; defaults to `document.display.scale ?? 1`. */
  scale?: ActorScale
  /** Deterministic seed for this actor; defaults to hash(runtime seed, id). */
  seed?: number
  /** Initial behaviour state; defaults to `'idle'`. */
  initialState?: string
}

/** Options for `SceneRuntime.emit()` / `broadcast()` / `send()`. */
export interface SceneEmitOptions {
  /** Route to exactly one actor (host targeted event). Omit for broadcast. */
  actorId?: string
  /** Logical event source recorded in the trace; defaults to `'host'`. */
  source?: string
  /** Opaque JSON payload; stored in the trace only (behaviour v0.1 ignores it). */
  payload?: unknown
  /** Event timestamp; defaults to `clock.nowMs`. Must be finite and >= 0. */
  atMs?: number
}

/** Options for `SceneRuntime.broadcast()`. */
export interface SceneBroadcastOptions {
  source?: string
  payload?: unknown
  atMs?: number
}

/** Options for `SceneRuntime.send()`. */
export interface SceneSendOptions {
  payload?: unknown
  atMs?: number
}

/** One actor that received an event, with the behaviour decision it produced. */
export interface SceneDelivery {
  readonly actorId: string
  readonly decision: BehaviorDecision
}

/** Actors deliberately not delivered to (capability gate). */
export interface SceneSkippedDelivery {
  readonly actorId: string
  readonly reason: 'multiObject-disabled'
}

/** Immutable routed-event log entry (`trace()`), replayable with the same seed/clock. */
export interface SceneEvent {
  readonly seq: number
  readonly kind: 'emit' | 'broadcast' | 'send'
  readonly event: string
  readonly atMs: number
  readonly source: string
  /** Present for `send`. */
  readonly from?: string
  /** Present when a single actor was targeted. */
  readonly target?: string
  readonly payload?: unknown
  /** Deliveries in actor-id order (deterministic). */
  readonly deliveries: readonly SceneDelivery[]
  /** Capability-gated actors, in actor-id order. */
  readonly skipped: readonly SceneSkippedDelivery[]
}

/** Why an actor left its state during a behaviour tick. */
export type SceneTransitionReason = 'timeout' | 'after' | 'ambient'

export interface SceneTickTransition {
  readonly actorId: string
  readonly from: string
  readonly to: string
  readonly reason: SceneTransitionReason
  /** Behaviour-step boundary timestamp (not necessarily the render tick time). */
  readonly atMs: number
}

export type InteractionEventKind = 'grant' | 'deny' | 'end'

export type InteractionReason =
  | 'granted'
  | 'interaction-limit'
  | 'actor-busy'
  | 'cooldown'
  | 'no-declaration'
  | 'left-range'

/**
 * Interaction placeholder record. The runtime only detects proximity, checks
 * declarations and arbitrates slots; `outcome` is deliberately NOT applied.
 */
export interface InteractionEvent {
  readonly seq: number
  readonly kind: InteractionEventKind
  readonly atMs: number
  /** Canonical pair order: `a < b` by actor id. */
  readonly a: string
  readonly b: string
  readonly declarationId: string | null
  readonly on: string | null
  readonly reason: InteractionReason
  readonly distPx: number
}

/** Result of one `tick(nowMs, dtMs)`. */
export interface SceneTickResult {
  readonly nowMs: number
  readonly dtMs: number
  /** Behaviour steps executed this tick (4 Hz by default; may be 0). */
  readonly behaviorSteps: number
  readonly transitions: readonly SceneTickTransition[]
  readonly interactions: readonly InteractionEvent[]
}

/** Per-actor serialisable state. `document`/`behavior` are embedded for a lossless v0.1 restore. */
export interface SceneActorSnapshot {
  readonly id: string
  readonly document: CharacterDocument
  /** Behaviour profile (the `behavior` field in `SceneActorInit`). */
  readonly behavior: BehaviorProfile
  readonly seed: number
  readonly state: string
  readonly x: number
  readonly y: number
  readonly zIndex: number
  readonly scale: ActorScale
  readonly stateEnteredAtMs: number
  readonly nextAmbientAtMs: number | null
  /** Internal scene RNG cursor (ambient scheduling); enables exact resume. */
  readonly rngState: number
  readonly lastDecision: BehaviorDecision | null
}

/**
 * Full scene snapshot. JSON-serialisable and stable (actors sorted by id).
 * Interaction arbitration state is transient and rebuilt from positions; it is
 * intentionally NOT part of the snapshot (v0.1: layout + per-object state only).
 */
export interface SceneSnapshot {
  readonly schema: typeof SCENE_SNAPSHOT_SCHEMA
  readonly runtime: typeof SCENE_RUNTIME_VERSION
  readonly seed: number
  readonly clock: SceneClock
  readonly lastBehaviorStepMs: number
  readonly actors: readonly SceneActorSnapshot[]
}

/**
 * Persistence adapter. Default implementation is `MemorySceneStore`.
 * A future Tauri adapter can wrap the existing Rust `write_save`/`read_save`
 * slot commands (slot `pet-scene` for the layout index, `pet_<id>` per object)
 * WITHOUT touching kernel/save — see `store.ts` header.
 */
export interface SceneStore {
  write(snapshot: SceneSnapshot): Promise<void>
  read(): Promise<SceneSnapshot | null>
}

/** Interaction counter snapshot (`stats().interactions`). */
export interface SceneInteractionStats {
  active: number
  granted: number
  denied: number
  unmatched: number
  ended: number
}

export interface SceneRuntimeStats {
  actors: number
  ticks: number
  behaviorSteps: number
  droppedBehaviorSteps: number
  events: number
  droppedEvents: number
  interactions: SceneInteractionStats
}

/** Constructor options; every field has a deterministic default. */
export interface SceneRuntimeOptions {
  /** Runtime seed, used to derive per-actor seeds. Default 1. */
  seed?: number
  /** Behaviour decision interval in ms. Default 250 (4 Hz). */
  behaviorIntervalMs?: number
  /** Max behaviour steps executed per tick (catch-up cap). Default 8. */
  maxCatchUpSteps?: number
  /** Max live actors. Default 32. */
  maxActors?: number
  /** Hold time for one-shot states without `timeoutMs`/tag duration. Default 1000. */
  oneShotMs?: number
  /** Distance (anchor-to-anchor px) at which interactions are considered. Default 64. */
  nearRange?: number
  /** Arbitration slot limit for concurrent interactions. Default 2. */
  maxConcurrentInteractions?: number
  /** Cooldown after an interaction ends before the pair may re-engage. Default 0. */
  interactionCooldownMs?: number
  /** Bounded event-trace length. Default 1024. */
  maxTraceEntries?: number
  /** Bounded interaction-trace length. Default 512. */
  maxInteractionTraceEntries?: number
  /** Injected clock (host may read it back). Defaults to a fresh clock at 0. */
  clock?: SceneClock
}
