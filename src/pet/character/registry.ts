import {
  CharacterInterfaceError,
  type BehaviorProfile,
  type CharacterDocument,
} from './types.ts'
import { legacyManifestToCharacter, validateBehaviorProfile, validateCharacterDocument } from './validate.ts'
import {
  validateBehaviorProfileV03,
  validateCharacterDocumentV03,
  validateVoiceLineLibrary,
  type BehaviorProfileV03,
  type CharacterDocumentV03,
  type VoiceLineLibrary,
} from './v03.ts'


export interface LoadedCharacter {
  document: CharacterDocument
  behavior: BehaviorProfile
  /** Where the pack's frames live (for hero.ts / CharacterRenderer). */
  packBase?: string
}

export class CharacterRegistry {
  private readonly characters = new Map<string, LoadedCharacter>()

  register(loaded: LoadedCharacter): LoadedCharacter {
    const { document, behavior } = loaded
    if (this.characters.has(document.id)) {
      throw new CharacterInterfaceError(`duplicate character id: ${document.id}`)
    }
    this.characters.set(document.id, { document, behavior, ...(loaded.packBase ? { packBase: loaded.packBase } : {}) })
    return loaded
  }

  get(id: string): LoadedCharacter {
    const found = this.characters.get(id)
    if (!found) throw new CharacterInterfaceError(`unknown character: ${id}`)
    return found
  }

  has(id: string): boolean {
    return this.characters.has(id)
  }

  list(): LoadedCharacter[] {
    return [...this.characters.values()]
  }

  unregister(id: string): boolean {
    return this.characters.delete(id)
  }

  clear(): void {
    this.characters.clear()
  }
}

function joinUrl(base: string, file: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return new URL(file, new URL(b, 'file:///')).toString().replace(/^fil<private-path> '')
}

/**
 * Load `character.json` (+ optional behaviour file / pack manifest) from a
 * directory URL. Pure data: nothing is executed.
 */
export async function loadCharacter(
  characterDir: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedCharacter> {
  const base = characterDir.endsWith('/') ? characterDir : `${characterDir}/`
  const charUrl = new URL('character.json', new URL(base, 'file:///')).toString().replace(/^fil<private-path> '')
  const res = await fetcher(charUrl)
  if (!res.ok) throw new CharacterInterfaceError(`failed to fetch ${charUrl}: HTTP ${res.status}`)
  const document = validateCharacterDocument(await res.json())

  let behavior: BehaviorProfile
  if (document.behavior) {
    behavior = document.behavior
  } else if (document.behaviorFile) {
    const behaviorUrl = new URL(document.behaviorFile, new URL(charUrl, 'file:///')).toString().replace(/^fil<private-path> '')
    const bres = await fetcher(behaviorUrl)
    if (!bres.ok) throw new CharacterInterfaceError(`failed to fetch ${behaviorUrl}: HTTP ${bres.status}`)
    behavior = validateBehaviorProfile(await bres.json())
  } else {
    throw new CharacterInterfaceError('character has no behavior or behaviorFile')
  }

  const resolvedPack = document.packBase
    ? new URL(document.packBase, new URL(base, 'file:///')).toString().replace(/^fil<private-path> '')
    : undefined
  return { document, behavior, ...(resolvedPack ? { packBase: resolvedPack } : {}) }
}

/** Register a legacy hero.ts manifest as an object-type legacy character. */
export function registerLegacyManifest(registry: CharacterRegistry, manifest: Record<string, unknown>, id?: string): LoadedCharacter {
  const document = legacyManifestToCharacter(manifest, id)
  const behavior = document.behavior
  if (!behavior) throw new CharacterInterfaceError('legacy conversion produced no behavior')
  return registry.register({ document, behavior, ...(typeof manifest.__base === 'string' ? { packBase: manifest.__base } : {}) })
}

/** Resolve a state's tag through the character pack fallback chain (no cycles, depth <= 3). */
export function resolveFallbackTag(tag: string, available: Set<string>, fallback: Record<string, string[]>): string | null {
  if (available.has(tag)) return tag
  const seen = new Set<string>([tag])
  let frontier = fallback[tag] ?? []
  for (let depth = 0; depth < 3; depth++) {
    const next: string[] = []
    for (const candidate of frontier) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      if (available.has(candidate)) return candidate
      next.push(...(fallback[candidate] ?? []))
    }
    if (next.length === 0) return null
    frontier = next
  }
  return null
}

export interface LoadedCharacterV03 {
  document: CharacterDocumentV03
  behavior: BehaviorProfileV03
  voiceLines?: VoiceLineLibrary
  packBase?: string
}

/**
 * Load an FCI 0.3 preview character (document + behavior + optional voice-line
 * library) from a directory. This is deliberately separate from
 * `loadCharacter()` so the shipping 0.1/0.2 path cannot silently accept 0.3.
 */
export async function loadCharacterV03(
  characterDir: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedCharacterV03> {
  const base = characterDir.endsWith('/') ? characterDir : `${characterDir}/`
  const charUrl = new URL('character.json', new URL(base, 'file:///')).toString().replace(/^fil<private-path> '')
  const res = await fetcher(charUrl)
  if (!res.ok) throw new CharacterInterfaceError(`failed to fetch ${charUrl}: HTTP ${res.status}`)
  const rawDoc = (await res.json()) as unknown
  const rawBehavior = (rawDoc as { behavior?: unknown }).behavior
  const behavior = rawBehavior
    ? validateBehaviorProfileV03(rawBehavior)
    : await (async () => {
        const file = (rawDoc as { behaviorFile?: string }).behaviorFile
        if (!file) throw new CharacterInterfaceError('character has no behavior/behaviorFile')
        const url = new URL(file, new URL(charUrl, 'file:///')).toString().replace(/^fil<private-path> '')
        const bres = await fetcher(url)
        if (!bres.ok) throw new CharacterInterfaceError(`failed to fetch ${url}: HTTP ${bres.status}`)
        return validateBehaviorProfileV03(await bres.json())
      })()
  const document = validateCharacterDocumentV03(rawDoc, { behavior })

  let voiceLines: VoiceLineLibrary | undefined
  const linesFile = document.voice?.lines
  if (linesFile) {
    const url = new URL(linesFile, new URL(charUrl, 'file:///')).toString().replace(/^fil<private-path> '')
    const lres = await fetcher(url)
    if (!lres.ok) throw new CharacterInterfaceError(`failed to fetch ${url}: HTTP ${lres.status}`)
    voiceLines = validateVoiceLineLibrary(await lres.json())
  }
  const resolvedPack = document.packBase
    ? new URL(document.packBase, new URL(base, 'file:///')).toString().replace(/^fil<private-path> '')
    : undefined
  return { document, behavior, ...(voiceLines ? { voiceLines } : {}), ...(resolvedPack ? { packBase: resolvedPack } : {}) }
}
