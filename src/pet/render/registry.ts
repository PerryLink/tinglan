/**
 * Renderer plugin registry — resolves pack formats to first-party renderer
 * plugins and creates backend instances.
 *
 * Design rules (render API v1.2 / FCI v0.2):
 * - Only first-party plugins can be registered (see `RendererPlugin` docs):
 *   character packs are data and can never register renderer code.
 * - `apiVersion` is negotiated: MAJOR must match exactly, an explicit MINOR
 *   must fall inside the host window (`RENDER_API_HOST_VERSION`), and the
 *   legacy bare-integer MAJOR declaration stays accepted.
 * - Optional `formats` acts as an allow-list consulted *before* `match()`, and
 *   `formats()` exposes the union so hosts can validate character
 *   `render.format` values against the registered renderer set.
 * - Optional `capabilities` is validated at registration and cross-checked
 *   against the created backend (e.g. `hitTest: true` must be implemented).
 * - At most one plugin may match a pack. Overlaps are a programming error in
 *   the host's plugin list, so they surface as `RendererConflictError` instead
 *   of a silent priority order (deterministic scenes matter for tests/demos).
 * - Unknown packs get `UnknownPackError` with the pack id/format plus the
 *   registered plugin ids and declared formats, so a bad pack URL or a missing
 *   Live2D/Spine plugin is debuggable without a debugger.
 */
import {
  RENDER_API_HOST_VERSION,
  RENDERER_CAPABILITY_KEYS,
  RendererConflictError,
  RendererRegistryError,
  UnknownPackError,
  assertRenderPackRef,
  explainRenderApiCompatibility,
  type RenderBackend,
  type RenderPackRef,
  type RendererPlugin,
} from './types.ts'

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const PACK_FORMAT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively enforce JSON data-only shape (capability paramsSchema is data). */
function assertJsonData(value: unknown, path: string): void {
  if (value === null) return
  const type = typeof value
  if (type === 'string' || type === 'boolean') return
  if (type === 'number') {
    if (!Number.isFinite(value as number)) throw new RendererRegistryError(`${path} must contain finite JSON numbers, got ${String(value)}`)
    return
  }
  if (type === 'function' || type === 'undefined' || type === 'symbol' || type === 'bigint') {
    throw new RendererRegistryError(`${path} must be JSON data (found ${type}); renderer metadata cannot carry code`)
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertJsonData(child, `${path}[${index}]`))
    return
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) assertJsonData(child, `${path}.${key}`)
    return
  }
  throw new RendererRegistryError(`${path} must be JSON data`)
}

/** Render API version errors are registry errors so hosts can catch one type. */
function assertPluginApiVersion(id: string, version: unknown): void {
  const compatibility = explainRenderApiCompatibility(version)
  if (!compatibility.compatible) {
    throw new RendererRegistryError(
      `renderer plugin "${id}" render apiVersion ${typeof version === 'string' ? JSON.stringify(version) : String(version)} is incompatible with host ${RENDER_API_HOST_VERSION}: ${compatibility.reason}`,
    )
  }
}

function assertPluginFormats(id: string, formats: unknown): void {
  if (formats === undefined) return
  if (!Array.isArray(formats) || formats.length === 0) {
    throw new RendererRegistryError(`renderer plugin "${id}" formats must be a non-empty array of pack format strings`)
  }
  const seen = new Set<string>()
  for (const format of formats) {
    if (typeof format !== 'string' || !PACK_FORMAT_PATTERN.test(format)) {
      throw new RendererRegistryError(
        `renderer plugin "${id}" declares invalid format ${typeof format === 'string' ? JSON.stringify(format) : typeof format}; formats must match ${String(PACK_FORMAT_PATTERN)}`,
      )
    }
    if (seen.has(format)) throw new RendererRegistryError(`renderer plugin "${id}" declares duplicate format "${format}"`)
    seen.add(format)
  }
}

function assertPluginCapabilities(id: string, capabilities: unknown): void {
  if (capabilities === undefined) return
  if (!isRecord(capabilities)) throw new RendererRegistryError(`renderer plugin "${id}" capabilities must be an object`)
  for (const key of Object.keys(capabilities)) {
    if (!(RENDERER_CAPABILITY_KEYS as readonly string[]).includes(key)) {
      throw new RendererRegistryError(
        `renderer plugin "${id}" declares unknown capability "${key}"; allowed: [${RENDERER_CAPABILITY_KEYS.join(', ')}]`,
      )
    }
  }
  for (const key of ['offscreenComposite', 'hitTest'] as const) {
    const value = capabilities[key]
    if (value !== undefined && typeof value !== 'boolean') {
      throw new RendererRegistryError(`renderer plugin "${id}" capabilities.${key} must be boolean`)
    }
  }
  if (capabilities.paramsSchema !== undefined) {
    if (!isRecord(capabilities.paramsSchema)) {
      throw new RendererRegistryError(`renderer plugin "${id}" capabilities.paramsSchema must be a JSON object`)
    }
    assertJsonData(capabilities.paramsSchema, `renderer plugin "${id}" capabilities.paramsSchema`)
  }
}

/**
 * Plugin registry. Instantiate once per host (or per scene) with the audited
 * first-party plugins, then resolve packs to plugins and create backends.
 *
 * ```ts
 * const registry = new RendererRegistry([heroRendererPlugin])
 * const plugin = registry.resolve(packRef)   // throws for unknown/ambiguous packs
 * const backend = plugin.create()            // cheap; load(pack) does the I/O
 * registry.formats()                         // -> ['hd-chibi','pixel-hero','pixel-micro']
 * ```
 */
export class RendererRegistry {
  private readonly plugins = new Map<string, RendererPlugin>()

  constructor(plugins: readonly RendererPlugin[] = []) {
    for (const plugin of plugins) this.register(plugin)
  }

  /**
   * Register a first-party plugin. Rejects:
   * - malformed/duplicate plugin ids,
   * - incompatible render API versions (MAJOR exact, MINOR window; see
   *   `RENDER_API_HOST_VERSION`),
   * - non-first-party origins (character packs must stay data-only),
   * - malformed `formats`/`capabilities` declarations,
   * - objects that do not implement `match()`/`create()`.
   */
  register(plugin: RendererPlugin): this {
    if (typeof plugin !== 'object' || plugin === null) {
      throw new RendererRegistryError('renderer plugin must be an object')
    }
    const id = plugin.id
    if (typeof id !== 'string' || !PLUGIN_ID_PATTERN.test(id)) {
      throw new RendererRegistryError(`renderer plugin id must match ${String(PLUGIN_ID_PATTERN)}, got ${typeof id === 'string' ? JSON.stringify(id) : typeof id}`)
    }
    assertPluginApiVersion(id, plugin.apiVersion)
    if (plugin.origin !== 'first-party') {
      throw new RendererRegistryError(
        `renderer plugin "${id}" is not first-party host code (origin=${String(plugin.origin)}); character packs must stay data-only`,
      )
    }
    if (typeof plugin.match !== 'function' || typeof plugin.create !== 'function') {
      throw new RendererRegistryError(`renderer plugin "${id}" must implement match(pack) and create()`)
    }
    assertPluginFormats(id, plugin.formats)
    assertPluginCapabilities(id, plugin.capabilities)
    if (this.plugins.has(id)) {
      throw new RendererRegistryError(`duplicate renderer plugin id: "${id}"`)
    }
    this.plugins.set(id, plugin)
    return this
  }

  /** Remove a plugin (host shutdown/plugin reload); returns whether it existed. */
  unregister(id: string): boolean {
    return this.plugins.delete(id)
  }

  has(id: string): boolean {
    return this.plugins.has(id)
  }

  /** Look up one registered plugin by id (diagnostics; throws when unknown). */
  get(id: string): RendererPlugin {
    const plugin = this.plugins.get(id)
    if (!plugin) throw new RendererRegistryError(`unknown renderer plugin: "${id}"`)
    return plugin
  }

  /** Registered plugins in registration order. */
  list(): RendererPlugin[] {
    return [...this.plugins.values()]
  }

  /**
   * Declared pack formats across registered plugins, sorted and de-duplicated.
   *
   * Hosts pass this to `validateCharacterDocument({ renderFormats })` so a
   * character can only select a format an actual renderer declares. Plugins
   * that only use `match()` (no `formats`) are not represented here.
   */
  formats(): string[] {
    const declared = new Set<string>()
    for (const plugin of this.plugins.values()) {
      for (const format of plugin.formats ?? []) declared.add(format)
    }
    return [...declared].sort()
  }

  /** Clear all plugins. */
  clear(): void {
    this.plugins.clear()
  }

  /**
   * Resolve the single plugin that claims `pack`.
   *
   * A plugin with declared `formats` is considered only when the pack format
   * is in that list; it must still return true from `match()`. Plugins without
   * `formats` are asked `match()` directly (legacy behaviour).
   *
   * @throws {UnknownPackError} no plugin matches (unknown format) or the ref is malformed
   * @throws {RendererConflictError} more than one plugin matches
   * @throws {RendererRegistryError} a plugin's `match()` throws
   */
  resolve(pack: RenderPackRef): RendererPlugin {
    const ref = assertRenderPackRef(pack)
    const matches: RendererPlugin[] = []
    for (const plugin of this.plugins.values()) {
      if (plugin.formats !== undefined && !plugin.formats.includes(ref.format)) continue
      let matched: boolean
      try {
        matched = plugin.match(ref) === true
      } catch (error) {
        throw new RendererRegistryError(
          `renderer plugin "${plugin.id}" match() threw for pack "${ref.id}" (format "${ref.format}"): ${messageOf(error)}`,
          { cause: error },
        )
      }
      if (matched) matches.push(plugin)
    }
    const first = matches[0]
    if (!first) {
      const registered = this.list().map((plugin) => plugin.id)
      const formats = this.formats()
      throw new UnknownPackError(
        `no renderer plugin matches pack "${ref.id}" (format "${ref.format}"); ` +
          `registered plugins: [${registered.length > 0 ? registered.join(', ') : 'none'}]; ` +
          `registered formats: [${formats.length > 0 ? formats.join(', ') : 'none'}]`,
      )
    }
    if (matches.length > 1) {
      throw new RendererConflictError(
        `pack "${ref.id}" (format "${ref.format}") matched multiple renderer plugins: [${matches.map((plugin) => plugin.id).join(', ')}]; match() must be exclusive`,
      )
    }
    return first
  }

  /**
   * Resolve `pack` and create a backend from the winning plugin.
   *
   * The returned backend is *not* loaded; call `backend.load(pack)` before the
   * first render. A host that renders several actors from the same plugin
   * should create one backend per plugin (not per actor) and cache it.
   */
  create(pack: RenderPackRef): RenderBackend {
    const plugin = this.resolve(pack)
    let backend: RenderBackend
    try {
      backend = plugin.create()
    } catch (error) {
      throw new RendererRegistryError(
        `renderer plugin "${plugin.id}" create() failed: ${messageOf(error)}`,
        { cause: error },
      )
    }
    if (
      typeof backend !== 'object' ||
      backend === null ||
      typeof backend.id !== 'string' ||
      backend.id.length === 0 ||
      typeof backend.load !== 'function' ||
      typeof backend.render !== 'function' ||
      typeof backend.dispose !== 'function'
    ) {
      throw new RendererRegistryError(`renderer plugin "${plugin.id}" create() returned an invalid RenderBackend`)
    }
    const compatibility = explainRenderApiCompatibility(backend.apiVersion)
    if (!compatibility.compatible) {
      throw new RendererRegistryError(
        `renderer plugin "${plugin.id}" created backend "${backend.id}" with incompatible render apiVersion ` +
          `${typeof backend.apiVersion === 'string' ? JSON.stringify(backend.apiVersion) : String(backend.apiVersion)} ` +
          `(host ${RENDER_API_HOST_VERSION}): ${compatibility.reason}`,
      )
    }
    if (backend.hitTest !== undefined && typeof backend.hitTest !== 'function') {
      throw new RendererRegistryError(`renderer plugin "${plugin.id}" created backend "${backend.id}" with a non-function hitTest`)
    }
    if (plugin.capabilities?.hitTest === true && typeof backend.hitTest !== 'function') {
      throw new RendererRegistryError(
        `renderer plugin "${plugin.id}" advertises capabilities.hitTest=true but its backend "${backend.id}" does not implement hitTest()`,
      )
    }
    return backend
  }
}
