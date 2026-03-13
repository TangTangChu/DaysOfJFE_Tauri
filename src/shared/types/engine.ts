export type Primitive = string | number | boolean | null
export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue }

export interface ScriptLoadInput {
  source?: string
  raw?: string
}

export interface ScriptLoadResult {
  scriptId: string
  title: string
  sceneCount: number
  commandCount: number
}

export interface StoryEntry {
  sceneId?: string
  commandId?: string
}

export interface RuntimeCursorState {
  scriptId: string
  sceneId: string
  commandIndex: number
  commandId: string
  tick: number
  paused: boolean
}

export interface DialogueBacklogItem {
  id: string
  mode: 'narration' | 'dialogue'
  speakerName: string | null
  text: string
  timestamp: number
}

export interface DialogueState {
  visible: boolean
  mode: 'narration' | 'dialogue'
  speakerId: string | null
  speakerName: string | null
  textRaw: string
  textRendered: string
  typing: {
    active: boolean
    cursor: number
    speed: number
    completed: boolean
  }
  backlog: DialogueBacklogItem[]
}

export interface StageCharacterState {
  charId: string
  poseKey: string | null
  slot: string
  visible: boolean
}

export interface StageState {
  backgroundKey: string | null
  layers: Record<string, Record<string, JsonValue>>
  characters: Record<string, StageCharacterState>
}

export interface ChoiceOptionState {
  id: string
  text: string
  to: string
  disabled: boolean
}

export interface ChoiceState {
  open: boolean
  choiceId: string | null
  prompt: string
  options: ChoiceOptionState[]
}

export interface AudioChannelState {
  currentKey: string | null
  playing: boolean
  volume: number
}

export interface AudioState {
  master: number
  muted: boolean
  channels: Record<'bgm' | 'voice' | 'sfx' | 'ui', AudioChannelState>
}

export interface HotkeyBinding {
  code: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export interface GameSettings {
  audio: {
    master: number
    bgm: number
    voice: number
    sfx: number
    mute: boolean
  }
  text: {
    fontFamily: string
    fontSize: number
    lineHeight: number
    textSpeed: number
    autoDelayMs: number
  }
  transition: {
    enabled: boolean
    speedRate: number
  }
  input: {
    keymap: Record<string, HotkeyBinding>
  }
  system: {
    skipReadOnly: boolean
    autoModeInterruptOnChoice: boolean
  }
}

export interface SaveMeta {
  slot: number
  kind: 'quick' | 'manual' | 'auto'
  title: string
  sceneTitle: string
  timestamp: number
  playTimeSec: number
  screenshotRef?: string
  snapshotHash: string
  snapshotVersion: string
}

export interface SaveRuntimeState {
  latestSlot: number | null
  latestKind: SaveMeta['kind'] | null
  latestTimestamp: number | null
}

export interface EngineFlagState {
  autoMode: boolean
  fastForward: boolean
  uiHidden: boolean
}

export interface EngineState {
  runtime: RuntimeCursorState
  stage: StageState
  dialogue: DialogueState
  choice: ChoiceState
  variables: Record<string, JsonValue>
  audio: AudioState
  settings: GameSettings
  save: SaveRuntimeState
  flags: EngineFlagState
}

export interface RuntimeSnapshot {
  snapshotVersion: string
  contractVersion: string
  buildId: string
  createdAt: number
  checksum: string
  engine: EngineState
  history: DialogueBacklogItem[]
}

export interface EngineEvent<T = unknown> {
  id: string
  at: number
  type: EngineEventType
  payload: T
  trace: {
    scriptId: string
    sceneId: string
    commandId: string
    line?: number
  }
}

export type EngineEventType =
  | 'engine.booted'
  | 'engine.state.changed'
  | 'engine.command.will_run'
  | 'engine.command.did_run'
  | 'dialogue.updated'
  | 'dialogue.typing.progress'
  | 'choice.opened'
  | 'choice.closed'
  | 'audio.channel.changed'
  | 'save.completed'
  | 'save.failed'
  | 'settings.changed'
  | 'script.error'
  | 'runtime.error'

export type EngineEventListener = (event: EngineEvent) => void
export type Unsubscribe = () => void

export interface EngineError {
  code: string
  message: string
  detail?: Record<string, unknown>
  traceId?: string
}

export interface SaveSnapshotWriteInput {
  slot: number
  kind: SaveMeta['kind']
  meta: Omit<SaveMeta, 'slot' | 'kind' | 'snapshotHash' | 'snapshotVersion'>
  snapshot: RuntimeSnapshot
  encoding: 'json' | 'bin'
}

export interface SaveSnapshotLoadInput {
  slot: number
  kind?: SaveMeta['kind']
}

export interface SaveSnapshotLoadOutput {
  meta: SaveMeta
  snapshot: RuntimeSnapshot
}

export interface SaveSnapshotWriteOutput {
  meta: SaveMeta
}

export interface ExportSaveInput {
  path: string
}

export interface ImportSaveInput {
  path: string
  overwrite?: boolean
}

export interface PersistenceApi {
  loadSettings(): Promise<GameSettings>
  saveSettings(settings: GameSettings): Promise<void>
  listSaveSlots(): Promise<SaveMeta[]>
  saveSnapshot(input: SaveSnapshotWriteInput): Promise<SaveMeta>
  loadSnapshot(input: SaveSnapshotLoadInput): Promise<SaveSnapshotLoadOutput>
  deleteSaveSlot(slot: number, kind?: SaveMeta['kind']): Promise<void>
  exportSave(input: ExportSaveInput): Promise<string>
  importSave(input: ImportSaveInput): Promise<SaveMeta[]>
}

export type RuntimeAction =
  | { type: 'engine.next' }
  | { type: 'engine.skip.current' }
  | { type: 'engine.auto.set'; enabled: boolean }
  | { type: 'engine.fast_forward.set'; enabled: boolean }
  | { type: 'engine.ui_hidden.set'; enabled: boolean }
  | { type: 'choice.select'; optionId: string }
  | { type: 'system.load.snapshot'; snapshot: RuntimeSnapshot }
  | { type: 'system.reset' }

export interface GalgameFacade {
  boot(): Promise<void>
  shutdown(): Promise<void>

  loadScript(input: ScriptLoadInput): Promise<ScriptLoadResult>
  start(entry: StoryEntry): Promise<void>
  restart(): Promise<void>

  next(): Promise<void>
  skipCurrent(): Promise<void>
  setAutoMode(enabled: boolean): Promise<void>
  setFastForward(enabled: boolean): Promise<void>
  setUiHidden(enabled: boolean): Promise<void>

  choose(optionId: string): Promise<void>

  quickSave(slot?: number): Promise<SaveMeta>
  quickLoad(slot?: number): Promise<void>
  save(slot: number, kind?: SaveMeta['kind']): Promise<SaveMeta>
  load(slot: number, kind?: SaveMeta['kind']): Promise<void>
  deleteSave(slot: number, kind?: SaveMeta['kind']): Promise<void>
  listSaves(): Promise<SaveMeta[]>

  getSettings(): Promise<GameSettings>
  patchSettings(patch: Partial<GameSettings>): Promise<GameSettings>
  resetSettings(): Promise<GameSettings>

  getState(): EngineState
  subscribe(listener: EngineEventListener): Unsubscribe

  exportSnapshot(): Promise<RuntimeSnapshot>
  importSnapshot(snapshot: RuntimeSnapshot): Promise<void>
}
