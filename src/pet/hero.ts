/**
 * Minimal hero-pixel renderer for the pet window / Famling shells.
 *
 * The renderer owns pixels only: no kernel, save, voice, DOM chrome or business
 * logic. It follows the CharacterRenderer contract in Famling `PLATFORM.md`:
 * load(pack), play(tag), setExpression, setMouth, setPosition, hitTest, destroy.
 */
export type CharacterStyle = 'pixel-hero' | 'pixel-micro' | 'hd-chibi'
export type CharacterPhase = '1a' | '1b' | 'later'
export type PixelScale = 1 | 2

export interface CharacterTag {
  frames: number
  fps: number
  loop: boolean
  /** Production phase; `deferred`/later tags still have placeholder frames. */
  phase?: CharacterPhase
}

export interface CharacterPackData {
  id: string
  style: CharacterStyle
  canvas: [number, number]
  anchor: { x: number; y: number; mode: string }
  footBox: { x: number; y: number; w: number; h: number }
  palette: string
  tags: Record<string, CharacterTag>
  assets: string[]
  license: string
  ai: { status: 'none' | 'concept' | 'final'; tool?: string }
  placeholder?: boolean
  sourceSpec?: string
  generator?: string
}

export interface LoadedCharacterPack extends CharacterPackData {
  baseUrl: string
  assetUrls: string[]
  /** asset URLs grouped by tag, in tag insertion order. */
  framesByTag: Record<string, string[]>
}

export class CharacterPackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CharacterPackError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CharacterPackError(`${what} must be an object`)
  return value
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new CharacterPackError(`${what} must be a non-empty string`)
  return value
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CharacterPackError(`${what} must be a finite number`)
  return value
}

function requirePositiveInt(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new CharacterPackError(`${what} must be a positive integer`)
  }
  return value
}

const STYLES: CharacterStyle[] = ['pixel-hero', 'pixel-micro', 'hd-chibi']
const PHASES: CharacterPhase[] = ['1a', '1b', 'later']
const AI_STATUSES: CharacterPackData['ai']['status'][] = ['none', 'concept', 'final']
export const EXPRESSIONS = ['calm', 'pleased', 'happy', 'sleepy', 'surprised', 'listening'] as const
export type Expression = (typeof EXPRESSIONS)[number]

export function validateCharacterPack(value: unknown): CharacterPackData {
  const raw = requireRecord(value, 'character pack')
  const id = requireString(raw.id, 'pack.id')
  const style = requireString(raw.style, 'pack.style') as CharacterStyle
  if (!STYLES.includes(style)) throw new CharacterPackError(`unsupported pack.style: ${style}`)
  const canvasRaw = raw.canvas
  if (!Array.isArray(canvasRaw) || canvasRaw.length !== 2) throw new CharacterPackError('pack.canvas must be [width,height]')
  const canvas: [number, number] = [requirePositiveInt(canvasRaw[0], 'pack.canvas[0]'), requirePositiveInt(canvasRaw[1], 'pack.canvas[1]')]
  const anchorRaw = requireRecord(raw.anchor, 'pack.anchor')
  const anchor = {
    x: requireFinite(anchorRaw.x, 'pack.anchor.x'),
    y: requireFinite(anchorRaw.y, 'pack.anchor.y'),
    mode: requireString(anchorRaw.mode, 'pack.anchor.mode'),
  }
  const footRaw = requireRecord(raw.footBox, 'pack.footBox')
  const footBox = {
    x: requireFinite(footRaw.x, 'pack.footBox.x'),
    y: requireFinite(footRaw.y, 'pack.footBox.y'),
    w: requireFinite(footRaw.w, 'pack.footBox.w'),
    h: requireFinite(footRaw.h, 'pack.footBox.h'),
  }
  const palette = requireString(raw.palette, 'pack.palette')
  const tagsRaw = requireRecord(raw.tags, 'pack.tags')
  const tagNames = Object.keys(tagsRaw)
  if (tagNames.length === 0) throw new CharacterPackError('pack.tags must not be empty')
  const tags: Record<string, CharacterTag> = {}
  let totalFrames = 0
  for (const name of tagNames) {
    const tagRaw = requireRecord(tagsRaw[name], `pack.tags.${name}`)
    const frames = requirePositiveInt(tagRaw.frames, `pack.tags.${name}.frames`)
    const fps = requireFinite(tagRaw.fps, `pack.tags.${name}.fps`)
    if (fps < 0) throw new CharacterPackError(`pack.tags.${name}.fps must be >= 0`)
    if (typeof tagRaw.loop !== 'boolean') throw new CharacterPackError(`pack.tags.${name}.loop must be boolean`)
    const tag: CharacterTag = { frames, fps, loop: tagRaw.loop }
    if (tagRaw.phase !== undefined) {
      const phase = requireString(tagRaw.phase, `pack.tags.${name}.phase`) as CharacterPhase
      if (!PHASES.includes(phase)) throw new CharacterPackError(`unsupported pack.tags.${name}.phase: ${phase}`)
      tag.phase = phase
    }
    tags[name] = tag
    totalFrames += frames
  }
  if (!Array.isArray(raw.assets) || raw.assets.length === 0) throw new CharacterPackError('pack.assets must be a non-empty array')
  const assets = raw.assets.map((asset, index) => requireString(asset, `pack.assets[${index}]`))
  if (assets.length !== totalFrames) {
    throw new CharacterPackError(`pack.assets length ${assets.length} != total tag frames ${totalFrames}`)
  }
  const license = requireString(raw.license, 'pack.license')
  const aiRaw = requireRecord(raw.ai, 'pack.ai')
  const status = requireString(aiRaw.status, 'pack.ai.status') as CharacterPackData['ai']['status']
  if (!AI_STATUSES.includes(status)) throw new CharacterPackError(`unsupported pack.ai.status: ${status}`)
  const ai: CharacterPackData['ai'] = { status }
  if (aiRaw.tool !== undefined) ai.tool = requireString(aiRaw.tool, 'pack.ai.tool')
  return {
    id,
    style,
    canvas,
    anchor,
    footBox,
    palette,
    tags,
    assets,
    license,
    ai,
    ...(raw.placeholder === true ? { placeholder: true } : {}),
    ...(typeof raw.sourceSpec === 'string' ? { sourceSpec: raw.sourceSpec } : {}),
    ...(typeof raw.generator === 'string' ? { generator: raw.generator } : {}),
  }
}

/**
 * Build the runtime form of an already-validated pack without fetching its
 * manifest. Additive adapter used by the first-party render-plugin layer
 * (`src/pet/render/hero-backend.ts`) when the host has already parsed and
 * validated the pack JSON; `loadCharacterPack()` keeps the same behaviour.
 */
export function describeCharacterPack(data: CharacterPackData, baseUrl: string): LoadedCharacterPack {
  const base = baseUrl.replace(/\/+$/, '')
  const assetUrls = data.assets.map((asset) => new URL(asset, `${base}/`).toString())
  const framesByTag: Record<string, string[]> = {}
  let cursor = 0
  for (const [tag, meta] of Object.entries(data.tags)) {
    framesByTag[tag] = assetUrls.slice(cursor, cursor + meta.frames)
    cursor += meta.frames
  }
  return { ...data, baseUrl: base, assetUrls, framesByTag }
}

export async function loadCharacterPack(baseUrl: string, fetcher: typeof fetch = fetch): Promise<LoadedCharacterPack> {
  const base = baseUrl.replace(/\/+$/, '')
  const response = await fetcher(`${base}/manifest.json`)
  if (!response.ok) throw new CharacterPackError(`failed to load pack manifest: HTTP ${response.status}`)
  const data = validateCharacterPack((await response.json()) as unknown)
  return describeCharacterPack(data, base)
}

export function resolveTag(pack: CharacterPackData, tag: string): CharacterTag {
  const meta = pack.tags[tag]
  if (!meta) throw new CharacterPackError(`unknown tag: ${tag}`)
  return meta
}

export function assertIntegerScale(scale: number): asserts scale is PixelScale {
  if (scale !== 1 && scale !== 2) throw new CharacterPackError(`display scale must be integer 1 or 2, got ${scale}`)
}

/** Frame index for elapsed milliseconds at a tag's fps; non-looping tags clamp on the last frame. */
export function frameIndexFor(meta: CharacterTag, elapsedMs: number, loop = meta.loop): number {
  const frames = Math.max(1, meta.frames)
  if (frames === 1) return 0
  const elapsed = Math.max(0, elapsedMs)
  const offset = Math.floor((elapsed / 1000) * meta.fps)
  if (loop) return ((offset % frames) + frames) % frames
  return Math.min(frames - 1, offset)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new CharacterPackError(`failed to load frame: ${url}`))
    image.src = url
  })
}

export class CharacterRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private pack: LoadedCharacterPack | null = null
  private imagesByTag: Map<string, HTMLImageElement[]> | null = null
  private currentTag: string | null = null
  private currentFrame = 0
  private loop = true
  private speed = 1
  private startedAt = 0
  private raf: number | null = null
  private scale: PixelScale
  private expression: Expression = 'calm'
  private mouth = 0
  private position = { x: 0, y: 0 }
  private sampleCanvas: HTMLCanvasElement | null = null

  constructor(canvas: HTMLCanvasElement, options: { scale?: PixelScale } = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new CharacterPackError('canvas 2d context unavailable')
    this.canvas = canvas
    this.ctx = context
    this.scale = options.scale ?? 2
    assertIntegerScale(this.scale)
    canvas.style.imageRendering = 'pixelated'
  }

  async load(pack: LoadedCharacterPack): Promise<void> {
    const images = await Promise.all(pack.assetUrls.map((url) => loadImage(url)))
    const byTag = new Map<string, HTMLImageElement[]>()
    let cursor = 0
    for (const [tag, meta] of Object.entries(pack.tags)) {
      byTag.set(tag, images.slice(cursor, cursor + meta.frames))
      cursor += meta.frames
    }
    this.pack = pack
    this.imagesByTag = byTag
    this.currentTag = Object.keys(pack.tags)[0] ?? null
    this.currentFrame = 0
    this.resize()
    this.renderFrame(0)
  }

  async play(tag: string, options: { loop?: boolean; speed?: number } = {}): Promise<void> {
    if (!this.pack || !this.imagesByTag) throw new CharacterPackError('load(pack) before play(tag)')
    const meta = resolveTag(this.pack, tag)
    if (!this.imagesByTag.has(tag)) throw new CharacterPackError(`tag has no frames: ${tag}`)
    this.currentTag = tag
    this.loop = options.loop ?? meta.loop
    this.speed = options.speed ?? 1
    this.startedAt = performance.now()
    this.currentFrame = 0
    this.renderFrame(0)
    this.stop()
    const tick = (now: number): void => {
      if (!this.pack || !this.currentTag) return
      const currentMeta = resolveTag(this.pack, this.currentTag)
      const frame = frameIndexFor(currentMeta, (now - this.startedAt) * this.speed, this.loop)
      if (frame !== this.currentFrame) {
        this.currentFrame = frame
        this.renderFrame(frame)
      }
      if (!this.loop && frame >= currentMeta.frames - 1) {
        this.raf = null
        return
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  /** Draw one still frame without starting the animation loop (Look Test/QA). */
  renderStill(tag: string, frame = 0): void {
    if (!this.pack || !this.imagesByTag) throw new CharacterPackError('load(pack) before renderStill(tag)')
    const meta = resolveTag(this.pack, tag)
    if (!this.imagesByTag.has(tag)) throw new CharacterPackError(`tag has no frames: ${tag}`)
    this.currentTag = tag
    this.currentFrame = Math.max(0, Math.min(meta.frames - 1, Math.floor(frame)))
    this.resize()
    this.renderFrame(this.currentFrame)
  }

  setScale(scale: PixelScale): void {
    assertIntegerScale(scale)
    this.scale = scale
    if (this.pack) this.resize()
    this.renderFrame(this.currentFrame)
  }

  getScale(): PixelScale {
    return this.scale
  }

  setExpression(name: string): void {
    if (!(EXPRESSIONS as readonly string[]).includes(name)) throw new CharacterPackError(`unknown expression: ${name}`)
    this.expression = name as Expression
  }

  getExpression(): Expression {
    return this.expression
  }

  setMouth(level: number): void {
    if (!Number.isFinite(level)) throw new CharacterPackError('mouth level must be finite')
    this.mouth = Math.max(0, Math.min(1, level))
  }

  setPosition(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new CharacterPackError('position must be finite')
    this.position = { x, y }
    this.canvas.style.transform = `translate(${x}px, ${y}px)`
  }

  /** Alpha hit test in CSS pixels relative to the canvas top-left. */
  hitTest(x: number, y: number): boolean {
    if (!this.imagesByTag || !this.currentTag) return false
    const frames = this.imagesByTag.get(this.currentTag)
    const image = frames?.[this.currentFrame]
    if (!image) return false
    const artX = Math.floor(x / this.scale)
    const artY = Math.floor(y / this.scale)
    if (!this.pack) return false
    const [width, height] = this.pack.canvas
    if (artX < 0 || artY < 0 || artX >= width || artY >= height) return false
    const sample = this.ensureSampleCanvas()
    const sampleCtx = sample.getContext('2d')
    if (!sampleCtx) return false
    sampleCtx.clearRect(0, 0, width, height)
    sampleCtx.drawImage(image, 0, 0)
    return sampleCtx.getImageData(artX, artY, 1, 1).data[3]! > 0
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
  }

  destroy(): void {
    this.stop()
    this.imagesByTag = null
    this.pack = null
    this.canvas.width = 0
    this.canvas.height = 0
  }

  private ensureSampleCanvas(): HTMLCanvasElement {
    if (!this.sampleCanvas) this.sampleCanvas = document.createElement('canvas')
    if (!this.pack) return this.sampleCanvas
    if (this.sampleCanvas.width !== this.pack.canvas[0] || this.sampleCanvas.height !== this.pack.canvas[1]) {
      this.sampleCanvas.width = this.pack.canvas[0]
      this.sampleCanvas.height = this.pack.canvas[1]
    }
    return this.sampleCanvas
  }

  private resize(): void {
    if (!this.pack) return
    this.canvas.width = this.pack.canvas[0] * this.scale
    this.canvas.height = this.pack.canvas[1] * this.scale
    this.canvas.style.width = `${this.canvas.width}px`
    this.canvas.style.height = `${this.canvas.height}px`
    this.ctx.imageSmoothingEnabled = false
  }

  private renderFrame(index: number): void {
    if (!this.pack || !this.currentTag || !this.imagesByTag) return
    const frame = this.imagesByTag.get(this.currentTag)?.[index]
    if (!frame) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.imageSmoothingEnabled = false
    this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
  }
}
