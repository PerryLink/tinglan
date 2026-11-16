/**
 * Pluggable render layer for Famling/Pearl — Phase 1 (code only, NOT wired into
 * `pet.html`/`src/pet/main.ts`).
 *
 * Layering:
 *   types.ts        contract: RenderBackend / RendererPlugin / RenderableActor /
 *                   ActorView / errors / actorView() helper
 *   registry.ts     RendererRegistry: register first-party plugins, resolve a
 *                   pack to exactly one plugin, create backends
 *   hero-backend.ts HeroRenderBackend (wraps hero.ts CharacterRenderer) plus the
 *                   first-party `heroRendererPlugin`
 *
 * The host scene owns the canvas, backing store (future DPR) and clock; it
 * clears once per frame and calls `backend.render(ctx, view, nowMs)` for every
 * visible actor. Renderer plugins are host code; character packs are data only.
 * See `types.ts` for the full contract and the Live2D/Spine plugin notes.
 */
export {
  RENDER_API_VERSION,
  RENDER_API_MAJOR,
  RENDER_API_MINOR,
  RENDER_API_MINOR_WINDOW,
  RENDER_API_HOST_VERSION,
  RENDER_SCALES,
  RENDERER_CAPABILITY_KEYS,
  RenderError,
  UnknownPackError,
  RendererRegistryError,
  RendererConflictError,
  RenderBackendError,
  assertRenderPackRef,
  assertRenderScale,
  assertRenderApiVersionCompatible,
  explainRenderApiCompatibility,
  isRenderApiVersionCompatible,
  parseRenderApiVersion,
  actorView,
  type RenderApiVersion,
  type ParsedRenderApiVersion,
  type RenderScale,
  type RenderPackRef,
  type RenderableActor,
  type ActorView,
  type RenderBackend,
  type RendererCapabilities,
  type RendererCapabilityKey,
  type RendererOrigin,
  type RendererPlugin,
} from './types.ts'
export { RendererRegistry } from './registry.ts'
export {
  HERO_PACK_FORMATS,
  HeroRenderBackend,
  createHeroRendererPlugin,
  heroRendererPlugin,
  type HeroPackFormat,
  type HeroRenderBackendOptions,
} from './hero-backend.ts'
