/**
 * Deterministic time + randomness for the scene runtime.
 *
 * No wall-clock or global RNG is used: the host drives `SceneRuntime.tick()`
 * with explicit `nowMs`/`dtMs`, and every random draw comes from a seeded
 * mulberry32 stream whose cursor is snapshot-able (see `SceneRng.state`).
 */
import type { SceneClock } from './types.ts'

/** Create a clock at a fixed start time (deterministic default: 0). */
export function createSceneClock(startMs = 0): SceneClock {
  return { nowMs: startMs, tick: 0, dtMs: 0 }
}

/** 32-bit FNV-1a; used to derive stable per-actor seeds from ids. */
export function hashSeed(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  }
  return hash >>> 0
}

/**
 * Seeded mulberry32 PRNG with an inspectable cursor.
 * Same algorithm as `character/behavior.ts` `mulberry32`, so seeded streams
 * match the FCI behaviour runtime's distribution.
 */
export class SceneRng {
  private cursor: number

  constructor(seed: number) {
    this.cursor = seed >>> 0
  }

  /** Current internal state; store it in snapshots to resume the stream exactly. */
  get state(): number {
    return this.cursor
  }

  set state(value: number) {
    this.cursor = value >>> 0
  }

  /** Next float in [0, 1). */
  next(): number {
    this.cursor = (this.cursor + 0x6d2b79f5) >>> 0
    let t = this.cursor
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normalise any integer seed to the uint32 range used by `SceneRng`. */
export function normalizeSeed(seed: number): number {
  return seed >>> 0
}
