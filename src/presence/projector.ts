import {
  DEFAULT_PRESENCE_POLICY,
  type AdvisersPresenceEvent,
  type PetDirective,
  type PresencePolicy,
  type PresencePriority,
} from './types.ts'

const DAY_MS = 24 * 60 * 60 * 1000

export class PresenceProjector {
  private readonly seen = new Map<string, number>()
  private readonly budget = new Map<string, { P0: number; P1: number }>()
  private seq = 0

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly policy: PresencePolicy = DEFAULT_PRESENCE_POLICY,
  ) {}

  project(event: AdvisersPresenceEvent): PetDirective | null {
    const secrecy = event.secrecy ?? 0
    if (secrecy >= this.policy.silentMinSecrecy) return null

    const at = this.now()
    if (this.isQuiet(at) && event.type !== 'work.state') return null

    const dedupeKey = event.dedupeKey ?? this.defaultKey(event)
    const day = dayKey(at)
    const dedupe = `${day}:${dedupeKey}`
    if (this.seen.has(dedupe)) return null
    this.seen.set(dedupe, at)
    if (this.seen.size > 512) {
      const oldest = this.seen.keys().next().value
      if (oldest) this.seen.delete(oldest)
    }

    const priority = event.priority ?? priorityOf(event)
    const pose = poseOf(event)

    // Work state is a pose only: no bubbles, no counts, no tool names.
    if (event.type === 'work.state') {
      return this.directive(at, event.type, 'pose', { pose })
    }

    // P2/P3 change the body only; they never speak.
    if (priority === 'P2' || priority === 'P3') {
      const tone = event.type === 'commitment.done' ? 'success' : 'neutral'
      return this.directive(at, event.type, 'pulse', { pose, tone, ttlMs: 3000 })
    }

    // secrecy 2: allow a generic body reaction, never text.
    if (secrecy > this.policy.textMaxSecrecy) {
      return this.directive(at, event.type, 'pulse', { pose, tone: 'attention', ttlMs: 3000 })
    }

    const text = template(event)
    if (!text) return this.directive(at, event.type, 'pulse', { pose, tone: 'neutral', ttlMs: 3000 })

    const dayBudget = this.budget.get(day) ?? { P0: 0, P1: 0 }
    this.budget.set(day, dayBudget)
    const key = priority === 'P0' ? 'P0' : 'P1'
    if (dayBudget[key] >= this.policy.dailyBubbleLimit[key]) {
      // Budget exhausted: downgrade to a silent pulse, never a queued backlog.
      return this.directive(at, event.type, 'pulse', { pose, tone: 'neutral', ttlMs: 3000 })
    }
    dayBudget[key] += 1

    return this.directive(at, event.type, 'bubble', {
      pose,
      text,
      tone: event.type === 'commitment.done' ? 'success' : 'attention',
      ttlMs: 8000,
    })
  }

  reset(): void {
    this.seen.clear()
    this.budget.clear()
  }

  private directive(
    at: number,
    sourceType: AdvisersPresenceEvent['type'],
    kind: PetDirective['kind'],
    extra: Partial<PetDirective>,
  ): PetDirective {
    return {
      id: `d${++this.seq}`,
      at,
      sourceType,
      kind,
      ttlMs: extra.ttlMs ?? 0,
      ...extra,
    }
  }

  private defaultKey(event: AdvisersPresenceEvent): string {
    const counts = event.counts ?? {}
    return [
      event.type,
      counts.due ?? '',
      counts.deadlines ?? '',
      counts.pending ?? '',
      counts.open ?? '',
    ].join(':')
  }

  private isQuiet(at: number): boolean {
    const hour = new Date(at).getHours()
    const { quietStartHour: start, quietEndHour: end } = this.policy
    if (start === end) return false
    if (start < end) return hour >= start && hour < end
    return hour >= start || hour < end
  }
}

export function priorityOf(event: AdvisersPresenceEvent): PresencePriority {
  switch (event.type) {
    case 'commitment.due':
      return (event.counts?.due ?? 0) > 0 ? 'P0' : 'P1'
    case 'brief.ready':
      return 'P1'
    case 'routine.proposed':
    case 'intent.ready':
    case 'commitment.done':
    case 'focus.changed':
      return 'P2'
    case 'work.state':
      return 'P3'
  }
}

function poseOf(event: AdvisersPresenceEvent): 'idle' | 'working' | 'waiting' {
  if (event.type === 'work.state') return event.state ?? 'idle'
  if (event.type === 'commitment.due') return 'waiting'
  return 'idle'
}

/** Fixed templates with numeric slots only. No names, amounts, or free text. */
function template(event: AdvisersPresenceEvent): string | null {
  const counts = event.counts ?? {}
  switch (event.type) {
    case 'commitment.due': {
      const n = counts.due ?? 0
      return n > 0 ? `${n} 件今天到期` : null
    }
    case 'brief.ready': {
      const n = counts.open ?? counts.deadlines ?? 0
      return n > 0 ? `${n} 件事待看` : null
    }
    case 'routine.proposed': {
      const n = counts.pending ?? 0
      return n > 0 ? `${n} 个流程待批` : null
    }
    case 'commitment.done':
      return '1 件已完成'
    default:
      return null
  }
}

function dayKey(at: number): string {
  return String(Math.floor(at / DAY_MS))
}
