import { Service, type Context } from 'cordis'
import { PresenceProjector } from './projector.ts'
import {
  DEFAULT_PRESENCE_POLICY,
  type AdvisersPresenceEvent,
  type PetDirective,
  type PresencePolicy,
} from './types.ts'

declare module 'cordis' {
  interface Context {
    presence: PresenceService
  }

  interface Events {
    'presence/directive': (directive: PetDirective) => void
  }
}

export interface PresenceOptions {
  policy?: PresencePolicy
  /** Injectable clock for tests and the quiet-hours demo. */
  now?: () => number
}

/** Cordis boundary for the pet: ingest Advisers events, emit directives. */
export class PresenceService extends Service {
  readonly projector: PresenceProjector

  constructor(ctx: Context, options: PresenceOptions = {}) {
    super(ctx, 'presence')
    this.projector = new PresenceProjector(
      options.now ?? (() => Date.now()),
      options.policy ?? DEFAULT_PRESENCE_POLICY,
    )
  }

  ingest(event: AdvisersPresenceEvent): PetDirective | null {
    const directive = this.projector.project(event)
    if (directive) this.ctx.emit('presence/directive', directive)
    return directive
  }
}

export const presencePlugin = {
  name: 'presence',
  apply(ctx: Context, options: PresenceOptions = {}) {
    new PresenceService(ctx, options)
  },
}
