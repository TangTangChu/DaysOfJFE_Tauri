import {
  CONTRACT_VERSION,
  SNAPSHOT_VERSION,
} from '../../shared/constants/version'
import type {
  EngineState,
  GalgameFacade,
  GameSettings,
  RuntimeSnapshot,
  SaveMeta,
  ScriptLoadInput,
  ScriptLoadResult,
  StoryEntry,
} from '../../shared/types/engine'
import { Runtime } from '../../engine/core/runtime'
import { parseScriptDocument } from '../../engine/script/parser'
import { validateScriptDocument } from '../../engine/script/validator'
import { compileScriptDocument } from '../../engine/script/compiler'
import { createDefaultSettings } from '../../engine/state/defaults'
import type { PersistenceApi } from '../../shared/types/engine'

function normalizeScriptSource(source: string): string {
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('/')
  ) {
    return source
  }
  return `/${source}`
}

async function sha256HexFromText(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return 'unsupported'
  }
  const bytes = new TextEncoder().encode(text)
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}

function mergeSettings(
  base: GameSettings,
  patch: Partial<GameSettings>,
): GameSettings {
  return {
    ...base,
    audio: { ...base.audio, ...(patch.audio ?? {}) },
    text: { ...base.text, ...(patch.text ?? {}) },
    transition: { ...base.transition, ...(patch.transition ?? {}) },
    input: { ...base.input, ...(patch.input ?? {}) },
    system: { ...base.system, ...(patch.system ?? {}) },
  }
}

export class GalgameFacadeImpl implements GalgameFacade {
  private readonly runtime = new Runtime()
  private readonly persistence: PersistenceApi
  private booted = false
  private scriptLoaded = false

  constructor(persistence: PersistenceApi) {
    this.persistence = persistence
  }

  async boot(): Promise<void> {
    if (this.booted) return

    try {
      const settings = await this.persistence.loadSettings()
      this.runtime.applySettings(settings)
    } catch {
      const defaults = createDefaultSettings()
      this.runtime.applySettings(defaults)
      await this.persistence.saveSettings(defaults)
    }

    this.booted = true
  }

  async shutdown(): Promise<void> {
    this.booted = false
  }

  async loadScript(input: ScriptLoadInput): Promise<ScriptLoadResult> {
    const raw = input.raw ?? (await this.fetchScript(input.source))
    if (!raw) {
      throw { code: 'SCRIPT_PARSE_ERROR', message: '脚本输入为空' }
    }

    const parsed = parseScriptDocument(raw)
    if (!parsed.document || parsed.errors.length > 0) {
      throw (
        parsed.errors[0] ?? {
          code: 'SCRIPT_PARSE_ERROR',
          message: '脚本解析失败',
        }
      )
    }

    const validateErrors = validateScriptDocument(parsed.document)
    if (validateErrors.length > 0) {
      throw validateErrors[0]
    }

    const compiled = compileScriptDocument(parsed.document)
    if (!compiled.ir || compiled.errors.length > 0) {
      throw (
        compiled.errors[0] ?? {
          code: 'SCRIPT_VALIDATE_ERROR',
          message: '脚本编译失败',
        }
      )
    }

    this.runtime.load(compiled.ir)
    this.scriptLoaded = true

    return {
      scriptId: compiled.ir.scriptId,
      title: compiled.ir.title,
      sceneCount: Object.keys(compiled.ir.sceneIndex).length,
      commandCount: compiled.ir.commandCount,
    }
  }

  async start(entry: StoryEntry): Promise<void> {
    this.ensureScript()
    await this.runtime.dispatch({ type: 'system.reset' })
    this.runtime.start(entry.sceneId, entry.commandId)
    await this.runtime.tick()
  }

  async restart(): Promise<void> {
    const state = this.runtime.getState()
    this.runtime.start(state.runtime.sceneId || undefined, undefined)
    await this.runtime.tick()
  }

  async next(): Promise<void> {
    await this.runtime.dispatch({ type: 'engine.next' })
  }

  async skipCurrent(): Promise<void> {
    await this.runtime.dispatch({ type: 'engine.skip.current' })
  }

  async setAutoMode(enabled: boolean): Promise<void> {
    await this.runtime.dispatch({ type: 'engine.auto.set', enabled })
  }

  async setFastForward(enabled: boolean): Promise<void> {
    await this.runtime.dispatch({ type: 'engine.fast_forward.set', enabled })
  }

  async setUiHidden(enabled: boolean): Promise<void> {
    await this.runtime.dispatch({ type: 'engine.ui_hidden.set', enabled })
  }

  async choose(optionId: string): Promise<void> {
    await this.runtime.dispatch({ type: 'choice.select', optionId })
  }

  async quickSave(slot = 0): Promise<SaveMeta> {
    return this.saveInternal(slot, 'quick')
  }

  async quickLoad(slot = 0): Promise<void> {
    await this.loadInternal(slot, 'quick')
  }

  async save(
    slot: number,
    kind: SaveMeta['kind'] = 'manual',
  ): Promise<SaveMeta> {
    return this.saveInternal(slot, kind)
  }

  async load(slot: number, kind: SaveMeta['kind'] = 'manual'): Promise<void> {
    await this.loadInternal(slot, kind)
  }

  async deleteSave(
    slot: number,
    kind: SaveMeta['kind'] = 'manual',
  ): Promise<void> {
    await this.persistence.deleteSaveSlot(slot, kind)
  }

  async listSaves(): Promise<SaveMeta[]> {
    return this.persistence.listSaveSlots()
  }

  async getSettings(): Promise<GameSettings> {
    return this.runtime.getSettings()
  }

  async patchSettings(patch: Partial<GameSettings>): Promise<GameSettings> {
    const merged = mergeSettings(this.runtime.getSettings(), patch)
    this.runtime.applySettings(merged)
    await this.persistence.saveSettings(merged)
    return merged
  }

  async resetSettings(): Promise<GameSettings> {
    const defaults = createDefaultSettings()
    this.runtime.applySettings(defaults)
    await this.persistence.saveSettings(defaults)
    return defaults
  }

  getState(): EngineState {
    return this.runtime.getState()
  }

  subscribe(
    listener: (event: import('../../shared/types/engine').EngineEvent) => void,
  ): () => void {
    return this.runtime.subscribe(listener)
  }

  async exportSnapshot(): Promise<RuntimeSnapshot> {
    const snapshot = this.runtime.snapshot()
    snapshot.contractVersion = CONTRACT_VERSION
    snapshot.snapshotVersion = SNAPSHOT_VERSION
    snapshot.checksum = await this.computeChecksum(snapshot)
    return snapshot
  }

  async importSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    await this.runtime.restore(snapshot)
  }

  private async saveInternal(
    slot: number,
    kind: SaveMeta['kind'],
  ): Promise<SaveMeta> {
    const snapshot = this.runtime.snapshot()
    snapshot.contractVersion = CONTRACT_VERSION
    snapshot.snapshotVersion = SNAPSHOT_VERSION
    snapshot.checksum = await this.computeChecksum(snapshot)

    const state = this.runtime.getState()
    const sceneTitle = state.runtime.sceneId || 'Unknown Scene'

    return this.persistence.saveSnapshot({
      slot,
      kind,
      encoding: 'json',
      meta: {
        title: state.runtime.scriptId || 'Untitled',
        sceneTitle,
        timestamp: Date.now(),
        playTimeSec: 0,
        screenshotRef: undefined,
      },
      snapshot,
    })
  }

  private async loadInternal(
    slot: number,
    kind: SaveMeta['kind'],
  ): Promise<void> {
    const loaded = await this.persistence.loadSnapshot({ slot, kind })
    await this.runtime.restore(loaded.snapshot)
  }

  private async fetchScript(source?: string): Promise<string> {
    if (!source) return ''
    const normalized = normalizeScriptSource(source)
    const response = await fetch(normalized)
    if (!response.ok) {
      throw {
        code: 'SCRIPT_PARSE_ERROR',
        message: `脚本读取失败: ${normalized}`,
      }
    }
    return response.text()
  }

  private async computeChecksum(snapshot: RuntimeSnapshot): Promise<string> {
    const raw = JSON.stringify({
      engine: snapshot.engine,
      history: snapshot.history,
      createdAt: snapshot.createdAt,
      buildId: snapshot.buildId,
    })
    return sha256HexFromText(raw)
  }

  private ensureScript(): void {
    if (!this.scriptLoaded) {
      throw {
        code: 'RUNTIME_ILLEGAL_STATE',
        message: '尚未加载脚本',
      }
    }
  }
}
