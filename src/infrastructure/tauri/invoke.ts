import { invoke } from '@tauri-apps/api/core'
import type { EngineError } from '../../shared/types/engine'

export async function invokeSafe<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const wrapped: EngineError = {
      code: 'RUNTIME_ILLEGAL_STATE',
      message,
      detail: {
        command,
      },
    }
    throw wrapped
  }
}
