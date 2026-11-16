/**
 * Famling Character Interface (FCI) — data-only character/pet definitions.
 *
 * v0.2 (2026-11-15) is additive over v0.1:
 * - `apiVersion` is now `'0.1' | '0.2'`; the runtime accepts a MINOR window
 *   (0.1 and 0.2) within the same MAJOR (see docs/CHARACTER-INTERFACE-V0.2.md).
 * - Optional `render: { format, params? }` selects which host-registered
 *   renderer format draws the character; unknown formats are rejected.
 * - `minRuntime` is negotiated against `CHARACTER_RUNTIME_VERSION` on load.
 * - v0.1 documents keep loading unchanged (backward compatibility).
 *
 * Additive layer: does not replace `hero.ts`. A runtime (or shell) can load a
 * CharacterDocument, resolve behaviour from JSON, and hand the compatible
 * animation pack to the existing CharacterRenderer. No pack code is executed.
 *
 * Design sources: real-industry specs (VRM/glTF/Live2D/Spine/Rive) reduced to
 * what a 2D pixel desktop pet needs; see docs/CHARACTER-INTERFACE.md and
 * docs/CHARACTER-INTERFACE-V0.2.md.
 */

/** Newest FCI version this runtime implements (written into new documents). */
export const CHARACTER_API_VERSION = '0.2' as const
/** Oldest FCI version this runtime still reads (backward-compat MINOR window). */
export const CHARACTER_API_MIN_VERSION = '0.1' as const
/** FCI `apiVersion` values accepted by this runtime; MAJOR is exact, MINOR window = this list. */
export const CHARACTER_API_VERSIONS = ['0.1', '0.2'] as const
export type CharacterApiVersion = (typeof CHARACTER_API_VERSIONS)[number]
/**
 * FCI runtime capability version used to negotiate `minRuntime`. It tracks
 * `CHARACTER_API_VERSION` (`<apiVersion>.0`); docs/CHARACTER-INTERFACE-V0.2.md
 * defines the rule, `isRuntimeVersionSatisfied()` implements it.
 */
export const CHARACTER_RUNTIME_VERSION = '0.2.0' as const
/**
 * Render formats known to this runtime (mirrors render.HERO_PACK_FORMATS).
 * Pack-side `render.format` must be one of the host's *registered* formats;
 * a host may add first-party renderers later and pass their formats in.
 */
export const KNOWN_RENDER_FORMATS = ['pixel-hero', 'pixel-micro', 'hd-chibi'] as const
export type KnownRenderFormat = (typeof KNOWN_RENDER_FORMATS)[number]

export const BEHAVIOR_PROFILE = 'famling.behavior/0.1' as const

/**
 * Pack-side renderer selection (FCI 0.2).
 *
 * `format` is a coarse data-format family, not a plugin id: packs may only
 * select a format the host already registered (`RendererRegistry.formats()`).
 * `params` is a data-only escape hatch for renderer-family extras (e.g. Live2D
 * parameter defaults); it must stay JSON-shaped and may be validated against a
 * renderer plugin's `paramsSchema`.
 */
export interface CharacterRenderSpec {
  format: string
  params?: Record<string, unknown>
}

/** Non-fatal validation note (e.g. a v0.2 document relying on render inference). */
export interface CharacterValidationWarning {
  code: string
  path: string
  message: string
}

/** Options for `validateCharacterDocument` / `validateCharacterDocumentDetailed`. */
export interface CharacterValidationOptions {
  /** Runtime version used to negotiate `minRuntime`; defaults to CHARACTER_RUNTIME_VERSION. */
  runtimeVersion?: string
  /**
   * Accepted FCI apiVersion window for this validation run. Defaults to the
   * frozen shipping window `CHARACTER_API_VERSIONS` (0.1/0.2). The FCI 0.3
   * preview layer (see `v03.ts` and docs/CHARACTER-INTERFACE-V0.3.md) passes
   * `['0.1', '0.2', '0.3']`; promoting 0.3 into the shipping runtime is a
   * separate, test-pinned change.
   */
  apiVersions?: readonly string[]
  /** Host-registered render formats in addition to/instead of KNOWN_RENDER_FORMATS. */
  renderFormats?: readonly string[]
  /** Sink for non-fatal warnings; callers that pass one observe RENDER_INFERRED etc. */
  warnings?: CharacterValidationWarning[]
}

/** Result of `validateCharacterDocumentDetailed` (document + collected warnings). */
export interface CharacterValidationResult {
  document: CharacterDocument
  warnings: CharacterValidationWarning[]
}

/** Where a document's effective render format came from. */
export interface RenderFormatResolution {
  format: string
  source: 'declared' | 'inferred'
  /** Human-readable origin, used in RENDER_INFERRED warnings and docs. */
  reason: string
}

export type CharacterType = 'humanoid' | 'pet' | 'object'
export type SpeechMode = 'text' | 'voice' | 'sfx' | 'none'
export type InterruptMode = 'immediate' | 'at-end' | 'never'
export type AnimCategory = 'idle' | 'reaction' | 'locomotion' | 'face' | 'fx'

export interface CharacterTag {
  frames: number
  fps: number
  loop: boolean
  category?: AnimCategory
  /** Per-frame integer [dx,dy] offsets (frame count may be >= frames, loops). */
  offsets?: Array<[number, number]>
  priority?: number
  next?: string
}

export interface BehaviorState {
  tag: string
  loop?: boolean
  priority?: number
  interrupt?: InterruptMode
  after?: string
  cooldownMs?: number
  timeoutMs?: number
}

export interface Guard {
  input: 'mood' | 'bond' | 'hunger' | 'energy' | 'fun'
  op: '>=' | '<=' | '==' | '!='
  value: number
}

export interface BehaviorRule {
  on: string | string[]
  to: string
  priority?: number
  cooldownMs?: number
  probability?: number
  when?: { state?: string[]; source?: string; secrecyMax?: number }
  guard?: Guard
  say?: { textId?: string; tone?: string; voice?: 'tts' | 'none' }
  sfx?: { clip: string; volume?: number; variants?: string[] }
  effects?: { bond?: number; mood?: Record<string, number>; needs?: Record<string, number> }
  requiresBrief?: boolean
}

export interface BehaviorProfile {
  profile: typeof BEHAVIOR_PROFILE
  version: string
  extends?: string
  defaults?: { priority?: number; interrupt?: InterruptMode; cooldownMs?: number }
  abilities: {
    speech: SpeechMode
    reminder: boolean
    care?: Record<string, boolean>
    needs?: boolean
    death?: boolean
    multiObject?: boolean
  }
  slots?: Record<string, string | null>
  states: Record<string, BehaviorState>
  rules: BehaviorRule[]
  ambient?: { intervalMs: [number, number]; choices: Array<{ state: string; weight: number }> }
  needs?: Record<string, { value: number; max: number; decayPerHour: number; criticalAt: number }>
  speech?: { lines?: Record<string, string> }
}

export interface CharacterDocument {
  spec: 'famling.character'
  apiVersion: CharacterApiVersion
  id: string
  version: string
  type: CharacterType
  species?: string
  traits?: string[]
  /** Optional per-character display scale hint (runtime validates integers). */
  display?: { scale?: 1 | 2; pixelated?: boolean }
  canvas: [number, number]
  anchor: { x: number; y: number; mode: string }
  footBox: [number, number, number, number]
  bbox?: [number, number, number, number]
  palette?: string
  /**
   * FCI 0.2 renderer selection. Optional at runtime for migration: a v0.2
   * document without `render` is inferred as `pixel-hero` with a warning, and
   * the validator CLI treats it as an error under `--strict` (new packs must be
   * explicit). v0.1 documents may omit it entirely.
   */
  render?: CharacterRenderSpec
  /** Animation tags; either inline here or supplied by `packBase` manifest. */
  tags?: Record<string, CharacterTag>
  assets?: string[]
  /** Base URL of the compatible hero.ts CharacterPack (manifest.json + frames). */
  packBase?: string
  behavior?: BehaviorProfile
  behaviorFile?: string
  license?: string
  meta?: Record<string, unknown>
  ai?: { status: 'none' | 'concept' | 'final'; tool?: string }
  fallback?: Record<string, string[]>
  capabilities?: {
    sockets?: string[]
    roles?: string[]
    behaviors?: Array<'social' | 'holdable' | 'carryable' | 'mountable' | 'aware'>
  }
  interactions?: Array<{ id: string; on: string; actors: string[]; outcome?: string }>
  /** Minimum FCI runtime version (semver); negotiated on load (FCI 0.2). */
  minRuntime?: string
  extensions?: Record<string, unknown>
  extensionsRequired?: string[]
}

export interface BehaviorDecision {
  event: string
  state: string
  tag: string
  priority: number
  ruleIndex: number
  /** true when the event was ignored (unknown event / unsupported ability). */
  ignored?: boolean
  reason?: string
}

export class CharacterInterfaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CharacterInterfaceError'
  }
}
