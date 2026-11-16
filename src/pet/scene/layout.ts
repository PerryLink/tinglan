/**
 * Pure layout / z-order / bounds helpers.
 *
 * Coordinate model (v0.1): an actor's `(x, y)` is its FCI document anchor point
 * in world space (built-in packs use `anchor.mode:"foot-center"`), and
 * `document.footBox` is anchor-relative (`[-36,-18,72,18]`). The actor foot-print
 * in world space is therefore `footBox` shifted by `(x, y)` and multiplied by the
 * integer display scale. Everything here is deterministic and allocation-light;
 * no rendering dependency.
 */
import type { CharacterDocument } from '../character/types.ts'
import type { ActorScale, SceneBounds, SceneRect } from './types.ts'

/** Minimal actor shape needed by the layout helpers (keeps this module dependency-free). */
export interface LayoutActor {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly scale: ActorScale
  readonly document: CharacterDocument
}

/** Lexicographic id comparison (locale-independent, stable across hosts). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Deterministic actor ordering by id. */
export function sortById<T extends { readonly id: string }>(actors: readonly T[]): T[] {
  return [...actors].sort((left, right) => compareIds(left.id, right.id))
}

/** World-space foot-print rectangle. */
export function actorFootprint(actor: LayoutActor): SceneRect {
  const [offsetX, offsetY, width, height] = actor.document.footBox
  const scale = actor.scale
  return {
    x: actor.x + offsetX * scale,
    y: actor.y + offsetY * scale,
    w: width * scale,
    h: height * scale,
  }
}

/** Minimal point shape for distance helpers (works for any actor view). */
export interface AnchorPoint {
  readonly x: number
  readonly y: number
}

/** Anchor-to-anchor distance in world pixels. */
export function anchorDistance(a: AnchorPoint, b: AnchorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function rectsOverlap(a: SceneRect, b: SceneRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Union of all foot-prints, or `null` for an empty scene. */
export function sceneBounds(actors: Iterable<LayoutActor>): SceneBounds | null {
  let result: SceneBounds | null = null
  for (const actor of actors) {
    const rect = actorFootprint(actor)
    if (!result) {
      result = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h }
      continue
    }
    result.minX = Math.min(result.minX, rect.x)
    result.minY = Math.min(result.minY, rect.y)
    result.maxX = Math.max(result.maxX, rect.x + rect.w)
    result.maxY = Math.max(result.maxY, rect.y + rect.h)
  }
  return result
}

/** Overlapping foot-print pairs, sorted by `(a, b)` ids for deterministic output. */
export function overlapPairs(actors: readonly LayoutActor[]): Array<{ a: string; b: string }> {
  const sorted = sortById(actors)
  const rects = sorted.map((actor) => actorFootprint(actor))
  const pairs: Array<{ a: string; b: string }> = []
  for (let i = 0; i < sorted.length; i++) {
    const left = sorted[i]
    const leftRect = rects[i]
    if (!left || !leftRect) continue
    for (let j = i + 1; j < sorted.length; j++) {
      const right = sorted[j]
      const rightRect = rects[j]
      if (!right || !rightRect) continue
      if (rectsOverlap(leftRect, rightRect)) pairs.push({ a: left.id, b: right.id })
    }
  }
  return pairs
}
