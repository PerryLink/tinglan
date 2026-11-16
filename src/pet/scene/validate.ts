/**
 * Runtime-local validation for scene data.
 *
 * The scene runtime does not re-implement the full FCI validator
 * (`character/validate.ts` stays authoritative for packs); it only asserts the
 * invariants it relies on, so malformed data fails fast with a `SceneRuntimeError`
 * instead of producing `NaN` layout or a runtime `TypeError`.
 */
import type { BehaviorProfile, CharacterDocument, CharacterType } from '../character/types.ts'
import { SceneRuntimeError, type ActorScale, type SceneErrorCode } from './types.ts'

const ACTOR_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const EVENT_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/
const CHARACTER_TYPES: readonly CharacterType[] = ['humanoid', 'pet', 'object']
const MAX_INTERACTIONS = 64

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertFiniteNumber(value: unknown, what: string, code: SceneErrorCode = 'actor-invalid'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SceneRuntimeError(code, `${what} must be a finite number`)
  }
  return value
}

export function assertInteger(
  value: unknown,
  what: string,
  code: SceneErrorCode = 'actor-invalid',
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new SceneRuntimeError(code, `${what} must be an integer in [${min},${max}]`)
  }
  return value
}

/** Same actor-id grammar as `character/scene.ts` `Actor`. */
export function assertActorId(value: unknown, what = 'actor id'): string {
  if (typeof value !== 'string' || !ACTOR_ID_RE.test(value)) {
    throw new SceneRuntimeError('actor-invalid-id', `${what} is invalid: ${String(value)}`)
  }
  return value
}

export function assertEventName(value: unknown): string {
  if (typeof value !== 'string' || !EVENT_RE.test(value)) {
    throw new SceneRuntimeError('event-invalid', `event name is invalid: ${String(value)}`)
  }
  return value
}

export function assertSeedValue(value: unknown, what: string, code: SceneErrorCode = 'actor-invalid'): number {
  return assertInteger(value, what, code)
}

export function assertScaleValue(value: unknown): ActorScale {
  if (value !== 1 && value !== 2) {
    throw new SceneRuntimeError('actor-invalid', `scale must be integer 1 or 2, got ${String(value)}`)
  }
  return value
}

function assertString(value: unknown, what: string, code: SceneErrorCode = 'actor-invalid'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SceneRuntimeError(code, `${what} must be a non-empty string`)
  }
  return value
}

function assertNonNegativeNumber(value: unknown, what: string): number {
  const number = assertFiniteNumber(value, what, 'actor-invalid')
  if (number < 0) throw new SceneRuntimeError('actor-invalid', `${what} must be >= 0`)
  return number
}

/** footBox is anchor-relative for the built-in packs (`[-36,-18,72,18]`). */
export function assertFootBox(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new SceneRuntimeError('actor-invalid', 'document.footBox must be [x,y,w,h]')
  }
  const [x, y, w, h] = value
  const nums = [x, y, w, h].map((entry, index) => assertFiniteNumber(entry, `document.footBox[${index}]`))
  const width = nums[2]
  const height = nums[3]
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    throw new SceneRuntimeError('actor-invalid', 'document.footBox w/h must be > 0')
  }
  return [nums[0] ?? 0, nums[1] ?? 0, width, height]
}

/** Validate only the document fields the runtime reads (layout + interactions). */
export function assertDocumentRuntime(value: unknown, context: string): CharacterDocument {
  if (!isRecord(value)) throw new SceneRuntimeError('actor-invalid', `${context}.document must be an object`)
  const id = value.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new SceneRuntimeError('actor-invalid', `${context}.document.id must be a non-empty string`)
  }
  if (typeof value.type !== 'string' || !CHARACTER_TYPES.includes(value.type as CharacterType)) {
    throw new SceneRuntimeError('actor-invalid', `${context}.document.type must be humanoid|pet|object`)
  }
  assertFootBox(value.footBox)
  if (value.interactions !== undefined) assertInteractionsRuntime(value.interactions, `${context}.document`)
  return value as unknown as CharacterDocument
}

/** `CharacterDocument.interactions` v0.1 shape (flat array of declarations). */
export function assertInteractionsRuntime(value: unknown, context: string): void {
  if (!Array.isArray(value)) {
    throw new SceneRuntimeError('actor-invalid', `${context}.interactions must be an array`)
  }
  if (value.length > MAX_INTERACTIONS) {
    throw new SceneRuntimeError('actor-invalid', `${context}.interactions exceeds ${MAX_INTERACTIONS} declarations`)
  }
  for (const [index, raw] of value.entries()) {
    if (!isRecord(raw)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.interactions[${index}] must be an object`)
    }
    assertString(raw.id, `${context}.interactions[${index}].id`)
    assertString(raw.on, `${context}.interactions[${index}].on`)
    if (!Array.isArray(raw.actors) || raw.actors.length === 0) {
      throw new SceneRuntimeError('actor-invalid', `${context}.interactions[${index}].actors must be a non-empty array`)
    }
    for (const [actorIndex, matcher] of raw.actors.entries()) {
      assertString(matcher, `${context}.interactions[${index}].actors[${actorIndex}]`)
    }
    if (raw.outcome !== undefined) assertString(raw.outcome, `${context}.interactions[${index}].outcome`)
  }
}

/** Validate only the behaviour fields the runtime reads (states/rules/ambient). */
export function assertBehaviorProfileRuntime(value: unknown, context: string): BehaviorProfile {
  if (!isRecord(value)) throw new SceneRuntimeError('actor-invalid', `${context}.behavior must be an object`)
  if (!isRecord(value.abilities)) {
    throw new SceneRuntimeError('actor-invalid', `${context}.behavior.abilities must be an object`)
  }
  const states = value.states
  if (!isRecord(states) || Object.keys(states).length === 0) {
    throw new SceneRuntimeError('actor-invalid', `${context}.behavior.states must be a non-empty object`)
  }
  for (const [name, raw] of Object.entries(states)) {
    if (!isRecord(raw)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.states.${name} must be an object`)
    }
    assertString(raw.tag, `${context}.behavior.states.${name}.tag`)
    if (raw.loop !== undefined && typeof raw.loop !== 'boolean') {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.states.${name}.loop must be boolean`)
    }
    if (raw.after !== undefined) {
      const after = assertString(raw.after, `${context}.behavior.states.${name}.after`)
      if (!(after in states)) {
        throw new SceneRuntimeError(
          'actor-invalid',
          `${context}.behavior.states.${name}.after references unknown state "${after}"`,
        )
      }
    }
    if (raw.timeoutMs !== undefined) assertNonNegativeNumber(raw.timeoutMs, `${context}.behavior.states.${name}.timeoutMs`)
    if (raw.cooldownMs !== undefined) {
      assertNonNegativeNumber(raw.cooldownMs, `${context}.behavior.states.${name}.cooldownMs`)
    }
  }

  if (!Array.isArray(value.rules)) {
    throw new SceneRuntimeError('actor-invalid', `${context}.behavior.rules must be an array`)
  }
  for (const [index, raw] of value.rules.entries()) {
    if (!isRecord(raw)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.rules[${index}] must be an object`)
    }
    const on = Array.isArray(raw.on) ? raw.on : [raw.on]
    if (on.length === 0) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.rules[${index}].on must not be empty`)
    }
    for (const event of on) assertString(event, `${context}.behavior.rules[${index}].on`)
    assertString(raw.to, `${context}.behavior.rules[${index}].to`)
    if (!(raw.to as string in states)) {
      throw new SceneRuntimeError(
        'actor-invalid',
        `${context}.behavior.rules[${index}].to references unknown state "${String(raw.to)}"`,
      )
    }
    if (raw.priority !== undefined) assertFiniteNumber(raw.priority, `${context}.behavior.rules[${index}].priority`)
    if (raw.cooldownMs !== undefined) {
      assertNonNegativeNumber(raw.cooldownMs, `${context}.behavior.rules[${index}].cooldownMs`)
    }
    if (raw.probability !== undefined) {
      const probability = assertFiniteNumber(raw.probability, `${context}.behavior.rules[${index}].probability`)
      if (probability < 0 || probability > 1) {
        throw new SceneRuntimeError('actor-invalid', `${context}.behavior.rules[${index}].probability must be in [0,1]`)
      }
    }
  }

  if (value.defaults !== undefined) {
    if (!isRecord(value.defaults)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.defaults must be an object`)
    }
    if (value.defaults.priority !== undefined) {
      assertFiniteNumber(value.defaults.priority, `${context}.behavior.defaults.priority`)
    }
    if (value.defaults.cooldownMs !== undefined) {
      assertNonNegativeNumber(value.defaults.cooldownMs, `${context}.behavior.defaults.cooldownMs`)
    }
  }

  if (value.slots !== undefined) {
    if (!isRecord(value.slots)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.slots must be an object`)
    }
    for (const [name, slot] of Object.entries(value.slots)) {
      if (slot !== null) assertString(slot, `${context}.behavior.slots.${name}`)
    }
  }

  if (value.ambient !== undefined) {
    if (!isRecord(value.ambient)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.ambient must be an object`)
    }
    const interval = value.ambient.intervalMs
    if (!Array.isArray(interval) || interval.length !== 2) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.ambient.intervalMs must be [min,max]`)
    }
    const min = assertInteger(interval[0], `${context}.behavior.ambient.intervalMs[0]`, 'actor-invalid', 0)
    const max = assertInteger(interval[1], `${context}.behavior.ambient.intervalMs[1]`, 'actor-invalid', 0)
    if (max < min) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.ambient.intervalMs max < min`)
    }
    const choices = value.ambient.choices
    if (!Array.isArray(choices)) {
      throw new SceneRuntimeError('actor-invalid', `${context}.behavior.ambient.choices must be an array`)
    }
    for (const [index, raw] of choices.entries()) {
      if (!isRecord(raw)) {
        throw new SceneRuntimeError('actor-invalid', `${context}.behavior.ambient.choices[${index}] must be an object`)
      }
      assertString(raw.state, `${context}.behavior.ambient.choices[${index}].state`)
      if (!(raw.state as string in states)) {
        throw new SceneRuntimeError(
          'actor-invalid',
          `${context}.behavior.ambient.choices[${index}].state references unknown state "${String(raw.state)}"`,
        )
      }
      assertNonNegativeNumber(raw.weight, `${context}.behavior.ambient.choices[${index}].weight`)
    }
  }

  return value as unknown as BehaviorProfile
}
