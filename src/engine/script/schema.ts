import type { JsonValue } from '../../shared/types/engine'

export type ScriptCommandType =
  | 'narration'
  | 'dialogue'
  | 'clear_dialogue'
  | 'bg_set'
  | 'char_show'
  | 'char_hide'
  | 'char_pose'
  | 'layer_set'
  | 'choice_show'
  | 'jump'
  | 'branch'
  | 'label'
  | 'call'
  | 'return'
  | 'end'
  | 'set'
  | 'inc'
  | 'dec'
  | 'expr'
  | 'bgm_play'
  | 'bgm_stop'
  | 'voice_play'
  | 'sfx_play'
  | 'wait'
  | 'transition'
  | 'emit'
  | 'autosave'

export interface ScriptMeta {
  scriptId: string
  title: string
  schemaVersion: string
}

export interface ScriptScene {
  id: string
  title: string
  entry?: string
  commands: ScriptCommand[]
}

export interface ScriptDocument {
  meta: ScriptMeta
  assets: Record<string, Record<string, string>>
  variables: Record<string, JsonValue>
  scenes: ScriptScene[]
}

export interface ScriptCommand<TPayload = Record<string, JsonValue>> {
  id: string
  type: ScriptCommandType
  payload: TPayload
  next?: string
}

export interface CompiledScriptIR {
  scriptId: string
  title: string
  schemaVersion: string
  assets: Record<string, Record<string, string>>
  initialVariables: Record<string, JsonValue>
  commandCount: number
  sceneIndex: Record<string, IRScene>
}

export interface IRScene {
  id: string
  title: string
  entryCommandId: string
  commands: IRCommand[]
  commandMap: Record<string, number>
}

export interface IRCommand {
  id: string
  type: ScriptCommandType
  payload: Record<string, JsonValue>
  next?: string
  line?: number
}
