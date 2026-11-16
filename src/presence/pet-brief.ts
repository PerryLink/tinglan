/**
 * Pet Brief consumer — validates the Advisers → Pearl read-only brief
 * (contract v0.1, `docs/contracts/pet-brief/`), enforces freshness, redaction
 * and the claims guard, then maps it to the existing presence directive types.
 *
 * Pure functions only: no file I/O, no network, no model call, no writes back
 * to Advisers. Times without an explicit timezone are rejected; "today" is
 * evaluated in Asia/Shanghai (the producer's calendar convention).
 *
 * Privacy:
 * - the whole brief is rejected if it contains reasoning/prompt/secret/emotional
 *   fields or unknown fields;
 * - `suggestedLines` are never fed to the projector: directives only ever carry
 *   fixed numeric templates owned by the renderer;
 * - items below confidence 0.7 are ignored by the projection.
 */
import { PresenceProjector } from './projector.ts'
import type { AdvisersPresenceEvent, PetDirective } from './types.ts'

export const PET_BRIEF_SCHEMA_VERSION = 1
export const PET_BRIEF_SOURCE = 'advisers'
export const PET_BRIEF_TTL_MS = 5 * 60 * 1000
export const PET_BRIEF_MAX_ITEMS = 10
export const PET_BRIEF_MIN_CONFIDENCE = 0.7
export const PET_BRIEF_MAX_SUGGESTED_LINES = 3
export const PET_BRIEF_MAX_LINE_LENGTH = 40
export const PET_BRIEF_TIME_ZONE = 'Asia/Shanghai'
export const PET_BRIEF_MOODS = ['calm', 'focused', 'concerned', 'pleased'] as const
export const PET_BRIEF_FALLBACK_LINE = '这个我没记。'

export type PetBriefMood = (typeof PET_BRIEF_MOODS)[number]
export type PetBriefRiskLevel = 'low' | 'medium' | 'high'
export type PetBriefTodayStatus = 'open' | 'doing' | 'done'

export interface PetBriefTodayItem {
  id: string
  title: string
  status: PetBriefTodayStatus
}

export interface PetBriefCommitment {
  id: string
  matter: string
  who: string
  what: string
  due: string
  risk: PetBriefRiskLevel
  confidence: number
}

export interface PetBriefRisk {
  id: string
  level: PetBriefRiskLevel
  summary: string
  evidence: string
  confidence: number
}

export interface PetBriefFact {
  id: string
  subject: string
  predicate: string
  value: string
  confidence: number
}

export interface PetBrief {
  schemaVersion: number
  generatedAt: string
  expiresAt: string
  source: string
  counts: { today: number; commitments: number; risks: number; facts: number }
  today: PetBriefTodayItem[]
  commitments: PetBriefCommitment[]
  risks: PetBriefRisk[]
  facts: PetBriefFact[]
  mood: PetBriefMood
  suggestedLines: string[]
  redactions: string[]
}

export interface PetBriefIssue {
  code: string
  path: string
  message: string
}

export interface PetBriefOmitted {
  section: 'commitments' | 'risks' | 'facts'
  id: string
  confidence: number
}

export type PetBriefValidationResult =
  | { status: 'accept'; brief: PetBrief; omitted: PetBriefOmitted[] }
  | { status: 'reject'; errors: PetBriefIssue[] }
  | { status: 'skip'; reason: 'user_opt_out' }

export interface ValidatePetBriefOptions {
  /** Injectable clock; defaults to Date.now(). */
  now?: number | string | Date
  /** False when the user disabled the brief: do not read/use it at all. */
  enabled?: boolean
  /** Default true. False validates schema only, ignoring the TTL. */
  requireFresh?: boolean
}

const ROOT_KEYS = new Set([
  'schemaVersion', 'generatedAt', 'expiresAt', 'source', 'counts',
  'today', 'commitments', 'risks', 'facts', 'mood', 'suggestedLines', 'redactions',
])

type Section = 'today' | 'commitments' | 'risks' | 'facts'

const SECTION_KEYS: Record<Section, Set<string>> = {
  today: new Set(['id', 'title', 'status']),
  commitments: new Set(['id', 'matter', 'who', 'what', 'due', 'risk', 'confidence']),
  risks: new Set(['id', 'level', 'summary', 'evidence', 'confidence']),
  facts: new Set(['id', 'subject', 'predicate', 'value', 'confidence']),
}

const COUNT_KEYS = new Set(['today', 'commitments', 'risks', 'facts'])
const RISK_LEVELS = new Set(['low', 'medium', 'high'])
const TODAY_STATUS = new Set(['open', 'doing', 'done'])
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

/** Contract §2.2, matched after lowercasing and removing `_`/`-`/spaces. */
const FORBIDDEN_KEYS = [
  'reasoning', 'cot', 'chainofthought', 'rawprompt', 'systemprompt',
  'clientsecret', 'apikey', 'token', 'password',
  'affection', 'love', 'missedyou', 'streak', 'guilt',
]

const COERCIVE = /必须|应该|你答应|你欠|欠我|内疚|不理你|再不做|早就该|说好了|你忘了|才对得起/
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: PET_BRIEF_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toMillis(value: number | string | Date | undefined): number {
  if (value === undefined) return Date.now()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, '')
}

function issue(code: string, path: string, message: string): PetBriefIssue {
  return { code, path, message }
}

function checkForbiddenKeys(value: unknown, path: string, errors: PetBriefIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkForbiddenKeys(entry, `${path}[${index}]`, errors))
    return
  }
  if (!isRecord(value)) return
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedKey(key)
    if (FORBIDDEN_KEYS.some((forbidden) => normalized === forbidden || normalized.endsWith(forbidden))) {
      errors.push(issue('FORBIDDEN_FIELD', `${path}.${key}`, `forbidden contract field: ${key}`))
    }
    checkForbiddenKeys(entry, `${path}.${key}`, errors)
  }
}

function checkUnknownKeys(value: unknown, allowed: Set<string>, path: string, errors: PetBriefIssue[]): void {
  if (!isRecord(value)) return
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(issue('UNKNOWN_FIELD', `${path}.${key}`, `field is not in contract v0.1: ${key}`))
  }
}

function checkString(
  value: unknown,
  path: string,
  errors: PetBriefIssue[],
  max: number,
  field: string,
): value is string {
  if (typeof value !== 'string') {
    errors.push(issue('TYPE', path, `${field} must be a string`))
    return false
  }
  const length = codePointLength(value)
  if (length < 1 || length > max) {
    errors.push(issue('LENGTH', path, `${field} length ${length} outside 1..${max}`))
    return false
  }
  return true
}

function checkConfidence(value: unknown, path: string, errors: PetBriefIssue[]): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(issue('CONFIDENCE', path, 'confidence must be a number in 0..1'))
    return false
  }
  return true
}

function parseIsoWithZone(value: unknown, path: string, errors: PetBriefIssue[]): number | null {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value)) {
    errors.push(issue('TIME_FORMAT', path, 'timestamp must be ISO 8601 with a timezone'))
    return null
  }
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) {
    errors.push(issue('TIME_FORMAT', path, 'timestamp is not a valid instant'))
    return null
  }
  return ms
}

function validateArrays(value: Record<string, unknown>, errors: PetBriefIssue[]): void {
  for (const section of ['today', 'commitments', 'risks', 'facts'] as const) {
    const items = value[section]
    if (!Array.isArray(items)) {
      errors.push(issue('TYPE', `$.${section}`, `${section} must be an array`))
      continue
    }
    if (items.length > PET_BRIEF_MAX_ITEMS) {
      errors.push(issue('MAX_ITEMS', `$.${section}`, `${section} exceeds ${PET_BRIEF_MAX_ITEMS} items`))
    }
    const seen = new Set<string>()
    items.forEach((item, index) => {
      const path = `$.${section}[${index}]`
      if (!isRecord(item)) {
        errors.push(issue('TYPE', path, 'item must be an object'))
        return
      }
      checkUnknownKeys(item, SECTION_KEYS[section], path, errors)
      if (!checkString(item.id, `${path}.id`, errors, 64, 'id')) return
      if (seen.has(item.id)) errors.push(issue('DUP_ID', `${path}.id`, `duplicate id within ${section}: ${item.id}`))
      seen.add(item.id)
      if (section === 'today') {
        checkString(item.title, `${path}.title`, errors, 80, 'title')
        if (!TODAY_STATUS.has(String(item.status))) errors.push(issue('ENUM', `${path}.status`, 'status must be open|doing|done'))
      } else if (section === 'commitments') {
        checkString(item.matter, `${path}.matter`, errors, 64, 'matter')
        checkString(item.who, `${path}.who`, errors, 40, 'who')
        checkString(item.what, `${path}.what`, errors, 80, 'what')
        checkString(item.due, `${path}.due`, errors, 32, 'due')
        if (!RISK_LEVELS.has(String(item.risk))) errors.push(issue('ENUM', `${path}.risk`, 'risk must be low|medium|high'))
        checkConfidence(item.confidence, `${path}.confidence`, errors)
      } else if (section === 'risks') {
        if (!RISK_LEVELS.has(String(item.level))) errors.push(issue('ENUM', `${path}.level`, 'level must be low|medium|high'))
        checkString(item.summary, `${path}.summary`, errors, 80, 'summary')
        checkString(item.evidence, `${path}.evidence`, errors, 64, 'evidence')
        checkConfidence(item.confidence, `${path}.confidence`, errors)
      } else {
        checkString(item.subject, `${path}.subject`, errors, 40, 'subject')
        checkString(item.predicate, `${path}.predicate`, errors, 40, 'predicate')
        checkString(item.value, `${path}.value`, errors, 80, 'value')
        checkConfidence(item.confidence, `${path}.confidence`, errors)
      }
    })
  }
}

function checkCounts(value: Record<string, unknown>, errors: PetBriefIssue[]): void {
  const counts = value.counts
  if (!isRecord(counts)) {
    errors.push(issue('TYPE', '$.counts', 'counts must be an object'))
    return
  }
  checkUnknownKeys(counts, COUNT_KEYS, '$.counts', errors)
  for (const section of ['today', 'commitments', 'risks', 'facts'] as const) {
    const count = counts[section]
    const items = value[section]
    if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > PET_BRIEF_MAX_ITEMS) {
      errors.push(issue('COUNTS', `$.counts.${section}`, `${section} count must be an integer in 0..${PET_BRIEF_MAX_ITEMS}`))
    } else if (Array.isArray(items) && count !== items.length) {
      errors.push(issue('COUNTS_MISMATCH', `$.counts.${section}`, `${section} count does not match the array length`))
    }
  }
}

function checkSuggestedLines(value: Record<string, unknown>, errors: PetBriefIssue[]): void {
  if (!Array.isArray(value.suggestedLines)) {
    errors.push(issue('TYPE', '$.suggestedLines', 'suggestedLines must be an array'))
    return
  }
  if (value.suggestedLines.length > PET_BRIEF_MAX_SUGGESTED_LINES) {
    errors.push(issue('MAX_LINES', '$.suggestedLines', `suggestedLines exceeds ${PET_BRIEF_MAX_SUGGESTED_LINES}`))
  }
  value.suggestedLines.forEach((line, index) => {
    if (typeof line !== 'string' || codePointLength(line) < 1 || codePointLength(line) > PET_BRIEF_MAX_LINE_LENGTH) {
      errors.push(issue('LINE', `$.suggestedLines[${index}]`, `suggested line must be a string of 1..${PET_BRIEF_MAX_LINE_LENGTH} chars`))
    }
  })
}

function checkRedactions(value: Record<string, unknown>, errors: PetBriefIssue[]): void {
  if (!Array.isArray(value.redactions)) {
    errors.push(issue('TYPE', '$.redactions', 'redactions must be an array'))
    return
  }
  if (value.redactions.length > 10) errors.push(issue('MAX_ITEMS', '$.redactions', 'redactions exceeds 10 items'))
  value.redactions.forEach((note, index) => {
    checkString(note, `$.redactions[${index}]`, errors, 80, 'redaction note')
  })
}

function omittedItems(brief: PetBrief): PetBriefOmitted[] {
  const omitted: PetBriefOmitted[] = []
  for (const section of ['commitments', 'risks', 'facts'] as const) {
    for (const item of brief[section]) {
      if (item.confidence < PET_BRIEF_MIN_CONFIDENCE) {
        omitted.push({ section, id: item.id, confidence: item.confidence })
      }
    }
  }
  return omitted
}

/**
 * Validate a parsed brief (or raw JSON text) against contract v0.1.
 * Returns accept / reject / skip so the caller can render idle on any failure.
 */
export function validatePetBrief(input: unknown, options: ValidatePetBriefOptions = {}): PetBriefValidationResult {
  if (options.enabled === false) return { status: 'skip', reason: 'user_opt_out' }
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return { status: 'reject', errors: [issue('MALFORMED_JSON', '$', 'brief is not valid JSON')] }
    }
  }
  if (!isRecord(value)) return { status: 'reject', errors: [issue('TYPE', '$', 'brief must be a JSON object')] }

  const errors: PetBriefIssue[] = []
  checkForbiddenKeys(value, '$', errors)
  checkUnknownKeys(value, ROOT_KEYS, '$', errors)
  if (typeof value.schemaVersion !== 'number' || value.schemaVersion !== PET_BRIEF_SCHEMA_VERSION) {
    errors.push(issue('SCHEMA_VERSION', '$.schemaVersion', `unsupported schemaVersion (expected ${PET_BRIEF_SCHEMA_VERSION})`))
  }
  if (value.source !== PET_BRIEF_SOURCE) errors.push(issue('SOURCE', '$.source', 'source must be "advisers"'))

  const generatedMs = parseIsoWithZone(value.generatedAt, '$.generatedAt', errors)
  const expiresMs = parseIsoWithZone(value.expiresAt, '$.expiresAt', errors)
  if (generatedMs !== null && expiresMs !== null) {
    if (expiresMs <= generatedMs) {
      errors.push(issue('TIME_ORDER', '$.expiresAt', 'expiresAt must be after generatedAt'))
    } else if (options.requireFresh !== false && toMillis(options.now) >= expiresMs) {
      errors.push(issue('EXPIRED', '$.expiresAt', 'brief is expired'))
    }
  }

  validateArrays(value, errors)
  checkCounts(value, errors)
  if (!PET_BRIEF_MOODS.includes(value.mood as PetBriefMood)) {
    errors.push(issue('ENUM', '$.mood', 'mood must be calm|focused|concerned|pleased'))
  }
  checkSuggestedLines(value, errors)
  checkRedactions(value, errors)

  if (errors.length > 0) return { status: 'reject', errors }
  const brief = value as unknown as PetBrief
  return { status: 'accept', brief, omitted: omittedItems(brief) }
}

/** True when the brief must be discarded: expired, malformed time, or TTL boundary. */
export function isExpired(brief: Pick<PetBrief, 'expiresAt'> | string, now: number | string | Date = Date.now()): boolean {
  const expiresAt = typeof brief === 'string' ? brief : brief?.expiresAt
  const expiresMs = Date.parse(String(expiresAt ?? ''))
  if (!Number.isFinite(expiresMs)) return true
  return toMillis(now) >= expiresMs
}

function usableItems(brief: PetBrief): {
  today: PetBriefTodayItem[]
  commitments: PetBriefCommitment[]
  risks: PetBriefRisk[]
  facts: PetBriefFact[]
} {
  return {
    today: Array.isArray(brief.today) ? brief.today : [],
    commitments: (Array.isArray(brief.commitments) ? brief.commitments : []).filter(
      (item) => item.confidence >= PET_BRIEF_MIN_CONFIDENCE,
    ),
    risks: (Array.isArray(brief.risks) ? brief.risks : []).filter(
      (item) => item.confidence >= PET_BRIEF_MIN_CONFIDENCE,
    ),
    facts: (Array.isArray(brief.facts) ? brief.facts : []).filter(
      (item) => item.confidence >= PET_BRIEF_MIN_CONFIDENCE,
    ),
  }
}

function localDayOf(nowMs: number): string {
  return DAY_FORMAT.format(new Date(nowMs))
}

export interface PresenceProjectionOptions {
  now?: number | string | Date
  /** Shared projector: keeps dedupe/budget across 60s polling. */
  projector?: PresenceProjector
}

/**
 * Map a validated brief to the existing presence event type. Numeric-only:
 * no names, titles or suggested lines cross into the projector.
 *
 * - high-risk item due today → `commitment.due` (P0 remind)
 * - other high risks → `brief.ready` (P1 one short line)
 * - mood `concerned` without risks → `brief.ready` (P1)
 * - `focused`/`calm`/`pleased` → `brief.ready` P2 (pose/pulse, never speaks)
 * - empty or expired brief → null (idle; no invented memory)
 */
export function toPresenceEvent(
  brief: PetBrief,
  options: Pick<PresenceProjectionOptions, 'now'> = {},
): AdvisersPresenceEvent | null {
  const now = toMillis(options.now)
  if (isExpired(brief, now)) return null
  const usable = usableItems(brief)
  const openCount = usable.today.length + usable.commitments.length + usable.risks.length
  if (openCount === 0 && usable.facts.length === 0) return null

  const today = localDayOf(now)
  const dueToday = usable.commitments.filter((item) => item.risk === 'high' && item.due === today).length
  const highRisk = usable.risks.some((item) => item.level === 'high') ||
    usable.commitments.some((item) => item.risk === 'high')
  const base = {
    at: now,
    dedupeKey: `pet-brief:${brief.generatedAt}`,
  } as const

  if (dueToday > 0) return { ...base, type: 'commitment.due', counts: { due: dueToday }, priority: 'P0' }
  if (highRisk) return { ...base, type: 'brief.ready', counts: { open: openCount }, priority: 'P1' }
  if (brief.mood === 'concerned') return { ...base, type: 'brief.ready', counts: { open: openCount || 1 }, priority: 'P1' }
  return { ...base, type: 'brief.ready', counts: { open: openCount }, priority: 'P2' }
}

/**
 * Map a validated brief to a `PetDirective` through the presence projector
 * (quiet hours, secrecy and daily bubble budget stay enforced there).
 *
 * Pass a shared projector for a real client; without one this creates a fresh
 * projector per call, which is fine for tests and one-shot rendering.
 */
export function projectToDirective(brief: PetBrief, options: PresenceProjectionOptions = {}): PetDirective | null {
  const now = toMillis(options.now)
  const event = toPresenceEvent(brief, { now })
  if (!event) return null
  const projector = options.projector ?? new PresenceProjector(() => now)
  return projector.project(event)
}

function briefTextSources(brief: PetBrief): string[] {
  return [
    ...brief.today.map((item) => item.title),
    ...brief.commitments.flatMap((item) => [item.who, item.what, item.due]),
    ...brief.risks.map((item) => item.summary),
    ...brief.facts.flatMap((item) => [item.subject, item.predicate, item.value]),
  ]
}

function sharesRun(line: string, source: string): boolean {
  const chars = Array.from(source)
  for (let size = chars.length; size >= 2; size--) {
    for (let start = 0; start + size <= chars.length; start++) {
      const run = chars.slice(start, start + size).join('')
      // Two CJK chars are already a meaningful claim; latin needs a real token
      // so incidental pairs like "ef" inside "brief"/"prefers" cannot match.
      const cjk = /^[\u4e00-\u9fa5]+$/.test(run)
      if (!cjk && size < 4) continue
      if (line.includes(run)) return true
    }
  }
  return false
}

function isTraceableLine(line: string, brief: PetBrief): boolean {
  // A line is traceable only if it reuses a >=2-char run of a field in the brief.
  return briefTextSources(brief).some((source) => sharesRun(line, source))
}

export interface SuggestedLineResult {
  lines: string[]
  fallback: boolean
  rejected: string[]
}

/**
 * Claims guard for `suggestedLines`: drop untraceable/coercive/oversized lines
 * and fall back to a fixed safe line instead of inventing a reminder.
 */
export function resolveSuggestedLines(brief: PetBrief): SuggestedLineResult {
  const raw = Array.isArray(brief.suggestedLines) ? brief.suggestedLines : []
  if (raw.length === 0) return { lines: [], fallback: false, rejected: [] }
  const rejected: string[] = []
  const accepted: string[] = []
  for (const line of raw) {
    if (typeof line !== 'string' || codePointLength(line) === 0 || codePointLength(line) > PET_BRIEF_MAX_LINE_LENGTH) {
      rejected.push(String(line))
    } else if (COERCIVE.test(line)) {
      rejected.push(line)
    } else if (!isTraceableLine(line, brief)) {
      rejected.push(line)
    } else {
      accepted.push(line)
    }
  }
  if (rejected.length === 0) return { lines: accepted.slice(0, PET_BRIEF_MAX_SUGGESTED_LINES), fallback: false, rejected }
  return { lines: accepted.length > 0 ? accepted.slice(0, PET_BRIEF_MAX_SUGGESTED_LINES) : [PET_BRIEF_FALLBACK_LINE], fallback: true, rejected }
}
