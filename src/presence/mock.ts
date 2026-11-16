import type { AdvisersPresenceEvent } from './types.ts'

/** Deterministic stand-in for the real Advisers event source. */
export class MockAdvisersSource {
  constructor(private readonly at: () => number = () => Date.now()) {}

  focus(deadlines: number, open: number): AdvisersPresenceEvent {
    return {
      type: 'focus.changed',
      at: this.at(),
      counts: { deadlines, open },
      dedupeKey: `focus:${deadlines}`,
    }
  }

  due(count: number, q: number): AdvisersPresenceEvent {
    return {
      type: 'commitment.due',
      at: this.at(),
      counts: { due: count },
      dedupeKey: `due:${q}`,
    }
  }

  done(): AdvisersPresenceEvent {
    return { type: 'commitment.done', at: this.at(), dedupeKey: `done:${this.at()}` }
  }

  brief(open: number, period: 'morning' | 'evening' = 'morning'): AdvisersPresenceEvent {
    return { type: 'brief.ready', at: this.at(), counts: { open }, period, dedupeKey: `brief:${period}` }
  }

  routine(pending: number): AdvisersPresenceEvent {
    return {
      type: 'routine.proposed',
      at: this.at(),
      counts: { pending },
      dedupeKey: `routine:${pending}`,
    }
  }

  work(state: 'idle' | 'working' | 'waiting'): AdvisersPresenceEvent {
    return { type: 'work.state', at: this.at(), state }
  }
}
