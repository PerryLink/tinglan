/**
 * Hero Canvas2D render backend — wraps the existing `hero.ts` CharacterRenderer
 * behind the pluggable `RenderBackend` contract.
 *
 * Why an offscreen "stage" canvas:
 * `CharacterRenderer` was written as the only renderer in the app: it owns its
 * canvas size (`canvas.width = pack.canvas * scale`), draws the whole canvas at
 * (0,0) and starts its own `requestAnimationFrame` loop in `play()`. To compose
 * several actors on one scene canvas without rewriting (and risking) the
 * existing renderer, this backend gives each loaded pack a *private* stage
 * canvas, lets the wrapped renderer draw one still frame into it, then blits
 * that stage onto the host canvas at the actor's x/y. `play()` is never called,
 * so the backend owns no rAF: the scene clock drives every frame.
 *
 * Cost: one extra `drawImage` per actor per frame plus a stage resize in
 * `renderStill()`. That is acceptable for Phase 1 (a handful of actors); the
 * Phase 2 split (CharacterAnimator per the extensibility architecture doc) can
 * draw directly into the host context and drop the stage.
 *
 * The first-party `heroRendererPlugin` below is the intended registration entry
 * point. A plugin is host code, not pack content; packs are only data (see
 * `types.ts` for the full boundary + future Live2D/Spine notes).
 */
import {
  CharacterRenderer,
  describeCharacterPack,
  frameIndexFor,
  loadCharacterPack,
  resolveTag,
  validateCharacterPack,
  type CharacterTag,
  type LoadedCharacterPack,
} from '../hero.ts'
import {
  RENDER_API_VERSION,
  RenderBackendError,
  assertRenderPackRef,
  type ActorView,
  type RenderBackend,
  type RenderPackRef,
  type RenderScale,
  type RendererPlugin,
} from './types.ts'

/**
 * Pack formats this backend understands. These mirror the `style` values of
 * hero.ts CharacterPacks: all three share the same manifest + PNG frame layout,
 * so the same renderer handles them.
 */
export const HERO_PACK_FORMATS = ['pixel-hero', 'pixel-micro', 'hd-chibi'] as const
export type HeroPackFormat = (typeof HERO_PACK_FORMATS)[number]

/** Stage canvases start at 1× (native art pixels); actors can request 2×. */
const STAGE_SCALE: RenderScale = 1

/** Options for tests/embedders; production uses the defaults. */
export interface HeroRenderBackendOptions {
  /** Fetch used only when `pack.data` is absent (manifest fetch). Default: global fetch. */
  fetcher?: typeof fetch
  /**
   * Private offscreen stage canvas factory. Defaults to
   * `document.createElement('canvas')`; injectable so Node tests (and future
   * OffscreenCanvas hosts) can run without a DOM.
   */
  createCanvas?: () => HTMLCanvasElement
}

interface HeroSlot {
  /** The ref the slot was loaded from (locator/format are part of the identity). */
  readonly ref: RenderPackRef
  /** Validated runtime pack: asset URLs + frames grouped by tag. */
  readonly pack: LoadedCharacterPack
  /** Private stage canvas owned by this backend (never the host canvas). */
  readonly stage: HTMLCanvasElement
  /** Wrapped single-role renderer that draws into `stage`. */
  readonly renderer: CharacterRenderer
}

/** In-flight `load()` per pack id, so concurrent callers share one image load. */
interface PendingLoad {
  readonly ref: RenderPackRef
  readonly promise: Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultCreateCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new RenderBackendError(
      'hero backend needs a DOM canvas: pass HeroRenderBackendOptions.createCanvas when running headless',
    )
  }
  return document.createElement('canvas')
}

function requireScale(value: number): RenderScale {
  if (value !== 1 && value !== 2) {
    throw new RenderBackendError(`hero backend requires integer display scale 1 or 2, got ${String(value)}`)
  }
  return value
}

function requireFinite(value: number, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RenderBackendError(`hero backend: ${what} must be a finite number, got ${String(value)}`)
  }
  return value
}

function isHeroFormat(format: string): format is HeroPackFormat {
  return (HERO_PACK_FORMATS as readonly string[]).includes(format)
}

export class HeroRenderBackend implements RenderBackend {
  readonly id = 'hero'
  readonly apiVersion = RENDER_API_VERSION

  private readonly fetcher: typeof fetch
  private readonly createCanvas: () => HTMLCanvasElement
  /** Loaded packs, keyed by pack id (one slot per pack, shared by all actors). */
  private readonly slots = new Map<string, HeroSlot>()
  /** Loads in flight, keyed by pack id (concurrent callers share one promise). */
  private readonly pending = new Map<string, PendingLoad>()
  private disposed = false

  constructor(options: HeroRenderBackendOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.createCanvas = options.createCanvas ?? defaultCreateCanvas
  }

  /** Whether `packId` has been loaded already (host-side de-dupe helper). */
  isLoaded(packId: string): boolean {
    return this.slots.has(packId)
  }

  /** Loaded pack refs in load order (diagnostics). */
  loadedPacks(): RenderPackRef[] {
    return [...this.slots.values()].map((slot) => slot.ref)
  }

  /**
   * Load one pack: validate the ref (and optional pre-parsed data), then load
   * the frame images through the existing hero loader. Idempotent for the same
   * pack id; rejects a different locator/format reusing the same id so a stale
   * slot can never silently render the wrong assets.
   */
  async load(pack: RenderPackRef): Promise<void> {
    this.assertUsable('load')
    const ref = assertRenderPackRef(pack)
    if (!isHeroFormat(ref.format)) {
      throw new RenderBackendError(
        `hero backend cannot load format "${ref.format}" for pack "${ref.id}"; supported formats: [${HERO_PACK_FORMATS.join(', ')}]`,
      )
    }
    const existing = this.slots.get(ref.id)
    if (existing) {
      this.assertSameRef(existing.ref, ref, 'already loaded')
      return
    }
    const pending = this.pending.get(ref.id)
    if (pending) {
      // A scene adding two actors of the same pack may call load() twice in
      // parallel; share the in-flight image load instead of decoding twice.
      this.assertSameRef(pending.ref, ref, 'currently loading')
      return pending.promise
    }
    const promise = this.installPack(ref)
    this.pending.set(ref.id, { ref, promise })
    try {
      await promise
    } finally {
      this.pending.delete(ref.id)
    }
  }

  /**
   * Draw one actor at its resolved x/y. The host canvas is only touched here
   * (never resized/cleared). Frame index is derived from `view.elapsedMs`, so
   * the scene clock alone decides animation; `nowMs` is accepted for future
   * backends that need an absolute clock.
   */
  render(ctx: CanvasRenderingContext2D, view: ActorView, nowMs: number): void {
    this.assertUsable('render')
    void nowMs
    if (!view.visible || view.opacity <= 0) return
    const slot = this.requireSlot(view.actor.pack)
    const scale = requireScale(view.scale)
    const x = Math.round(requireFinite(view.x, 'actor view x'))
    const y = Math.round(requireFinite(view.y, 'actor view y'))
    const opacity = Number.isFinite(view.opacity) ? Math.min(1, Math.max(0, view.opacity)) : 1

    const meta = this.requireTag(slot, view.actor.tag)
    const frame = frameIndexFor(meta, view.elapsedMs)
    if (slot.renderer.getScale() !== scale) slot.renderer.setScale(scale)
    try {
      // Draws one still frame into the private stage at art-canvas * scale.
      slot.renderer.renderStill(view.actor.tag, frame)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: failed to render tag "${view.actor.tag}" for pack "${slot.pack.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }

    const stage = slot.stage
    if (stage.width <= 0 || stage.height <= 0) {
      throw new RenderBackendError(`hero backend: stage for pack "${slot.pack.id}" has no size`)
    }
    const previousAlpha = ctx.globalAlpha
    const previousSmoothing = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = previousAlpha * opacity
    try {
      // CSS-pixel units; the host may apply a DPR transform to `ctx`.
      ctx.drawImage(stage, 0, 0, stage.width, stage.height, x, y, stage.width, stage.height)
    } finally {
      ctx.globalAlpha = previousAlpha
      ctx.imageSmoothingEnabled = previousSmoothing
    }
  }

  /**
   * Alpha hit test in actor-local CSS pixels (host subtracts the actor x/y).
   * Delegates to the wrapped renderer, so it needs a DOM (`document.createElement`
   * for its sample canvas) and is therefore optional/browser-oriented.
   */
  hitTest(view: ActorView, x: number, y: number): boolean {
    this.assertUsable('hitTest')
    const slot = this.requireSlot(view.actor.pack)
    if (!view.visible) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (typeof document === 'undefined') {
      throw new RenderBackendError('hero backend hitTest requires a DOM environment (document.createElement); omit hitTest headless')
    }
    const scale = requireScale(view.scale)
    const meta = this.requireTag(slot, view.actor.tag)
    const frame = frameIndexFor(meta, view.elapsedMs)
    if (slot.renderer.getScale() !== scale) slot.renderer.setScale(scale)
    try {
      // Keep the shared stage in sync with this actor before sampling it: with
      // several actors per pack the stage's "current frame" is call-order based.
      slot.renderer.renderStill(view.actor.tag, frame)
      return slot.renderer.hitTest(x, y)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: hitTest failed for tag "${view.actor.tag}" of pack "${slot.pack.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }
  }

  /** Release every stage. Idempotent; the backend is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const slot of this.slots.values()) {
      try {
        slot.renderer.destroy()
      } catch {
        // Dispose must be best-effort: never let one bad stage block the rest.
      }
    }
    this.slots.clear()
  }

  /** Validate/load frames and install the slot. Shared by concurrent `load()`s. */
  private async installPack(ref: RenderPackRef): Promise<void> {
    const loaded = await this.readPack(ref)
    let stage: HTMLCanvasElement
    let renderer: CharacterRenderer
    try {
      stage = this.createCanvas()
      renderer = new CharacterRenderer(stage, { scale: STAGE_SCALE })
      await renderer.load(loaded)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: failed to prepare stage/frames for pack "${ref.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }
    if (this.disposed) {
      // dispose() won while images were loading; do not leak the stage.
      renderer.destroy()
      throw new RenderBackendError(`hero backend cannot load: already disposed`)
    }
    this.slots.set(ref.id, { ref, pack: loaded, stage, renderer })
  }

  /** Validate/fetch one pack into the renderer-agnostic runtime shape. */
  private async readPack(ref: RenderPackRef): Promise<LoadedCharacterPack> {
    let loaded: LoadedCharacterPack
    if (ref.data !== undefined) {
      let data: ReturnType<typeof validateCharacterPack>
      try {
        data = validateCharacterPack(ref.data)
      } catch (error) {
        throw new RenderBackendError(
          `hero backend: invalid data for pack "${ref.id}": ${messageOf(error)}`,
          { cause: error },
        )
      }
      if (data.id !== ref.id) {
        throw new RenderBackendError(
          `hero backend: pack id mismatch: ref id "${ref.id}" but manifest id "${data.id}"`,
        )
      }
      try {
        loaded = describeCharacterPack(data, ref.locator)
      } catch (error) {
        // e.g. a relative locator outside a browser cannot resolve asset URLs.
        throw new RenderBackendError(
          `hero backend: cannot resolve asset URLs for pack "${ref.id}" from locator "${ref.locator}": ${messageOf(error)}`,
          { cause: error },
        )
      }
    } else {
      try {
        loaded = await loadCharacterPack(ref.locator, this.fetcher)
      } catch (error) {
        throw new RenderBackendError(
          `hero backend: failed to load pack "${ref.id}" from "${ref.locator}": ${messageOf(error)}`,
          { cause: error },
        )
      }
      if (loaded.id !== ref.id) {
        throw new RenderBackendError(
          `hero backend: pack id mismatch: ref id "${ref.id}" but manifest id "${loaded.id}"`,
        )
      }
    }
    return loaded
  }

  private requireTag(slot: HeroSlot, tag: string): CharacterTag {
    try {
      return resolveTag(slot.pack, tag)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: ${messageOf(error)} (pack "${slot.pack.id}")`,
        { cause: error },
      )
    }
  }

  private requireSlot(pack: RenderPackRef): HeroSlot {
    const slot = this.slots.get(pack.id)
    if (!slot) {
      throw new RenderBackendError(
        `hero backend: pack "${pack.id}" is not loaded; call load(pack) before render()`,
      )
    }
    this.assertSameRef(slot.ref, pack, 'already loaded')
    return slot
  }

  /** Reject reusing one pack id with another locator/format (stale-slot guard). */
  private assertSameRef(loaded: RenderPackRef, requested: RenderPackRef, state: string): void {
    if (loaded.locator !== requested.locator || loaded.format !== requested.format) {
      throw new RenderBackendError(
        `hero backend: pack "${requested.id}" is ${state} from "${loaded.locator}" (format "${loaded.format}"), refusing "${requested.locator}" (format "${requested.format}")`,
      )
    }
  }

  private assertUsable(action: 'load' | 'render' | 'hitTest'): void {
    if (this.disposed) throw new RenderBackendError(`hero backend cannot ${action}: already disposed`)
  }
}

/**
 * Build a hero renderer plugin. Options are for tests/embedders; the exported
 * singleton `heroRendererPlugin` uses production defaults.
 */
export function createHeroRendererPlugin(options: HeroRenderBackendOptions = {}): RendererPlugin {
  return {
    id: 'hero',
    apiVersion: RENDER_API_VERSION,
    origin: 'first-party',
    name: 'hero.ts CharacterRenderer (Canvas2D pixel packs)',
    // FCI v0.2: declare the pack formats this plugin claims so hosts can
    // validate character `render.format` without instantiating a backend.
    formats: HERO_PACK_FORMATS,
    capabilities: {
      // hero.ts draws frames into a private stage canvas, then blits it.
      offscreenComposite: true,
      hitTest: true,
    },
    match(pack) {
      return isHeroFormat(pack.format)
    },
    create() {
      return new HeroRenderBackend(options)
    },
  }
}

/**
 * The first-party hero renderer plugin — register this in the host's
 * `RendererRegistry` alongside any future Live2D/Spine plugins.
 */
export const heroRendererPlugin: RendererPlugin = createHeroRendererPlugin()
