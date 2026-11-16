import { readFile } from 'node:fs/promises'
import type { AdvisersPresenceEvent, Secrecy } from './types.ts'

/**
 * Structural subset of `advisers` LedgerSnapshot (v1). We do not import the
 * package: the bridge stays a thin adapter over the public JSON shape.
 */
export interface AdvisersMatter {
  id: string
  status: 'active' | 'paused' | 'archived'
  secrecy?: Secrecy
  deadlines?: string[]
  openQuestions?: string[]
  updatedAt?: string
}

export interface AdvisersCommitment {
  id: string
  matterId: string
  status: 'open' | 'done' | 'snoozed' | 'dropped'
  dueAt?: string
  timezone?: string
}

export interface AdvisersRoutine {
  id: string
  status: 'draft' | 'active' | 'archived'
}

export interface AdvisersSnapshot {
  version?: number
  matters?: AdvisersMatter[]
  commitments?: AdvisersCommitment[]
  routines?: AdvisersRoutine[]
  routinePatches?: Array<{ id: string; status: 'pending' | 'applied' | 'rejected' }>
  updates?: Array<{ id: string; status: 'pending' | 'applied' | 'rejected' }>
}

const EMPTY: AdvisersSnapshot = {
  matters: [],
  commitments: [],
  routines: [],
  routinePatches: [],
  updates: [],
}

function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function endOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function publicDueCommitments(snapshot: AdvisersSnapshot, now: number): AdvisersCommitment[] {
  const secrecyByMatter = new Map((snapshot.matters ?? []).map((m) => [m.id, m.secrecy ?? 0]))
  const due: AdvisersCommitment[] = []
  for (const c of snapshot.commitments ?? []) {
    if (c.status !== 'open') continue
    const at = dueTime(c)
    if (at === null || at > endOfDay(now)) continue
    if ((secrecyByMatter.get(c.matterId) ?? 0) >= 2) continue
    due.push(c)
  }
  return due
}

function dueTime(commitment: AdvisersCommitment): number | null {
  if (!commitment.dueAt) return null
  const t = Date.parse(commitment.dueAt)
  return Number.isFinite(t) ? t : null
}

/**
 * Turn two ledger snapshots into presence events.
 *
 * Privacy rules:
 * - commitments whose matter has secrecy >= 2 are excluded from counts entirely;
 * - no action/creditor/matter title ever leaves this function.
 */
export function diffAdvisersSnapshots(
  prev: AdvisersSnapshot,
  next: AdvisersSnapshot,
  now: number,
): AdvisersPresenceEvent[] {
  const events: AdvisersPresenceEvent[] = []
  const prevById = new Map((prev.commitments ?? []).map((c) => [c.id, c]))

  const publicDue = publicDueCommitments(next, now)
  const prevDue = publicDueCommitments(prev, now)
  const dueKey = (list: AdvisersCommitment[]) => list.map((c) => c.id).sort().join(',')
  if (publicDue.length > 0 && dueKey(publicDue) !== dueKey(prevDue)) {
    const withinHour = publicDue.some((c) => (dueTime(c) ?? Infinity) - now <= 3_600_000)
    events.push({
      type: 'commitment.due',
      at: now,
      counts: { due: publicDue.length },
      priority: withinHour ? 'P0' : 'P1',
      dedupeKey: `due:${publicDue.map((c) => c.id).sort().join(',')}`,
    })
  }

  // Completed commitments: compare status, never emit the action text.
  for (const c of next.commitments ?? []) {
    const before = prevById.get(c.id)
    if (!before || before.status === 'done' || c.status !== 'done') continue
    events.push({
      type: 'commitment.done',
      at: now,
      dedupeKey: `done:${c.id}`,
    })
  }

  // Draft routines / pending patches / cross-matter proposals.
  const prevDraft = new Set((prev.routines ?? []).filter((r) => r.status === 'draft').map((r) => r.id))
  const drafts = (next.routines ?? []).filter((r) => r.status === 'draft' && !prevDraft.has(r.id))
  const pendingPatches = (next.routinePatches ?? []).filter((p) => p.status === 'pending')
  const pendingUpdates = (next.updates ?? []).filter((u) => u.status === 'pending')
  const pending = drafts.length + pendingPatches.length + pendingUpdates.length
  if (pending > 0) {
    events.push({
      type: 'routine.proposed',
      at: now,
      counts: { pending },
      dedupeKey: `routine:${drafts.map((r) => r.id).join(',')}:${pendingPatches.length}:${pendingUpdates.length}`,
    })
  }

  // Focus: only a numeric summary, only when the active-matter shape changed.
  const focusKey = (snapshot: AdvisersSnapshot) =>
    (snapshot.matters ?? [])
      .filter((m) => m.status === 'active')
      .map((m) => `${m.id}:${(m.deadlines ?? []).length}:${(m.openQuestions ?? []).length}`)
      .sort()
      .join('|')
  if (focusKey(prev) !== focusKey(next)) {
    const active = (next.matters ?? []).filter((m) => m.status === 'active')
    const deadlines = active.reduce((sum, m) => sum + (m.deadlines ?? []).length, 0)
    const open = active.reduce((sum, m) => sum + (m.openQuestions ?? []).length, 0)
    if (active.length > 0) {
      events.push({
        type: 'focus.changed',
        at: now,
        counts: { deadlines, open },
        dedupeKey: `focus:${focusKey(next)}`,
      })
    }
  }

  return events
}

export interface AdvisersSourceOptions {
  now?: () => number
  readFile?: (path: string) => Promise<string>
}

/**
 * Polls the `advisers` JSON ledger (default `~/.advisers/state.json`) and
 * emits presence events for changes. A missing file yields no events.
 */
export class AdvisersFileSource {
  private previous: AdvisersSnapshot = EMPTY
  private readonly seen = new Set<string>()
  private readonly now: () => number
  private readonly read: (path: string) => Promise<string>

  constructor(
    private readonly path: string,
    options: AdvisersSourceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now())
    this.read = options.readFile ?? ((p) => readFile(p, 'utf8'))
  }

  /** Reset the diff baseline (e.g. after a full re-read). */
  reset(): void {
    this.previous = EMPTY
    this.seen.clear()
  }

  async poll(): Promise<AdvisersPresenceEvent[]> {
    let text: string
    try {
      text = await this.read(this.path)
    } catch {
      return []
    }
    let next: AdvisersSnapshot
    try {
      next = JSON.parse(text) as AdvisersSnapshot
    } catch {
      return []
    }
    const events = diffAdvisersSnapshots(this.previous, next, this.now()).filter(
      (event) => !event.dedupeKey || !this.seen.has(event.dedupeKey),
    )
    for (const event of events) {
      if (!event.dedupeKey) continue
      this.seen.add(event.dedupeKey)
      if (this.seen.size > 512) {
        const oldest = this.seen.values().next().value
        if (oldest) this.seen.delete(oldest)
      }
    }
    this.previous = next
    return events
  }

  get baseline(): AdvisersSnapshot {
    return this.previous
  }
}

export { startOfDay, endOfDay }
