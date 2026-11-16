import {
  BEHAVIOR_PROFILE,
  CHARACTER_API_VERSIONS,
  CHARACTER_RUNTIME_VERSION,
  KNOWN_RENDER_FORMATS,
  CharacterInterfaceError,
  type BehaviorProfile,
  type CharacterApiVersion,
  type CharacterDocument,
  type CharacterRenderSpec,
  type CharacterType,
  type CharacterValidationOptions,
  type CharacterValidationResult,
  type CharacterValidationWarning,
  type RenderFormatResolution,
} from './types.js'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new CharacterInterfaceError(`${what} must be a non-empty string`)
  return v
}

function int(v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new CharacterInterfaceError(`${what} must be an integer in [${min},${max}]`)
  }
  return v
}

function num(v: unknown, what: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new CharacterInterfaceError(`${what} must be a finite number in [${min},${max}]`)
  }
  return v
}

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const API_RE = /^(\d+)\.(\d+)$/
const RENDER_FORMAT_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const RENDER_KEYS = ['format', 'params']
const TYPES: CharacterType[] = ['humanoid', 'pet', 'object']
const FORBIDDEN_KEYS = ['script', 'scripts', 'eval', 'code', 'execute', 'permissions']

// ---------------------------------------------------------------------------
// Version negotiation (FCI 0.2)
// ---------------------------------------------------------------------------

/** Parse a `MAJOR.MINOR.PATCH` string into numeric parts (callers validate format first). */
function semverParts(version: string): [number, number, number] {
  const parts = version.split('.').map((part) => Number(part))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** Compare two valid semver strings: -1 (a<b), 0 (a===b), 1 (a>b). */
export function compareSemver(a: string, b: string): number {
  const left = semverParts(a)
  const right = semverParts(b)
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r) return l < r ? -1 : 1
  }
  return 0
}

/** True when `runtimeVersion` is new enough for a document's `minRuntime`. */
export function isRuntimeVersionSatisfied(minRuntime: string, runtimeVersion: string = CHARACTER_RUNTIME_VERSION): boolean {
  return compareSemver(minRuntime, runtimeVersion) <= 0
}

export interface CharacterApiVersionNegotiation {
  supported: boolean
  apiVersion: string
  message?: string
}

/**
 * FCI version negotiation: MAJOR must match exactly, MINOR lives in a window
 * (`supportedVersions[0]` .. newest entry). The default window is the frozen
 * shipping contract (`CHARACTER_API_VERSIONS` = 0.1/0.2); the FCI 0.3 preview
 * layer passes its own wider window so 0.3 documents can be validated without
 * changing the shipping defaults (see v03.ts). Returns a readable reason when
 * unsupported instead of throwing, so callers decide how to surface it
 * (runtime throws, CLI reports a diagnostic code).
 */
export function negotiateCharacterApiVersion(
  apiVersion: string,
  supportedVersions: readonly string[] = CHARACTER_API_VERSIONS,
): CharacterApiVersionNegotiation {
  if (supportedVersions.includes(apiVersion)) {
    return { supported: true, apiVersion }
  }
  const supported = `[${supportedVersions.join(', ')}]`
  const match = API_RE.exec(apiVersion)
  if (!match) return { supported: false, apiVersion, message: `apiVersion must be MAJOR.MINOR, got ${apiVersion}` }
  const docMajor = Number(match[1])
  const docMinor = Number(match[2])
  const window = supportedVersions
    .map((version) => API_RE.exec(version))
    .filter((parts): parts is RegExpExecArray => parts !== null)
    .map((parts) => [Number(parts[1]), Number(parts[2])] as const)
  if (window.length === 0) {
    return { supported: false, apiVersion, message: `unsupported character apiVersion ${apiVersion} (this runtime accepts no FCI MINOR versions)` }
  }
  const hostMajor = window.reduce((max, [major]) => Math.max(max, major), 0)
  const hostMinor = window.reduce((max, [, minor]) => Math.max(max, minor), 0)
  const minMinor = window.reduce((min, [, minor]) => Math.min(min, minor), hostMinor)
  const hostVersion = `${hostMajor}.${hostMinor}`
  if (docMajor !== hostMajor) {
    return {
      supported: false,
      apiVersion,
      message: `unsupported character apiVersion ${apiVersion}: MAJOR must match exactly (this runtime speaks ${hostVersion} and accepts ${supported})`,
    }
  }
  if (docMinor > hostMinor) {
    return {
      supported: false,
      apiVersion,
      message: `character apiVersion ${apiVersion} is newer than this runtime supports (host accepts ${supported}; upgrade the runtime)`,
    }
  }
  if (docMinor < minMinor) {
    return {
      supported: false,
      apiVersion,
      message: `character apiVersion ${apiVersion} is older than the supported window ${supported} (migrate the character document)`,
    }
  }
  return { supported: false, apiVersion, message: `unsupported character apiVersion ${apiVersion} (host accepts ${supported})` }
}

// ---------------------------------------------------------------------------
// Renderer selection (FCI 0.2)
// ---------------------------------------------------------------------------

/**
 * Resolve (or infer) the effective render format of a document.
 *
 * Declared `render.format` always wins. Documents without one are inferred for
 * migration: `meta.style`/`meta.renderFormat` wins when it names a registered
 * format, then hero pixel packs (`packBase`/`tags`) imply `pixel-hero`, then the
 * runtime default `pixel-hero`. Inference is reported as `source: 'inferred'`.
 */
export function inferRenderFormat(raw: unknown, renderFormats: readonly string[] = KNOWN_RENDER_FORMATS): RenderFormatResolution {
  if (isRecord(raw)) {
    const render = raw.render
    if (isRecord(render) && typeof render.format === 'string' && render.format.length > 0) {
      return { format: render.format, source: 'declared', reason: 'render.format' }
    }
    const meta = raw.meta
    if (isRecord(meta)) {
      for (const key of ['style', 'renderFormat']) {
        const candidate = meta[key]
        if (typeof candidate === 'string' && renderFormats.includes(candidate)) {
          return { format: candidate, source: 'inferred', reason: `meta.${key}` }
        }
      }
    }
    if (isRecord(raw.tags) || typeof raw.packBase === 'string') {
      return { format: 'pixel-hero', source: 'inferred', reason: 'packBase/tags imply a hero pixel pack' }
    }
  }
  return { format: 'pixel-hero', source: 'inferred', reason: 'runtime default' }
}

/** Effective render format of an already-validated document. */
export function resolveRenderFormat(document: CharacterDocument): string {
  const declared = document.render?.format
  if (typeof declared === 'string' && declared.length > 0) return declared
  return inferRenderFormat(document).format
}

/** Recursively enforce JSON data-only shape for the 0.2 `render.params` escape hatch. */
function assertJsonData(value: unknown, path: string): void {
  if (value === null) return
  const type = typeof value
  if (type === 'string' || type === 'boolean') return
  if (type === 'number') {
    if (!Number.isFinite(value as number)) throw new CharacterInterfaceError(`${path} must contain finite JSON numbers, got ${String(value)}`)
    return
  }
  if (type === 'function' || type === 'undefined' || type === 'symbol' || type === 'bigint') {
    throw new CharacterInterfaceError(`${path} must be JSON data (found ${type}); character packs cannot carry code`)
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertJsonData(child, `${path}[${index}]`))
    return
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) assertJsonData(child, `${path}.${key}`)
    return
  }
  throw new CharacterInterfaceError(`${path} must be JSON data`)
}

function validateRenderSpec(raw: unknown, renderFormats: readonly string[], path = 'render'): CharacterRenderSpec {
  if (!isRecord(raw)) throw new CharacterInterfaceError(`${path} must be an object`)
  for (const key of Object.keys(raw)) {
    if (!RENDER_KEYS.includes(key)) throw new CharacterInterfaceError(`${path}.${key} is not part of the FCI 0.2 render block`)
  }
  const format = str(raw.format, `${path}.format`)
  if (!RENDER_FORMAT_RE.test(format)) {
    throw new CharacterInterfaceError(`${path}.format must match ${String(RENDER_FORMAT_RE)}, got ${JSON.stringify(format)}`)
  }
  if (!renderFormats.includes(format)) {
    const registered = renderFormats.length > 0 ? renderFormats.join(', ') : 'none'
    throw new CharacterInterfaceError(`${path}.format "${format}" is not registered by this runtime; registered formats: [${registered}]`)
  }
  if (raw.params === undefined) return { format }
  if (!isRecord(raw.params)) throw new CharacterInterfaceError(`${path}.params must be an object`)
  assertJsonData(raw.params, `${path}.params`)
  return { format, params: raw.params }
}

function pushWarning(options: CharacterValidationOptions, warning: CharacterValidationWarning): void {
  options.warnings?.push(warning)
}

/** Reject any object that tries to smuggle executable content into a pack. */
function guardDataOnly(value: unknown, path = 'document'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => guardDataOnly(v, `${path}[${i}]`))
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      throw new CharacterInterfaceError(`${path}.${key} is forbidden: character packs are data-only (no scripts/permissions)`)
    }
    guardDataOnly(child, `${path}.${key}`)
  }
}

export function validateBehaviorProfile(raw: unknown): BehaviorProfile {
  if (!isRecord(raw)) throw new CharacterInterfaceError('behavior must be an object')
  guardDataOnly(raw, 'behavior')
  const profile = str(raw.profile, 'behavior.profile')
  if (profile !== BEHAVIOR_PROFILE) throw new CharacterInterfaceError(`behavior.profile must be ${BEHAVIOR_PROFILE}`)
  str(raw.version, 'behavior.version')
  const abilities = raw.abilities
  if (!isRecord(abilities)) throw new CharacterInterfaceError('behavior.abilities is required')
  const speech = str(abilities.speech, 'behavior.abilities.speech')
  if (!['text', 'voice', 'sfx', 'none'].includes(speech)) throw new CharacterInterfaceError(`unsupported speech mode: ${speech}`)
  if (typeof abilities.reminder !== 'boolean') throw new CharacterInterfaceError('behavior.abilities.reminder must be boolean')

  const statesRaw = raw.states
  if (!isRecord(statesRaw) || Object.keys(statesRaw).length === 0) {
    throw new CharacterInterfaceError('behavior.states must be a non-empty object')
  }
  const states: Record<string, Record<string, unknown>> = {}
  for (const [name, stateRaw] of Object.entries(statesRaw)) {
    if (!isRecord(stateRaw)) throw new CharacterInterfaceError(`behavior.states.${name} must be an object`)
    const tag = str(stateRaw.tag, `behavior.states.${name}.tag`)
    if (stateRaw.priority !== undefined) num(stateRaw.priority, `behavior.states.${name}.priority`, 0, 100)
    if (stateRaw.interrupt !== undefined) {
      const i = str(stateRaw.interrupt, `behavior.states.${name}.interrupt`)
      if (!['immediate', 'at-end', 'never'].includes(i)) throw new CharacterInterfaceError(`bad interrupt: ${i}`)
    }
    if (stateRaw.after !== undefined) str(stateRaw.after, `behavior.states.${name}.after`)
    states[name] = { tag, ...stateRaw }
  }

  if (!Array.isArray(raw.rules)) throw new CharacterInterfaceError('behavior.rules must be an array')
  const rules = raw.rules.map((ruleRaw, i) => {
    if (!isRecord(ruleRaw)) throw new CharacterInterfaceError(`behavior.rules[${i}] must be an object`)
    const on = ruleRaw.on
    const ons = Array.isArray(on) ? on.map((e) => str(e, `behavior.rules[${i}].on`)) : [str(on, `behavior.rules[${i}].on`)]
    if (ons.length === 0) throw new CharacterInterfaceError(`behavior.rules[${i}].on must not be empty`)
    const to = str(ruleRaw.to, `behavior.rules[${i}].to`)
    if (!states[to]) throw new CharacterInterfaceError(`behavior.rules[${i}].to="${to}" is not a declared state`)
    if (ruleRaw.probability !== undefined) num(ruleRaw.probability, `behavior.rules[${i}].probability`, 0, 1)
    if (ruleRaw.cooldownMs !== undefined) num(ruleRaw.cooldownMs, `behavior.rules[${i}].cooldownMs`, 0)
    return { ...ruleRaw, on: ons, to }
  })

  if (raw.ambient !== undefined) {
    if (!isRecord(raw.ambient)) throw new CharacterInterfaceError('behavior.ambient must be an object')
    const interval = raw.ambient.intervalMs
    if (!Array.isArray(interval) || interval.length !== 2) throw new CharacterInterfaceError('behavior.ambient.intervalMs must be [min,max]')
    int(interval[0], 'ambient.intervalMs[0]', 0)
    int(interval[1], 'ambient.intervalMs[1]', 0)
    if (Number(interval[1]) < Number(interval[0])) throw new CharacterInterfaceError('ambient.intervalMs max < min')
    const choices = raw.ambient.choices
    if (!Array.isArray(choices)) throw new CharacterInterfaceError('behavior.ambient.choices must be an array')
    for (const [i, choice] of choices.entries()) {
      if (!isRecord(choice)) throw new CharacterInterfaceError(`ambient.choices[${i}] must be an object`)
      const state = str(choice.state, `ambient.choices[${i}].state`)
      if (!states[state]) throw new CharacterInterfaceError(`ambient.choices[${i}].state="${state}" is not declared`)
      num(choice.weight, `ambient.choices[${i}].weight`, 0)
    }
  }

  const allowed = new Set(['profile', 'version', 'extends', 'defaults', 'abilities', 'slots', 'states', 'rules', 'ambient', 'needs', 'mood', 'speech', 'brief', 'fallback', 'interactions', 'overrides'])
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new CharacterInterfaceError(`behavior.${key} is not part of famling.behavior/0.1`)
  }
  return raw as unknown as BehaviorProfile
}

export function validateCharacterDocument(raw: unknown, options: CharacterValidationOptions = {}): CharacterDocument {
  if (!isRecord(raw)) throw new CharacterInterfaceError('character document must be an object')
  guardDataOnly(raw, 'character')
  if (raw.spec !== 'famling.character') throw new CharacterInterfaceError('spec must be "famling.character"')
  const apiVersion = str(raw.apiVersion, 'apiVersion')
  if (!API_RE.test(apiVersion)) throw new CharacterInterfaceError(`apiVersion must be MAJOR.MINOR, got ${apiVersion}`)
  const negotiation = negotiateCharacterApiVersion(apiVersion, options.apiVersions)
  if (!negotiation.supported) throw new CharacterInterfaceError(negotiation.message ?? `unsupported character apiVersion ${apiVersion}`)
  const characterApiVersion = apiVersion as CharacterApiVersion
  const id = str(raw.id, 'id')
  if (!ID_RE.test(id)) throw new CharacterInterfaceError(`invalid id: ${id}`)
  const version = str(raw.version, 'version')
  if (!SEMVER_RE.test(version)) throw new CharacterInterfaceError(`version must be semver, got ${version}`)
  const type = str(raw.type, 'type') as CharacterType
  if (!TYPES.includes(type)) throw new CharacterInterfaceError(`unsupported type: ${type}`)

  const canvas = raw.canvas
  if (!Array.isArray(canvas) || canvas.length !== 2) throw new CharacterInterfaceError('canvas must be [w,h]')
  int(canvas[0], 'canvas[0]', 16, 512)
  int(canvas[1], 'canvas[1]', 16, 512)

  const anchor = raw.anchor
  if (!isRecord(anchor)) throw new CharacterInterfaceError('anchor is required')
  num(anchor.x, 'anchor.x'); num(anchor.y, 'anchor.y')
  str(anchor.mode, 'anchor.mode')

  const footBox = raw.footBox
  if (!Array.isArray(footBox) || footBox.length !== 4) throw new CharacterInterfaceError('footBox must be [x,y,w,h]')
  footBox.forEach((v, i) => num(v, `footBox[${i}]`))
  if (Number(footBox[2]) <= 0 || Number(footBox[3]) <= 0) throw new CharacterInterfaceError('footBox w/h must be > 0')

  if (raw.bbox !== undefined) {
    if (!Array.isArray(raw.bbox) || raw.bbox.length !== 4) throw new CharacterInterfaceError('bbox must be [x,y,w,h]')
    raw.bbox.forEach((v, i) => num(v, `bbox[${i}]`))
  }

  // FCI 0.2 renderer selection. A declared format must be host-registered; a
  // missing one on a document newer than 0.1 is inferred for migration
  // (warning) rather than hard-failing, so pre-0.2 authors can upgrade without
  // lockout. New packs should declare it explicitly (the CLI enforces it under
  // --strict). The same rule applies to the 0.3 preview window passed by v03.ts.
  const renderFormats = options.renderFormats ?? KNOWN_RENDER_FORMATS
  let normalizedRender: CharacterRenderSpec | undefined
  if (raw.render !== undefined) {
    normalizedRender = validateRenderSpec(raw.render, renderFormats)
  } else if (characterApiVersion !== '0.1') {
    const inferred = inferRenderFormat(raw, renderFormats)
    if (!renderFormats.includes(inferred.format)) {
      const registered = renderFormats.length > 0 ? renderFormats.join(', ') : 'none'
      throw new CharacterInterfaceError(
        `character apiVersion ${characterApiVersion} has no render.format and the inferred format "${inferred.format}" is not registered by this runtime; registered formats: [${registered}]`,
      )
    }
    normalizedRender = { format: inferred.format }
    pushWarning(options, {
      code: 'RENDER_INFERRED',
      path: 'render.format',
      message: `character apiVersion ${characterApiVersion} has no render.format; inferred "${inferred.format}" (${inferred.reason}). Add render.format to make the renderer choice explicit.`,
    })
  }

  const hasPack = raw.packBase !== undefined
  const hasTags = raw.tags !== undefined
  if (!hasPack && !hasTags) {
    // Behaviour-only authoring is allowed; a runtime refuses to render it.
    if (raw.behavior === undefined && raw.behaviorFile === undefined) {
      throw new CharacterInterfaceError('document needs packBase, tags, or behavior')
    }
  }
  if (hasPack) str(raw.packBase, 'packBase')
  if (hasTags) {
    if (!isRecord(raw.tags) || Object.keys(raw.tags).length === 0) throw new CharacterInterfaceError('tags must be a non-empty object')
    for (const [name, tagRaw] of Object.entries(raw.tags)) {
      if (!isRecord(tagRaw)) throw new CharacterInterfaceError(`tags.${name} must be an object`)
      if (tagRaw.frames !== undefined) int(tagRaw.frames, `tags.${name}.frames`, 1)
      if (tagRaw.fps !== undefined) num(tagRaw.fps, `tags.${name}.fps`, 0)
      if (tagRaw.loop !== undefined && typeof tagRaw.loop !== 'boolean') throw new CharacterInterfaceError(`tags.${name}.loop must be boolean`)
    }
  }

  if (raw.behavior !== undefined) validateBehaviorProfile(raw.behavior)
  if (raw.behaviorFile !== undefined) str(raw.behaviorFile, 'behaviorFile')
  if (raw.behavior === undefined && raw.behaviorFile === undefined) {
    throw new CharacterInterfaceError('behavior or behaviorFile is required for famling.character (0.1 and 0.2)')
  }
  if (raw.license !== undefined) str(raw.license, 'license')
  if (raw.ai !== undefined) {
    if (!isRecord(raw.ai)) throw new CharacterInterfaceError('ai must be an object')
    str(raw.ai.status, 'ai.status')
    if (!['none', 'concept', 'final'].includes(String(raw.ai.status))) throw new CharacterInterfaceError('unsupported ai.status')
  }
  if (raw.minRuntime !== undefined) {
    const minRuntime = str(raw.minRuntime, 'minRuntime')
    if (!SEMVER_RE.test(minRuntime)) throw new CharacterInterfaceError(`minRuntime must be MAJOR.MINOR.PATCH, got ${minRuntime}`)
    const runtimeVersion = options.runtimeVersion ?? CHARACTER_RUNTIME_VERSION
    if (!SEMVER_RE.test(runtimeVersion)) throw new CharacterInterfaceError(`runtimeVersion option must be MAJOR.MINOR.PATCH, got ${runtimeVersion}`)
    if (!isRuntimeVersionSatisfied(minRuntime, runtimeVersion)) {
      throw new CharacterInterfaceError(`character requires runtime >= ${minRuntime}, this runtime is ${runtimeVersion}`)
    }
  }
  // v0.2 documents without render get a normalized copy so callers can read the
  // effective format without re-inferring. Declared render / v0.1 pass through.
  if (normalizedRender !== undefined && raw.render === undefined) {
    return { ...raw, render: normalizedRender } as unknown as CharacterDocument
  }
  return raw as unknown as CharacterDocument
}

/**
 * Convenience wrapper that also returns non-fatal warnings (currently
 * RENDER_INFERRED for v0.2 documents relying on render inference).
 */
export function validateCharacterDocumentDetailed(
  raw: unknown,
  options: Omit<CharacterValidationOptions, 'warnings'> = {},
): CharacterValidationResult {
  const warnings: CharacterValidationWarning[] = []
  const document = validateCharacterDocument(raw, { ...options, warnings })
  return { document, warnings }
}

/** Convert a legacy hero.ts manifest into a FCI document (data-only, typed object). */
export function legacyManifestToCharacter(manifest: Record<string, unknown>, id = 'legacy.character'): CharacterDocument {
  const tags = isRecord(manifest.tags) ? (manifest.tags as Record<string, unknown>) : {}
  const normalizedTags: Record<string, unknown> = {}
  for (const [name, tagRaw] of Object.entries(tags)) {
    if (!isRecord(tagRaw)) continue
    normalizedTags[name] = {
      frames: tagRaw.frames,
      fps: tagRaw.fps,
      loop: tagRaw.loop,
      ...(tagRaw.phase ? { category: tagRaw.phase === '1a' ? 'reaction' : 'idle' } : {}),
    }
  }
  return validateCharacterDocument({
    spec: 'famling.character',
    // Legacy hero.ts manifests are v0.1 documents by definition; keep writing
    // 0.1 here so converting an old pack does not silently claim v0.2.
    apiVersion: '0.1',
    id,
    version: '0.0.0',
    type: 'object',
    canvas: manifest.canvas,
    anchor: manifest.anchor,
    footBox: (() => {
      const fb = manifest.footBox
      if (isRecord(fb)) return [fb.x, fb.y, fb.w, fb.h]
      return [-36, -18, 72, 18]
    })(),
    palette: manifest.palette,
    tags: normalizedTags,
    behavior: {
      profile: BEHAVIOR_PROFILE,
      version: '0.0.0',
      abilities: { speech: 'none', reminder: false },
      states: { idle: { tag: 'idle', loop: true } },
      rules: [],
    },
    license: typeof manifest.license === 'string' ? manifest.license : 'unknown',
  })
}
