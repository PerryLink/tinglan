/**
 * FCI 0.3 presentation adapter: resolve a voice-line id to subtitle text and
 * an optional declared audio asset. No audio is generated or fetched from the
 * network; playback only happens if the pack ships a declared local asset.
 */
import type { AudioAsset, CharacterDocumentV03, VoiceLineLibrary } from './v03.ts'

export interface ResolvedVoiceLine {
  lineId: string
  text: string
  lang?: string
  audioPath?: string
  durationMs?: number
}

export function resolveVoiceLine(
  document: CharacterDocumentV03,
  library: VoiceLineLibrary | undefined,
  lineId: string,
  baseUrl = '',
): ResolvedVoiceLine | undefined {
  const line = library?.lines[lineId]
  if (!line) return undefined
  let audioPath: string | undefined
  if (line.audio) {
    const asset: AudioAsset | undefined = (document.audio ?? []).find((entry) => entry.id === line.audio && entry.kind === 'voice')
    if (asset) {
      const base = new URL(baseUrl || '/', 'http://local/')
      const resolved = new URL(asset.path, base)
      audioPath = resolved.origin === 'http://local' ? `${resolved.pathname}${resolved.search}` : resolved.toString()
    }
  }
  return {
    lineId,
    text: line.text,
    ...(line.lang ? { lang: line.lang } : {}),
    ...(audioPath ? { audioPath } : {}),
    ...(line.durationMs !== undefined ? { durationMs: line.durationMs } : {}),
  }
}

export interface VoicePresenterOptions {
  document: CharacterDocumentV03
  library?: VoiceLineLibrary
  baseUrl?: string
  /** Called for every line (muted or not) so subtitles survive mute. */
  onSubtitle?: (line: ResolvedVoiceLine) => void
  /** Injectable for tests; defaults to HTMLAudioElement in a browser. */
  audioFactory?: (src: string) => { play: () => Promise<void>; pause?: () => void }
}

export class VoicePresenter03 {
  private readonly options: VoicePresenterOptions
  constructor(options: VoicePresenterOptions) {
    this.options = options
  }

  resolve(lineId: string): ResolvedVoiceLine | undefined {
    return resolveVoiceLine(this.options.document, this.options.library, lineId, this.options.baseUrl)
  }

  /** Show subtitles and play the declared local audio if present and unmuted. */
  async present(lineId: string, options: { muted?: boolean } = {}): Promise<ResolvedVoiceLine | undefined> {
    const line = this.resolve(lineId)
    if (!line) return undefined
    this.options.onSubtitle?.(line)
    if (options.muted === true || !line.audioPath) return line
    const factory = this.options.audioFactory ?? (typeof Audio === 'undefined' ? undefined : (src: string) => new Audio(src))
    if (!factory) return line
    try {
      await factory(line.audioPath).play()
    } catch {
      // Autoplay/blocked/missing asset: subtitle already delivered; fail soft.
    }
    return line
  }
}
