#!/usr/bin/env node
/**
 * Famling Character Interface (FCI) validator — supports 0.1, 0.2 and 0.3 documents.
 *
 * Usage:
 *   node --import tsx scripts/validate-character.mjs public/characters/humanoid-default --json --strict
 *   node --import tsx scripts/validate-character.mjs public/characters/*            (POSIX shell glob)
 *   node --import tsx scripts/validate-character.mjs a b c --strict --format pixel-hero
 *
 * Checks (schema + semantics are intentionally complementary):
 *   1. JSON Schema  content/schema/character-<apiVersion>.schema.json, auto-selected by the
 *                    document's apiVersion (0.1 -> character-0.1, 0.2 -> character-0.2,
 *                    0.3 -> character-0.3 preview extensions)
 *   2. Runtime       src/pet/character/validate.ts (data-only guard, ids/versions, ranges,
 *                    apiVersion MAJOR/MINOR negotiation, minRuntime, render.format registration)
 *   3. Behavior      state/rule/slot/ambient references, priority/probability/cooldown ranges,
 *                    fallback cycles and depth (<= 3), needs sanity, tag coverage;
 *                    0.3 adds state categories and rules[].voiceLineId/sfx/emote/
 *                    durationMs/requiresAny + when.mood/focus/energy
 *   4. Pack          packBase resolution (relative / absolute / /assets/... under public/),
 *                    manifest structural validation (hero.ts validateCharacterPack),
 *                    canvas/anchor/footBox/palette consistency, frame files, naming,
 *                    PNG dimensions + alpha + palette colours (no external deps)
 *   5. Renderer      FCI 0.2 render.format is a registered host format (built-in pixel-hero /
 *                    pixel-micro / hd-chibi; --format adds future first-party formats);
 *                    --strict requires an explicit render.format on 0.2 documents
 *   6. Release       license/ai required under --strict
 *   7. FCI 0.3       preview-only checks for 0.3 documents: audio[] asset declarations
 *                    (path/sha256/license/ai/provenance, file presence is a warning until
 *                    audio playback lands), voice line library + line id references,
 *                    sfx clip references, emote/idle-tag art coverage, zone events.
 *                    0.3 is an interface preview: no TTS/ASR, audio playback, idle
 *                    scheduling, hit-testing or mood/focus/schedule execution happens.
 *
 * Exit codes: 0 = all targets valid, 1 = at least one validation error, 2 = usage/fatal error.
 * --json prints a single machine-readable object on stdout (diagnostics never mix in).
 *
 * Data-only: this script never executes pack content. It imports the project runtime
 * through tsx; without `--import tsx` it exits 2 with an explanatory message.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import Ajv2020 from 'ajv/dist/2020.js'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCHEMA_DIR = join(REPO_ROOT, 'content/schema')
const SCHEMA_PATH_BY_API_VERSION = {
  '0.1': join(SCHEMA_DIR, 'character-0.1.schema.json'),
  '0.2': join(SCHEMA_DIR, 'character-0.2.schema.json'),
  '0.3': join(SCHEMA_DIR, 'character-0.3.schema.json'),
}
/** apiVersion values with a JSON Schema; 0.3 is the additive preview layer. */
const SCHEMA_API_VERSIONS = Object.keys(SCHEMA_PATH_BY_API_VERSION)
/**
 * apiVersion values the *shipping runtime* can load without opt-in. FCI 0.2 is
 * frozen; 0.3 rides on the preview layer (`src/pet/character/v03.ts`) and the
 * CLI routes it, but a 0.2 host still rejects it. Kept in the --json payload
 * under the historical `supportedApiVersions` key for backward compatibility.
 */
const RUNTIME_API_VERSIONS = ['0.1', '0.2']
const PREVIEW_API_VERSIONS = ['0.3']
const FORBIDDEN_KEYS = ['script', 'scripts', 'eval', 'code', 'execute', 'permissions']
const RENDER_FORMAT_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_FALLBACK_DEPTH = 3
const DEFAULT_MAX_COLORS = 41 // FCI art constraint: 40 visible colours + transparent

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value) {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value)
}

function toDisplayPath(path) {
  if (typeof path !== 'string') return String(path)
  return path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length + 1) || '.' : path
}

class PngError extends Error {}

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

const USAGE = `Famling Character Interface (FCI) 0.1/0.2/0.3 validator

Usage:
  node --import tsx scripts/validate-character.mjs <character-dir> [more-dirs...] [options]

Options:
  --json           print one machine-readable JSON object on stdout
  --strict         treat release-readiness problems as errors (license/ai required,
                   palette/naming/alpha-range mismatches, missing art tags, missing
                   explicit render.format on documents newer than 0.1)
  --max-colors N   max distinct opaque colours per frame (default ${DEFAULT_MAX_COLORS})
  --schema PATH    force ONE JSON Schema for every target (default: auto-select by
                   apiVersion from content/schema/character-<apiVersion>.schema.json)
  --format NAME    additional registered render format, repeatable (e.g. a future
                   first-party Live2D/Spine plugin format)
  --no-pixels      skip PNG pixel decoding (keeps dimensions; alpha/colour checks report skipped)
  -h, --help       show this help
  -V, --version    show validator version

Exit codes:
  0  all targets valid
  1  at least one validation error
  2  usage/setup error (bad flags, missing target dir, schema unreadable, runtime unavailable)

Examples:
  node --import tsx scripts/validate-character.mjs public/characters/humanoid-default --json --strict
  node --import tsx scripts/validate-character.mjs public/characters/pet-default --strict
  node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v02/humanoid-v02 --json --strict
  node --import tsx scripts/validate-character.mjs tests/fixtures/fci-v03/tinlan-v03 --json --strict
`

const VALIDATOR_VERSION = '0.3.0'

function parseArgs(argv) {
  const options = {
    json: false,
    strict: false,
    help: false,
    version: false,
    maxColors: DEFAULT_MAX_COLORS,
    schemaPath: null,
    formats: [],
    pixels: true,
    targets: [],
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--no-pixels') options.pixels = false
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--version' || arg === '-V') options.version = true
    else if (arg === '--max-colors') {
      const raw = argv[++i]
      const value = Number(raw)
      if (!isInteger(value) || value < 1 || value > 1024) {
        return { usageError: `--max-colors expects an integer in [1,1024], got ${raw === undefined ? '(missing)' : raw}` }
      }
      options.maxColors = value
    } else if (arg === '--format') {
      const raw = argv[++i]
      if (!isString(raw) || !RENDER_FORMAT_RE.test(raw)) {
        return { usageError: `--format expects a lowercase format name (${String(RENDER_FORMAT_RE)}), got ${raw === undefined ? '(missing)' : raw}` }
      }
      if (!options.formats.includes(raw)) options.formats.push(raw)
    } else if (arg === '--schema') {
      const raw = argv[++i]
      if (!isString(raw)) return { usageError: '--schema expects a path' }
      options.schemaPath = resolve(raw)
    } else if (arg.startsWith('-')) {
      return { usageError: `unknown flag: ${arg}` }
    } else {
      options.targets.push(arg)
    }
  }
  return options
}

// ---------------------------------------------------------------------------
// Diagnostic report
// ---------------------------------------------------------------------------

class TargetReport {
  constructor(dir) {
    this.dir = dir
    this.characterFile = undefined
    this.behaviorFile = undefined
    this.manifestFile = undefined
    this.schemaFile = undefined
    this.id = undefined
    this.apiVersion = undefined
    this.version = undefined
    this.type = undefined
    this.errors = []
    this.warnings = []
    this.infos = []
    this.checks = {}
  }

  add(level, code, path, message) {
    const entry = { level, code, path: path || '/', message }
    if (level === 'error') this.errors.push(entry)
    else if (level === 'warning') this.warnings.push(entry)
    else this.infos.push(entry)
    return entry
  }

  error(code, path, message) {
    return this.add('error', code, path, message)
  }

  warning(code, path, message) {
    return this.add('warning', code, path, message)
  }

  info(code, path, message) {
    return this.add('info', code, path, message)
  }

  get ok() {
    return this.errors.length === 0
  }

  toJSON() {
    return {
      dir: toDisplayPath(this.dir),
      character: this.characterFile ? toDisplayPath(this.characterFile) : undefined,
      behavior: this.behaviorFile ? toDisplayPath(this.behaviorFile) : undefined,
      manifest: this.manifestFile ? toDisplayPath(this.manifestFile) : undefined,
      schema: this.schemaFile ? toDisplayPath(this.schemaFile) : undefined,
      id: this.id,
      apiVersion: this.apiVersion,
      version: this.version,
      type: this.type,
      ok: this.ok,
      errors: this.errors,
      warnings: this.warnings,
      infos: this.infos,
      checks: this.checks,
    }
  }
}

// ---------------------------------------------------------------------------
// JSON / file helpers
// ---------------------------------------------------------------------------

function readJsonFile(file, report, whatPath) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    report.error('IO_ERROR', whatPath, `cannot read ${toDisplayPath(file)}: ${error.message}`)
    return undefined
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  try {
    return JSON.parse(text)
  } catch (error) {
    report.error('INVALID_JSON', whatPath, `${toDisplayPath(file)}: ${error.message}`)
    return undefined
  }
}

/** Recursive data-only guard mirroring src/pet/character/validate.ts. */
function findForbiddenKey(value, path = 'document') {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const hit = findForbiddenKey(child, `${path}[${index}]`)
      if (hit) return hit
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) return `${path}.${key}`
    const hit = findForbiddenKey(child, `${path}.${key}`)
    if (hit) return hit
  }
  return null
}

// ---------------------------------------------------------------------------
// PNG inspection (no third-party deps: PNG chunks + zlib inflate)
// ---------------------------------------------------------------------------

function readPng(file) {
  const buffer = readFileSync(file)
  const signatureOk =
    buffer.length >= 8 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a
  if (!signatureOk) throw new PngError('missing PNG signature')
  let offset = 8
  let header
  const idat = []
  let palette = null
  let transparency = null
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const start = offset + 8
    if (start + length + 4 > buffer.length) throw new PngError(`truncated ${type} chunk`)
    const data = buffer.subarray(start, start + length)
    if (type === 'IHDR') {
      if (length < 13) throw new PngError('bad IHDR')
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
    } else if (type === 'PLTE') {
      palette = Buffer.from(data)
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data)
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset = start + length + 4
  }
  if (!header) throw new PngError('missing IHDR')
  if (header.width <= 0 || header.height <= 0) throw new PngError('zero-sized image')
  if (header.compression !== 0 || header.filter !== 0) throw new PngError('unsupported PNG compression/filter method')
  const hasAlpha = header.colorType === 4 || header.colorType === 6 || transparency !== null
  const result = {
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    colorType: header.colorType,
    interlace: header.interlace,
    hasAlpha,
    pixels: null,
    skipped: null,
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType]
  if (channels === undefined) {
    result.skipped = `unsupported PNG colour type ${header.colorType}`
    return result
  }
  if (header.bitDepth !== 8) {
    result.skipped = `unsupported PNG bit depth ${header.bitDepth} (only 8-bit frames are supported by the art pipeline)`
    return result
  }
  if (header.interlace !== 0) {
    result.skipped = 'interlaced PNGs are not supported by the art pipeline'
    return result
  }
  if (header.colorType === 3 && !palette) {
    result.skipped = 'palette PNG without PLTE chunk'
    return result
  }
  let raw
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch (error) {
    throw new PngError(`IDAT inflate failed: ${error.message}`)
  }
  const stride = header.width * channels
  const expected = header.height * (stride + 1)
  if (raw.length < expected) throw new PngError(`IDAT too short (${raw.length} < ${expected})`)
  const pixels = Buffer.alloc(header.width * header.height * 4)
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let value = line[x]
      if (filter === 1) value = (value + left) & 0xff
      else if (filter === 2) value = (value + up) & 0xff
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff
      } else if (filter !== 0) {
        throw new PngError(`unsupported PNG scanline filter ${filter}`)
      }
      line[x] = value
    }
    const outBase = y * header.width * 4
    for (let x = 0; x < header.width; x += 1) {
      const o = outBase + x * 4
      const source = x * channels
      if (header.colorType === 6) {
        pixels[o] = line[source]
        pixels[o + 1] = line[source + 1]
        pixels[o + 2] = line[source + 2]
        pixels[o + 3] = line[source + 3]
      } else if (header.colorType === 2) {
        pixels[o] = line[source]
        pixels[o + 1] = line[source + 1]
        pixels[o + 2] = line[source + 2]
        pixels[o + 3] = 255
        if (transparency && transparency.length >= 6) {
          const r = transparency.readUInt16BE(0) >> 8
          const g = transparency.readUInt16BE(2) >> 8
          const b = transparency.readUInt16BE(4) >> 8
          if (pixels[o] === r && pixels[o + 1] === g && pixels[o + 2] === b) pixels[o + 3] = 0
        }
      } else if (header.colorType === 0) {
        pixels[o] = line[source]
        pixels[o + 1] = line[source]
        pixels[o + 2] = line[source]
        pixels[o + 3] = 255
        if (transparency && transparency.length >= 2 && line[source] === (transparency.readUInt16BE(0) & 0xff)) {
          pixels[o + 3] = 0
        }
      } else if (header.colorType === 4) {
        pixels[o] = line[source]
        pixels[o + 1] = line[source]
        pixels[o + 2] = line[source]
        pixels[o + 3] = line[source + 1]
      } else if (header.colorType === 3) {
        const index = line[source]
        const p = index * 3
        if (p + 2 < palette.length) {
          pixels[o] = palette[p]
          pixels[o + 1] = palette[p + 1]
          pixels[o + 2] = palette[p + 2]
        }
        pixels[o + 3] = transparency && index < transparency.length ? transparency[index] : 255
      }
    }
    previous = line
  }
  result.pixels = pixels
  return result
}

function summarisePixels(png) {
  const { width, height, pixels } = png
  let transparent = 0
  let opaque = 0
  let semi = 0
  const colours = new Set()
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4
    const alpha = pixels[o + 3]
    if (alpha === 0) {
      transparent += 1
    } else {
      if (alpha === 255) opaque += 1
      else semi += 1
      colours.add(`#${pixels[o].toString(16).padStart(2, '0')}${pixels[o + 1].toString(16).padStart(2, '0')}${pixels[o + 2].toString(16).padStart(2, '0')}`)
    }
  }
  return { transparent, opaque, semi, colours }
}

// ---------------------------------------------------------------------------
// Palette spec lookup (art/specs/*.json, best effort)
// ---------------------------------------------------------------------------

const paletteCache = new Map()

function loadPaletteColours(paletteId) {
  if (typeof paletteId !== 'string' || paletteId.length === 0) return null
  if (paletteCache.has(paletteId)) return paletteCache.get(paletteId)
  let found = null
  const specsDir = join(REPO_ROOT, 'art/specs')
  if (existsSync(specsDir)) {
    for (const file of readdirSync(specsDir)) {
      if (!file.endsWith('.json')) continue
      try {
        const spec = JSON.parse(readFileSync(join(specsDir, file), 'utf8'))
        if (isRecord(spec) && spec.palette === paletteId && isRecord(spec.colors)) {
          const colours = new Set(
            Object.values(spec.colors)
              .filter((value) => typeof value === 'string')
              .map((value) => value.toLowerCase()),
          )
          if (colours.size > 0) {
            found = colours
            break
          }
        }
      } catch {
        // Ignore unreadable art specs: palette checking is best effort.
      }
    }
  }
  paletteCache.set(paletteId, found)
  return found
}

// ---------------------------------------------------------------------------
// packBase resolution
// ---------------------------------------------------------------------------

function resolvePackLocation(rawPackBase, characterDir) {
  if (typeof rawPackBase !== 'string' || rawPackBase.length === 0) {
    return { kind: 'error', message: 'packBase must be a non-empty string' }
  }
  if (/^https?:\/\//i.test(rawPackBase)) return { kind: 'remote', raw: rawPackBase }
  if (/^fil<private-path>)) {
    try {
      return { kind: 'local', path: fileURLToPath(rawPackBase), raw: rawPackBase }
    } catch (error) {
      return { kind: 'error', message: `cannot decode file:// packBase: ${error.message}` }
    }
  }
  if (/^[A-Za-z]:[\\/]/.test(rawPackBase)) {
    return { kind: 'local', path: rawPackBase, raw: rawPackBase }
  }
  if (rawPackBase.startsWith('/') || rawPackBase.startsWith('\\')) {
    const webPath = join(REPO_ROOT, 'public', rawPackBase.replace(/^[\\/]+/, ''))
    if (existsSync(webPath)) return { kind: 'local', path: webPath, raw: rawPackBase, via: 'public/' }
    return { kind: 'local', path: rawPackBase, raw: rawPackBase, via: 'absolute' }
  }
  return { kind: 'local', path: resolve(characterDir, rawPackBase), raw: rawPackBase, via: 'relative' }
}

// ---------------------------------------------------------------------------
// Behavior semantic checks (complements validateBehaviorProfile)
// ---------------------------------------------------------------------------

function checkBehaviourSemantics(behavior, report) {
  const result = { states: 0, rules: 0, slots: 0, fallback: null, needs: null, issues: [] }
  if (!isRecord(behavior)) return result
  const states = isRecord(behavior.states) ? behavior.states : {}
  const stateNames = new Set(Object.keys(states))
  result.states = stateNames.size
  const defaults = isRecord(behavior.defaults) ? behavior.defaults : {}
  if (defaults.priority !== undefined && (!isFiniteNumber(defaults.priority) || defaults.priority < 0 || defaults.priority > 100)) {
    report.error('PRIORITY_RANGE', 'behavior.defaults.priority', 'defaults.priority must be a number in [0,100]')
  }
  if (defaults.cooldownMs !== undefined && (!isFiniteNumber(defaults.cooldownMs) || defaults.cooldownMs < 0)) {
    report.error('COOLDOWN_RANGE', 'behavior.defaults.cooldownMs', 'defaults.cooldownMs must be a finite number >= 0')
  }
  if (defaults.interrupt !== undefined && !['immediate', 'at-end', 'never'].includes(defaults.interrupt)) {
    report.error('INTERRUPT_MODE', 'behavior.defaults.interrupt', `unsupported interrupt mode: ${String(defaults.interrupt)}`)
  }

  for (const [name, state] of Object.entries(states)) {
    if (!isRecord(state)) continue
    if (state.after !== undefined) {
      if (typeof state.after !== 'string' || !stateNames.has(state.after)) {
        report.error('AFTER_UNKNOWN', `behavior.states.${name}.after`, `state "${name}" falls back to unknown state "${String(state.after)}"`)
      }
    }
    if (state.cooldownMs !== undefined && (!isFiniteNumber(state.cooldownMs) || state.cooldownMs < 0)) {
      report.error('COOLDOWN_RANGE', `behavior.states.${name}.cooldownMs`, 'cooldownMs must be a finite number >= 0')
    }
    if (state.timeoutMs !== undefined && (!isFiniteNumber(state.timeoutMs) || state.timeoutMs < 0)) {
      report.error('TIMEOUT_RANGE', `behavior.states.${name}.timeoutMs`, 'timeoutMs must be a finite number >= 0')
    }
  }

  const slots = isRecord(behavior.slots) ? behavior.slots : {}
  result.slots = Object.keys(slots).length
  for (const [event, target] of Object.entries(slots)) {
    if (target === null) continue
    if (typeof target !== 'string' || !stateNames.has(target)) {
      report.error('SLOT_UNKNOWN', `behavior.slots.${event}`, `slot "${event}" points at unknown state "${String(target)}"`)
    }
  }

  const rules = Array.isArray(behavior.rules) ? behavior.rules : []
  result.rules = rules.length
  const guardInputs = ['mood', 'bond', 'hunger', 'energy', 'fun']
  for (const [index, rule] of rules.entries()) {
    if (!isRecord(rule)) continue
    const path = `behavior.rules[${index}]`
    if (typeof rule.to !== 'string' || !stateNames.has(rule.to)) {
      report.error('RULE_TARGET_UNKNOWN', `${path}.to`, `rule target "${String(rule.to)}" is not a declared state`)
    }
    const ons = Array.isArray(rule.on) ? rule.on : [rule.on]
    if (ons.length === 0 || ons.some((on) => typeof on !== 'string' || on.length === 0)) {
      report.error('RULE_EVENT', `${path}.on`, 'rule "on" must be a non-empty event name or array of them')
    }
    if (rule.priority !== undefined && (!isFiniteNumber(rule.priority) || rule.priority < 0 || rule.priority > 100)) {
      report.error('PRIORITY_RANGE', `${path}.priority`, 'priority must be a number in [0,100]')
    }
    if (rule.cooldownMs !== undefined && (!isFiniteNumber(rule.cooldownMs) || rule.cooldownMs < 0)) {
      report.error('COOLDOWN_RANGE', `${path}.cooldownMs`, 'cooldownMs must be a finite number >= 0')
    }
    if (rule.probability !== undefined && (!isFiniteNumber(rule.probability) || rule.probability < 0 || rule.probability > 1)) {
      report.error('PROBABILITY_RANGE', `${path}.probability`, 'probability must be a number in [0,1]')
    }
    if (isRecord(rule.when) && Array.isArray(rule.when.state)) {
      for (const [i, ref] of rule.when.state.entries()) {
        if (typeof ref !== 'string' || !stateNames.has(ref)) {
          report.error('WHEN_STATE_UNKNOWN', `${path}.when.state[${i}]`, `unknown state reference "${String(ref)}"`)
        }
      }
    }
    if (isRecord(rule.guard)) {
      if (!guardInputs.includes(rule.guard.input)) {
        report.error('GUARD_INPUT', `${path}.guard.input`, `guard.input must be one of ${guardInputs.join('/')}`)
      }
      if (!['>=', '<=', '==', '!='].includes(rule.guard.op)) {
        report.error('GUARD_OP', `${path}.guard.op`, 'guard.op must be one of >=, <=, ==, !=')
      }
      if (!isFiniteNumber(rule.guard.value)) {
        report.error('GUARD_VALUE', `${path}.guard.value`, 'guard.value must be a finite number')
      }
    }
    if (isRecord(rule.sfx) && rule.sfx.volume !== undefined && (!isFiniteNumber(rule.sfx.volume) || rule.sfx.volume < 0 || rule.sfx.volume > 1)) {
      report.error('SFX_VOLUME', `${path}.sfx.volume`, 'sfx.volume must be a number in [0,1]')
    }
  }

  // ambient interval ordering is not checked by the runtime validator.
  if (isRecord(behavior.ambient) && Array.isArray(behavior.ambient.intervalMs) && behavior.ambient.intervalMs.length === 2) {
    const [min, max] = behavior.ambient.intervalMs
    if (isFiniteNumber(min) && isFiniteNumber(max) && max < min) {
      report.error('AMBIENT_INTERVAL', 'behavior.ambient.intervalMs', 'ambient.intervalMs max < min')
    }
  }

  // needs (pet profiles) — not validated by the runtime yet.
  if (isRecord(behavior.needs)) {
    result.needs = {}
    for (const [name, need] of Object.entries(behavior.needs)) {
      const path = `behavior.needs.${name}`
      if (!isRecord(need)) {
        report.error('NEED_INVALID', path, 'need must be an object')
        continue
      }
      for (const field of ['value', 'max', 'decayPerHour', 'criticalAt']) {
        if (!isFiniteNumber(need[field])) report.error('NEED_INVALID', `${path}.${field}`, `${field} must be a finite number`)
      }
      if (isFiniteNumber(need.max) && need.max <= 0) report.error('NEED_INVALID', `${path}.max`, 'max must be > 0')
      if (isFiniteNumber(need.value) && isFiniteNumber(need.max) && need.value > need.max) {
        report.error('NEED_INVALID', `${path}.value`, 'value must not exceed max')
      }
      if (isFiniteNumber(need.criticalAt) && isFiniteNumber(need.max) && need.criticalAt > need.max) {
        report.error('NEED_INVALID', `${path}.criticalAt`, 'criticalAt must not exceed max')
      }
      if (isFiniteNumber(need.value) && isFiniteNumber(need.criticalAt) && need.criticalAt > need.value) {
        report.warning('NEED_CRITICAL', `${path}.criticalAt`, 'criticalAt is above the starting value (character starts critical)')
      }
      result.needs[name] = { value: need.value, max: need.max }
    }
  }

  if (isRecord(behavior.speech) && isRecord(behavior.speech.lines)) {
    for (const [key, line] of Object.entries(behavior.speech.lines)) {
      if (typeof line !== 'string' || line.length === 0) {
        report.error('SPEECH_LINE', `behavior.speech.lines.${key}`, 'speech line must be a non-empty string')
      }
    }
  }
  return result
}

/** Fallback graph: report cycles and chains deeper than MAX_FALLBACK_DEPTH. */
function checkFallbackGraph(fallback, report) {
  const result = { keys: 0, maxDepth: 0, cycles: [], tooDeep: [] }
  if (!isRecord(fallback)) return result
  const keys = Object.keys(fallback)
  result.keys = keys.length
  const graph = new Map()
  for (const [key, alternatives] of Object.entries(fallback)) {
    if (!Array.isArray(alternatives)) {
      report.error('FALLBACK_INVALID', `fallback.${key}`, 'fallback entry must be an array of tag names')
      continue
    }
    const edges = []
    for (const [index, target] of alternatives.entries()) {
      if (typeof target !== 'string' || target.length === 0) {
        report.error('FALLBACK_INVALID', `fallback.${key}[${index}]`, 'fallback alternative must be a non-empty tag name')
        continue
      }
      edges.push(target)
    }
    graph.set(key, edges)
  }
  const state = new Map() // 0=visiting, 1=done
  const longest = new Map()
  const reported = new Set()
  const visit = (node, trail) => {
    if (state.get(node) === 1) return longest.get(node) ?? 0
    if (state.get(node) === 0) {
      const cycle = [...trail.slice(trail.indexOf(node)), node]
      if (!reported.has(cycle.join('>'))) {
        reported.add(cycle.join('>'))
        result.cycles.push(cycle)
        report.error('FALLBACK_CYCLE', `fallback.${node}`, `fallback cycle detected: ${cycle.join(' -> ')}`)
      }
      return 0
    }
    state.set(node, 0)
    let depth = 0
    for (const target of graph.get(node) ?? []) {
      depth = Math.max(depth, 1 + visit(target, [...trail, node]))
    }
    state.set(node, 1)
    longest.set(node, depth)
    return depth
  }
  for (const key of graph.keys()) {
    const depth = visit(key, [])
    result.maxDepth = Math.max(result.maxDepth, depth)
    if (depth > MAX_FALLBACK_DEPTH && !result.tooDeep.includes(key)) {
      result.tooDeep.push(key)
    }
  }
  for (const key of result.tooDeep) {
    report.error('FALLBACK_TOO_DEEP', `fallback.${key}`, `fallback chain from "${key}" is ${longest.get(key)} hops deep (max ${MAX_FALLBACK_DEPTH})`)
  }
  return result
}

// ---------------------------------------------------------------------------
// Pack inspection
// ---------------------------------------------------------------------------

function checkPackGeometry(pack, document, report) {
  const canvas = Array.isArray(document.canvas) ? document.canvas : null
  if (canvas && (canvas[0] !== pack.canvas[0] || canvas[1] !== pack.canvas[1])) {
    report.error('PACK_CANVAS_MISMATCH', 'packBase', `document canvas ${JSON.stringify(canvas)} != manifest canvas ${JSON.stringify(pack.canvas)}`)
  }
  const anchor = isRecord(document.anchor) ? document.anchor : null
  if (anchor) {
    if (anchor.x !== pack.anchor.x || anchor.y !== pack.anchor.y) {
      report.warning('PACK_ANCHOR_MISMATCH', 'anchor', `document anchor (${anchor.x},${anchor.y}) != manifest anchor (${pack.anchor.x},${pack.anchor.y})`)
    }
    if (anchor.mode !== pack.anchor.mode) {
      report.warning('PACK_ANCHOR_MODE', 'anchor.mode', `document anchor mode "${anchor.mode}" != manifest mode "${pack.anchor.mode}"`)
    }
  }
  const footBox = Array.isArray(document.footBox) ? document.footBox : null
  if (footBox && footBox.length === 4) {
    const expected = [pack.footBox.x, pack.footBox.y, pack.footBox.w, pack.footBox.h]
    let mismatch = false
    for (let i = 0; i < 4; i += 1) if (footBox[i] !== expected[i]) mismatch = true
    if (mismatch) report.warning('PACK_FOOTBOX_MISMATCH', 'footBox', `document footBox ${JSON.stringify(footBox)} != manifest footBox ${JSON.stringify(expected)}`)
  }
  if (typeof document.palette === 'string' && document.palette !== pack.palette) {
    report.warning('PACK_PALETTE_ID', 'palette', `document palette "${document.palette}" != manifest palette "${pack.palette}"`)
  }
}

function checkPackAssets(pack, packDir, document, report, options) {
  const summary = {
    dir: toDisplayPath(packDir),
    id: pack.id,
    style: pack.style,
    canvas: pack.canvas,
    tags: Object.keys(pack.tags).length,
    frames: 0,
    files: { checked: 0, missing: 0, decoded: 0, skipped: 0 },
    pixels: { transparentFrames: 0, opaqueFrames: 0, semiFrames: 0, maxColours: 0 },
    naming: { canonical: 0, nonCanonical: 0 },
    palette: { id: pack.palette, spec: false, offPalette: [] },
    license: pack.license,
    ai: pack.ai,
  }
  const paletteColours = loadPaletteColours(pack.palette)
  summary.palette.spec = paletteColours !== null
  const offPalette = new Set()
  const globalColours = new Set()
  let cursor = 0
  let missingReported = 0
  for (const [tag, meta] of Object.entries(pack.tags)) {
    for (let frame = 0; frame < meta.frames; frame += 1) {
      const asset = pack.assets[cursor]
      cursor += 1
      summary.frames += 1
      if (typeof asset !== 'string' || asset.length === 0) {
        report.error('PACK_ASSET_INVALID', `pack.assets[${cursor - 1}]`, 'asset entry must be a non-empty string')
        continue
      }
      const unsafe = /^([A-Za-z]:[\\/]|[/\\])/.test(asset) || asset.split(/[\\/]/).includes('..')
      if (unsafe) {
        report.error('PACK_PATH_ESCAPE', `pack.assets[${cursor - 1}]`, `asset "${asset}" escapes the pack directory`)
        continue
      }
      const expectedName = `${tag}_${String(frame).padStart(2, '0')}.png`
      if (basename(asset) === expectedName) summary.naming.canonical += 1
      else {
        summary.naming.nonCanonical += 1
        const code = options.strict ? 'error' : 'warning'
        report[code === 'error' ? 'error' : 'warning']('PACK_NAMING', `pack.assets[${cursor - 1}]`, `asset "${asset}" does not follow canonical naming "${expectedName}"`)
      }
      const assetPath = join(packDir, asset)
      summary.files.checked += 1
      if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
        summary.files.missing += 1
        if (missingReported < 10) report.error('PACK_FRAME_MISSING', `pack.assets[${cursor - 1}]`, `frame file missing: ${toDisplayPath(assetPath)}`)
        missingReported += 1
        continue
      }
      if (extname(asset).toLowerCase() !== '.png') {
        report.error('PACK_FRAME_FORMAT', `pack.assets[${cursor - 1}]`, `frame "${asset}" is not a .png file`)
        continue
      }
      let png
      try {
        png = readPng(assetPath)
      } catch (error) {
        report.error('PACK_PNG_INVALID', `pack.assets[${cursor - 1}]`, `${asset}: ${error.message}`)
        continue
      }
      if (png.width !== pack.canvas[0] || png.height !== pack.canvas[1]) {
        report.error('PACK_DIM_MISMATCH', `pack.assets[${cursor - 1}]`, `${asset}: ${png.width}x${png.height} != manifest canvas ${pack.canvas[0]}x${pack.canvas[1]}`)
      }
      if (!png.hasAlpha) {
        report.error('PACK_ALPHA_MISSING', `pack.assets[${cursor - 1}]`, `${asset}: no alpha channel / tRNS chunk (sprite would render as an opaque box)`)
        continue
      }
      if (!options.pixels) {
        summary.files.skipped += 1
        continue
      }
      if (png.skipped) {
        summary.files.skipped += 1
        report.warning('PACK_PIXELS_SKIPPED', `pack.assets[${cursor - 1}]`, `${asset}: pixel checks skipped (${png.skipped})`)
        continue
      }
      summary.files.decoded += 1
      const stats = summarisePixels(png)
      if (stats.transparent === 0) {
        report.error('PACK_ALPHA_OPAQUE', `pack.assets[${cursor - 1}]`, `${asset}: frame has no transparent pixels (sprite would render as an opaque box)`)
      }
      if (stats.opaque === 0) {
        report.error('PACK_ALPHA_EMPTY', `pack.assets[${cursor - 1}]`, `${asset}: frame is fully transparent`)
      }
      if (stats.transparent > 0) summary.pixels.transparentFrames += 1
      if (stats.opaque > 0) summary.pixels.opaqueFrames += 1
      if (stats.semi > 0) {
        summary.pixels.semiFrames += 1
        const code = options.strict ? 'error' : 'warning'
        report[code]('PACK_ALPHA_SEMI', `pack.assets[${cursor - 1}]`, `${asset}: ${stats.semi} semi-transparent pixels (FCI art expects alpha 0/255)`)
      }
      if (stats.colours.size > options.maxColors) {
        report.error('PACK_COLORS', `pack.assets[${cursor - 1}]`, `${asset}: ${stats.colours.size} opaque colours > --max-colors ${options.maxColors}`)
      }
      summary.pixels.maxColours = Math.max(summary.pixels.maxColours, stats.colours.size)
      for (const colour of stats.colours) globalColours.add(colour)
      if (paletteColours) {
        for (const colour of stats.colours) {
          if (!paletteColours.has(colour)) offPalette.add(colour)
        }
      }
    }
  }
  if (paletteColours && offPalette.size > 0) {
    summary.palette.offPalette = [...offPalette].slice(0, 8)
    const code = options.strict ? 'error' : 'warning'
    report[code]('PACK_PALETTE', 'palette', `${offPalette.size} colour(s) outside palette "${pack.palette}": ${summary.palette.offPalette.join(', ')}`)
  }
  summary.pixels.uniqueColours = globalColours.size
  return summary
}

function inspectPack(location, rawPackBase, document, report, options) {
  const summary = { status: 'skipped', raw: rawPackBase }
  if (location.kind === 'remote') {
    summary.status = 'remote'
    report.warning('PACK_REMOTE_SKIPPED', 'packBase', `remote pack "${location.raw}" was not fetched (validator is offline; run against a local checkout)`)
    return summary
  }
  if (location.kind === 'error') {
    summary.status = 'error'
    report.error('PACK_UNRESOLVED', 'packBase', location.message)
    return summary
  }
  const candidate = resolve(location.path)
  const exists = existsSync(candidate)
  if (!exists) {
    summary.status = 'missing'
    const hint = location.via === 'public/' ? ' (resolved via public/)' : ''
    report.error('PACK_UNRESOLVED', 'packBase', `pack directory not found: ${toDisplayPath(candidate)}${hint}`)
    return summary
  }
  let packDir = candidate
  let manifestFile
  if (statSync(candidate).isFile()) {
    if (extname(candidate).toLowerCase() !== '.json') {
      summary.status = 'error'
      report.error('PACK_UNRESOLVED', 'packBase', `packBase points at a file that is not a manifest: ${toDisplayPath(candidate)}`)
      return summary
    }
    manifestFile = candidate
    packDir = dirname(candidate)
  } else {
    manifestFile = join(candidate, 'manifest.json')
  }
  report.manifestFile = manifestFile
  summary.status = 'local'
  summary.dir = toDisplayPath(packDir)
  if (!existsSync(manifestFile)) {
    summary.status = 'missing-manifest'
    report.error('PACK_MANIFEST_MISSING', 'packBase', `manifest.json not found in ${toDisplayPath(packDir)}`)
    return summary
  }
  const rawManifest = readJsonFile(manifestFile, report, 'manifest')
  if (rawManifest === undefined) {
    summary.status = 'invalid-manifest'
    return summary
  }
  if (!isRecord(rawManifest)) {
    summary.status = 'invalid-manifest'
    report.error('PACK_MANIFEST_INVALID', 'manifest', 'manifest.json must be a JSON object')
    return summary
  }
  let pack
  try {
    pack = options.runtime.validateCharacterPack(rawManifest)
  } catch (error) {
    summary.status = 'invalid-manifest'
    report.error('PACK_MANIFEST_INVALID', 'manifest', error.message)
    return summary
  }
  summary.manifest = 'ok'
  summary.tags = Object.keys(pack.tags).length
  checkPackGeometry(pack, document, report)
  const assets = checkPackAssets(pack, packDir, document, report, options)
  summary.assets = assets
  return summary
}

// ---------------------------------------------------------------------------
// Per-target validation
// ---------------------------------------------------------------------------

/**
 * Select the JSON Schema for one raw document.
 *
 * Default is auto-routing by `apiVersion` (0.1 -> character-0.1.schema.json,
 * 0.2 -> character-0.2.schema.json). `--schema PATH` still forces a single
 * schema for every target (useful for testing a draft schema).
 */
function pickSchema(raw, context, report) {
  if (context.overrideSchema) return context.overrideSchema
  const version = typeof raw.apiVersion === 'string' ? raw.apiVersion : undefined
  const schema = version ? context.schemas.get(version) : undefined
  if (schema) return schema
  report.error(
    'API_VERSION_UNKNOWN',
    'apiVersion',
    `unsupported character apiVersion ${version === undefined ? '(missing)' : JSON.stringify(version)}; validator routes schemas for [${SCHEMA_API_VERSIONS.join(', ')}]`,
  )
  return null
}


/**
 * Resolve a declared pack-relative file/path and report escapes. Returns the
 * absolute path or null when the path is absolute/escapes the character dir.
 */
function resolveCharacterRelative(rawPath, characterDir, report, code, what) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null
  if (/^([A-Za-z]:[\\/]|\/)/.test(rawPath) || /^[a-z][a-z0-9+.-]*:/i.test(rawPath) || rawPath.includes('\\')) {
    report.error(code, what, `path must be a POSIX-style relative path inside the character directory: ${rawPath}`)
    return null
  }
  const absolute = resolve(characterDir, rawPath)
  const escaped = absolute !== resolve(characterDir) && !absolute.startsWith(`${resolve(characterDir)}${sep}`)
  if (escaped) {
    report.error(code, what, `path must stay inside the character directory: ${rawPath}`)
    return null
  }
  return absolute
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/**
 * FCI 0.3 preview: validate audio[] asset declarations against the filesystem.
 * The declaration itself is schema/runtime validated; here we check that paths
 * stay inside the pack and that declared sha256 digests match when a file is
 * present. Missing files are a warning on purpose: audio playback is not
 * implemented yet, so 0.3 authors may reserve paths before shipping audio.
 */
function checkFci03AudioAssets(document, characterDir, report) {
  const assets = Array.isArray(document.audio) ? document.audio : []
  if (assets.length === 0) return null
  const summary = { declared: assets.length, present: 0, hashed: 0, missing: [], hashMismatch: [], paths: {} }
  for (const [index, asset] of assets.entries()) {
    if (!isRecord(asset) || typeof asset.id !== 'string' || typeof asset.path !== 'string') continue // schema/runtime reported
    const what = `audio[${index}]`
    const absolute = resolveCharacterRelative(asset.path, characterDir, report, 'AUDIO_PATH', `${what}.path`)
    if (absolute === null) continue
    summary.paths[asset.id] = asset.path
    if (!existsSync(absolute)) {
      summary.missing.push(asset.id)
      report.warning('AUDIO_FILE_MISSING', `${what}.path`, `audio file "${asset.path}" is declared but not present; audio playback is not implemented in FCI 0.3 preview, so this stays a warning until it lands`)
      continue
    }
    summary.present += 1
    if (typeof asset.sha256 === 'string' && asset.sha256.length === 64) {
      summary.hashed += 1
      const actual = sha256File(absolute)
      if (actual !== asset.sha256) {
        summary.hashMismatch.push(asset.id)
        report.error('AUDIO_HASH_MISMATCH', `${what}.sha256`, `declared sha256 ${asset.sha256} does not match the file digest ${actual}`)
      }
    }
  }
  report.checks.audio = summary
  return summary
}

/**
 * FCI 0.3 preview: resolve voice.lines, validate the `famling.voice-lines/0.1`
 * library and cross-check every referenced line id (voice.lineIds, responses,
 * behavior rules). Voice synthesis itself is out of scope.
 */
function checkFci03VoiceLines(document, characterDir, behavior, report, runtime) {
  const voice = isRecord(document.voice) ? document.voice : null
  const refs = isRecord(document) ? runtime.collectFci03VoiceLineRefs(document, behavior) : []
  if (!voice) {
    if (refs.length > 0) {
      report.warning('VOICE_PROFILE_MISSING', refs[0].path, `voiceLineId references (${refs.length}) require a voice block/voice.profile; hosts will stay silent`)
    }
    return
  }
  const summary = { profile: voice.profile, tts: voice.tts === true, language: voice.language, linesDeclared: typeof voice.lines === 'string', lineCount: 0, refs: refs.length, missing: [] }
  const audioIds = new Set((Array.isArray(document.audio) ? document.audio : []).map((asset) => (isRecord(asset) && typeof asset.id === 'string' ? asset.id : '')).filter(Boolean))
  if (typeof voice.lines === 'string') {
    const absolute = resolveCharacterRelative(voice.lines, characterDir, report, 'VOICE_LINES_PATH', 'voice.lines')
    if (absolute !== null) {
      if (!existsSync(absolute)) {
        report.error('VOICE_LINES_MISSING', 'voice.lines', `voice line library "${voice.lines}" is declared but not present`)
      } else {
        const libraryRaw = readJsonFile(absolute, report, 'voice.lines')
        if (libraryRaw !== undefined) {
          try {
            const library = runtime.validateVoiceLineLibrary(libraryRaw, { audioIds })
            summary.lineCount = Object.keys(library.lines).length
            for (const ref of refs) {
              if (library.lines[ref.id]) continue
              summary.missing.push(ref.id)
              report.error('VOICE_LINE_UNKNOWN', ref.path, `voice line "${ref.id}" is not declared in ${voice.lines}`)
            }
            report.checks.voiceLines = 'ok'
          } catch (error) {
            report.checks.voiceLines = 'failed'
            report.error('VOICE_LINES_INVALID', 'voice.lines', error.message)
          }
        }
      }
    }
  } else if (refs.length > 0) {
    report.error('VOICE_LINES_MISSING', 'voice.lines', 'voiceLineId references require voice.lines (a famling.voice-lines/0.1 library file) to be declared')
  }
  report.checks.voice = summary
}

/**
 * FCI 0.3 preview: sfx clip references must resolve to declared audio assets.
 * (The document validator already checks document-level responses; this also
 * covers legacy `{clip}` objects in behavior rules.)
 */
function checkFci03SfxRefs(document, behavior, report, runtime) {
  const clips = isRecord(document.sfx) && isRecord(document.sfx.clips) ? document.sfx.clips : null
  const refs = runtime.collectFci03SfxRefs(document, behavior)
  if (clips === null) {
    if (refs.length > 0) report.warning('SFX_CLIPS_MISSING', refs[0].path, `sfx references (${refs.length}) require a document-level sfx.clips map`)
    return
  }
  const declared = Object.keys(clips)
  for (const ref of refs) {
    if (!declared.includes(ref.id)) {
      report.error('SFX_ASSET_UNKNOWN', ref.path, `sfx clip "${ref.id}" is not declared in sfx.clips; declared: [${declared.join(', ')}]`)
    }
  }
}

/**
 * FCI 0.3 preview: emote/idle-tag art coverage + zone event hints. Runs after
 * the pack tag set is known (same fallback rules as behavior states).
 */
function checkFci03TagCoverage(document, behavior, availableTags, fallback, report, options, runtime) {
  const available = new Set(availableTags)
  if (available.size === 0) return // TAG_SOURCE_NONE already reported for behaviour states
  const emotes = runtime.collectFci03Emotes(document, behavior)
  for (const ref of emotes) {
    if (available.has(ref.id)) continue
    const resolved = runtime.resolveFallbackTag(ref.id, available, fallback)
    if (resolved) {
      report.info('EMOTE_FALLBACK', ref.path, `emote "${ref.id}" is not in the art pack; fallback resolves to "${resolved}"`)
      continue
    }
    const code = options.strict ? 'error' : 'warning'
    report[code]('EMOTE_TAG_MISSING', ref.path, `emote "${ref.id}" is not in the art pack and has no usable fallback`)
  }
  const idleTags = runtime.collectFci03IdleTags(document)
  for (const ref of idleTags) {
    if (available.has(ref.id)) continue
    const resolved = runtime.resolveFallbackTag(ref.id, available, fallback)
    if (resolved) {
      report.info('IDLE_TAG_FALLBACK', ref.path, `idle tag "${ref.id}" is not in the art pack; fallback resolves to "${resolved}"`)
      continue
    }
    const code = options.strict ? 'error' : 'warning'
    report[code]('IDLE_TAG_MISSING', ref.path, `idle variant tag "${ref.id}" is not in the art pack and has no usable fallback`)
  }
  if (Array.isArray(document.zones) && isRecord(behavior)) {
    const events = new Set()
    for (const rule of Array.isArray(behavior.rules) ? behavior.rules : []) {
      if (!isRecord(rule)) continue
      for (const on of Array.isArray(rule.on) ? rule.on : [rule.on]) if (typeof on === 'string') events.add(on)
    }
    for (const slot of Object.keys(isRecord(behavior.slots) ? behavior.slots : {})) events.add(slot)
    for (const [index, zone] of document.zones.entries()) {
      if (isRecord(zone) && typeof zone.on === 'string' && !events.has(zone.on)) {
        report.info('ZONE_EVENT_UNHANDLED', `zones[${index}].on`, `zone event "${zone.on}" has no rule/slot in the behavior profile; a host can still dispatch it (declaration only)`)
      }
    }
  }
  report.checks.fci03Tags = { emotes: emotes.length, idleTags: idleTags.length }
}

function validateTarget(dirArg, context, duplicateIds) {
  const characterDir = resolve(dirArg)
  const report = new TargetReport(characterDir)
  const options = context.options
  const runtime = context.runtime
  if (!existsSync(characterDir) || !statSync(characterDir).isDirectory()) {
    report.error('IO_ERROR', '/', `character directory not found: ${toDisplayPath(characterDir)}`)
    return report
  }
  const characterFile = join(characterDir, 'character.json')
  report.characterFile = characterFile
  if (!existsSync(characterFile)) {
    report.error('IO_ERROR', 'character', `character.json not found in ${toDisplayPath(characterDir)}`)
    return report
  }
  const raw = readJsonFile(characterFile, report, 'character')
  if (raw === undefined) return report
  if (!isRecord(raw)) {
    report.error('SCHEMA_INVALID', '/', 'character.json must be a JSON object')
    return report
  }

  // 1) JSON Schema, auto-routed by apiVersion (0.1 -> 0.1 schema, 0.2 -> 0.2 schema).
  if (typeof raw.id === 'string') report.id = raw.id
  if (typeof raw.apiVersion === 'string') report.apiVersion = raw.apiVersion
  if (typeof raw.version === 'string') report.version = raw.version
  if (typeof raw.type === 'string') report.type = raw.type
  const schema = pickSchema(raw, context, report)
  let schemaOk = false
  if (schema) {
    report.schemaFile = schema.path
    schemaOk = schema.validate(raw)
    report.checks.schema = schemaOk ? 'ok' : 'failed'
    if (!schemaOk) {
      for (const error of schema.validate.errors ?? []) {
        const path = error.instancePath ? error.instancePath.replace(/^\//, '').replace(/\//g, '.') : '/'
        report.error('SCHEMA_INVALID', path, `${error.message}${error.params && Object.keys(error.params).length > 0 ? ` (${JSON.stringify(error.params)})` : ''}`)
      }
    }
  } else {
    report.checks.schema = 'failed'
  }

  // 2) Data-only guard (schema covers most; keep an explicit recursive scan for clear messages).
  const forbidden = findForbiddenKey(raw)
  if (forbidden) {
    report.error('DATA_ONLY', forbidden, 'character packs are data-only: scripts/permissions/eval/code/execute keys are forbidden at any depth')
  }

  // 3) Behaviour profile (inline or behaviorFile). Loaded before the document
  //    runtime validation so the FCI 0.3 preview validator can cross-check
  //    state/mood/sfx references. 0.1/0.2 keep the frozen behavior validator.
  let behavior
  if (isRecord(raw.behavior)) {
    behavior = raw.behavior
  } else if (typeof raw.behaviorFile === 'string' && raw.behaviorFile.length > 0) {
    const behaviorPath = resolve(characterDir, raw.behaviorFile)
    const escaped = behaviorPath !== resolve(characterDir) && !behaviorPath.startsWith(`${resolve(characterDir)}${sep}`)
    if (/^([A-Za-z]:[\\/]|\/)/.test(raw.behaviorFile) || escaped) {
      report.error('BEHAVIORFILE_ESCAPE', 'behaviorFile', `behaviorFile must stay inside the character directory: ${raw.behaviorFile}`)
    } else if (!existsSync(behaviorPath)) {
      report.error('IO_ERROR', 'behaviorFile', `behavior file not found: ${toDisplayPath(behaviorPath)}`)
    } else {
      report.behaviorFile = behaviorPath
      behavior = readJsonFile(behaviorPath, report, 'behavior')
    }
  } else {
    report.error('BEHAVIOR_MISSING', 'behavior', 'character document needs behavior or behaviorFile')
  }
  if (isRecord(behavior)) {
    report.checks.behavior = checkBehaviourSemantics(behavior, report)
    try {
      if (report.apiVersion === '0.3') runtime.validateBehaviorProfileV03(behavior)
      else runtime.validateBehaviorProfile(behavior)
      report.checks.behavior.runtime = 'ok'
    } catch (error) {
      report.checks.behavior.runtime = 'failed'
      report.error('BEHAVIOR_INVALID', 'behavior', error.message)
    }
  }
  // 0.3-only behavior fields on an older document (inline or behaviorFile).
  if (isRecord(behavior) && (report.apiVersion === '0.1' || report.apiVersion === '0.2')) {
    const previewFields = runtime.findFci03BehaviorFields(behavior)
    if (previewFields.length > 0) {
      report.error(
        'FCI03_FIELD_REQUIRES_0_3',
        'behavior',
        `behavior declares FCI 0.3 field(s) [${previewFields.join(', ')}] but the document apiVersion is "${report.apiVersion}"; bump apiVersion to "0.3"`,
      )
    }
  }
  const validBehavior = isRecord(behavior) && report.checks.behavior.runtime === 'ok' ? behavior : undefined

  // 4) Renderer selection (FCI 0.2/0.3): schema checks the shape, the host
  //    registration table is semantic and lives here.
  const declaredRender = isRecord(raw.render) ? raw.render : null
  const declaredFormat = declaredRender && isString(declaredRender.format) ? declaredRender.format : null
  if (declaredRender && declaredFormat && !context.renderFormats.includes(declaredFormat)) {
    report.error(
      'RENDER_FORMAT_UNKNOWN',
      'render.format',
      `render.format "${declaredFormat}" is not a registered host render format; registered formats: [${context.renderFormats.join(', ')}]`,
    )
  }
  if (report.apiVersion !== '0.1' && declaredFormat === null) {
    const code = options.strict ? 'error' : 'warning'
    report[code](
      'RENDER_MISSING',
      'render',
      `character apiVersion ${report.apiVersion === undefined ? '(missing)' : report.apiVersion} should declare render.format (built-in: pixel-hero | pixel-micro | hd-chibi); the runtime would infer "pixel-hero" and warn. Add render:{format:"pixel-hero"} for a new pack.`,
    )
  }

  // 5) Runtime document validation (only when the document is structurally valid).
  //    0.3 documents go through the preview layer with the behavior profile so
  //    state/mood/sfx cross-checks are enforced; 0.1/0.2 are unchanged.
  let validatedDocument
  if (schemaOk && !forbidden) {
    const validationWarnings = []
    try {
      validatedDocument =
        report.apiVersion === '0.3'
          ? runtime.validateCharacterDocumentV03(raw, { warnings: validationWarnings, renderFormats: context.renderFormats, behavior: validBehavior })
          : runtime.validateCharacterDocument(raw, { warnings: validationWarnings, renderFormats: context.renderFormats })
      report.checks.runtime = 'ok'
      for (const warning of validationWarnings) {
        // RENDER_INFERRED is already surfaced as RENDER_MISSING above (warning/error per --strict).
        if (warning.code === 'RENDER_INFERRED') continue
        report.warning(warning.code, warning.path, warning.message)
      }
    } catch (error) {
      report.checks.runtime = 'failed'
      // FCI 0.3 preview blocks throw FciV03Error with a stable code + path;
      // core 0.1/0.2 errors keep the historical RUNTIME_INVALID code.
      const code = error && typeof error.code === 'string' ? error.code : 'RUNTIME_INVALID'
      const path = error && typeof error.path === 'string' ? error.path : '/'
      report.error(code, path, error.message)
    }
  } else {
    report.checks.runtime = 'skipped'
  }
  // Effective renderer format: declared wins, otherwise the runtime default/inference.
  let effectiveFormat = declaredFormat
  if (effectiveFormat === null && validatedDocument) {
    try {
      effectiveFormat = runtime.resolveRenderFormat(validatedDocument)
    } catch {
      effectiveFormat = null
    }
  }
  if (effectiveFormat) {
    report.checks.render = {
      format: effectiveFormat,
      source: declaredFormat ? 'declared' : report.apiVersion === '0.1' ? 'default' : 'inferred',
      registered: context.renderFormats.includes(effectiveFormat),
      params: declaredRender ? isRecord(declaredRender.params) : false,
    }
  }

  // 5b) FCI 0.3 preview-only checks: audio asset declarations (path/sha256,
  //     file presence as warning), voice line library + line-id references,
  //     sfx clip references. No audio is played, no TTS/scheduling runs.
  if (report.apiVersion === '0.3') {
    const document = validatedDocument && isRecord(validatedDocument) ? validatedDocument : raw
    const audioSummary = checkFci03AudioAssets(document, characterDir, report)
    checkFci03VoiceLines(document, characterDir, behavior, report, runtime)
    checkFci03SfxRefs(document, behavior, report, runtime)
    const idle = isRecord(document.idle) ? document.idle : null
    const moods = isRecord(document.moods) && isRecord(document.moods.defs) ? document.moods.defs : null
    const schedule = isRecord(document.schedule) && Array.isArray(document.schedule.segments) ? document.schedule.segments : []
    const timeOfDay = isRecord(document.timeOfDay) && Array.isArray(document.timeOfDay.periods) ? document.timeOfDay.periods : []
    report.checks.fci03 = {
      preview: true,
      audio: audioSummary ? { declared: audioSummary.declared, present: audioSummary.present, missing: audioSummary.missing.length } : { declared: 0, present: 0, missing: 0 },
      zones: Array.isArray(document.zones) ? document.zones.length : 0,
      idleVariants: idle && Array.isArray(idle.variants) ? idle.variants.length : 0,
      responses: Array.isArray(document.responses) ? document.responses.length : 0,
      moods: moods ? Object.keys(moods).length : 0,
      scheduleSegments: schedule.length,
      timeOfDayPeriods: timeOfDay.length,
    }
  }

  // 5) Tags, pack and tag coverage.
  const documentTags = isRecord(raw.tags) ? raw.tags : {}
  const location = typeof raw.packBase === 'string' ? resolvePackLocation(raw.packBase, characterDir) : null
  const packSummary = location
    ? inspectPack(location, raw.packBase, raw, report, { ...options, runtime })
    : null
  if (packSummary) report.checks.pack = packSummary
  let manifestTags = {}
  if (packSummary && report.manifestFile) {
    try {
      const manifestRaw = JSON.parse(readFileSync(report.manifestFile, 'utf8'))
      if (isRecord(manifestRaw) && isRecord(manifestRaw.tags)) manifestTags = manifestRaw.tags
    } catch {
      // manifest already reported by inspectPack
    }
  }
  const tagSource = new Set([...Object.keys(manifestTags), ...Object.keys(documentTags)])
  const fallback = isRecord(raw.fallback) ? raw.fallback : (isRecord(behavior) && isRecord(behavior.fallback) ? behavior.fallback : {})
  const fallbackSummary = checkFallbackGraph(fallback, report)
  report.checks.fallback = fallbackSummary

  if (isRecord(behavior)) {
    const required = runtime.requiredTags(behavior)
    const available = new Set(tagSource)
    const missing = []
    for (const tag of required) {
      if (available.has(tag)) continue
      const resolved = runtime.resolveFallbackTag(tag, available, fallback)
      if (resolved) {
        report.info('TAG_FALLBACK', 'behavior.states', `tag "${tag}" is not in the art pack; fallback resolves to "${resolved}"`)
      } else {
        missing.push(tag)
      }
    }
    report.checks.tags = { required: required.length, source: tagSource.size > 0 ? (Object.keys(manifestTags).length > 0 ? 'pack' : 'inline') : 'none', missing, available: tagSource.size }
    if (tagSource.size > 0) {
      for (const tag of missing) {
        const code = options.strict ? 'error' : 'warning'
        report[code]('TAG_MISSING', 'behavior.states', `required animation tag "${tag}" is missing from the art pack and has no usable fallback`)
      }
    } else if (required.length > 0) {
      report.warning('TAG_SOURCE_NONE', 'behavior.states', 'no tags/packBase declared: tag coverage not checked (behaviour-only character)')
    }
  }

  // 5c) FCI 0.3 preview: emote/idle-tag art coverage and zone event hints.
  if (report.apiVersion === '0.3') {
    checkFci03TagCoverage(raw, behavior, tagSource, fallback, report, options, runtime)
  }

  // 6) Release fields under --strict.
  const licenseOk = typeof raw.license === 'string' && raw.license.length > 0
  const aiOk = isRecord(raw.ai) && ['none', 'concept', 'final'].includes(raw.ai.status)
  report.checks.license = licenseOk
  report.checks.ai = isRecord(raw.ai) ? raw.ai.status : undefined
  if (!licenseOk) {
    if (options.strict) report.error('LICENSE_MISSING', 'license', 'license is required in --strict mode (SPDX id or explicit placeholder note)')
    else report.warning('LICENSE_MISSING', 'license', 'license is missing; required for release (--strict)')
  }
  if (!aiOk) {
    if (options.strict) report.error('AI_MISSING', 'ai', 'ai.status is required in --strict mode (none|concept|final)')
    else report.warning('AI_MISSING', 'ai', 'ai.status is missing; required for release (--strict)')
  }

  // 7) Cross-target duplicate ids.
  if (typeof raw.id === 'string' && raw.id.length > 0) {
    if (duplicateIds.has(raw.id)) {
      report.error('DUPLICATE_ID', 'id', `character id "${raw.id}" is already used by ${toDisplayPath(duplicateIds.get(raw.id))}`)
    } else {
      duplicateIds.set(raw.id, characterDir)
    }
  }

  return report
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(argv) {
  const options = parseArgs(argv)
  if (options.usageError) {
    process.stderr.write(`error: ${options.usageError}\n\n${USAGE}`)
    return 2
  }
  if (options.help) {
    process.stdout.write(USAGE)
    return 0
  }
  if (options.version) {
    process.stdout.write(`${VALIDATOR_VERSION}\n`)
    return 0
  }
  if (options.targets.length === 0) {
    process.stderr.write(`error: at least one character directory is required\n\n${USAGE}`)
    return 2
  }

  // Schema setup. Default: one schema per supported apiVersion, auto-routed per
  // target. `--schema PATH` still forces a single schema for every target.
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const compileSchema = (schemaPath) => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
    return { path: schemaPath, validate: ajv.compile(schema) }
  }
  const schemas = new Map()
  let overrideSchema = null
  try {
    if (options.schemaPath) {
      overrideSchema = compileSchema(options.schemaPath)
    } else {
      for (const [version, schemaPath] of Object.entries(SCHEMA_PATH_BY_API_VERSION)) {
        schemas.set(version, compileSchema(schemaPath))
      }
    }
  } catch (error) {
    const targetSchema = options.schemaPath ?? SCHEMA_DIR
    process.stderr.write(`error: cannot load JSON Schema ${toDisplayPath(targetSchema)}: ${error.message}\n`)
    return 2
  }

  // Runtime modules (TypeScript) — requires `node --import tsx`.
  let runtime
  try {
    const character = await import('../src/pet/character/index.ts')
    const hero = await import('../src/pet/hero.ts')
    runtime = {
      validateCharacterDocument: character.validateCharacterDocument,
      validateBehaviorProfile: character.validateBehaviorProfile,
      resolveRenderFormat: character.resolveRenderFormat,
      renderFormats: () => [...character.KNOWN_RENDER_FORMATS],
      requiredTags: character.requiredTags,
      resolveFallbackTag: character.resolveFallbackTag,
      validateCharacterPack: hero.validateCharacterPack,
      // FCI 0.3 preview layer (optional extensions; shipping runtime stays 0.2).
      characterApiVersion: character.CHARACTER_API_VERSION,
      characterApiVersions: [...character.CHARACTER_API_VERSIONS],
      validateCharacterDocumentV03: character.validateCharacterDocumentV03,
      validateBehaviorProfileV03: character.validateBehaviorProfileV03,
      validateVoiceLineLibrary: character.validateVoiceLineLibrary,
      collectFci03VoiceLineRefs: character.collectFci03VoiceLineRefs,
      collectFci03Emotes: character.collectFci03Emotes,
      collectFci03SfxRefs: character.collectFci03SfxRefs,
      collectFci03IdleTags: character.collectFci03IdleTags,
      findFci03BehaviorFields: character.findFci03BehaviorFields,
    }
  } catch (error) {
    process.stderr.write(
      'error: cannot load the project TypeScript runtime.\n' +
        'Run the validator with the TS loader, e.g.:\n' +
        '  node --import tsx scripts/validate-character.mjs <character-dir> [--strict] [--json]\n' +
        `underlying error: ${error && error.message ? error.message : String(error)}\n`,
    )
    return 2
  }

  // Registered render formats = runtime built-ins + optional --format additions.
  const renderFormats = [...new Set([...runtime.renderFormats(), ...options.formats])]

  // Every target directory must exist before validation (usage-class failure).
  for (const target of options.targets) {
    const absolute = resolve(target)
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      const message = `character directory not found: ${toDisplayPath(absolute)}`
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ ok: false, fatal: { code: 'TARGET_MISSING', message } }, null, 2)}\n`)
      } else {
        process.stderr.write(`error: ${message}\n`)
      }
      return 2
    }
  }

  const duplicateIds = new Map()
  const context = { options: { ...options }, schemas, overrideSchema, renderFormats, runtime }

  const reports = options.targets.map((target) => validateTarget(target, context, duplicateIds))

  const summary = {
    targets: reports.length,
    errors: reports.reduce((sum, report) => sum + report.errors.length, 0),
    warnings: reports.reduce((sum, report) => sum + report.warnings.length, 0),
  }
  const ok = summary.errors === 0

  if (options.json) {
    const payload = {
      ok,
      strict: options.strict,
      validator: VALIDATOR_VERSION,
      // Historical fields: the *shipping runtime* contract this validator
      // targets (frozen at 0.2). 0.3 is validated through the preview layer;
      // see schemaApiVersions/previewApiVersions for authoring coverage.
      apiVersion: runtime.characterApiVersion,
      supportedApiVersions: runtime.characterApiVersions.length > 0 ? runtime.characterApiVersions : RUNTIME_API_VERSIONS,
      schemaApiVersions: SCHEMA_API_VERSIONS,
      previewApiVersions: PREVIEW_API_VERSIONS,
      schema: options.schemaPath ? toDisplayPath(options.schemaPath) : 'auto (content/schema/character-<apiVersion>.schema.json)',
      renderFormats,
      summary,
      targets: reports.map((report) => report.toJSON()),
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  } else {
    for (const report of reports) {
      const status = report.ok ? 'ok  ' : 'FAIL'
      const id = report.id ? ` ${report.id}@${report.version ?? '?'}` : ''
      const version = report.apiVersion ? ` (apiVersion ${report.apiVersion})` : ''
      process.stdout.write(`${status} ${toDisplayPath(report.dir)}${id}${version}\n`)
      for (const entry of report.errors) process.stdout.write(`  ERROR ${entry.code} ${entry.path}: ${entry.message}\n`)
      for (const entry of report.warnings) process.stdout.write(`  WARN  ${entry.code} ${entry.path}: ${entry.message}\n`)
    }
    process.stdout.write(`summary: ${summary.targets} target(s), ${summary.errors} error(s), ${summary.warnings} warning(s)${options.strict ? ' (strict)' : ''}\n`)
  }
  return ok ? 0 : 1
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`fatal: ${error && error.stack ? error.stack : String(error)}\n`)
    process.exitCode = 2
  })
