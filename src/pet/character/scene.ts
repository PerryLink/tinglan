import { BehaviorRuntime, type DecisionContext } from './behavior.ts'
import { CharacterInterfaceError, type BehaviorDecision, type CharacterDocument } from './types.ts'
import type { BehaviorProfile } from './types.ts'

export interface ActorInit {
  id: string
  document: CharacterDocument
  behavior: BehaviorProfile
  seed?: number
  initialState?: string
}

/** One live instance of a character/pet in a scene. */
export class Actor {
  readonly id: string
  readonly document: CharacterDocument
  readonly behavior: BehaviorRuntime
  constructor(init: ActorInit) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(init.id)) throw new CharacterInterfaceError(`invalid actor id: ${init.id}`)
    this.id = init.id
    this.document = init.document
    this.behavior = new BehaviorRuntime(init.behavior, {
      ...(init.seed !== undefined ? { seed: init.seed } : {}),
      ...(init.initialState !== undefined ? { initialState: init.initialState } : {}),
    })
  }

  get type() { return this.document.type }

  emit(event: string, ctx: DecisionContext): BehaviorDecision {
    return this.behavior.decide(event, ctx)
  }
}

export interface SceneEmission {
  actorId: string
  decision: BehaviorDecision
}

/**
 * Minimal multi-actor scene: registration + event broadcast + actor.emit.
 * No rendering/UI here; a shell can render actors with hero.ts later.
 * Phase-3 multi-object interactions only use declared `interactions`; for now
 * peer events are simply broadcast with a source id.
 */
export class Scene {
  private readonly actors = new Map<string, Actor>()

  spawn(init: ActorInit): Actor {
    if (this.actors.has(init.id)) throw new CharacterInterfaceError(`duplicate actor id: ${init.id}`)
    const actor = new Actor(init)
    this.actors.set(actor.id, actor)
    return actor
  }

  despawn(id: string): boolean {
    return this.actors.delete(id)
  }

  get(id: string): Actor {
    const actor = this.actors.get(id)
    if (!actor) throw new CharacterInterfaceError(`unknown actor: ${id}`)
    return actor
  }

  has(id: string): boolean {
    return this.actors.has(id)
  }

  list(): Actor[] {
    return [...this.actors.values()]
  }

  /** Emit an event to every actor that declares multiObject capability. */
  broadcast(event: string, ctx: DecisionContext, sourceId = 'host'): SceneEmission[] {
    const out: SceneEmission[] = []
    for (const actor of this.actors.values()) {
      if (actor.behavior.profile.abilities.multiObject === false) continue
      const decision = actor.emit(event, { ...ctx, source: sourceId })
      out.push({ actorId: actor.id, decision })
    }
    return out
  }

  /** Actor-to-actor event (peer) guarded by declared capabilities; v1 is a simple send. */
  send(fromId: string, toId: string, event: string, nowMs: number): SceneEmission {
    const from = this.get(fromId)
    const to = this.get(toId)
    if (from.document.capabilities?.behaviors?.includes('social') !== true) {
      throw new CharacterInterfaceError(`${fromId} cannot send peer events (missing social capability)`)
    }
    if (to.behavior.profile.abilities.multiObject === false) {
      throw new CharacterInterfaceError(`${toId} does not accept multi-object events`)
    }
    return { actorId: to.id, decision: to.emit(event, { nowMs, state: to.behavior.state }) }
  }
}
