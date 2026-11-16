/**
 * `SceneStore` persistence adapter — the save boundary for the scene runtime.
 *
 * The runtime never touches `kernel/save.ts`, `voice` or Rust directly. A host
 * plugs in a `SceneStore`; this round only ships the deterministic in-memory
 * adapter, which is enough for tests and for wiring a UI preview.
 *
 * Future Tauri adapter (NOT wired in this round, and no Rust changes needed):
 *
 * ```ts
 * class TauriSaveSlotStore implements SceneStore {
 *   constructor(private readonly slot = 'pet-scene') {}
 *   async write(snapshot: SceneSnapshot): Promise<void> {
 *     await invoke('write_save', { slot: this.slot, text: JSON.stringify(snapshot) })
 *   }
 *   async read(): Promise<SceneSnapshot | null> {
 *     const text = await invoke<string>('read_save', { slot: this.slot, backup: true })
 *     return text ? (JSON.parse(text) as SceneSnapshot) : null
 *   }
 * }
 * ```
 *
 * Slot naming follows the existing Rust `write_save/read_save` contract (slots
 * are `safe_slug`-validated): `pet-scene` for the layout/scene index (this
 * snapshot) and optionally `pet_<objectId>` for per-object payloads. The
 * envelope/cipher stays in the existing save layer — `SceneStore` only sees a
 * plain JSON snapshot, so the boundary is orthogonal to DPAPI/WebCrypto.
 */
import type { SceneSnapshot, SceneStore } from './types.ts'

/** Deep clone so callers can never mutate a stored snapshot by reference. */
export function cloneSnapshot(snapshot: SceneSnapshot): SceneSnapshot {
  return structuredClone(snapshot)
}

/** Deterministic in-memory store with one slot (default adapter for tests/UI). */
export class MemorySceneStore implements SceneStore {
  private snapshot: SceneSnapshot | null

  constructor(initial?: SceneSnapshot) {
    this.snapshot = initial ? cloneSnapshot(initial) : null
  }

  async write(snapshot: SceneSnapshot): Promise<void> {
    this.snapshot = cloneSnapshot(snapshot)
  }

  async read(): Promise<SceneSnapshot | null> {
    return this.snapshot ? cloneSnapshot(this.snapshot) : null
  }

  /** Test/UI helper: drop the stored snapshot. */
  clear(): void {
    this.snapshot = null
  }
}
