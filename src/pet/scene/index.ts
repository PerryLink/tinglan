/**
 * Famling/Pearl multi-object scene runtime — entry point.
 *
 * ## Relationship to `src/pet/character/` (FCI 0.1)
 *
 * `character/scene.ts` exposes the minimal **protocol skeleton**:
 * `Actor` + `Scene` with spawn/despawn/get/list, `broadcast()` (multiObject gate)
 * and `send()` (sender `social` capability + receiver `multiObject` gate). It has
 * no clock, no layout, no persistence and never advances behaviour on its own.
 *
 * This module is the **runnable runtime** built on that protocol:
 * - `SceneRuntime` owns multiple `SceneActor`s (id, FCI document, behaviour
 *   profile, world position, z-order, integer scale).
 * - `tick(nowMs, dtMs)` advances deterministic per-actor behaviour at a fixed
 *   4 Hz default (ambient scheduling, `timeoutMs` timeout, `after` fallback)
 *   while a renderer may run at 60 Hz. Time comes only from the injected clock
 *   and `tick` arguments — no `Date.now()`/`Math.random()`.
 * - Event routing: `emit()` (host/targeted), `broadcast()`, `send()` reuse the
 *   `character/Scene` social + multiObject checks, and every routed event is
 *   recorded in a bounded, replayable trace. Replay = construct a fresh runtime
 *   with the same seed/clock and re-run the same tick/emit sequence (covered by
 *   the determinism test), or keep `trace()` as a golden fixture.
 * - Layout/z: `move`, `setZ`, `listByZ`, `bounds`, `overlapPairs`, `neighbors`.
 * - Interactions: `CharacterDocument.interactions` declarations + `nearRange`
 *   distance checks + arbitration counters (slot cap / one interaction per
 *   actor). Outcomes are intentionally NOT executed in v0.1.
 * - Per-object snapshots: `snapshot()`/`restore()` plus the `SceneStore` adapter
 *   (default `MemorySceneStore`). Snapshots are JSON-serialisable and stable;
 *   interaction arbitration is transient and rebuilt from positions.
 *
 * `CharacterDocument`/`BehaviorProfile`/`BehaviorRuntime`/`CharacterRegistry`
 * keep their existing owners — this module does not modify or re-export them
 * (import from `src/pet/character/index.ts` for pack loading/validation).
 *
 * ## Future boundaries (deliberately out of scope this round)
 *
 * - **Renderer** (`src/pet/render/**`, hero.ts): consumes `listByZ()` and each
 *   actor's `{x, y, zIndex, scale, state, tag}`; it must not own behaviour
 *   ticking. The runtime stays canvas/rAF free.
 * - **Persistence**: implement `SceneStore` over the existing Rust
 *   `write_save/read_save` slot commands (e.g. slot `pet-scene` for this
 *   snapshot, `pet_<id>` for per-object payloads). No kernel/save/voice change
 *   is required; the save envelope/cipher stays outside this module.
 * - **UI / pet.html / main.ts**: host wiring only; not touched here.
 * - **Outcome layer**: grant/deny records from `interactionLog()` are the input
 *   for a future outcome router (state/tag commands, speech, pair affinity).
 *
 * ## Determinism contract
 *
 * Same seed + same clock start + same sequence of spawn/tick/move/emit calls ⇒
 * byte-identical `snapshot()` and `trace()`. Tests cover this, including a run
 * with `Date.now`/`Math.random` poisoned.
 */
export {
  SCENE_RUNTIME_VERSION,
  SCENE_SNAPSHOT_SCHEMA,
  SceneRuntimeError,
  type ActorScale,
  type InteractionEvent,
  type InteractionEventKind,
  type InteractionReason,
  type SceneActorInit,
  type SceneActorSnapshot,
  type SceneBounds,
  type SceneBroadcastOptions,
  type SceneClock,
  type SceneDelivery,
  type SceneEmitOptions,
  type SceneErrorCode,
  type SceneEvent,
  type SceneInteractionStats,
  type SceneRect,
  type SceneRuntimeOptions,
  type SceneRuntimeStats,
  type SceneSendOptions,
  type SceneSkippedDelivery,
  type SceneSnapshot,
  type SceneStore,
  type SceneTickResult,
  type SceneTickTransition,
  type SceneTransitionReason,
  type Vec2,
} from './types.ts'
export { createSceneClock, hashSeed, normalizeSeed, SceneRng } from './clock.ts'
export { MemorySceneStore, cloneSnapshot } from './store.ts'
export {
  InteractionArbiter,
  findInteractionDeclaration,
  type InteractionActor,
  type InteractionArbiterOptions,
  type InteractionCounters,
  type InteractionDeclaration,
} from './interactions.ts'
export {
  actorFootprint,
  anchorDistance,
  compareIds,
  overlapPairs as layoutOverlapPairs,
  sceneBounds,
  sortById,
  type AnchorPoint,
  type LayoutActor,
} from './layout.ts'
export { assertActorId, assertBehaviorProfileRuntime, assertDocumentRuntime } from './validate.ts'
export { SceneActor, SceneRuntime } from './runtime.ts'
