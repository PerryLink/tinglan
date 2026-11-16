/**
 * Famling / Pearl render-layer abstraction — Phase 1 (code only).
 *
 * Why this exists: `hero.ts`'s `CharacterRenderer` is a single-role Canvas2D
 * renderer that owns its own canvas, its own `requestAnimationFrame` loop and
 * draws itself at (0,0). That is fine for the current Look Test / single-pearl
 * shell, but the next steps need (a) more than one actor on one scene canvas and
 * (b) renderer families other than Canvas2D pixel art (Live2D / Spine / 3D)
 * without letting character packs execute code.
 *
 * This module is the *contract* between the host scene and such renderers:
 *
 * - `RenderBackend` — one runtime renderer instance. It loads pack data, draws
 *   actors when the host asks, optionally hit-tests, and can be disposed. It
 *   owns no animation loop: the scene clock drives every frame.
 * - `RendererPlugin` — first-party host code that claims one or more pack
 *   formats and creates backends. Character packs are data only; they never
 *   ship a plugin. See the "first-party boundary" note on `RendererPlugin`.
 * - `RenderableActor` / `ActorView` — the data a scene hands to a backend for
 *   one actor and one frame. The actor is the source of truth; the view is the
 *   resolved snapshot (clock included).
 * - `RendererRegistry` (see `registry.ts`) — registers plugins and resolves a
 *   pack to exactly one plugin, rejecting unknown packs and ambiguity.
 *
 * Hard contracts every backend must honour
 * ----------------------------------------
 * 1. **Canvas ownership.** The host owns exactly one target canvas and its
 *    backing store. Backends only draw: they never resize, clear or recreate
 *    the target canvas, and never start a `requestAnimationFrame` loop. The
 *    host clears once per frame and calls `render()` for every visible actor.
 * 2. **Coordinates are CSS pixels** relative to the target canvas top-left.
 *    Device-pixel-ratio backing stores are a host concern: the host may size
 *    `canvas.width = cssWidth * dpr` and call
 *    `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once per resize; backends then
 *    draw in CSS pixels. Backends must not leave a mutated transform or
 *    `globalAlpha` behind, so future WebGL/3D backends can compose.
 * 3. **Integer scale only.** `RenderableActor.scale` is `1` or `2`; fractional
 *    scales are rejected. Pixel art must stay crisp (nearest-neighbour,
 *    integer placement) even on fractional-DPR displays.
 * 4. **Multi-actor.** One backend instance may render any number of actors on
 *    the same canvas (e.g. two pearls in one scene). `render()` must be
 *    stateless per call: all per-actor state comes from the `ActorView`, and
 *    any internal cache is keyed by pack id (not by "the current actor").
 * 5. **Data-only packs.** `RenderPackRef` carries a locator plus already-parsed
 *    JSON data. Pack content is never evaluated as code. Renderer plugins are
 *    host code (signed/audited at release time), see `RendererPlugin.origin`.
 *
 * Phase gate note: this module is additive and is **not** wired into `pet.html`
 * or `src/pet/main.ts`. The Phase 2 gate decides when the shell switches over.
 */

/**
 * Render-API versioning (v1.2 as of FCI v0.2).
 *
 * `RENDER_API_VERSION` stays the legacy integer MAJOR so existing v1 plugins
 * (`apiVersion: 1`) keep working unchanged. The negotiated host version is
 * `RENDER_API_HOST_VERSION` = MAJOR.MINOR:
 *
 * - A plugin's `apiVersion` may be a bare integer MAJOR (legacy, means "any
 *   MINOR of this MAJOR") or an exact `"MAJOR.MINOR"` string.
 * - MAJOR must match the host exactly.
 * - A plugin targeting an explicit MINOR must fall inside the host's
 *   compatibility window: `[hostMinor - RENDER_API_MINOR_WINDOW, hostMinor]`.
 *   A newer plugin MINOR is refused (the host cannot implement it yet); an
 *   older MINOR outside the window is refused (the host has dropped it).
 *
 * The v1 contract (scene owns the canvas/clock; a plugin resolves one pack) is
 * frozen. v1.2 (FCI v0.2) adds *optional* plugin metadata (`formats`,
 * `capabilities`) and this negotiation, so it is purely additive: any plugin
 * declaring the legacy integer MAJOR keeps binding unchanged.
 */
export const RENDER_API_VERSION = 1 as const
export const RENDER_API_MAJOR = 1 as const
export const RENDER_API_MINOR = 2 as const
/** How many older MINORs a host still accepts from plugins (one release cycle). */
export const RENDER_API_MINOR_WINDOW = 1 as const
/** Host render-API version as MAJOR.MINOR (must equal RENDER_API_MAJOR.RENDER_API_MINOR). */
export const RENDER_API_HOST_VERSION = '1.2' as const

/**
 * Plugin/backend render-API declaration: bare integer MAJOR (legacy) or an
 * exact `"MAJOR.MINOR"` string. Parsed/negotiated by the helpers below.
 */
export type RenderApiVersion = number | `${number}.${number}`

/** Parsed `RenderApiVersion`; `minor === null` means a legacy MAJOR-only declaration. */
export interface ParsedRenderApiVersion {
  readonly major: number
  readonly minor: number | null
  readonly text: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Parse a plugin/backend `apiVersion`; throws `RenderError` for malformed values. */
export function parseRenderApiVersion(version: unknown, what = 'render apiVersion'): ParsedRenderApiVersion {
  if (typeof version === 'number') {
    if (!Number.isInteger(version) || version < 0) {
      throw new RenderError(`${what} must be a non-negative integer MAJOR or a "MAJOR.MINOR" string, got ${describeValue(version)}`)
    }
    return { major: version, minor: null, text: String(version) }
  }
  if (typeof version === 'string') {
    const match = /^(\d+)\.(\d+)$/.exec(version)
    if (!match) {
      throw new RenderError(`${what} must be a non-negative integer MAJOR or a "MAJOR.MINOR" string, got ${JSON.stringify(version)}`)
    }
    return { major: Number(match[1]), minor: Number(match[2]), text: version }
  }
  throw new RenderError(`${what} must be a non-negative integer MAJOR or a "MAJOR.MINOR" string, got ${describeValue(version)}`)
}

function explainParsedRenderApiVersion(parsed: ParsedRenderApiVersion): { compatible: boolean; reason: string } {
  if (parsed.major !== RENDER_API_MAJOR) {
    return { compatible: false, reason: `MAJOR ${parsed.major} does not match host MAJOR ${RENDER_API_MAJOR}` }
  }
  if (parsed.minor === null) {
    return { compatible: true, reason: `legacy MAJOR-only declaration accepted by host ${RENDER_API_HOST_VERSION}` }
  }
  const minMinor = Math.max(0, RENDER_API_MINOR - RENDER_API_MINOR_WINDOW)
  if (parsed.minor > RENDER_API_MINOR) {
    return { compatible: false, reason: `MINOR ${parsed.minor} is newer than host MINOR ${RENDER_API_MINOR}` }
  }
  if (parsed.minor < minMinor) {
    return { compatible: false, reason: `MINOR ${parsed.minor} is outside the host compatibility window ${minMinor}..${RENDER_API_MINOR}` }
  }
  return { compatible: true, reason: `compatible with host ${RENDER_API_HOST_VERSION}` }
}

/** Explain whether a plugin/backend `apiVersion` can bind to this host (never throws). */
export function explainRenderApiCompatibility(version: unknown, what = 'render apiVersion'): { compatible: boolean; reason: string } {
  let parsed: ParsedRenderApiVersion
  try {
    parsed = parseRenderApiVersion(version, what)
  } catch (error) {
    return { compatible: false, reason: errorMessage(error) }
  }
  return explainParsedRenderApiVersion(parsed)
}

/** True when a plugin/backend `apiVersion` can bind to this host. */
export function isRenderApiVersionCompatible(version: unknown, what = 'render apiVersion'): boolean {
  return explainRenderApiCompatibility(version, what).compatible
}

/**
 * Assert a plugin/backend `apiVersion` is compatible; returns the parsed form.
 * Throws `RendererRegistryError` with the host version + reason, for hosts and
 * tests that prefer a ready-made diagnostic. The registry itself uses
 * `explainRenderApiCompatibility()` so it can add the plugin id/context.
 */
export function assertRenderApiVersionCompatible(version: unknown, what = 'render apiVersion'): ParsedRenderApiVersion {
  const parsed = parseRenderApiVersion(version, what)
  const explained = explainParsedRenderApiVersion(parsed)
  if (!explained.compatible) {
    throw new RendererRegistryError(`${what} ${parsed.text} is incompatible with host ${RENDER_API_HOST_VERSION}: ${explained.reason}`)
  }
  return parsed
}

/** Integer display scale. Pixel art only supports 1× and 2× (no 1.5×). */
export type RenderScale = 1 | 2
export const RENDER_SCALES: readonly RenderScale[] = [1, 2]

/** Pack ids share the FCI character-id shape (lowercase, dots/dashes/underscores). */
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/

/**
 * A character pack as the render layer sees it.
 *
 * `format` is the coarse data family that decides which plugin renders it
 * (e.g. `pixel-hero` for hero.ts packs, later `live2d-model3` / `spine-json`).
 * `locator` is backend-specific: for the hero backend it is the base URL of a
 * `manifest.json` directory; for a Live2D backend it would be the model
 * directory. `data` is an optional pre-fetched/validated JSON payload so a host
 * that already validated the pack does not have to fetch it twice (and so Node
 * tests do not need a network).
 *
 * The object is intentionally data-only; its fields must stay JSON-shaped.
 */
export interface RenderPackRef {
  /** Pack id; must equal the id inside the pack manifest (backends verify). */
  readonly id: string
  /** Coarse data-format family, e.g. `pixel-hero`. */
  readonly format: string
  /** Backend-specific pack locator (hero: base directory URL). */
  readonly locator: string
  /** Optional already-parsed pack JSON. Never a function, never executable. */
  readonly data?: unknown
  /** Optional content digest for first-party audit / cache keys (unused today). */
  readonly digest?: string
}

/**
 * One actor as the scene wants it rendered this frame.
 *
 * Positions are the actor's top-left in CSS pixels on the target canvas. The
 * scene owns interpolation/behaviour; the backend only rasterises. `params`
 * is backend-specific data (e.g. Live2D parameter values) and must stay data
 * only — it is the escape hatch for renderer-family extras, not for code.
 */
export interface RenderableActor {
  /** Unique within the scene; also the cache key for per-actor backend state. */
  readonly id: string
  readonly pack: RenderPackRef
  /** Animation tag inside the pack; an unknown tag is an error, not a fallback. */
  readonly tag: string
  /** Top-left position on the target canvas, CSS px. */
  readonly x: number
  readonly y: number
  /** Integer display scale; defaults to 1. */
  readonly scale?: RenderScale
  /** 0..1; defaults to 1. */
  readonly opacity?: number
  /** Defaults to true; invisible actors are not drawn. */
  readonly visible?: boolean
  /** Painter order hint for the host's scene sort; backends may ignore it. */
  readonly z?: number
  /**
   * Added to the scene clock for this actor (ms). Lets two actors share a clock
   * but start their loops at different phases, or lets one actor start "in the
   * past". Negative values are allowed; the resolved elapsed time clamps at 0.
   */
  readonly timeOffsetMs?: number
  /** Backend-specific, data-only extras (e.g. Live2D expression weights). */
  readonly params?: Readonly<Record<string, unknown>>
}

/**
 * Resolved per-frame view of an actor. Built by the host (or `actorView()`) —
 * never by a backend — so the clock and layout stay under scene control.
 */
export interface ActorView {
  readonly actor: RenderableActor
  /** Scene-clock time for this actor, clamped to >= 0, in ms. */
  readonly elapsedMs: number
  /** Resolved top-left position in CSS px. */
  readonly x: number
  readonly y: number
  readonly scale: RenderScale
  readonly opacity: number
  readonly visible: boolean
}

/**
 * A runtime renderer instance.
 *
 * Lifecycle: `new` (cheap, no I/O) → `load(pack)` once per distinct pack →
 * `render(...)` N times per frame → `dispose()`. A backend may be asked to
 * load several packs (e.g. two pearls using different packs) and to render
 * many actors, but it must never schedule work on its own.
 */
export interface RenderBackend {
  /** Backend implementation id (typically equals the plugin id), used in errors. */
  readonly id: string
  /**
   * Render-API version this backend implements. Bare integer MAJOR (legacy) or
   * exact `"MAJOR.MINOR"`; the registry negotiates it with the host on create().
   */
  readonly apiVersion: RenderApiVersion
  /**
   * Load one pack's data and assets. Must be safe to call twice with the same
   * pack (idempotent) and may be called once per distinct pack id. The target
   * canvas is not involved here; backends may use private offscreen canvases.
   */
  load(pack: RenderPackRef): Promise<void>
  /**
   * Draw one actor into the host canvas. Called by the scene once per frame and
   * actor, after the host has cleared the canvas. Must not clear or resize the
   * target canvas, and must leave `globalAlpha`/transform as it found them.
   *
   * `nowMs` is the scene clock; animation time for pixel/stateful backends is
   * usually carried by `view.elapsedMs`, while video/3D backends may prefer the
   * absolute clock. Hero backend only uses `view.elapsedMs`.
   */
  render(ctx: CanvasRenderingContext2D, view: ActorView, nowMs: number): void
  /**
   * Optional alpha hit test. `x`/`y` are CSS pixels **relative to the actor's
   * top-left** (not canvas coordinates), matching how a scene maps a pointer
   * event after subtracting the actor position. Must return `false` for
   * invisible actors and out-of-bounds points.
   */
  hitTest?(view: ActorView, x: number, y: number): boolean
  /** Release images/canvases. Idempotent; the backend is unusable afterwards. */
  dispose(): void
}

/**
 * How a renderer plugin is trusted. Only host code may render:
 * - `first-party`: compiled/audited code shipped with the app, pinned & signed
 *   by the release pipeline. It is bundled with the host, never downloaded
 *   from a character pack, and reviewed like any other first-party module.
 *
 * There is deliberately no `community`/`third-party` value yet. Live2D/Spine
 * renderers will also be first-party code (the *model files* stay data).
 */
export type RendererOrigin = 'first-party'

/**
 * Optional capability advertisement (FCI v0.2 / render API v1.2).
 *
 * These are *declarations*, not new contract requirements: they let a host
 * choose a renderer without instantiating it, and let the registry cross-check
 * the created backend. A future Live2D/Spine backend advertises
 * `offscreenComposite: true` (it renders to a private stage and blits), while
 * the hero backend advertises `offscreenComposite` + `hitTest`.
 *
 * `paramsSchema` describes the backend-specific params a renderer accepts
 * (pack-side `render.params` / actor `params`). It is a JSON Schema-shaped data
 * object, validated as data-only by the registry; the FCI runtime does not
 * evaluate it yet (forward hook for first-party renderers).
 */
export interface RendererCapabilities {
  /** Backend renders through its own offscreen canvas/GL stage, then composites. */
  readonly offscreenComposite?: boolean
  /** Backend implements `RenderBackend.hitTest` (registry verifies on create()). */
  readonly hitTest?: boolean
  /** Data-only JSON Schema describing renderer-specific params; advisory today. */
  readonly paramsSchema?: Readonly<Record<string, unknown>>
}

/** Allowed capability keys (typos are rejected at registration). */
export const RENDERER_CAPABILITY_KEYS = ['offscreenComposite', 'hitTest', 'paramsSchema'] as const
export type RendererCapabilityKey = (typeof RENDERER_CAPABILITY_KEYS)[number]

/**
 * A first-party renderer plugin: the registration unit for a renderer family.
 *
 * First-party boundary (design, enforced at runtime by `RendererRegistry`):
 * 1. **Plugins are host code.** A plugin module is bundled/pinned with the
 *    app, goes through source review and release signing, and is imported at
 *    startup. The runtime registry has no eval/network/plugin-loading path, so
 *    a character pack can never smuggle code in.
 * 2. **Packs are data.** A pack (JSON + images/audio/model files) only selects
 *    a `format` and provides a `locator`; it cannot add plugins or extend the
 *    renderer. Unknown/unsigned formats simply fail to resolve.
 * 3. **Registration is explicit.** At startup the host calls
 *    `new RendererRegistry([heroRendererPlugin, ...])`. The registry rejects
 *    duplicate ids, incompatible `apiVersion`s (see `RENDER_API_HOST_VERSION`),
 *    non-first-party origins, malformed format/capability declarations and (at
 *    resolve time) packs claimed by more than one plugin.
 * 4. **Future plugins** register here too, e.g.:
 *    - `live2d-cubism`: declares `formats: ['live2d-model3']`,
 *      `capabilities: { offscreenComposite: true }`; `create()` returns a
 *      backend that loads Cubism model JSON + textures, advances the model with
 *      `nowMs`, renders to a private WebGL/2D stage and blits into the host 2D
 *      context (the v1 `render()` target is a `CanvasRenderingContext2D`, so
 *      WebGL backends composite offscreen).
 *    - `spine`: declares `formats: ['spine-json']`, same offscreen composite
 *      path, still integer-scale nearest-neighbour for pixel skins.
 *    - A future MAJOR bump can widen the target type (e.g. a `RenderTarget`
 *      union) for true 3D backends; MINOR bumps stay additive like v1.2.
 */
export interface RendererPlugin {
  /** Stable plugin id (duplicate ids are rejected by the registry). */
  readonly id: string
  /**
   * Render-API version this plugin targets. Bare integer MAJOR = legacy "any
   * MINOR of this MAJOR" declaration; `"MAJOR.MINOR"` = exact MINOR (must be in
   * the host window). MAJOR must match the host exactly.
   */
  readonly apiVersion: RenderApiVersion
  /** Trust boundary: only audited host code is accepted. */
  readonly origin: RendererOrigin
  /** Optional human-readable name for diagnostics. */
  readonly name?: string
  /**
   * Optional declared pack formats (FCI v0.2). When present, the registry uses
   * it as an allowlist *before* calling `match()`, and
   * `RendererRegistry.formats()` exposes the union so a host can validate
   * character `render.format` values. Characters may only select formats a
   * registered plugin declares (or that `match()` accepts when undeclared).
   */
  readonly formats?: readonly string[]
  /** Optional capability advertisement; see `RendererCapabilities`. */
  readonly capabilities?: RendererCapabilities
  /**
   * Return true if this plugin can render the pack. Must be pure and cheap
   * (called for every pack resolution) and must reject formats it does not
   * understand. Exactly one registered plugin may match a pack; overlaps are
   * surfaced as a conflict instead of a silent priority order.
   */
  match(pack: RenderPackRef): boolean
  /** Create a fresh backend instance. Cheap: no pack I/O until `load()`. */
  create(): RenderBackend
}

/** Base class for all render-layer errors, so hosts can catch one type. */
export class RenderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RenderError'
  }
}

/** No registered plugin matches a pack (unknown format) or the ref is malformed. */
export class UnknownPackError extends RenderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UnknownPackError'
  }
}

/** A plugin registration is invalid (duplicate id, stale apiVersion, bad origin). */
export class RendererRegistryError extends RenderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RendererRegistryError'
  }
}

/** More than one plugin claims the same pack; registration is ambiguous. */
export class RendererConflictError extends RendererRegistryError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RendererConflictError'
  }
}

/** Backend misuse/misconfiguration: not loaded, disposed, bad pack id, bad view. */
export class RenderBackendError extends RenderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RenderBackendError'
  }
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return typeof value
}

function requireFiniteNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RenderError(`${what} must be a finite number, got ${describeValue(value)}`)
  }
  return value
}

function requireNonEmptyString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RenderError(`${what} must be a non-empty string`)
  }
  return value
}

/**
 * Validate and normalise a pack reference at the render-layer boundary.
 * Keeps every entry point (registry, backend) from trusting loose JSON.
 */
export function assertRenderPackRef(value: unknown): RenderPackRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnknownPackError('render pack ref must be an object')
  }
  const raw = value as Record<string, unknown>
  const id = requireNonEmptyString(raw.id, 'render pack id')
  if (!PACK_ID_PATTERN.test(id)) {
    throw new UnknownPackError(`render pack id must match ${String(PACK_ID_PATTERN)}, got ${JSON.stringify(id)}`)
  }
  const format = requireNonEmptyString(raw.format, `render pack "${id}" format`)
  const locator = requireNonEmptyString(raw.locator, `render pack "${id}" locator`)
  if (raw.data !== undefined && typeof raw.data === 'function') {
    throw new UnknownPackError(`render pack "${id}" data must be data-only (functions are not allowed)`)
  }
  if (raw.digest !== undefined && typeof raw.digest !== 'string') {
    throw new UnknownPackError(`render pack "${id}" digest must be a string`)
  }
  return {
    id,
    format,
    locator,
    ...(raw.data !== undefined ? { data: raw.data } : {}),
    ...(typeof raw.digest === 'string' && raw.digest.length > 0 ? { digest: raw.digest } : {}),
  }
}

/** Validate that a value is one of the integer display scales. */
export function assertRenderScale(value: unknown, what = 'scale'): RenderScale {
  if (value !== 1 && value !== 2) {
    throw new RenderError(`${what} must be integer 1 or 2, got ${describeValue(value)}`)
  }
  return value
}

/**
 * Resolve a `RenderableActor` into the per-frame `ActorView` the backends read.
 *
 * The host computes `elapsedMs` from its scene clock, then calls this helper so
 * defaults/clamping/validation live in one place. `elapsedMs` is clamped to
 * >= 0; negative values (e.g. a start offset in the future) resolve to 0.
 */
export function actorView(actor: RenderableActor, elapsedMs: number): ActorView {
  if (typeof actor !== 'object' || actor === null) throw new RenderError('renderable actor must be an object')
  requireNonEmptyString(actor.id, 'actor.id')
  requireNonEmptyString(actor.tag, 'actor.tag')
  const pack = assertRenderPackRef(actor.pack)
  const x = requireFiniteNumber(actor.x, `actor "${actor.id}" x`)
  const y = requireFiniteNumber(actor.y, `actor "${actor.id}" y`)
  const scale = actor.scale === undefined ? 1 : assertRenderScale(actor.scale, `actor "${actor.id}" scale`)
  const opacityRaw = actor.opacity === undefined ? 1 : actor.opacity
  if (typeof opacityRaw !== 'number' || !Number.isFinite(opacityRaw)) {
    throw new RenderError(`actor "${actor.id}" opacity must be a finite number`)
  }
  const elapsed = typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return {
    // Keep the caller's actor object: its identity stays stable across frames,
    // so a backend may cache by reference. The pack ref above is validated.
    actor,
    elapsedMs: elapsed,
    x,
    y,
    scale,
    opacity: Math.min(1, Math.max(0, opacityRaw)),
    visible: actor.visible !== false,
  }
}
