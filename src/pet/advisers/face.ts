/**
 * Advisers face controller: consume the read-only Pet Brief and drive the
 * existing pet presentation (bubble/pose) without coupling the pet to the
 * Advisers database. Normal pat/drag/talk continue to flow through the shell.
 *
 * Transport is a fixed local file (`~/.advisers/pet-brief.json`) read by the
 * Tauri command `read_advisers_brief`; browsers (no Tauri) report `no-transport`.
 * The brief is always validated (schema/TTL/redaction) before any use.
 */
import { toPresenceEvent, validatePetBrief, type PetBrief } from '../../presence/pet-brief.ts'
import { PresenceProjector } from '../../presence/projector.ts'
import type { PetDirective } from '../../presence/types.ts'

export type AdvisersFaceReason =
  | 'disabled'
  | 'no-transport'
  | 'no-file'
  | 'invalid'
  | 'skipped'
  | 'fresh'
  | 'stale'
  | 'quiet-or-deduped'
  | 'error'

export interface AdvisersFaceStatus {
  enabled: boolean
  ok: boolean
  reason: AdvisersFaceReason
  lastSyncAt?: number
  generatedAt?: string
  expiresAt?: string
  counts?: PetBrief['counts']
  message?: string
}

export interface AdvisersFaceSummary {
  generatedAt: string
  expiresAt: string
  mood: PetBrief['mood']
  counts: PetBrief['counts']
  today: string[]
  commitments: Array<{ who: string; what: string; due: string; risk: string }>
  risks: Array<{ level: string; summary: string }>
}

/** Render a redacted summary for the pet-side details panel (no suggestedLines). */
export function summarizeBrief(brief: PetBrief): AdvisersFaceSummary {
  return {
    generatedAt: brief.generatedAt,
    expiresAt: brief.expiresAt,
    mood: brief.mood,
    counts: brief.counts,
    today: brief.today.map((item) => item.title).slice(0, 10),
    commitments: brief.commitments
      .filter((item) => item.confidence >= 0.7)
      .slice(0, 10)
      .map((item) => ({ who: item.who, what: item.what, due: item.due, risk: item.risk })),
    risks: brief.risks
      .filter((item) => item.confidence >= 0.7)
      .slice(0, 10)
      .map((item) => ({ level: item.level, summary: item.summary })),
  }
}

export interface AdvisersFaceOptions {
  /** Injectable for tests; defaults to Tauri invoke. */
  readBrief?: () => Promise<unknown | null>
  now?: () => number
  onDirective?: (directive: PetDirective) => void
  onStatus?: (status: AdvisersFaceStatus) => void
  intervalMs?: number
}

export async function readAdvisersBriefFromTauri(): Promise<unknown | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) throw new Error('Tauri transport unavailable')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<unknown | null>('read_advisers_brief')
}

export class AdvisersFaceController {
  private readonly options: AdvisersFaceOptions
  private readonly projector: PresenceProjector
  private timer: ReturnType<typeof setInterval> | undefined
  enabled = false
  lastBrief: PetBrief | undefined
  lastStatus: AdvisersFaceStatus = { enabled: false, ok: false, reason: 'disabled' }

  constructor(options: AdvisersFaceOptions = {}) {
    this.options = options
    this.projector = new PresenceProjector(options.now ?? (() => Date.now()))
  }

  private now(): number {
    return (this.options.now ?? (() => Date.now()))()
  }

  private setStatus(status: AdvisersFaceStatus): void {
    this.lastStatus = status
    this.options.onStatus?.(status)
  }

  async start(): Promise<AdvisersFaceStatus> {
    this.enabled = true
    const status = await this.sync()
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        void this.sync()
      }, this.options.intervalMs ?? 60_000)
    }
    return status
  }

  stop(): void {
    this.enabled = false
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.setStatus({ enabled: false, ok: false, reason: 'disabled' })
  }

  /** One read/validate/project cycle. Safe to call manually (QA/tests). */
  async sync(): Promise<AdvisersFaceStatus> {
    if (!this.enabled) {
      const status: AdvisersFaceStatus = { enabled: false, ok: false, reason: 'disabled' }
      this.setStatus(status)
      return status
    }
    const reader = this.options.readBrief ?? readAdvisersBriefFromTauri
    let raw: unknown | null
    try {
      raw = await reader()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status: AdvisersFaceStatus = {
        enabled: true,
        ok: false,
        reason: message.includes('transport') ? 'no-transport' : 'error',
        lastSyncAt: this.now(),
        message,
      }
      this.setStatus(status)
      return status
    }
    if (raw === null || raw === undefined) {
      const status: AdvisersFaceStatus = { enabled: true, ok: false, reason: 'no-file' }
      this.setStatus(status)
      return status
    }
    const now = this.now()
    const checked = validatePetBrief(raw, { now, enabled: true, requireFresh: false })
    if (checked.status === 'reject') {
      const status: AdvisersFaceStatus = {
        enabled: true,
        ok: false,
        reason: 'invalid',
        lastSyncAt: now,
        message: checked.errors.map((error) => `${error.code} ${error.path}`).join(', '),
      }
      this.setStatus(status)
      return status
    }
    if (checked.status === 'skip') {
      const status: AdvisersFaceStatus = { enabled: true, ok: false, reason: 'skipped' }
      this.setStatus(status)
      return status
    }
    const brief = checked.brief
    this.lastBrief = brief
    const stale = Date.parse(brief.expiresAt) <= now
    if (stale) {
      const status: AdvisersFaceStatus = {
        enabled: true,
        ok: false,
        reason: 'stale',
        lastSyncAt: now,
        generatedAt: brief.generatedAt,
        expiresAt: brief.expiresAt,
        counts: brief.counts,
      }
      this.setStatus(status)
      return status
    }
    const event = toPresenceEvent(brief, { now })
    if (!event) {
      const status: AdvisersFaceStatus = {
        enabled: true,
        ok: true,
        reason: 'quiet-or-deduped',
        lastSyncAt: now,
        generatedAt: brief.generatedAt,
        expiresAt: brief.expiresAt,
        counts: brief.counts,
      }
      this.setStatus(status)
      return status
    }
    const directive = this.projector.project(event)
    if (directive) this.options.onDirective?.(directive)
    const status: AdvisersFaceStatus = {
      enabled: true,
      ok: true,
      reason: 'fresh',
      lastSyncAt: now,
      generatedAt: brief.generatedAt,
      expiresAt: brief.expiresAt,
      counts: brief.counts,
      ...(directive ? { message: `${directive.kind}:${directive.sourceType}` } : {}),
    }
    this.setStatus(status)
    return status
  }
}
