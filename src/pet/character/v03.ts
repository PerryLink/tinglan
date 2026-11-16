/**
 * Famling Character Interface (FCI) 0.3 — **optional interface extensions**
 * (preview layer): voice, sfx/audio assets, idle micro-actions, interaction
 * zones, presentation responses, moods/focus/schedule/timeOfDay interfaces and
 * a namespaced `extensions` convention.
 *
 * Status (2026-11-15): **authoring/interface preview only**. Nothing here is
 * wired into `pet.html`/`main.ts`, and no scheduling, TTS/ASR, audio playback
 * or hit-testing is implemented. The shipping runtime contract stays FCI 0.2
 * (`CHARACTER_API_VERSIONS` in `types.ts` is frozen); this module passes a wider
 * apiVersion window to the core validator, so a host or the authoring CLI can
 * validate 0.3 documents without changing 0.1/0.2 behaviour:
 *
 * ```ts
 * const document = validateCharacterDocumentV03(raw) // accepts 0.1/0.2/0.3
 * const behavior = validateBehaviorProfileV03(behaviorRaw) // 0.3 additive fields
 * ```
 *
 * Compatibility rules:
 * - 0.1/0.2 documents validate exactly like the core validator (no 0.3 blocks)
 *   and are returned with their original apiVersion.
 * - The 0.3-only blocks are rejected on older documents (`FCI 0.3 fields ...
 *   require apiVersion "0.3"`) so a 0.2 pack cannot silently rely on them.
 * - Everything is data-only: core forbidden keys (`script`/`eval`/...) are
 *   rejected at any depth; the 0.3 blocks additionally have closed key
 *   whitelists, no functions, and reject real-person voice-cloning fields.
 * - `famling.behavior/0.1` stays the behavior profile id; 0.3 only adds
 *   optional fields (`states.*.category`, `rules[].voiceLineId/sfx/emote/...`,
 *   `when.mood/focus/energy`), so 0.1/0.2 behaviour files keep loading.
 *
 * See docs/CHARACTER-INTERFACE-V0.3.md for the field reference, replacement
 * points (art / voice / behaviour / UI) and the DLC/plugin boundary.
 */
import {
  CharacterInterfaceError,
  type BehaviorProfile,
  type BehaviorRule,
  type CharacterDocument,
  type CharacterValidationOptions,
  type CharacterValidationWarning,
} from './types.ts'
import { validateBehaviorProfile, validateCharacterDocument } from './validate.ts'

// ---------------------------------------------------------------------------
// Version / format constants
// ---------------------------------------------------------------------------

/** Newest FCI version understood by this preview layer (written by 0.3 authors). */
export const FCI_V03_API_VERSION = '0.3' as const
/**
 * apiVersion window accepted by the FCI 0.3 preview layer: 0.1/0.2 keep
 * validating unchanged, 0.3 opts into the additive fields below.
 */
export const FCI_V03_API_VERSIONS = ['0.1', '0.2', '0.3'] as const
export type CharacterApiVersionV03 = (typeof FCI_V03_API_VERSIONS)[number]
/** Runtime capability version a 0.3 preview host advertises for `minRuntime`. */
export const FCI_V03_RUNTIME_VERSION = '0.3.0' as const
/** Voice line library file format referenced by `voice.lines`. */
export const VOICE_LINES_PROFILE = 'famling.voice-lines/0.1' as const

/** Document-level fields that only exist in FCI 0.3 (rejected on 0.1/0.2). */
export const FCI_V03_ONLY_FIELDS = [
  'audio',
  'voice',
  'sfx',
  'idle',
  'zones',
  'responses',
  'moods',
  'focus',
  'schedule',
  'timeOfDay',
] as const
export type FciV03OnlyField = (typeof FCI_V03_ONLY_FIELDS)[number]

/** Behavior state categories added in FCI 0.3 (animation tags keep their own enum). */
export const STATE_CATEGORIES = [
  'idle',
  'micro-idle',
  'reaction',
  'expression',
  'locomotion',
  'interaction',
  'sleep',
  'fx',
] as const
export type StateCategory = (typeof STATE_CATEGORIES)[number]

export const ZONE_ROLES = ['head', 'hand', 'tail', 'tablet', 'glasses', 'body', 'other'] as const
export type ZoneRole = (typeof ZONE_ROLES)[number]
export const ZONE_SPACES = ['canvas', 'anchor', 'normalized'] as const
export type ZoneSpace = (typeof ZONE_SPACES)[number]
export const ZONE_CURSORS = ['default', 'pointer', 'grab', 'help'] as const
export type ZoneCursor = (typeof ZONE_CURSORS)[number]

export const AUDIO_KINDS = ['sfx', 'voice', 'music'] as const
export type AudioKind = (typeof AUDIO_KINDS)[number]
/**
 * Audio provenance AI label. Deliberately a 3-state machine-readable field:
 * - `none`: no generative AI involved,
 * - `assisted`: AI-assisted (edited/generated fragments),
 * - `generated`: synthesized by a generative model.
 */
export const AUDIO_AI_STATUSES = ['none', 'assisted', 'generated'] as const
export type AudioAiStatus = (typeof AUDIO_AI_STATUSES)[number]
export const AUDIO_PROVENANCE_SOURCES = ['recorded', 'synthesized', 'library', 'generated', 'unknown'] as const
export type AudioProvenanceSource = (typeof AUDIO_PROVENANCE_SOURCES)[number]
/** Audio file extensions accepted by the interface (no video/binary blobs). */
export const AUDIO_FILE_EXTENSIONS = ['.ogg', '.wav', '.mp3', '.webm'] as const

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

// ---------------------------------------------------------------------------
// FCI 0.3 types
// ---------------------------------------------------------------------------

export interface NumericRange {
  min?: number
  max?: number
}

/** Host capability ids a response/rule can require (at least one). */
export interface AudioAiDisclosure {
  status: AudioAiStatus
  tool?: string
  disclosure?: string
}

export interface AudioProvenance {
  source: AudioProvenanceSource
  /** Display-only credit link (never fetched by the runtime/validator). */
  url?: string
  creator?: string
  note?: string
}

/**
 * One audio asset declaration. The file itself is optional in the interface
 * preview (audio playback is not implemented yet), but the declaration already
 * carries the release-relevant fields: path/sha256/license/AI/provenance and the
 * voice profile id for voice lines. No real-person clone fields are allowed.
 */
export interface AudioAsset {
  id: string
  kind: AudioKind
  /** POSIX-style relative path inside the character/pack directory. */
  path: string
  /** 64 lowercase hex chars; recommended (release builds should pin it). */
  sha256?: string
  /** SPDX id or explicit placeholder licence note. */
  license: string
  ai: AudioAiDisclosure
  provenance: AudioProvenance
  /** Voice profile id; required for `kind:"voice"` and must match `voice.profile`. */
  voiceId?: string
  /** Optional declared clip length in ms (validator/UI hint). */
  durationMs?: number
}

export interface VoiceTimbre {
  /** Host-registered/synth preset id. Cloning a real person is not representable. */
  presetId?: string
  /** Pitch multiplier (1 = neutral). */
  pitch?: number
  /** Speech-rate multiplier (1 = neutral). */
  rate?: number
  /** Output volume 0..1. */
  volume?: number
  /** Style slug (e.g. `gentle`, `neutral`, `bright`); host-defined. */
  style?: string
}

export interface VoiceSpec {
  /** Voice profile id (stable, e.g. `voice.tinlan.calm`). */
  profile: string
  /** TTS switch; default false (text-only). */
  tts?: boolean
  /** BCP-47-ish language tag, e.g. `zh-CN`. */
  language?: string
  /** `none` = silent, `system` = OS voices, `tts` = any TTS provider the host owns. */
  provider?: 'none' | 'system' | 'tts'
  /** Relative path to a `famling.voice-lines/0.1` JSON file inside the pack. */
  lines?: string
  /** Per-event default line id; rules/responses may override with `voiceLineId`. */
  lineIds?: Record<string, string>
  timbre?: VoiceTimbre
}

export interface SfxClip {
  /** Audio asset id declared in `audio[]`. */
  asset: string
  /** Alternative audio asset ids picked deterministically per play. */
  variants?: string[]
  volume?: number
  cooldownMs?: number
  /** Host may pick randomly among asset+variants (seeded in tests). */
  randomize?: boolean
}

export interface SfxSpec {
  masterVolume?: number
  clips: Record<string, SfxClip>
}

export interface ResponseCondition {
  /** Declared behavior states the character must currently be in. */
  state?: string[]
  mood?: NumericRange
  focus?: NumericRange
  energy?: NumericRange
  /** Ids declared in the document-level `timeOfDay.periods`. */
  timeOfDay?: string[]
}

export interface IdleVariant {
  /** Declared behavior state to enter (mutually exclusive with `tag`). */
  state?: string
  /** Raw animation tag to play (mutually exclusive with `state`). */
  tag?: string
  weight: number
  /** Re-think interval window in ms; `[0,0]` means "once". */
  intervalMs?: [number, number]
  priority?: number
  /** Whether a user/host interaction may interrupt this micro-action. */
  interruptible?: boolean
  when?: ResponseCondition
}

export interface IdleSpec {
  /** Main idle behavior state the character parks in. */
  main: string
  variants?: IdleVariant[]
}

export interface ZoneRectShape {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
}

export interface ZonePolygonShape {
  type: 'polygon'
  /** 3..32 [x,y] points, same coordinate space as the zone. */
  points: Array<[number, number]>
}

export type ZoneShape = ZoneRectShape | ZonePolygonShape

/**
 * Interaction hit zone (head/hand/tail/tablet/glasses/body...).
 *
 * `space` decides the coordinate frame: `canvas` = art pixels from the canvas
 * top-left, `anchor` = art pixels relative to `anchor` (same frame as
 * `footBox`), `normalized` = 0..1 fractions of the canvas. A zone emits one
 * host event (`on`) and may point at one declarative behavior state (`state`).
 */
export interface ZoneSpec {
  id: string
  role?: ZoneRole
  space: ZoneSpace
  shape: ZoneShape
  /** Event emitted when the zone is hit (host event vocabulary). */
  on: string
  /** Optional behavior state shown when the zone fires. */
  state?: string
  cursor?: ZoneCursor
  /** Short display label for tooltips (UI escapes it). */
  label?: string
}

export interface ResponseSfx {
  clip: string
  volume?: number
}

/**
 * Presentation overlay for one host event: what to say / play / show and for
 * how long. Serialised after the behavior decision; it cannot change the state
 * machine. `when`/`requiresAny` are *selection* predicates (data only).
 */
export interface ResponseSpec {
  on: string | string[]
  when?: ResponseCondition
  voiceLineId?: string
  /** Clip id declared in document-level `sfx.clips`. */
  sfx?: string
  /** Animation tag / emote id (resolved like a fallback tag by the host). */
  emote?: string
  durationMs?: number
  /** Host capability ids; at least one must be active for this response. */
  requiresAny?: string[]
  priority?: number
}

export interface MoodDefinition {
  label?: string
  /** -1 (unpleasant) .. 1 (pleasant). */
  valence?: number
  /** 0 (calm) .. 1 (aroused). */
  arousal?: number
  /** Optional animation tag for the mood. */
  emote?: string
  /** Optional behavior state for the mood. */
  state?: string
}

export interface MoodsSpec {
  default?: string
  defs: Record<string, MoodDefinition>
}

export interface FocusSpec {
  default?: number
  min?: number
  max?: number
  decayPerHour?: number
  restingState?: string
}

export interface ScheduleSegment {
  id: string
  days?: Weekday[]
  /** `HH:MM` (00:00..23:59); `from` must be < `to` (no wrap in 0.3). */
  from: string
  to: string
  state?: string
  mood?: string
}

export interface ScheduleSpec {
  segments: ScheduleSegment[]
}

export interface TimeOfDayPeriod {
  id: string
  from: string
  to: string
}

export interface TimeOfDaySpec {
  periods: TimeOfDayPeriod[]
}

/** 0.3 behavior state: 0.1 fields plus an optional semantic category. */
export interface BehaviorStateV03 {
  tag: string
  loop?: boolean
  priority?: number
  interrupt?: 'immediate' | 'at-end' | 'never'
  after?: string
  cooldownMs?: number
  timeoutMs?: number
  /** Semantic bucket for host schedulers/UI (new in 0.3). */
  category?: StateCategory
}

export interface RuleConditionV03 {
  state?: string[]
  source?: string
  secrecyMax?: number
  mood?: NumericRange
  focus?: NumericRange
  energy?: NumericRange
}

export interface RuleSfx {
  clip: string
  volume?: number
  variants?: string[]
}

export interface BehaviorRuleV03 {
  on: string | string[]
  to: string
  priority?: number
  cooldownMs?: number
  probability?: number
  when?: RuleConditionV03
  guard?: BehaviorRule['guard']
  say?: BehaviorRule['say']
  /** Clip id (0.3) or the legacy `{clip,volume,variants}` object. */
  sfx?: string | RuleSfx
  effects?: BehaviorRule['effects']
  requiresBrief?: boolean
  /** Line id from the referenced `voice.lines` library. */
  voiceLineId?: string
  /** Animation tag / emote id. */
  emote?: string
  /** Declared presentation duration hint in ms (does not gate the state machine). */
  durationMs?: number
  /** Host capability ids; at least one must be active. */
  requiresAny?: string[]
}

export interface BehaviorProfileV03 extends Omit<BehaviorProfile, 'states' | 'rules'> {
  states: Record<string, BehaviorStateV03>
  rules: BehaviorRuleV03[]
}

/**
 * FCI 0.3 character document: 0.1/0.2 shape plus the optional preview blocks.
 * `apiVersion` may still be 0.1/0.2 (the preview layer is a superset
 * validator); only 0.3 documents may declare the new blocks.
 */
export interface CharacterDocumentV03 extends Omit<CharacterDocument, 'apiVersion' | 'behavior'> {
  apiVersion: CharacterApiVersionV03
  behavior?: BehaviorProfileV03
  audio?: AudioAsset[]
  voice?: VoiceSpec
  sfx?: SfxSpec
  idle?: IdleSpec
  zones?: ZoneSpec[]
  responses?: ResponseSpec[]
  moods?: MoodsSpec
  focus?: FocusSpec
  schedule?: ScheduleSpec
  timeOfDay?: TimeOfDaySpec
}

// ---------------------------------------------------------------------------
// Voice line library (`voice.lines`)
// ---------------------------------------------------------------------------

export interface VoiceLineEntry {
  text: string
  /** BCP-47-ish language tag for this line (defaults to `voice.language`). */
  lang?: string
  /** Audio asset id declared in `audio[]` (`kind:"voice"`). */
  audio?: string
  durationMs?: number
}

export interface VoiceLineLibrary {
  profile: typeof VOICE_LINES_PROFILE
  version?: string
  lines: Record<string, VoiceLineEntry>
}

// ---------------------------------------------------------------------------
// Small validation helpers (mirrors validate.ts style; kept local on purpose)
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const SHA256_RE = /^[0-9a-f]{64}$/
const LANGUAGE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const EXTENSION_KEY_RE = /^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*$/
const FORBIDDEN_KEYS = ['script', 'scripts', 'eval', 'code', 'execute', 'permissions']
/**
 * Field names that imply cloning/impersonating a real person's voice. The 0.3
 * voice interface is preset-based on purpose: character packs may select a
 * synthetic TTS profile/timbre, never ship a reference recording or embedding.
 */
const VOICE_CLONE_KEY_RE =
  /(clone|impersonat|voicesample|voice_sample|referenceaudio|reference_audio|referencevoice|reference_voice|speakerembedding|speaker_embedding|voiceembedding|voice_embedding|sourceaudio|source_audio|trainingaudio|training_audio|voicemodel|voice_model)/i
const WHEN_KEYS = ['state', 'source', 'secrecyMax', 'mood', 'focus', 'energy'] as const
const STATE_KEYS = ['tag', 'loop', 'priority', 'interrupt', 'after', 'cooldownMs', 'timeoutMs', 'category'] as const
const RULE_KEYS = [
  'on',
  'to',
  'priority',
  'cooldownMs',
  'probability',
  'when',
  'guard',
  'say',
  'sfx',
  'effects',
  'requiresBrief',
  'voiceLineId',
  'emote',
  'durationMs',
  'requiresAny',
] as const
const VOICE_KEYS = ['profile', 'tts', 'language', 'provider', 'lines', 'lineIds', 'timbre'] as const
const TIMBRE_KEYS = ['presetId', 'pitch', 'rate', 'volume', 'style'] as const
const AUDIO_KEYS = ['id', 'kind', 'path', 'sha256', 'license', 'ai', 'provenance', 'voiceId', 'durationMs'] as const
const AUDIO_AI_KEYS = ['status', 'tool', 'disclosure'] as const
const PROVENANCE_KEYS = ['source', 'url', 'creator', 'note'] as const
const SFX_KEYS = ['masterVolume', 'clips'] as const
const SFX_CLIP_KEYS = ['asset', 'variants', 'volume', 'cooldownMs', 'randomize'] as const
const IDLE_KEYS = ['main', 'variants'] as const
const IDLE_VARIANT_KEYS = ['state', 'tag', 'weight', 'intervalMs', 'priority', 'interruptible', 'when'] as const
const ZONE_KEYS = ['id', 'role', 'space', 'shape', 'on', 'state', 'cursor', 'label'] as const
const RECT_SHAPE_KEYS = ['type', 'x', 'y', 'w', 'h'] as const
const POLYGON_SHAPE_KEYS = ['type', 'points'] as const
const RESPONSE_KEYS = ['on', 'when', 'voiceLineId', 'sfx', 'emote', 'durationMs', 'requiresAny', 'priority'] as const
const CONDITION_KEYS = ['state', 'mood', 'focus', 'energy', 'timeOfDay'] as const
const MOODS_KEYS = ['default', 'defs'] as const
const MOOD_DEF_KEYS = ['label', 'valence', 'arousal', 'emote', 'state'] as const
const FOCUS_KEYS = ['default', 'min', 'max', 'decayPerHour', 'restingState'] as const
const SCHEDULE_KEYS = ['segments'] as const
const SEGMENT_KEYS = ['id', 'days', 'from', 'to', 'state', 'mood'] as const
const TIMEOFDAY_KEYS = ['periods'] as const
const PERIOD_KEYS = ['id', 'from', 'to'] as const
const VOICE_LINES_KEYS = ['profile', 'version', 'lines'] as const
const VOICE_LINE_KEYS = ['text', 'lang', 'audio', 'durationMs'] as const

const LIMITS = {
  audioAssets: 32,
  zones: 16,
  idleVariants: 16,
  responses: 32,
  moodDefs: 16,
  scheduleSegments: 16,
  timeOfDayPeriods: 8,
  polygonPoints: 32,
  lineIds: 64,
  voiceLines: 512,
  requiresAny: 8,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new CharacterInterfaceError(`FCI 0.3: ${message}`)
}

/**
 * Validation error carrying a stable CLI/report code + JSON path, so hosts and
 * `scripts/validate-character.mjs` can surface e.g. `VOICE_INVALID` /
 * `ZONE_OUT_OF_BOUNDS` instead of a generic runtime error. It is still a
 * `CharacterInterfaceError`, so existing catches keep working.
 */
export class FciV03Error extends CharacterInterfaceError {
  readonly code: string
  readonly path: string

  constructor(message: string, code: string, path: string) {
    super(`FCI 0.3: ${message}`)
    this.name = 'FciV03Error'
    this.code = code
    this.path = path
  }
}

/** Map a block-level validation message to its stable report code. */
function classifyFci03Error(block: string, message: string): string {
  const lower = message.toLowerCase()
  if (block === 'voice') return /clon|impersonat/.test(lower) ? 'VOICE_CLONE_FORBIDDEN' : 'VOICE_INVALID'
  if (block === 'audio') return 'AUDIO_INVALID'
  if (block === 'sfx') return 'SFX_INVALID'
  if (block === 'idle') return /when/.test(lower) ? 'WHEN_INVALID' : 'IDLE_INVALID'
  if (block === 'zones') return /coordinate \d+ must be within|must be within 0\.\.1|bounds/.test(lower) ? 'ZONE_OUT_OF_BOUNDS' : 'ZONE_INVALID'
  if (block === 'responses') return /\.when|condition/.test(lower) ? 'WHEN_INVALID' : 'RESPONSE_INVALID'
  if (block === 'moods') return /when/.test(lower) ? 'WHEN_INVALID' : 'MOODS_INVALID'
  if (block === 'focus') return 'FOCUS_INVALID'
  if (block === 'schedule') return 'SCHEDULE_INVALID'
  if (block === 'timeOfDay') return 'TIMEOFDAY_INVALID'
  if (block === 'extensions') {
    if (/namespac/.test(lower)) return 'EXTENSION_NAMESPACE'
    if (/not declared in extensions/.test(lower)) return 'EXTENSION_REQUIRED_UNKNOWN'
    return 'EXTENSION_INVALID'
  }
  if (block === 'behavior') return 'BEHAVIOR_INVALID'
  return 'FCI03_INVALID'
}

/** Run one 0.3 block validator and attach its stable error code/path. */
function runBlock<T>(block: string, path: string, fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof FciV03Error) throw error
    const message = error instanceof Error ? error.message.replace(/^FCI 0\.3: /, '') : String(error)
    throw new FciV03Error(message, classifyFci03Error(block, message), path)
  }
}

function str(value: unknown, what: string, maxLength = 300): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${what} must be a non-empty string`)
  if (value.length > maxLength) fail(`${what} must be at most ${maxLength} chars`)
  return value
}

function idString(value: unknown, what: string): string {
  const text = str(value, what, 64)
  if (!ID_RE.test(text)) fail(`${what} must match ${String(ID_RE)}, got ${JSON.stringify(text)}`)
  return text
}

function intNumber(value: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${what} must be an integer in [${min},${max}]`)
  }
  return value
}

function finiteNumber(value: unknown, what: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${what} must be a finite number in [${min},${max}]`)
  }
  return value
}

function boolValue(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') fail(`${what} must be boolean`)
  return value
}

function recordValue(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${what} must be an object`)
  return value
}

function arrayValue(value: unknown, what: string, maxItems: number, minItems = 0): unknown[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`)
  if (value.length < minItems) fail(`${what} must have at least ${minItems} item(s)`)
  if (value.length > maxItems) fail(`${what} must have at most ${maxItems} items`)
  return value
}

function checkKeys(value: Record<string, unknown>, what: string, allowed: readonly string[]): void {
  const allow = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) fail(`${what}.${key} is not part of FCI 0.3`)
  }
}

function stringList(value: unknown, what: string, maxItems: number, minItems = 0): string[] {
  const list = arrayValue(value, what, maxItems, minItems)
  return list.map((entry, index) => str(entry, `${what}[${index}]`, 64))
}

function uniqueStrings(value: unknown, what: string, maxItems: number, minItems = 1): string[] {
  const list = arrayValue(value, what, maxItems, minItems)
  const out: string[] = []
  const seen = new Set<string>()
  for (const [index, entry] of list.entries()) {
    const text = str(entry, `${what}[${index}]`, 64)
    if (seen.has(text)) fail(`${what}[${index}] duplicates ${JSON.stringify(text)}`)
    seen.add(text)
    out.push(text)
  }
  return out
}

/** Recursively reject executable/script keys inside a free-form 0.3 block. */
function guardDataOnly(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => guardDataOnly(child, `${path}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) fail(`${path}.${key} is forbidden: character packs are data-only (no scripts/permissions)`)
    if (typeof child === 'function') fail(`${path}.${key} must be JSON data (functions are not allowed)`)
    guardDataOnly(child, `${path}.${key}`)
  }
}

/** Recursively reject real-person voice-cloning field names. */
function findVoiceCloneKey(value: unknown, path = 'character'): string | null {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const hit = findVoiceCloneKey(child, `${path}[${index}]`)
      if (hit) return hit
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, child] of Object.entries(value)) {
    if (VOICE_CLONE_KEY_RE.test(key)) return `${path}.${key}`
    const hit = findVoiceCloneKey(child, `${path}.${key}`)
    if (hit) return hit
  }
  return null
}

function assertSafeRelativePath(value: unknown, what: string, extensions: readonly string[]): string {
  const path = str(value, what, 200)
  if (path.includes('\\')) fail(`${what} must use POSIX-style "/" separators, got ${JSON.stringify(path)}`)
  if (/^[a-zA-Z]:\//.test(path) || path.startsWith('/') || path.startsWith('//')) fail(`${what} must be a relative path inside the character directory, got ${JSON.stringify(path)}`)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) fail(`${what} must not be a URL/protocol path, got ${JSON.stringify(path)}`)
  const segments = path.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)) {
    fail(`${what} must not contain "."/".."/empty segments, got ${JSON.stringify(path)}`)
  }
  const lower = path.toLowerCase()
  if (!extensions.some((extension) => lower.endsWith(extension))) {
    fail(`${what} must end with one of ${extensions.join('/')}, got ${JSON.stringify(path)}`)
  }
  return path
}

function validateTime(value: unknown, what: string): string {
  const text = str(value, what, 5)
  if (!TIME_RE.test(text)) fail(`${what} must be "HH:MM" (00:00..23:59), got ${JSON.stringify(text)}`)
  return text
}

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map((part) => Number(part))
  return hours * 60 + minutes
}

// ---------------------------------------------------------------------------
// 0.3 block validators
// ---------------------------------------------------------------------------

function validateNumericRange(value: unknown, what: string): NumericRange {
  const raw = recordValue(value, what)
  checkKeys(raw, what, ['min', 'max'])
  if (raw.min === undefined && raw.max === undefined) fail(`${what} must declare min and/or max`)
  const min = raw.min === undefined ? undefined : finiteNumber(raw.min, `${what}.min`, 0, 100)
  const max = raw.max === undefined ? undefined : finiteNumber(raw.max, `${what}.max`, 0, 100)
  if (min !== undefined && max !== undefined && min > max) fail(`${what}.min must be <= ${what}.max`)
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
}

function validateCapabilityList(value: unknown, what: string): string[] {
  const list = stringList(value, what, LIMITS.requiresAny, 1)
  for (const [index, capability] of list.entries()) {
    if (!ID_RE.test(capability)) fail(`${what}[${index}] must be a capability id matching ${String(ID_RE)} (e.g. "ability.speech")`)
  }
  return list
}

function validateVoiceTimbre(value: unknown, path: string): VoiceTimbre {
  const raw = recordValue(value, path)
  checkKeys(raw, path, TIMBRE_KEYS)
  const timbre: VoiceTimbre = {}
  if (raw.presetId !== undefined) timbre.presetId = idString(raw.presetId, `${path}.presetId`)
  if (raw.pitch !== undefined) timbre.pitch = finiteNumber(raw.pitch, `${path}.pitch`, 0.25, 4)
  if (raw.rate !== undefined) timbre.rate = finiteNumber(raw.rate, `${path}.rate`, 0.25, 4)
  if (raw.volume !== undefined) timbre.volume = finiteNumber(raw.volume, `${path}.volume`, 0, 1)
  if (raw.style !== undefined) timbre.style = idString(raw.style, `${path}.style`)
  if (Object.keys(timbre).length === 0) fail(`${path} must declare at least one timbre parameter`)
  return timbre
}

export function validateVoiceSpec(raw: unknown, path = 'voice'): VoiceSpec {
  guardDataOnly(raw, path)
  const voice = recordValue(raw, path)
  checkKeys(voice, path, VOICE_KEYS)
  const profile = idString(voice.profile, `${path}.profile`)
  const out: VoiceSpec = { profile }
  if (voice.tts !== undefined) out.tts = boolValue(voice.tts, `${path}.tts`)
  if (voice.language !== undefined) {
    const language = str(voice.language, `${path}.language`, 35)
    if (!LANGUAGE_RE.test(language)) fail(`${path}.language must be a BCP-47-ish tag like "zh-CN", got ${JSON.stringify(language)}`)
    out.language = language
  }
  if (voice.provider !== undefined) {
    const provider = str(voice.provider, `${path}.provider`, 16)
    if (!['none', 'system', 'tts'].includes(provider)) fail(`${path}.provider must be none|system|tts, got ${JSON.stringify(provider)}`)
    out.provider = provider as VoiceSpec['provider']
  }
  if (voice.lines !== undefined) out.lines = assertSafeRelativePath(voice.lines, `${path}.lines`, ['.json'])
  if (voice.lineIds !== undefined) {
    const lineIds = recordValue(voice.lineIds, `${path}.lineIds`)
    if (Object.keys(lineIds).length === 0) fail(`${path}.lineIds must not be empty`)
    if (Object.keys(lineIds).length > LIMITS.lineIds) fail(`${path}.lineIds has too many entries (max ${LIMITS.lineIds})`)
    const normalized: Record<string, string> = {}
    for (const [event, lineId] of Object.entries(lineIds)) {
      if (!ID_RE.test(event)) fail(`${path}.lineIds key ${JSON.stringify(event)} must be an event name matching ${String(ID_RE)}`)
      normalized[event] = idString(lineId, `${path}.lineIds.${event}`)
    }
    out.lineIds = normalized
  }
  if (voice.timbre !== undefined) out.timbre = validateVoiceTimbre(voice.timbre, `${path}.timbre`)
  return out
}

function validateAudioAi(value: unknown, what: string): AudioAiDisclosure {
  const raw = recordValue(value, what)
  checkKeys(raw, what, AUDIO_AI_KEYS)
  if (raw.status === undefined) fail(`${what}.status is required (${AUDIO_AI_STATUSES.join('|')})`)
  const status = str(raw.status, `${what}.status`, 16)
  if (!(AUDIO_AI_STATUSES as readonly string[]).includes(status)) fail(`${what}.status must be ${AUDIO_AI_STATUSES.join('|')}, got ${JSON.stringify(status)}`)
  const out: AudioAiDisclosure = { status: status as AudioAiStatus }
  if (raw.tool !== undefined) out.tool = str(raw.tool, `${what}.tool`, 120)
  if (raw.disclosure !== undefined) out.disclosure = str(raw.disclosure, `${what}.disclosure`, 500)
  return out
}

function validateAudioProvenance(value: unknown, what: string): AudioProvenance {
  const raw = recordValue(value, what)
  checkKeys(raw, what, PROVENANCE_KEYS)
  if (raw.source === undefined) fail(`${what}.source is required (${AUDIO_PROVENANCE_SOURCES.join('|')})`)
  const source = str(raw.source, `${what}.source`, 16)
  if (!(AUDIO_PROVENANCE_SOURCES as readonly string[]).includes(source)) {
    fail(`${what}.source must be ${AUDIO_PROVENANCE_SOURCES.join('|')}, got ${JSON.stringify(source)}`)
  }
  const out: AudioProvenance = { source: source as AudioProvenanceSource }
  if (raw.url !== undefined) out.url = str(raw.url, `${what}.url`, 300)
  if (raw.creator !== undefined) out.creator = str(raw.creator, `${what}.creator`, 120)
  if (raw.note !== undefined) out.note = str(raw.note, `${what}.note`, 300)
  return out
}

/**
 * Validate `audio[]`. Returns the declared asset ids so `sfx`/voice lines can
 * cross-reference them. The file itself is not read here (pure data validator);
 * the CLI resolves paths and verifies sha256 when a file exists.
 */
export interface AudioAssetsValidation {
  ids: Set<string>
  assets: AudioAsset[]
}

export function validateAudioAssets(raw: unknown, voiceProfile: string | undefined, options: CharacterValidationOptions = {}): AudioAssetsValidation {
  const list = arrayValue(raw, 'audio', LIMITS.audioAssets, 1)
  const ids = new Set<string>()
  const assets: AudioAsset[] = []
  for (const [index, entry] of list.entries()) {
    const path = `audio[${index}]`
    guardDataOnly(entry, path)
    const asset = recordValue(entry, path)
    checkKeys(asset, path, AUDIO_KEYS)
    const id = idString(asset.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id duplicates audio asset "${id}"`)
    ids.add(id)
    const kind = str(asset.kind, `${path}.kind`, 16)
    if (!(AUDIO_KINDS as readonly string[]).includes(kind)) fail(`${path}.kind must be ${AUDIO_KINDS.join('|')}, got ${JSON.stringify(kind)}`)
    const normalized: AudioAsset = {
      id,
      kind: kind as AudioKind,
      path: assertSafeRelativePath(asset.path, `${path}.path`, AUDIO_FILE_EXTENSIONS),
      license: str(asset.license, `${path}.license`, 300),
      ai: validateAudioAi(asset.ai, `${path}.ai`),
      provenance: validateAudioProvenance(asset.provenance, `${path}.provenance`),
    }
    if (asset.sha256 !== undefined) {
      const sha = str(asset.sha256, `${path}.sha256`, 64)
      if (!SHA256_RE.test(sha)) fail(`${path}.sha256 must be 64 lowercase hex chars, got ${JSON.stringify(sha)}`)
      normalized.sha256 = sha
    } else {
      emitWarning(options, 'AUDIO_NO_HASH', `${path}.sha256`, `audio asset "${id}" declares no sha256; release builds should pin the file digest`)
    }
    if (asset.voiceId !== undefined) {
      const voiceId = idString(asset.voiceId, `${path}.voiceId`)
      if (kind === 'voice' && voiceProfile !== undefined && voiceId !== voiceProfile) {
        fail(`${path}.voiceId "${voiceId}" must equal voice.profile "${voiceProfile}" (one voice profile per character in 0.3)`)
      }
      normalized.voiceId = voiceId
    }
    if (kind === 'voice' && normalized.voiceId === undefined) fail(`${path}.voiceId is required for kind "voice"`)
    if (kind === 'voice' && voiceProfile === undefined) fail(`${path} is a voice asset but the document declares no voice block/voice.profile`)
    if (asset.durationMs !== undefined) normalized.durationMs = finiteNumber(asset.durationMs, `${path}.durationMs`, 0, 600_000)
    assets.push(normalized)
  }
  return { ids, assets }
}

export function validateSfxSpec(raw: unknown, audioIds: Set<string>, path = 'sfx'): SfxSpec {
  guardDataOnly(raw, path)
  const sfx = recordValue(raw, path)
  checkKeys(sfx, path, SFX_KEYS)
  const out: SfxSpec = { clips: {} }
  if (sfx.masterVolume !== undefined) out.masterVolume = finiteNumber(sfx.masterVolume, `${path}.masterVolume`, 0, 1)
  const clips = recordValue(sfx.clips, `${path}.clips`)
  if (Object.keys(clips).length === 0) fail(`${path}.clips must not be empty`)
  for (const [clipId, clipRaw] of Object.entries(clips)) {
    if (!ID_RE.test(clipId)) fail(`${path}.clips key ${JSON.stringify(clipId)} must match ${String(ID_RE)}`)
    const clipPath = `${path}.clips.${clipId}`
    const clip = recordValue(clipRaw, clipPath)
    checkKeys(clip, clipPath, SFX_CLIP_KEYS)
    const asset = idString(clip.asset, `${clipPath}.asset`)
    requireAudioAsset(audioIds, asset, `${clipPath}.asset`)
    const normalized: SfxClip = { asset }
    if (clip.variants !== undefined) {
      const variants = uniqueStrings(clip.variants, `${clipPath}.variants`, 8, 1)
      for (const [index, variant] of variants.entries()) requireAudioAsset(audioIds, variant, `${clipPath}.variants[${index}]`)
      normalized.variants = variants
    }
    if (clip.volume !== undefined) normalized.volume = finiteNumber(clip.volume, `${clipPath}.volume`, 0, 1)
    if (clip.cooldownMs !== undefined) normalized.cooldownMs = finiteNumber(clip.cooldownMs, `${clipPath}.cooldownMs`, 0, 86_400_000)
    if (clip.randomize !== undefined) normalized.randomize = boolValue(clip.randomize, `${clipPath}.randomize`)
    out.clips[clipId] = normalized
  }
  return out
}

function requireAudioAsset(audioIds: Set<string>, assetId: string, what: string): void {
  if (audioIds.size === 0) fail(`${what} references audio asset "${assetId}" but the document declares no audio[]`)
  if (!audioIds.has(assetId)) {
    const declared = [...audioIds].join(', ')
    fail(`${what} references undeclared audio asset "${assetId}"; declared: [${declared}]`)
  }
}

function validateResponseCondition(value: unknown, what: string, ctx: RefContext): ResponseCondition {
  const raw = recordValue(value, what)
  checkKeys(raw, what, CONDITION_KEYS)
  if (Object.keys(raw).length === 0) fail(`${what} must declare at least one condition`)
  const out: ResponseCondition = {}
  if (raw.state !== undefined) {
    const states = uniqueStrings(raw.state, `${what}.state`, 16, 1)
    for (const [index, state] of states.entries()) requireDeclaredState(ctx, state, `${what}.state[${index}]`)
    out.state = states
  }
  if (raw.mood !== undefined) out.mood = validateNumericRange(raw.mood, `${what}.mood`)
  if (raw.focus !== undefined) out.focus = validateNumericRange(raw.focus, `${what}.focus`)
  if (raw.energy !== undefined) out.energy = validateNumericRange(raw.energy, `${what}.energy`)
  if (raw.timeOfDay !== undefined) {
    const periods = uniqueStrings(raw.timeOfDay, `${what}.timeOfDay`, 8, 1)
    for (const [index, period] of periods.entries()) {
      if (ctx.timeOfDay.size > 0 && !ctx.timeOfDay.has(period)) {
        fail(`${what}.timeOfDay[${index}] references undeclared timeOfDay period "${period}"; declared: [${[...ctx.timeOfDay].join(', ')}]`)
      }
    }
    out.timeOfDay = periods
  }
  return out
}

interface RefContext {
  canvas: [number, number]
  states: Set<string>
  moods: Set<string>
  timeOfDay: Set<string>
  sfxClips: Set<string>
}

function requireDeclaredState(ctx: RefContext, state: string, what: string): void {
  if (ctx.states.size > 0 && !ctx.states.has(state)) {
    fail(`${what} references undeclared behavior state "${state}"; declared: [${[...ctx.states].join(', ')}]`)
  }
}

function validateIdleSpec(raw: unknown, ctx: RefContext): IdleSpec {
  guardDataOnly(raw, 'idle')
  const idle = recordValue(raw, 'idle')
  checkKeys(idle, 'idle', IDLE_KEYS)
  const main = idString(idle.main, 'idle.main')
  requireDeclaredState(ctx, main, 'idle.main')
  const out: IdleSpec = { main }
  if (idle.variants !== undefined) {
    const variants = arrayValue(idle.variants, 'idle.variants', LIMITS.idleVariants)
    const normalized: IdleVariant[] = []
    for (const [index, variantRaw] of variants.entries()) {
      const path = `idle.variants[${index}]`
      guardDataOnly(variantRaw, path)
      const variant = recordValue(variantRaw, path)
      checkKeys(variant, path, IDLE_VARIANT_KEYS)
      const hasState = variant.state !== undefined
      const hasTag = variant.tag !== undefined
      if (hasState === hasTag) fail(`${path} must declare exactly one of state|tag`)
      const normalizedVariant: IdleVariant = { weight: finiteNumber(variant.weight, `${path}.weight`, 0, 10_000) }
      if (hasState) {
        const state = idString(variant.state, `${path}.state`)
        requireDeclaredState(ctx, state, `${path}.state`)
        normalizedVariant.state = state
      }
      if (hasTag) normalizedVariant.tag = idString(variant.tag, `${path}.tag`)
      if (variant.intervalMs !== undefined) {
        const interval = arrayValue(variant.intervalMs, `${path}.intervalMs`, 2, 2)
        if (interval.length !== 2) fail(`${path}.intervalMs must be [min,max]`)
        const min = intNumber(interval[0], `${path}.intervalMs[0]`, 0, 86_400_000)
        const max = intNumber(interval[1], `${path}.intervalMs[1]`, 0, 86_400_000)
        if (max < min) fail(`${path}.intervalMs max < min`)
        normalizedVariant.intervalMs = [min, max]
      }
      if (variant.priority !== undefined) normalizedVariant.priority = finiteNumber(variant.priority, `${path}.priority`, 0, 100)
      if (variant.interruptible !== undefined) normalizedVariant.interruptible = boolValue(variant.interruptible, `${path}.interruptible`)
      if (variant.when !== undefined) normalizedVariant.when = validateResponseCondition(variant.when, `${path}.when`, ctx)
      normalized.push(normalizedVariant)
    }
    out.variants = normalized
  }
  return out
}

function validateZoneShape(shapeRaw: unknown, what: string, space: ZoneSpace, canvas: [number, number]): ZoneShape {
  const shape = recordValue(shapeRaw, what)
  const type = str(shape.type, `${what}.type`, 16)
  if (type === 'rect') {
    checkKeys(shape, what, RECT_SHAPE_KEYS)
    const x = finiteNumber(shape.x, `${what}.x`)
    const y = finiteNumber(shape.y, `${what}.y`)
    const w = finiteNumber(shape.w, `${what}.w`, 0)
    const h = finiteNumber(shape.h, `${what}.h`, 0)
    if (w <= 0 || h <= 0) fail(`${what}.w/.h must be > 0`)
    assertZoneBounds(space, canvas, what, [x, y], [x + w, y + h])
    return { type: 'rect', x, y, w, h }
  }
  if (type === 'polygon') {
    checkKeys(shape, what, POLYGON_SHAPE_KEYS)
    const points = arrayValue(shape.points, `${what}.points`, LIMITS.polygonPoints, 3)
    const normalized: Array<[number, number]> = []
    for (const [index, pointRaw] of points.entries()) {
      const pointPath = `${what}.points[${index}]`
      const point = arrayValue(pointRaw, pointPath, 2, 2)
      if (point.length !== 2) fail(`${pointPath} must be [x,y]`)
      const x = finiteNumber(point[0], `${pointPath}[0]`)
      const y = finiteNumber(point[1], `${pointPath}[1]`)
      assertZoneBounds(space, canvas, pointPath, [x, y], [x, y])
      normalized.push([x, y])
    }
    return { type: 'polygon', points: normalized }
  }
  fail(`${what}.type must be "rect" or "polygon", got ${JSON.stringify(type)}`)
}

function assertZoneBounds(space: ZoneSpace, canvas: [number, number], what: string, low: [number, number], high: [number, number]): void {
  const [width, height] = canvas
  if (space === 'normalized') {
    for (const [index, value] of [...low, ...high].entries()) {
      if (value < 0 || value > 1) fail(`${what} normalized coordinate ${index} must be within 0..1, got ${value}`)
    }
    return
  }
  if (space === 'anchor') return // anchor-relative zones are allowed to sit outside the canvas (props/drag targets)
  for (const [index, value] of [...low, ...high].entries()) {
    const limit = index % 2 === 0 ? width : height
    if (value < 0 || value > limit) fail(`${what} coordinate ${index} must be within the canvas [0,${limit}], got ${value}`)
  }
}

function validateZones(raw: unknown, ctx: RefContext): ZoneSpec[] {
  const list = arrayValue(raw, 'zones', LIMITS.zones, 1)
  const ids = new Set<string>()
  const zones: ZoneSpec[] = []
  for (const [index, zoneRaw] of list.entries()) {
    const path = `zones[${index}]`
    guardDataOnly(zoneRaw, path)
    const zone = recordValue(zoneRaw, path)
    checkKeys(zone, path, ZONE_KEYS)
    const id = idString(zone.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id duplicates zone "${id}"`)
    ids.add(id)
    const spaceText = str(zone.space, `${path}.space`, 16)
    if (!(ZONE_SPACES as readonly string[]).includes(spaceText)) fail(`${path}.space must be ${ZONE_SPACES.join('|')}, got ${JSON.stringify(spaceText)}`)
    const space = spaceText as ZoneSpace
    const shape = validateZoneShape(zone.shape, `${path}.shape`, space, ctx.canvas)
    const on = idString(zone.on, `${path}.on`)
    const normalized: ZoneSpec = { id, space, shape, on }
    if (zone.role !== undefined) {
      const role = str(zone.role, `${path}.role`, 16)
      if (!(ZONE_ROLES as readonly string[]).includes(role)) fail(`${path}.role must be ${ZONE_ROLES.join('|')}, got ${JSON.stringify(role)}`)
      normalized.role = role as ZoneRole
    }
    if (zone.state !== undefined) {
      const state = idString(zone.state, `${path}.state`)
      requireDeclaredState(ctx, state, `${path}.state`)
      normalized.state = state
    }
    if (zone.cursor !== undefined) {
      const cursor = str(zone.cursor, `${path}.cursor`, 16)
      if (!(ZONE_CURSORS as readonly string[]).includes(cursor)) fail(`${path}.cursor must be ${ZONE_CURSORS.join('|')}, got ${JSON.stringify(cursor)}`)
      normalized.cursor = cursor as ZoneCursor
    }
    if (zone.label !== undefined) normalized.label = str(zone.label, `${path}.label`, 32)
    zones.push(normalized)
  }
  return zones
}

function validateResponses(raw: unknown, ctx: RefContext): ResponseSpec[] {
  const list = arrayValue(raw, 'responses', LIMITS.responses, 1)
  const responses: ResponseSpec[] = []
  for (const [index, responseRaw] of list.entries()) {
    const path = `responses[${index}]`
    guardDataOnly(responseRaw, path)
    const response = recordValue(responseRaw, path)
    checkKeys(response, path, RESPONSE_KEYS)
    const on = Array.isArray(response.on)
      ? uniqueStrings(response.on, `${path}.on`, 8, 1)
      : [idString(response.on, `${path}.on`)]
    const normalized: ResponseSpec = { on }
    if (response.when !== undefined) normalized.when = validateResponseCondition(response.when, `${path}.when`, ctx)
    if (response.voiceLineId !== undefined) normalized.voiceLineId = idString(response.voiceLineId, `${path}.voiceLineId`)
    if (response.sfx !== undefined) {
      const clip = idString(response.sfx, `${path}.sfx`)
      if (ctx.sfxClips.size === 0) fail(`${path}.sfx references clip "${clip}" but the document declares no sfx.clips`)
      if (!ctx.sfxClips.has(clip)) fail(`${path}.sfx references undeclared sfx clip "${clip}"; declared: [${[...ctx.sfxClips].join(', ')}]`)
      normalized.sfx = clip
    }
    if (response.emote !== undefined) normalized.emote = idString(response.emote, `${path}.emote`)
    if (response.durationMs !== undefined) normalized.durationMs = finiteNumber(response.durationMs, `${path}.durationMs`, 0, 600_000)
    if (response.requiresAny !== undefined) normalized.requiresAny = validateCapabilityList(response.requiresAny, `${path}.requiresAny`)
    if (response.priority !== undefined) normalized.priority = finiteNumber(response.priority, `${path}.priority`, 0, 100)
    responses.push(normalized)
  }
  return responses
}

function validateMoodsSpec(raw: unknown, ctx: RefContext): MoodsSpec {
  guardDataOnly(raw, 'moods')
  const moods = recordValue(raw, 'moods')
  checkKeys(moods, 'moods', MOODS_KEYS)
  const defsRaw = recordValue(moods.defs, 'moods.defs')
  const defsCount = Object.keys(defsRaw).length
  if (defsCount === 0) fail('moods.defs must not be empty')
  if (defsCount > LIMITS.moodDefs) fail(`moods.defs has too many entries (max ${LIMITS.moodDefs})`)
  const defs: Record<string, MoodDefinition> = {}
  for (const [moodId, defRaw] of Object.entries(defsRaw)) {
    if (!ID_RE.test(moodId)) fail(`moods.defs key ${JSON.stringify(moodId)} must match ${String(ID_RE)}`)
    const path = `moods.defs.${moodId}`
    const def = recordValue(defRaw, path)
    checkKeys(def, path, MOOD_DEF_KEYS)
    const normalized: MoodDefinition = {}
    if (def.label !== undefined) normalized.label = str(def.label, `${path}.label`, 32)
    if (def.valence !== undefined) normalized.valence = finiteNumber(def.valence, `${path}.valence`, -1, 1)
    if (def.arousal !== undefined) normalized.arousal = finiteNumber(def.arousal, `${path}.arousal`, 0, 1)
    if (def.emote !== undefined) normalized.emote = idString(def.emote, `${path}.emote`)
    if (def.state !== undefined) {
      const state = idString(def.state, `${path}.state`)
      requireDeclaredState(ctx, state, `${path}.state`)
      normalized.state = state
    }
    defs[moodId] = normalized
  }
  const out: MoodsSpec = { defs }
  if (moods.default !== undefined) {
    const defaultMood = idString(moods.default, 'moods.default')
    if (!(defaultMood in defs)) fail(`moods.default "${defaultMood}" is not declared in moods.defs`)
    out.default = defaultMood
  }
  return out
}

function validateFocusSpec(raw: unknown, ctx: RefContext): FocusSpec {
  guardDataOnly(raw, 'focus')
  const focus = recordValue(raw, 'focus')
  checkKeys(focus, 'focus', FOCUS_KEYS)
  const out: FocusSpec = {}
  const min = focus.min === undefined ? 0 : finiteNumber(focus.min, 'focus.min', 0, 100)
  const max = focus.max === undefined ? 100 : finiteNumber(focus.max, 'focus.max', 0, 100)
  if (min > max) fail('focus.min must be <= focus.max')
  out.min = min
  out.max = max
  if (focus.default !== undefined) {
    const value = finiteNumber(focus.default, 'focus.default', min, max)
    out.default = value
  }
  if (focus.decayPerHour !== undefined) out.decayPerHour = finiteNumber(focus.decayPerHour, 'focus.decayPerHour', 0, 100)
  if (focus.restingState !== undefined) {
    const restingState = idString(focus.restingState, 'focus.restingState')
    requireDeclaredState(ctx, restingState, 'focus.restingState')
    out.restingState = restingState
  }
  return out
}

function validateScheduleSpec(raw: unknown, ctx: RefContext): ScheduleSpec {
  guardDataOnly(raw, 'schedule')
  const schedule = recordValue(raw, 'schedule')
  checkKeys(schedule, 'schedule', SCHEDULE_KEYS)
  const segmentsRaw = arrayValue(schedule.segments, 'schedule.segments', LIMITS.scheduleSegments, 1)
  const segments: ScheduleSegment[] = []
  const ids = new Set<string>()
  const intervals: Array<{ id: string; days: Set<Weekday>; from: number; to: number }> = []
  for (const [index, segmentRaw] of segmentsRaw.entries()) {
    const path = `schedule.segments[${index}]`
    const segment = recordValue(segmentRaw, path)
    checkKeys(segment, path, SEGMENT_KEYS)
    const id = idString(segment.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id duplicates schedule segment "${id}"`)
    ids.add(id)
    const from = validateTime(segment.from, `${path}.from`)
    const to = validateTime(segment.to, `${path}.to`)
    if (timeToMinutes(from) >= timeToMinutes(to)) fail(`${path}.from must be earlier than ${path}.to (0.3 has no cross-midnight wrap)`)
    let days: Weekday[] | undefined
    const daySet = new Set<Weekday>(WEEKDAYS)
    if (segment.days !== undefined) {
      const rawDays = uniqueStrings(segment.days, `${path}.days`, 7, 1)
      days = rawDays.map((day, dayIndex) => {
        if (!(WEEKDAYS as readonly string[]).includes(day)) fail(`${path}.days[${dayIndex}] must be one of ${WEEKDAYS.join('|')}`)
        return day as Weekday
      })
      daySet.clear()
      for (const day of days) daySet.add(day)
    }
    const normalized: ScheduleSegment = { id, from, to }
    if (days !== undefined) normalized.days = days
    if (segment.state !== undefined) {
      const state = idString(segment.state, `${path}.state`)
      requireDeclaredState(ctx, state, `${path}.state`)
      normalized.state = state
    }
    if (segment.mood !== undefined) {
      const mood = idString(segment.mood, `${path}.mood`)
      if (ctx.moods.size > 0 && !ctx.moods.has(mood)) fail(`${path}.mood references undeclared mood "${mood}"`)
      normalized.mood = mood
    }
    segments.push(normalized)
    intervals.push({ id, days: daySet, from: timeToMinutes(from), to: timeToMinutes(to) })
  }
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const left = intervals[i]
      const right = intervals[j]
      if (!left || !right) continue
      const sharesDay = [...left.days].some((day) => right.days.has(day))
      if (sharesDay && left.from < right.to && right.from < left.to) {
        fail(`schedule.segments "${left.id}" and "${right.id}" overlap on the same day`)
      }
    }
  }
  return { segments }
}

function validateTimeOfDaySpec(raw: unknown): TimeOfDaySpec {
  guardDataOnly(raw, 'timeOfDay')
  const timeOfDay = recordValue(raw, 'timeOfDay')
  checkKeys(timeOfDay, 'timeOfDay', TIMEOFDAY_KEYS)
  const periodsRaw = arrayValue(timeOfDay.periods, 'timeOfDay.periods', LIMITS.timeOfDayPeriods, 1)
  const periods: TimeOfDayPeriod[] = []
  const ids = new Set<string>()
  const ranges: Array<{ id: string; from: number; to: number }> = []
  for (const [index, periodRaw] of periodsRaw.entries()) {
    const path = `timeOfDay.periods[${index}]`
    const period = recordValue(periodRaw, path)
    checkKeys(period, path, PERIOD_KEYS)
    const id = idString(period.id, `${path}.id`)
    if (ids.has(id)) fail(`${path}.id duplicates timeOfDay period "${id}"`)
    ids.add(id)
    const from = validateTime(period.from, `${path}.from`)
    const to = validateTime(period.to, `${path}.to`)
    if (timeToMinutes(from) >= timeToMinutes(to)) fail(`${path}.from must be earlier than ${path}.to (0.3 has no cross-midnight wrap)`)
    periods.push({ id, from, to })
    ranges.push({ id, from: timeToMinutes(from), to: timeToMinutes(to) })
  }
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const left = ranges[i]
      const right = ranges[j]
      if (!left || !right) continue
      if (left.from < right.to && right.from < left.to) fail(`timeOfDay.periods "${left.id}" and "${right.id}" overlap`)
    }
  }
  return { periods }
}

function validateExtensionsSpec(extensions: unknown, extensionsRequired: unknown): void {
  if (extensions === undefined) {
    if (extensionsRequired !== undefined) fail('extensionsRequired requires an extensions block in FCI 0.3')
    return
  }
  const record = recordValue(extensions, 'extensions')
  for (const key of Object.keys(record)) {
    if (!EXTENSION_KEY_RE.test(key)) {
      fail(`extensions key ${JSON.stringify(key)} must be namespaced for FCI 0.3 (e.g. "x.famling.fork", pattern ${String(EXTENSION_KEY_RE)})`)
    }
  }
  if (extensionsRequired !== undefined) {
    const required = uniqueStrings(extensionsRequired, 'extensionsRequired', 16, 1)
    for (const [index, key] of required.entries()) {
      if (!EXTENSION_KEY_RE.test(key)) fail(`extensionsRequired[${index}] must be a namespaced extension key`)
      if (!(key in record)) fail(`extensionsRequired[${index}] "${key}" is not declared in extensions`)
    }
  }
}

// ---------------------------------------------------------------------------
// Behavior profile 0.3 (additive over famling.behavior/0.1)
// ---------------------------------------------------------------------------

export interface BehaviorProfileV03Options {
  /** When the document declares `sfx`, rule sfx clip ids must resolve in it. */
  sfxClipIds?: ReadonlySet<string>
}

export function validateBehaviorProfileV03(raw: unknown, options: BehaviorProfileV03Options = {}): BehaviorProfileV03 {
  const profile = validateBehaviorProfile(raw) as unknown as BehaviorProfile
  const rawRecord = raw as Record<string, unknown>
  for (const key of Object.keys(rawRecord)) {
    if (FORBIDDEN_KEYS.includes(key)) fail(`behavior.${key} is forbidden: character packs are data-only`)
  }
  const statesRaw = recordValue(rawRecord.states, 'behavior.states')
  for (const [name, stateRaw] of Object.entries(statesRaw)) {
    const state = recordValue(stateRaw, `behavior.states.${name}`)
    for (const key of Object.keys(state)) {
      if (!(STATE_KEYS as readonly string[]).includes(key)) fail(`behavior.states.${name}.${key} is not part of FCI 0.3 behavior states`)
    }
    if (state.category !== undefined) {
      const category = str(state.category, `behavior.states.${name}.category`, 16)
      if (!(STATE_CATEGORIES as readonly string[]).includes(category)) {
        fail(`behavior.states.${name}.category must be ${STATE_CATEGORIES.join('|')}, got ${JSON.stringify(category)}`)
      }
    }
  }
  const rulesRaw = arrayValue(rawRecord.rules, 'behavior.rules', 256)
  for (const [index, ruleRaw] of rulesRaw.entries()) {
    const path = `behavior.rules[${index}]`
    const rule = recordValue(ruleRaw, path)
    for (const key of Object.keys(rule)) {
      if (!(RULE_KEYS as readonly string[]).includes(key)) fail(`${path}.${key} is not part of FCI 0.3 behavior rules`)
    }
    if (rule.when !== undefined) {
      const when = recordValue(rule.when, `${path}.when`)
      for (const key of Object.keys(when)) {
        if (!(WHEN_KEYS as readonly string[]).includes(key)) fail(`${path}.when.${key} is not part of FCI 0.3 rule conditions`)
      }
      if (when.mood !== undefined) validateNumericRange(when.mood, `${path}.when.mood`)
      if (when.focus !== undefined) validateNumericRange(when.focus, `${path}.when.focus`)
      if (when.energy !== undefined) validateNumericRange(when.energy, `${path}.when.energy`)
    }
    if (rule.voiceLineId !== undefined) idString(rule.voiceLineId, `${path}.voiceLineId`)
    if (rule.emote !== undefined) idString(rule.emote, `${path}.emote`)
    if (rule.durationMs !== undefined) finiteNumber(rule.durationMs, `${path}.durationMs`, 0, 600_000)
    if (rule.requiresAny !== undefined) validateCapabilityList(rule.requiresAny, `${path}.requiresAny`)
    if (rule.sfx !== undefined) {
      if (typeof rule.sfx === 'string') {
        const clip = idString(rule.sfx, `${path}.sfx`)
        if (options.sfxClipIds && options.sfxClipIds.size > 0 && !options.sfxClipIds.has(clip)) {
          fail(`${path}.sfx references undeclared sfx clip "${clip}"; declared: [${[...options.sfxClipIds].join(', ')}]`)
        }
      } else {
        const sfx = recordValue(rule.sfx, `${path}.sfx`)
        checkKeys(sfx, `${path}.sfx`, ['clip', 'volume', 'variants'])
        idString(sfx.clip, `${path}.sfx.clip`)
        if (sfx.volume !== undefined) finiteNumber(sfx.volume, `${path}.sfx.volume`, 0, 1)
        if (sfx.variants !== undefined) uniqueStrings(sfx.variants, `${path}.sfx.variants`, 8, 1)
      }
    }
  }
  return profile as unknown as BehaviorProfileV03
}

// ---------------------------------------------------------------------------
// Voice line library
// ---------------------------------------------------------------------------

export interface VoiceLineLibraryOptions {
  /** Declared audio asset ids (line.audio must resolve when provided). */
  audioIds?: ReadonlySet<string>
}

export function validateVoiceLineLibrary(raw: unknown, options: VoiceLineLibraryOptions = {}): VoiceLineLibrary {
  guardDataOnly(raw, 'voice-lines')
  const clonePath = findVoiceCloneKey(raw, 'voice-lines')
  if (clonePath) throw new FciV03Error(`real-person voice cloning is not representable (forbidden field ${clonePath})`, 'VOICE_CLONE_FORBIDDEN', clonePath)
  const library = recordValue(raw, 'voice-lines')
  checkKeys(library, 'voice-lines', VOICE_LINES_KEYS)
  if (library.profile !== VOICE_LINES_PROFILE) fail(`voice-lines.profile must be ${VOICE_LINES_PROFILE}`)
  if (library.version !== undefined) {
    const version = str(library.version, 'voice-lines.version', 32)
    if (!SEMVER_RE.test(version)) fail(`voice-lines.version must be semver, got ${version}`)
  }
  const linesRaw = recordValue(library.lines, 'voice-lines.lines')
  const lineCount = Object.keys(linesRaw).length
  if (lineCount === 0) fail('voice-lines.lines must not be empty')
  if (lineCount > LIMITS.voiceLines) fail(`voice-lines.lines has too many entries (max ${LIMITS.voiceLines})`)
  const lines: Record<string, VoiceLineEntry> = {}
  for (const [lineId, entryRaw] of Object.entries(linesRaw)) {
    if (!ID_RE.test(lineId)) fail(`voice-lines.lines key ${JSON.stringify(lineId)} must match ${String(ID_RE)}`)
    const path = `voice-lines.lines.${lineId}`
    const entry = recordValue(entryRaw, path)
    checkKeys(entry, path, VOICE_LINE_KEYS)
    const text = str(entry.text, `${path}.text`, 500)
    const normalized: VoiceLineEntry = { text }
    if (entry.lang !== undefined) {
      const lang = str(entry.lang, `${path}.lang`, 35)
      if (!LANGUAGE_RE.test(lang)) fail(`${path}.lang must be a BCP-47-ish tag, got ${JSON.stringify(lang)}`)
      normalized.lang = lang
    }
    if (entry.audio !== undefined) {
      const audio = idString(entry.audio, `${path}.audio`)
      if (options.audioIds) {
        if (options.audioIds.size === 0) fail(`${path}.audio references audio asset "${audio}" but the document declares no audio[]`)
        if (!options.audioIds.has(audio)) fail(`${path}.audio references undeclared audio asset "${audio}"`)
      }
      normalized.audio = audio
    }
    if (entry.durationMs !== undefined) normalized.durationMs = finiteNumber(entry.durationMs, `${path}.durationMs`, 0, 600_000)
    lines[lineId] = normalized
  }
  return {
    profile: VOICE_LINES_PROFILE,
    ...(library.version !== undefined ? { version: String(library.version) } : {}),
    lines,
  }
}

// ---------------------------------------------------------------------------
// Reference collectors (used by the validator CLI and by hosts)
// ---------------------------------------------------------------------------

export interface Fci03Reference {
  /** Dotted JSON path of the reference. */
  path: string
  id: string
}

function behaviorRules(behavior: BehaviorProfile | BehaviorProfileV03 | undefined): BehaviorRuleV03[] {
  if (!behavior || !Array.isArray(behavior.rules)) return []
  return behavior.rules as BehaviorRuleV03[]
}

function asRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asArrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Every emote id referenced by responses, moods and behavior rules (tolerant of partially invalid data). */
export function collectFci03Emotes(document: Partial<CharacterDocumentV03>, behavior?: BehaviorProfile | BehaviorProfileV03): Fci03Reference[] {
  const refs: Fci03Reference[] = []
  const responses = asArrayOrEmpty(document.responses)
  for (const [index, response] of responses.entries()) {
    if (isRecord(response) && typeof response.emote === 'string') refs.push({ path: `responses[${index}].emote`, id: response.emote })
  }
  for (const [moodId, def] of Object.entries(asRecordOrEmpty(asRecordOrEmpty(document.moods).defs))) {
    if (isRecord(def) && typeof def.emote === 'string') refs.push({ path: `moods.defs.${moodId}.emote`, id: def.emote })
  }
  for (const [index, rule] of behaviorRules(behavior ?? document.behavior).entries()) {
    if (rule.emote) refs.push({ path: `behavior.rules[${index}].emote`, id: rule.emote })
  }
  return refs
}

/** Every voice line id referenced by `voice.lineIds`, responses and behavior rules. */
export function collectFci03VoiceLineRefs(document: Partial<CharacterDocumentV03>, behavior?: BehaviorProfile | BehaviorProfileV03): Fci03Reference[] {
  const refs: Fci03Reference[] = []
  for (const [event, lineId] of Object.entries(asRecordOrEmpty(asRecordOrEmpty(document.voice).lineIds))) {
    if (typeof lineId === 'string') refs.push({ path: `voice.lineIds.${event}`, id: lineId })
  }
  for (const [index, response] of asArrayOrEmpty(document.responses).entries()) {
    if (isRecord(response) && typeof response.voiceLineId === 'string') refs.push({ path: `responses[${index}].voiceLineId`, id: response.voiceLineId })
  }
  for (const [index, rule] of behaviorRules(behavior ?? document.behavior).entries()) {
    if (rule.voiceLineId) refs.push({ path: `behavior.rules[${index}].voiceLineId`, id: rule.voiceLineId })
  }
  return refs
}

/** Every sfx clip id referenced by responses and behavior rules. */
export function collectFci03SfxRefs(document: Partial<CharacterDocumentV03>, behavior?: BehaviorProfile | BehaviorProfileV03): Fci03Reference[] {
  const refs: Fci03Reference[] = []
  for (const [index, response] of asArrayOrEmpty(document.responses).entries()) {
    if (isRecord(response) && typeof response.sfx === 'string') refs.push({ path: `responses[${index}].sfx`, id: response.sfx })
  }
  for (const [index, rule] of behaviorRules(behavior ?? document.behavior).entries()) {
    const sfx = rule.sfx
    if (typeof sfx === 'string') refs.push({ path: `behavior.rules[${index}].sfx`, id: sfx })
    else if (sfx && typeof sfx === 'object') refs.push({ path: `behavior.rules[${index}].sfx.clip`, id: sfx.clip })
  }
  return refs
}

/** Raw animation tags referenced by idle variants (art coverage check). */
export function collectFci03IdleTags(document: Partial<CharacterDocumentV03>): Fci03Reference[] {
  const refs: Fci03Reference[] = []
  for (const [index, variant] of asArrayOrEmpty(asRecordOrEmpty(document.idle).variants).entries()) {
    if (isRecord(variant) && typeof variant.tag === 'string') refs.push({ path: `idle.variants[${index}].tag`, id: variant.tag })
  }
  return refs
}

// ---------------------------------------------------------------------------
// Document validation (0.1/0.2 unchanged, 0.3 blocks additive)
// ---------------------------------------------------------------------------

export interface CharacterDocumentV03Options extends CharacterValidationOptions {
  /** Already-loaded behaviour profile (inline or from behaviorFile) for ref checks. */
  behavior?: BehaviorProfile | BehaviorProfileV03
}

function emitWarning(options: CharacterValidationOptions, code: string, path: string, message: string): void {
  const warning: CharacterValidationWarning = { code, path, message }
  options.warnings?.push(warning)
}

function collectStates(behavior: BehaviorProfile | BehaviorProfileV03 | undefined): Set<string> {
  return new Set(behavior ? Object.keys(behavior.states) : [])
}

/** FCI 0.3-only behavior fields present in a behavior profile (migration aid). */
export function findFci03BehaviorFields(behavior: unknown): string[] {
  if (!isRecord(behavior)) return []
  const found: string[] = []
  if (isRecord(behavior.states)) {
    for (const [name, state] of Object.entries(behavior.states)) {
      if (isRecord(state) && 'category' in state) found.push(`behavior.states.${name}.category`)
    }
  }
  if (Array.isArray(behavior.rules)) {
    for (const [index, rule] of behavior.rules.entries()) {
      if (!isRecord(rule)) continue
      for (const key of ['voiceLineId', 'emote', 'durationMs', 'requiresAny']) {
        if (key in rule) found.push(`behavior.rules[${index}].${key}`)
      }
      if (typeof rule.sfx === 'string') found.push(`behavior.rules[${index}].sfx (string form)`)
      if (isRecord(rule.when)) {
        for (const key of ['mood', 'focus', 'energy']) if (key in rule.when) found.push(`behavior.rules[${index}].when.${key}`)
      }
    }
  }
  return found
}

function assertNoPreviewFieldsOnOlderApiVersion(raw: Record<string, unknown>, apiVersion: string): void {
  const fields = FCI_V03_ONLY_FIELDS.filter((field) => raw[field] !== undefined)
  const behaviorFields = findFci03BehaviorFields(raw.behavior)
  const all = [...fields, ...behaviorFields]
  if (all.length === 0) return
  throw new FciV03Error(
    `FCI 0.3 field(s) [${all.join(', ')}] require apiVersion "0.3"; document declares apiVersion ${JSON.stringify(apiVersion)}. ` +
      'Bump apiVersion to "0.3" (see docs/CHARACTER-INTERFACE-V0.3.md) or keep the extension inside the namespaced extensions block.',
    'FCI03_FIELD_REQUIRES_0_3',
    'apiVersion',
  )
}

/**
 * Validate a 0.1/0.2/0.3 character document through the FCI 0.3 preview layer.
 *
 * - 0.1/0.2 documents: identical rules to `validateCharacterDocument()`; 0.3
 *   fields are rejected so a 0.2 pack cannot silently depend on them.
 * - 0.3 documents: core validation with the 0.3 window/runtime version, then
 *   closed-whitelist validation of every preview block, data-only guards, a
 *   real-person voice-clone field ban, and cross-references against the
 *   behaviour profile (inline or passed via `options.behavior`) for states,
 *   moods, time-of-day periods and sfx clips.
 *
 * Pure data validation: no filesystem access, no network, no code execution.
 */
export function validateCharacterDocumentV03(raw: unknown, options: CharacterDocumentV03Options = {}): CharacterDocumentV03 {
  if (!isRecord(raw)) fail('character document must be an object')
  const document = validateCharacterDocument(raw, {
    ...options,
    apiVersions: options.apiVersions ?? FCI_V03_API_VERSIONS,
    runtimeVersion: options.runtimeVersion ?? FCI_V03_RUNTIME_VERSION,
  })
  const validatedApiVersion: string = document.apiVersion
  if (validatedApiVersion !== '0.3') {
    assertNoPreviewFieldsOnOlderApiVersion(raw, validatedApiVersion)
    return document as unknown as CharacterDocumentV03
  }
  const clonePath = findVoiceCloneKey(raw)
  if (clonePath) {
    throw new FciV03Error(
      `real-person voice cloning is not representable (forbidden field ${clonePath}); ` +
        'use a synthetic TTS preset (voice.timbre.presetId) or a licensed voice profile id instead',
      'VOICE_CLONE_FORBIDDEN',
      clonePath,
    )
  }
  // Structural order: timeOfDay -> voice -> audio -> sfx -> moods (state/mood
  // refs) -> idle -> zones -> responses -> schedule -> focus -> extensions ->
  // behavior. Every block has a closed key whitelist and stays data-only.
  const timeOfDay = raw.timeOfDay !== undefined ? runBlock('timeOfDay', 'timeOfDay', () => validateTimeOfDaySpec(raw.timeOfDay)) : undefined
  const voice = raw.voice !== undefined ? runBlock('voice', 'voice', () => validateVoiceSpec(raw.voice)) : undefined
  const audio = raw.audio !== undefined ? runBlock('audio', 'audio', () => validateAudioAssets(raw.audio, voice?.profile, options)) : undefined
  const sfx = raw.sfx !== undefined ? runBlock('sfx', 'sfx', () => validateSfxSpec(raw.sfx, audio?.ids ?? new Set<string>())) : undefined
  const behavior = (options.behavior ?? document.behavior) as BehaviorProfile | undefined
  const ctx: RefContext = {
    canvas: document.canvas,
    states: collectStates(behavior),
    moods: new Set(),
    timeOfDay: new Set(timeOfDay ? timeOfDay.periods.map((period) => period.id) : []),
    sfxClips: new Set(sfx ? Object.keys(sfx.clips) : []),
  }
  const moods = raw.moods !== undefined ? runBlock('moods', 'moods', () => validateMoodsSpec(raw.moods, ctx)) : undefined
  if (moods) ctx.moods = new Set(Object.keys(moods.defs))
  const idle = raw.idle !== undefined ? runBlock('idle', 'idle', () => validateIdleSpec(raw.idle, ctx)) : undefined
  const zones = raw.zones !== undefined ? runBlock('zones', 'zones', () => validateZones(raw.zones, ctx)) : undefined
  const responses = raw.responses !== undefined ? runBlock('responses', 'responses', () => validateResponses(raw.responses, ctx)) : undefined
  const schedule = raw.schedule !== undefined ? runBlock('schedule', 'schedule', () => validateScheduleSpec(raw.schedule, ctx)) : undefined
  const focus = raw.focus !== undefined ? runBlock('focus', 'focus', () => validateFocusSpec(raw.focus, ctx)) : undefined
  runBlock('extensions', 'extensions', () => validateExtensionsSpec(raw.extensions, raw.extensionsRequired))

  if (behavior === undefined && typeof raw.behaviorFile === 'string') {
    emitWarning(
      options,
      'FCI03_CROSSREFS_SKIPPED',
      'behaviorFile',
      '0.3 state/mood/timeOfDay/sfx cross-references were not checked because the loaded behavior profile was not passed; load behaviorFile and call validateCharacterDocumentV03(raw, { behavior })',
    )
  }
  // Behaviour 0.3 additive fields (inline or externally loaded profile).
  const behaviorV03 = behavior !== undefined ? runBlock('behavior', 'behavior', () => validateBehaviorProfileV03(behavior, { sfxClipIds: ctx.sfxClips })) : undefined
  if (voice?.tts === true && behavior !== undefined && behavior.abilities.speech !== 'voice') {
    emitWarning(
      options,
      'VOICE_TTS_WITHOUT_SPEECH',
      'voice.tts',
      'voice.tts is enabled but behavior.abilities.speech is not "voice"; hosts that gate TTS on the ability would stay silent',
    )
  }
  return {
    ...(document as unknown as CharacterDocumentV03),
    ...(audio !== undefined ? { audio: audio.assets } : {}),
    ...(voice !== undefined ? { voice } : {}),
    ...(sfx !== undefined ? { sfx } : {}),
    ...(idle !== undefined ? { idle } : {}),
    ...(zones !== undefined ? { zones } : {}),
    ...(responses !== undefined ? { responses } : {}),
    ...(moods !== undefined ? { moods } : {}),
    ...(focus !== undefined ? { focus } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
    ...(timeOfDay !== undefined ? { timeOfDay } : {}),
    ...(behaviorV03 !== undefined ? { behavior: behaviorV03 } : {}),
  }
}

/** Wrapper returning non-fatal warnings alongside the document (mirrors core). */
export function validateCharacterDocumentV03Detailed(
  raw: unknown,
  options: Omit<CharacterDocumentV03Options, 'warnings'> = {},
): { document: CharacterDocumentV03; warnings: CharacterValidationWarning[] } {
  const warnings: CharacterValidationWarning[] = []
  const document = validateCharacterDocumentV03(raw, { ...options, warnings })
  return { document, warnings }
}
