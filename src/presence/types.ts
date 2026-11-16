export type Secrecy = 0 | 1 | 2 | 3
export type PresencePriority = 'P0' | 'P1' | 'P2' | 'P3'

/**
 * What Advisers is allowed to tell the pet. Deliberately numeric-only:
 * there is no free-text field, so the model cannot invent a sentence and the
 * renderer owns every word.
 */
export interface AdvisersPresenceEvent {
  type:
    | 'focus.changed'
    | 'commitment.due'
    | 'commitment.done'
    | 'brief.ready'
    | 'routine.proposed'
    | 'intent.ready'
    | 'work.state'
  at: number
  secrecy?: Secrecy
  priority?: PresencePriority
  dedupeKey?: string
  counts?: {
    deadlines?: number
    open?: number
    due?: number
    pending?: number
  }
  state?: 'idle' | 'working' | 'waiting'
  period?: 'morning' | 'evening'
}

export type PetPose = 'idle' | 'working' | 'waiting'

export interface PetDirective {
  id: string
  at: number
  sourceType: AdvisersPresenceEvent['type']
  kind: 'pose' | 'bubble' | 'pulse'
  pose?: PetPose
  text?: string
  tone?: 'neutral' | 'attention' | 'success'
  ttlMs: number
}

export interface PresencePolicy {
  quietStartHour: number
  quietEndHour: number
  dailyBubbleLimit: { P0: number; P1: number }
  /** Secrecy >= this never produces text. */
  textMaxSecrecy: Secrecy
  /** Secrecy >= this produces no directive at all. */
  silentMinSecrecy: Secrecy
}

export const DEFAULT_PRESENCE_POLICY: PresencePolicy = {
  quietStartHour: 22,
  quietEndHour: 8,
  dailyBubbleLimit: { P0: 1, P1: 3 },
  textMaxSecrecy: 1,
  silentMinSecrecy: 3,
}
