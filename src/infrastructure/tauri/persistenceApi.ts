import type {
  ExportSaveInput,
  GameSettings,
  ImportSaveInput,
  PersistenceApi,
  SaveMeta,
  SaveSnapshotLoadInput,
  SaveSnapshotLoadOutput,
  SaveSnapshotWriteInput,
} from '../../shared/types/engine'
import { invokeSafe } from './invoke'

export class TauriPersistenceApi implements PersistenceApi {
  async loadSettings(): Promise<GameSettings> {
    return invokeSafe<GameSettings>('load_settings')
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    await invokeSafe<void>('save_settings', { settings })
  }

  async listSaveSlots(): Promise<SaveMeta[]> {
    return invokeSafe<SaveMeta[]>('list_save_slots')
  }

  async saveSnapshot(input: SaveSnapshotWriteInput): Promise<SaveMeta> {
    const output = await invokeSafe<{ meta: SaveMeta }>('save_snapshot', {
      input,
    })
    return output.meta
  }

  async loadSnapshot(
    input: SaveSnapshotLoadInput,
  ): Promise<SaveSnapshotLoadOutput> {
    return invokeSafe<SaveSnapshotLoadOutput>('load_snapshot', { input })
  }

  async deleteSaveSlot(slot: number, kind?: SaveMeta['kind']): Promise<void> {
    await invokeSafe<void>('delete_save_slot', { slot, kind })
  }

  async exportSave(input: ExportSaveInput): Promise<string> {
    return invokeSafe<string>('export_save', { input })
  }

  async importSave(input: ImportSaveInput): Promise<SaveMeta[]> {
    return invokeSafe<SaveMeta[]>('import_save', { input })
  }
}
