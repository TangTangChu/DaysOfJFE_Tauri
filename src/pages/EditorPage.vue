<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue'
import yaml from 'js-yaml'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useGalgameFacade } from '../app/bootstrap'
import { useNavigator } from '../app/navigator'
import ChoiceLayer from '../components/game/ChoiceLayer.vue'
import CommandEditor from '../components/game/CommandEditor.vue'
import DialogueBox from '../components/game/DialogueBox.vue'
import GalButton from '../components/ui/GalButton.vue'
import GalConfirmDialog from '../components/ui/GalConfirmDialog.vue'
import GalDropdown from '../components/ui/GalDropdown.vue'
import GalField from '../components/ui/GalField.vue'
import GalSegmented from '../components/ui/GalSegmented.vue'
import GalTag from '../components/ui/GalTag.vue'
import { parseScriptDocument } from '../engine/script/parser'
import { validateScriptDocument } from '../engine/script/validator'
import { compileScriptDocument } from '../engine/script/compiler'
import type {
  ScriptCommand,
  ScriptCommandType,
  ScriptDocument,
} from '../engine/script/schema'
import type {
  EngineError,
  EngineState,
  JsonValue,
  StageCharacterState,
} from '../shared/types/engine'

interface AssetOption {
  id: string
  label: string
}

type AssetCategory = 'backgrounds' | 'standees' | 'bgm' | 'voice' | 'sfx'

interface AssetLibraryEntry {
  id: string
  src: string
}

interface ImportedAssetDraft {
  category: AssetCategory
  id: string
  src: string
  fileName: string
}

const facade = useGalgameFacade()
const { goBack, resetTo } = useNavigator()

const rawText = ref('')
const doc = ref<ScriptDocument | null>(null)
const parseErrors = ref<EngineError[]>([])
const validateErrors = ref<EngineError[]>([])
const compileErrors = ref<EngineError[]>([])
const lastAnalysisAt = ref<number | null>(null)

const viewMode = ref<'editor' | 'structure' | 'validation'>('editor')
const activeSceneId = ref('')
const activeCommandId = ref('')
const searchText = ref('')
const commandTypeFilter = ref<'all' | ScriptCommandType>('all')

const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
  onConfirm: () => {},
})

const editorRef = ref<HTMLTextAreaElement | null>(null)
const analysisTimer = ref<number | null>(null)
const focusFrame = ref<number | null>(null)
const previewTimer = ref<number | null>(null)
const isAlive = ref(false)
const previewState = ref<EngineState | null>(null)
const previewReady = ref(false)
const previewSyncing = ref(false)
const previewError = ref('')
const fileActionError = ref('')
const previewSyncedAt = ref<number | null>(null)
const dragSnippet = ref('')
const draggedInsertType = ref<ScriptCommandType | null>(null)
const draggedCommandId = ref('')
const dragInsertIndex = ref<number | null>(null)
const inlineInsertIndex = ref<number | null>(null)
const previewFullscreen = ref(false)
const previewJumping = ref(false)
const commandListRef = ref<HTMLElement | null>(null)
const fullscreenRef = ref<HTMLElement | null>(null)
const stageFrameRef = ref<HTMLElement | null>(null)
const resourceTab = ref<'backgrounds' | 'standees' | 'audio'>('backgrounds')
const assetSearchText = ref('')
const stageDropActive = ref(false)
const stageDropHint = ref('拖入图片或音频资源，自动加入脚本资源库')
const stageEditorMessage = ref('')
const stageMessageTimer = ref<number | null>(null)
const draggingStageCharacterId = ref('')
const draggedStageSlot = ref<'left' | 'center' | 'right' | ''>('')
let skipNextJump = false
let previewUnsubscribe: (() => void) | null = null

const COMMAND_DRAG_ID_MIME = 'application/x-days-command-id'
const COMMAND_INSERT_TYPE_MIME = 'application/x-days-command-type'

type CommandDragPayload =
  | { kind: 'reorder'; commandId: string }
  | { kind: 'insert'; commandType: ScriptCommandType }

const scriptSources = import.meta.glob('../assets/scripts/v2/*.yaml', {
  query: '?raw',
  import: 'default',
})

const scriptIds = computed(() =>
  Object.keys(scriptSources)
    .map((path) => path.split('/').pop()?.replace('.yaml', ''))
    .filter((id): id is string => !!id)
    .sort(),
)

const sceneCommandCount = computed(() => {
  if (!doc.value) return 0
  return doc.value.scenes.reduce((acc, scene) => acc + scene.commands.length, 0)
})

const statusSummary = computed(() => {
  if (parseErrors.value.length > 0) return '解析失败'
  if (validateErrors.value.length > 0) return '校验失败'
  if (compileErrors.value.length > 0) return '编译失败'
  return doc.value ? '通过' : '未解析'
})

const sceneList = computed(() => doc.value?.scenes ?? [])

const activeScene = computed(() => {
  if (!sceneList.value.length) return null
  return (
    sceneList.value.find((scene) => scene.id === activeSceneId.value) ??
    sceneList.value[0]
  )
})

const filteredCommands = computed(() => {
  const commands = activeScene.value?.commands ?? []
  const keyword = searchText.value.trim().toLowerCase()
  return commands.filter((command) => {
    if (commandTypeFilter.value !== 'all') {
      if (command.type !== commandTypeFilter.value) return false
    }
    if (!keyword) return true
    const payloadText = Object.values(command.payload ?? {})
      .map((v) => String(v))
      .join(' ')
      .toLowerCase()
    return (
      command.id.toLowerCase().includes(keyword) ||
      command.type.toLowerCase().includes(keyword) ||
      payloadText.includes(keyword)
    )
  })
})

const activeCommand = computed(() => {
  if (!structureCommands.value.length) return null
  return (
    structureCommands.value.find((cmd) => cmd.id === activeCommandId.value) ??
    structureCommands.value[0]
  )
})

const activeCommandVisibleInFilter = computed(() => {
  if (!activeCommand.value) return false
  return filteredCommands.value.some(
    (cmd) => cmd.id === activeCommand.value?.id,
  )
})

const previewDialogue = computed(() => previewState.value?.dialogue ?? null)
const previewChoice = computed(() => previewState.value?.choice ?? null)
const previewStage = computed(() => previewState.value?.stage ?? null)
const previewFlags = computed(() => previewState.value?.flags ?? null)
const previewCharacters = computed(() =>
  Object.values(previewStage.value?.characters ?? {}),
)
const previewBackgroundLabel = computed(
  () => previewStage.value?.backgroundKey ?? '未设背景',
)
const previewBgmLabel = computed(
  () => previewState.value?.audio.channels.bgm.currentKey ?? '未设 BGM',
)
const activeSceneEntry = computed(
  () => activeScene.value?.entry || activeScene.value?.commands[0]?.id || '',
)
const activeCommandIndex = computed(() => {
  const commands = activeScene.value?.commands ?? []
  return commands.findIndex((c) => c.id === activeCommandId.value)
})
const validationIssueCount = computed(
  () =>
    parseErrors.value.length +
    validateErrors.value.length +
    compileErrors.value.length,
)

const structureCommands = computed(() => activeScene.value?.commands ?? [])

const isCommandListFiltered = computed(
  () => searchText.value.trim().length > 0 || commandTypeFilter.value !== 'all',
)

const visibleStructureCommands = computed(() =>
  isCommandListFiltered.value
    ? filteredCommands.value
    : structureCommands.value,
)

const typeFilterOptions = computed(() => [
  { id: 'all', label: '全部类型' },
  ...typeOptions.map((t) => ({ id: t, label: typeLabels[t] ?? t })),
])

const typeDropdownOptions = computed(() =>
  typeOptions.map((t) => ({ id: t, label: typeLabels[t] ?? t })),
)

const sampleDropdownOptions = computed(() =>
  scriptIds.value.map((id) => ({ id, label: id })),
)

const assetLibrary = computed<Record<AssetCategory, AssetLibraryEntry[]>>(
  () => {
    const assets = doc.value?.assets ?? {}
    return {
      backgrounds: Object.entries(assets.backgrounds ?? {}).map(
        ([id, src]) => ({
          id,
          src,
        }),
      ),
      standees: Object.entries(assets.standees ?? {}).map(([id, src]) => ({
        id,
        src,
      })),
      bgm: Object.entries(assets.bgm ?? {}).map(([id, src]) => ({ id, src })),
      voice: Object.entries(assets.voice ?? {}).map(([id, src]) => ({
        id,
        src,
      })),
      sfx: Object.entries(assets.sfx ?? {}).map(([id, src]) => ({ id, src })),
    }
  },
)

const commandAssetOptions = computed<{
  backgrounds: AssetOption[]
  standees: AssetOption[]
  bgm: AssetOption[]
  voice: AssetOption[]
  sfx: AssetOption[]
}>(() => ({
  backgrounds: assetLibrary.value.backgrounds.map((item) => ({
    id: item.src,
    label: `${item.id} · ${item.src.slice(0, 36)}`,
  })),
  standees: assetLibrary.value.standees.map((item) => ({
    id: item.src,
    label: `${item.id} · ${item.src.slice(0, 36)}`,
  })),
  bgm: assetLibrary.value.bgm.map((item) => ({
    id: item.src,
    label: `${item.id} · ${item.src.slice(0, 36)}`,
  })),
  voice: assetLibrary.value.voice.map((item) => ({
    id: item.src,
    label: `${item.id} · ${item.src.slice(0, 36)}`,
  })),
  sfx: assetLibrary.value.sfx.map((item) => ({
    id: item.src,
    label: `${item.id} · ${item.src.slice(0, 36)}`,
  })),
}))

const visibleAssetGroups = computed(() => {
  const keyword = assetSearchText.value.trim().toLowerCase()
  const filterEntries = (entries: AssetLibraryEntry[]) =>
    entries.filter((entry) => {
      if (!keyword) return true
      return (
        entry.id.toLowerCase().includes(keyword) ||
        entry.src.toLowerCase().includes(keyword)
      )
    })

  return {
    backgrounds: filterEntries(assetLibrary.value.backgrounds),
    standees: filterEntries(assetLibrary.value.standees),
    bgm: filterEntries(assetLibrary.value.bgm),
    voice: filterEntries(assetLibrary.value.voice),
    sfx: filterEntries(assetLibrary.value.sfx),
  }
})

const hasResourceEditing = computed(() =>
  [
    'bg_set',
    'char_show',
    'char_pose',
    'bgm_play',
    'voice_play',
    'sfx_play',
  ].includes(activeCommand.value?.type ?? ''),
)

const activeCharacterId = computed(() => {
  const command = activeCommand.value
  if (!command) return ''
  if (command.type === 'char_show' || command.type === 'char_pose') {
    return String(command.payload.charId ?? '')
  }
  return ''
})

const activeStageCharacter = computed<StageCharacterState | null>(() => {
  const charId = activeCharacterId.value
  if (!charId) return null
  return previewStage.value?.characters?.[charId] ?? null
})

const metaForm = reactive({
  scriptId: '',
  title: '',
  schemaVersion: '2.0.0',
})

const newScene = reactive({
  id: '',
  title: '',
  entry: '',
})

const commandTemplates: Record<ScriptCommandType, string> = {
  narration: '{"text":"新的旁白"}',
  dialogue: '{"speakerId":"heroine","speakerName":"少女","text":"新的对话"}',
  clear_dialogue: '{}',
  bg_set: '{"bgKey":"bg_room"}',
  char_show: '{"charId":"heroine","slot":"center"}',
  char_hide: '{"charId":"heroine"}',
  char_pose: '{"charId":"heroine","poseKey":"normal"}',
  layer_set: '{"layer":"effect","props":{"opacity":1}}',
  choice_show:
    '{"choiceId":"choice_new","prompt":"新的选择","options":[{"id":"opt_1","text":"选项一","to":"next_1"},{"id":"opt_2","text":"选项二","to":"next_2"}]}',
  jump: '{"to":"target_command"}',
  branch: '{"if":"true","then":"cmd_yes","else":"cmd_no"}',
  label: '{}',
  call: '{"sceneId":"scene_target","entry":"cmd_0001"}',
  return: '{}',
  script_jump: '{"scriptId":"chapter1","sceneId":"scene_start"}',
  end: '{"endingKey":"ending_1"}',
  set: '{"key":"flag.example","value":true}',
  inc: '{"key":"affinity.heroine","by":1}',
  dec: '{"key":"affinity.heroine","by":1}',
  expr: '{"statement":"_ = 1 + 2"}',
  bgm_play: '{"key":"bgm_main"}',
  bgm_stop: '{}',
  voice_play: '{"key":"voice_001","interruptPolicy":"interrupt"}',
  sfx_play: '{"key":"sfx_click"}',
  wait: '{"ms":800}',
  transition: '{}',
  emit: '{"event":"engine.state.changed","payload":{}}',
  autosave: '{}',
}

const typeOptions: ScriptCommandType[] = [
  'narration',
  'dialogue',
  'clear_dialogue',
  'bg_set',
  'char_show',
  'char_hide',
  'char_pose',
  'layer_set',
  'choice_show',
  'jump',
  'branch',
  'label',
  'call',
  'return',
  'script_jump',
  'end',
  'set',
  'inc',
  'dec',
  'expr',
  'bgm_play',
  'bgm_stop',
  'voice_play',
  'sfx_play',
  'wait',
  'transition',
  'emit',
  'autosave',
]

const viewItems = [
  { id: 'editor', label: '编辑' },
  { id: 'structure', label: '结构' },
  { id: 'validation', label: '校验' },
]

const typeLabels: Record<ScriptCommandType, string> = {
  narration: '旁白',
  dialogue: '对白',
  clear_dialogue: '清空对白',
  bg_set: '切换背景',
  char_show: '角色出现',
  char_hide: '角色隐藏',
  char_pose: '角色姿态',
  layer_set: '图层设置',
  choice_show: '选项',
  jump: '跳转',
  branch: '分支',
  label: '标签',
  call: '调用',
  return: '返回',
  script_jump: '跨脚本',
  end: '结束',
  set: '设定变量',
  inc: '增加变量',
  dec: '减少变量',
  expr: '表达式',
  bgm_play: '播放音乐',
  bgm_stop: '停止音乐',
  voice_play: '播放语音',
  sfx_play: '播放音效',
  wait: '等待',
  transition: '转场',
  emit: '事件',
  autosave: '自动存档',
}

function typeLabel(type: ScriptCommandType): string {
  return typeLabels[type] ?? type
}

function commandSummary(cmd: ScriptCommand): string {
  const p = cmd.payload ?? {}
  switch (cmd.type) {
    case 'dialogue':
      return `${p.speakerName || p.speakerId || '?'}: ${p.text || '…'}`
    case 'narration':
      return String(p.text ?? '…')
    case 'bg_set':
      return `背景 → ${p.bgKey}`
    case 'char_show':
      return `${p.charId} → ${p.slot || '?'}`
    case 'char_hide':
      return `隐藏 ${p.charId}`
    case 'char_pose':
      return `${p.charId}: ${p.poseKey}`
    case 'choice_show':
      return String(p.prompt || '选择…')
    case 'jump':
      return `→ ${p.to}`
    case 'branch':
      return `if ${p.if} → ${p.then}`
    case 'call':
      return `调用 ${p.sceneId}`
    case 'script_jump':
      return `跳转 ${p.scriptId}/${p.sceneId}`
    case 'set':
      return `${p.key} = ${p.value}`
    case 'inc':
      return `${p.key} += ${p.by}`
    case 'dec':
      return `${p.key} -= ${p.by}`
    case 'bgm_play':
      return `♪ ${p.key}`
    case 'sfx_play':
      return `♫ ${p.key}`
    case 'voice_play':
      return `🎤 ${p.key}`
    case 'wait':
      return `等待 ${p.ms}ms`
    case 'end':
      return p.endingKey ? `结局: ${p.endingKey}` : '结束'
    default: {
      const entries = Object.entries(p)
      return entries.length
        ? entries.map(([k, v]) => `${k}=${v}`).join(' ')
        : '(空)'
    }
  }
}

function buildCommandPayload(
  type: ScriptCommandType,
): Record<string, JsonValue> {
  try {
    return toJsonRecord(JSON.parse(commandTemplates[type]))
  } catch {
    return {}
  }
}

function createCommandId(scene: ScriptDocument['scenes'][number]): string {
  const timestampId = `cmd_${Date.now().toString().slice(-6)}`
  if (!scene.commands.some((command) => command.id === timestampId)) {
    return timestampId
  }

  let sequence = scene.commands.length + 1
  while (true) {
    const fallbackId = `cmd_${String(sequence).padStart(4, '0')}`
    if (!scene.commands.some((command) => command.id === fallbackId)) {
      return fallbackId
    }
    sequence += 1
  }
}

function clearCommandInteractionState() {
  draggedCommandId.value = ''
  dragInsertIndex.value = null
}

function clearSnippetDragState() {
  dragSnippet.value = ''
  draggedInsertType.value = null
}

function isScriptCommandType(value: string): value is ScriptCommandType {
  return typeOptions.includes(value as ScriptCommandType)
}

function resolveCommandDragPayload(
  event: DragEvent,
): CommandDragPayload | null {
  const commandId =
    event.dataTransfer?.getData(COMMAND_DRAG_ID_MIME) || draggedCommandId.value
  if (commandId) {
    return { kind: 'reorder', commandId }
  }

  const commandType =
    event.dataTransfer?.getData(COMMAND_INSERT_TYPE_MIME) ||
    draggedInsertType.value ||
    ''
  if (commandType && isScriptCommandType(commandType)) {
    return { kind: 'insert', commandType }
  }

  return null
}

function resolveDropEffect(event: DragEvent): 'copy' | 'move' | 'none' {
  const payload = resolveCommandDragPayload(event)
  if (!payload) return 'none'
  return payload.kind === 'insert' ? 'copy' : 'move'
}

function insertCommandAtIndex(type: ScriptCommandType, insertIndex: number) {
  if (!doc.value || !activeScene.value) return
  const scene = doc.value.scenes.find((s) => s.id === activeScene.value!.id)
  if (!scene) return

  const nextIndex = Math.max(0, Math.min(insertIndex, scene.commands.length))
  const commandId = createCommandId(scene)
  const command: ScriptCommand = {
    id: commandId,
    type,
    payload: buildCommandPayload(type),
  }

  scene.commands.splice(nextIndex, 0, command)
  inlineInsertIndex.value = null
  setRaw(serializeDoc(doc.value))
  activeCommandId.value = commandId
}

function reorderCommandToIndex(commandId: string, insertIndex: number) {
  if (!doc.value || !activeScene.value) return
  const scene = doc.value.scenes.find((s) => s.id === activeScene.value!.id)
  if (!scene) return

  const sourceIndex = scene.commands.findIndex(
    (command) => command.id === commandId,
  )
  if (sourceIndex < 0) return

  const boundedIndex = Math.max(0, Math.min(insertIndex, scene.commands.length))
  const [command] = scene.commands.splice(sourceIndex, 1)
  const targetIndex =
    sourceIndex < boundedIndex ? boundedIndex - 1 : boundedIndex
  scene.commands.splice(targetIndex, 0, command)

  setRaw(serializeDoc(doc.value))
  activeCommandId.value = command.id
}

function insertCommandAt(
  type: ScriptCommandType,
  position: 'after' | 'end' = 'after',
) {
  if (!activeScene.value) return
  const activeIndex = structureCommands.value.findIndex(
    (command) => command.id === activeCommandId.value,
  )
  const insertIndex =
    position === 'after' && activeIndex >= 0
      ? activeIndex + 1
      : structureCommands.value.length

  insertCommandAtIndex(type, insertIndex)
}

function deleteActiveCommand() {
  if (!doc.value || !activeScene.value || !activeCommand.value) return
  const scene = doc.value.scenes.find((s) => s.id === activeScene.value!.id)
  if (!scene) return
  const idx = scene.commands.findIndex((c) => c.id === activeCommand.value!.id)
  if (idx < 0) return
  scene.commands.splice(idx, 1)
  setRaw(serializeDoc(doc.value))
  if (scene.commands.length > 0) {
    activeCommandId.value =
      scene.commands[Math.min(idx, scene.commands.length - 1)].id
  } else {
    activeCommandId.value = ''
  }
}

function moveActiveCommand(direction: 'up' | 'down') {
  if (!activeCommand.value) return
  const idx = structureCommands.value.findIndex(
    (command) => command.id === activeCommand.value!.id,
  )
  if (idx < 0) return
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= structureCommands.value.length) return

  reorderCommandToIndex(activeCommand.value.id, targetIdx)
}

function handleInsertCommandType(typeId: string) {
  if (typeId) insertCommandAt(typeId as ScriptCommandType, 'after')
}

function clearCommandFilters() {
  searchText.value = ''
  commandTypeFilter.value = 'all'
}

function handleInlineInsertType(typeId: string, insertIndex: number) {
  if (!typeId) return
  insertCommandAtIndex(typeId as ScriptCommandType, insertIndex)
}

const quickInsertItems = [
  { id: 'narration', label: '旁白' },
  { id: 'dialogue', label: '对白' },
  { id: 'choice_show', label: '选项' },
  { id: 'jump', label: '跳转' },
  { id: 'call', label: '调用' },
  { id: 'return', label: '返回' },
  { id: 'script_jump', label: '跨脚本' },
] as const

function openInlineInsert(index: number) {
  inlineInsertIndex.value = inlineInsertIndex.value === index ? null : index
}

function handleCommandDragStart(commandId: string, event: DragEvent) {
  clearSnippetDragState()
  draggedCommandId.value = commandId
  dragInsertIndex.value = null
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(COMMAND_DRAG_ID_MIME, commandId)
  event.dataTransfer.setData('text/plain', commandId)
}

function handleCommandDragEnd() {
  clearCommandInteractionState()
}

function handleCommandDrop(insertIndex: number, event: DragEvent) {
  event.preventDefault()
  const payload = resolveCommandDragPayload(event)
  if (!payload) {
    clearCommandInteractionState()
    clearSnippetDragState()
    return
  }

  if (payload.kind === 'insert') {
    insertCommandAtIndex(payload.commandType, insertIndex)
  } else {
    reorderCommandToIndex(payload.commandId, insertIndex)
  }
  clearCommandInteractionState()
  clearSnippetDragState()
}

function handleCommandInsertZoneDragOver(
  insertIndex: number,
  event: DragEvent,
) {
  if (isCommandListFiltered.value) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    return
  }
  event.preventDefault()
  const dropEffect = resolveDropEffect(event)
  if (dropEffect === 'none') return
  dragInsertIndex.value = insertIndex
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = dropEffect
  }
}

function handleCommandInsertZoneDrop(insertIndex: number, event: DragEvent) {
  if (isCommandListFiltered.value) return
  handleCommandDrop(insertIndex, event)
}

function resolveCommandInsertIndexFromPointer(event: DragEvent) {
  const pointerY = event.clientY
  const cards = Array.from(
    commandListRef.value?.querySelectorAll<HTMLElement>('[data-cmd-id]') ?? [],
  )

  for (const card of cards) {
    const commandId = card.dataset.cmdId
    if (!commandId) continue
    const commandIndex = structureCommands.value.findIndex(
      (command) => command.id === commandId,
    )
    if (commandIndex < 0) continue

    const rect = card.getBoundingClientRect()
    if (pointerY < rect.top + rect.height / 2) {
      return commandIndex
    }
  }

  return structureCommands.value.length
}

function handleCommandListDragOver(event: DragEvent) {
  event.preventDefault()
  if (isCommandListFiltered.value) return

  const dropEffect = resolveDropEffect(event)
  if (dropEffect === 'none') return

  dragInsertIndex.value = resolveCommandInsertIndexFromPointer(event)
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = dropEffect
  }
}

function handleCommandListDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (isCommandListFiltered.value) return

  handleCommandDrop(resolveCommandInsertIndexFromPointer(event), event)
}

function getCardDropInsertIndex(cardIndex: number, event: DragEvent) {
  const currentTarget = event.currentTarget
  if (!(currentTarget instanceof HTMLElement)) {
    return cardIndex
  }

  const rect = currentTarget.getBoundingClientRect()
  const pointerY = event.clientY - rect.top
  return pointerY >= rect.height / 2 ? cardIndex + 1 : cardIndex
}

function handleCommandCardDragOver(cardIndex: number, event: DragEvent) {
  if (isCommandListFiltered.value) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    return
  }
  event.preventDefault()
  const dropEffect = resolveDropEffect(event)
  if (dropEffect === 'none') return
  dragInsertIndex.value = getCardDropInsertIndex(cardIndex, event)
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = dropEffect
  }
}

function handleCommandCardDrop(cardIndex: number, event: DragEvent) {
  if (isCommandListFiltered.value) return
  const insertIndex = getCardDropInsertIndex(cardIndex, event)
  handleCommandDrop(insertIndex, event)
}

function handleCommandListDragLeave(event: DragEvent) {
  const nextTarget = event.relatedTarget
  if (
    nextTarget instanceof Node &&
    commandListRef.value?.contains(nextTarget)
  ) {
    return
  }
  dragInsertIndex.value = null
}

function showConfirm(title: string, message: string, onConfirm: () => void) {
  confirmDialog.value.title = title
  confirmDialog.value.message = message
  confirmDialog.value.onConfirm = onConfirm
  confirmDialog.value.visible = true
}

function handleConfirm() {
  confirmDialog.value.onConfirm()
  confirmDialog.value.visible = false
}

function createEmptyDoc(): ScriptDocument {
  return {
    meta: {
      scriptId: 'new_story',
      title: '新剧本',
      schemaVersion: '2.0.0',
    },
    assets: {},
    variables: {},
    scenes: [],
  }
}

async function back() {
  const didGoBack = await goBack()
  if (!didGoBack) {
    await resetTo('title')
  }
}
function serializeDoc(nextDoc: ScriptDocument): string {
  return yaml.dump(nextDoc, { lineWidth: 120, noRefs: true })
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, JsonValue>
    >((acc, [key, val]) => {
      acc[key] = toJsonValue(val)
      return acc
    }, {})
  }
  return String(value)
}

function toJsonRecord(value: unknown): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, JsonValue>
  >((acc, [key, val]) => {
    acc[key] = toJsonValue(val)
    return acc
  }, {})
}

function refreshAnalysis() {
  try {
    const parsed = parseScriptDocument(rawText.value)
    parseErrors.value = parsed.errors
    doc.value = parsed.document
    if (!parsed.document || parsed.errors.length > 0) {
      validateErrors.value = []
      compileErrors.value = []
      return
    }
    validateErrors.value = validateScriptDocument(parsed.document)
    const compiled = compileScriptDocument(parsed.document)
    compileErrors.value = compiled.errors
    lastAnalysisAt.value = Date.now()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parseErrors.value = [{ code: 'SCRIPT_PARSE_ERROR', message }]
    validateErrors.value = []
    compileErrors.value = []
    doc.value = null
  }
}

function setRaw(nextRaw: string) {
  rawText.value = nextRaw
  refreshAnalysis()
}

function insertSnippet(snippet: string) {
  const target = editorRef.value
  if (!target) return
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? target.value.length
  const before = rawText.value.slice(0, start)
  const after = rawText.value.slice(end)
  const next = `${before}${snippet}${after}`
  rawText.value = next
  if (focusFrame.value) {
    window.cancelAnimationFrame(focusFrame.value)
  }
  focusFrame.value = requestAnimationFrame(() => {
    focusFrame.value = null
    const nextTarget = editorRef.value
    if (!isAlive.value || !nextTarget) return
    nextTarget.focus()
    const cursor = start + snippet.length
    nextTarget.setSelectionRange(cursor, cursor)
  })
}

function createCommandSnippet(type: ScriptCommandType): string {
  return `\n      - id: cmd_${Date.now().toString().slice(-4)}\n        type: ${type}\n        payload: ${commandTemplates[type]}\n`
}

function handleQuickInsert(type: ScriptCommandType) {
  insertSnippet(createCommandSnippet(type))
}

function handleSnippetDragStart(type: ScriptCommandType, event: DragEvent) {
  const snippet = createCommandSnippet(type)
  clearCommandInteractionState()
  draggedInsertType.value = type
  dragSnippet.value = snippet
  if (!event.dataTransfer) return
  event.dataTransfer.setData(COMMAND_INSERT_TYPE_MIME, type)
  event.dataTransfer.setData('text/plain', snippet)
  event.dataTransfer.effectAllowed = 'copy'
}

function handleSnippetDragEnd() {
  clearSnippetDragState()
}

function handleEditorDragOver(event: DragEvent) {
  const payload = resolveCommandDragPayload(event)
  if (payload?.kind !== 'insert') {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleEditorDrop(event: DragEvent) {
  const payload = resolveCommandDragPayload(event)
  if (payload?.kind !== 'insert') {
    clearSnippetDragState()
    return
  }
  event.preventDefault()
  const snippet = event.dataTransfer?.getData('text/plain') || dragSnippet.value
  if (!snippet) {
    clearSnippetDragState()
    return
  }
  insertSnippet(snippet)
  clearSnippetDragState()
}

function loadTemplate() {
  setRaw(`meta:
  scriptId: new_story
  title: 新剧本
  schemaVersion: 2.0.0

variables:
  flag.example: false

scenes:
  - id: scene_start
    title: 开始
    entry: c_0001
    commands:
      - id: c_0001
        type: narration
        payload:
          text: '你好，编辑器。'
`)
}

async function loadSample(id: string) {
  const path = Object.keys(scriptSources).find((p) => p.endsWith(`/${id}.yaml`))
  if (!path) return
  const loader = scriptSources[path]
  const content = (await loader()) as string
  if (!isAlive.value) return
  setRaw(content)
}

function formatScript() {
  if (!doc.value) return
  const formatted = serializeDoc(doc.value)
  setRaw(formatted)
}

function applyMeta() {
  const target = doc.value ?? createEmptyDoc()
  target.meta = {
    scriptId: metaForm.scriptId || target.meta.scriptId,
    title: metaForm.title || target.meta.title,
    schemaVersion: metaForm.schemaVersion || target.meta.schemaVersion,
  }
  const formatted = serializeDoc(target)
  setRaw(formatted)
}

function addScene() {
  const target = doc.value ?? createEmptyDoc()
  if (!newScene.id || !newScene.title) return
  target.scenes.push({
    id: newScene.id,
    title: newScene.title,
    entry: newScene.entry || undefined,
    commands: [],
  })
  const formatted = serializeDoc(target)
  setRaw(formatted)
  newScene.id = ''
  newScene.title = ''
  newScene.entry = ''
}

function saveLocal() {
  void saveLocalYaml()
}

function loadLocal() {
  void loadLocalYaml()
}

async function saveLocalYaml() {
  try {
    fileActionError.value = ''
    const targetPath = await save({
      title: '保存 YAML 剧本',
      defaultPath: `${metaForm.scriptId || 'script'}.yaml`,
      filters: [{ name: 'YAML Script', extensions: ['yaml', 'yml'] }],
    })
    if (!targetPath) return

    await invoke('write_text_file', {
      input: {
        path: targetPath,
        content: rawText.value,
      },
    })
  } catch (error) {
    fileActionError.value =
      error instanceof Error ? error.message : String(error)
  }
}

async function loadLocalYaml() {
  try {
    fileActionError.value = ''
    const selected = await open({
      title: '读取 YAML 剧本',
      multiple: false,
      directory: false,
      filters: [{ name: 'YAML Script', extensions: ['yaml', 'yml'] }],
    })
    if (!selected || Array.isArray(selected)) return

    const content = await invoke<string>('read_text_file', {
      input: { path: selected },
    })
    setRaw(content)
  } catch (error) {
    fileActionError.value =
      error instanceof Error ? error.message : String(error)
  }
}

function downloadScript() {
  const blob = new Blob([rawText.value], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${metaForm.scriptId || 'script'}.yaml`
  a.click()
  URL.revokeObjectURL(url)
}

function updatePreviewSnapshot() {
  previewState.value = facade.getState()
  // Reverse sync: update command list highlight to match preview cursor
  if (!previewJumping.value && previewState.value) {
    const cmdId = previewState.value.runtime.commandId
    if (cmdId && cmdId !== activeCommandId.value) {
      skipNextJump = true
      activeCommandId.value = cmdId
      scrollCommandIntoView(cmdId)
    }
  }
}

function getPreviewEntry() {
  return {
    sceneId: activeScene.value?.id || doc.value?.scenes[0]?.id,
    commandId: activeSceneEntry.value || undefined,
  }
}

async function syncPreview() {
  if (!doc.value) {
    previewReady.value = false
    previewError.value = '当前还没有可用于预演的剧本结构。'
    return
  }
  if (validationIssueCount.value > 0) {
    previewReady.value = false
    previewError.value = '脚本存在解析、校验或编译错误，暂时无法联动预演。'
    return
  }

  const entry = getPreviewEntry()
  if (!entry.sceneId) {
    previewReady.value = false
    previewError.value = '请先创建一个场景，再启动舞台预演。'
    return
  }

  previewSyncing.value = true
  previewError.value = ''
  try {
    await facade.boot()
    await facade.loadScript({ raw: rawText.value })
    await facade.start(entry)
    updatePreviewSnapshot()
    previewReady.value = true
    previewSyncedAt.value = Date.now()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    previewReady.value = false
    previewError.value = `联动失败：${message}`
  } finally {
    previewSyncing.value = false
  }
}

function queuePreviewSync(delay = 520) {
  if (previewTimer.value) {
    window.clearTimeout(previewTimer.value)
  }
  previewTimer.value = window.setTimeout(() => {
    previewTimer.value = null
    void syncPreview()
  }, delay)
}

async function handlePreviewNext() {
  try {
    await facade.next()
    updatePreviewSnapshot()
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error)
  }
}

async function handlePreviewSkip() {
  try {
    await facade.skipCurrent()
    updatePreviewSnapshot()
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error)
  }
}

async function handlePreviewToggleAuto() {
  try {
    await facade.setAutoMode(!previewFlags.value?.autoMode)
    updatePreviewSnapshot()
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error)
  }
}

async function handlePreviewChoose(optionId: string) {
  try {
    await facade.choose(optionId)
    updatePreviewSnapshot()
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error)
  }
}

async function jumpToCommand(commandId: string) {
  if (!commandId || !previewReady.value || !doc.value || previewJumping.value)
    return
  const sceneId = activeScene.value?.id
  if (!sceneId || validationIssueCount.value > 0) return

  previewJumping.value = true
  previewError.value = ''
  try {
    await facade.loadScript({ raw: rawText.value })
    await facade.start({ sceneId, commandId })
    updatePreviewSnapshot()
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    previewJumping.value = false
  }
}

function scrollCommandIntoView(cmdId: string) {
  nextTick(() => {
    const el = commandListRef.value?.querySelector(
      `[data-cmd-id="${CSS.escape(cmdId)}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function navigateCommand(direction: 'prev' | 'next') {
  const commands = activeScene.value?.commands ?? []
  if (!commands.length) return
  const idx = activeCommandIndex.value
  const cur = idx < 0 ? 0 : idx
  const target =
    direction === 'next'
      ? Math.min(cur + 1, commands.length - 1)
      : Math.max(cur - 1, 0)
  if (target !== cur || idx < 0) {
    activeCommandId.value = commands[target].id
  }
}

// --- Fullscreen editing ---
const showEditPanel = ref(true)
const sampleDropdownValue = ref('')
const fsSearchText = ref('')

const fsFilteredCommands = computed(() => {
  const commands = activeScene.value?.commands ?? []
  const keyword = fsSearchText.value.trim().toLowerCase()
  if (!keyword) return commands
  return commands.filter((cmd) => {
    const payloadText = Object.values(cmd.payload ?? {})
      .map((v) => String(v))
      .join(' ')
      .toLowerCase()
    return (
      cmd.id.toLowerCase().includes(keyword) ||
      cmd.type.toLowerCase().includes(keyword) ||
      payloadText.includes(keyword)
    )
  })
})

function updateActiveCommandPayload(patch: Record<string, JsonValue>) {
  if (!doc.value || !activeScene.value || !activeCommand.value) return
  const scene = doc.value.scenes.find((s) => s.id === activeScene.value!.id)
  if (!scene) return
  const cmd = scene.commands.find((c) => c.id === activeCommand.value!.id)
  if (!cmd) return
  cmd.payload = { ...cmd.payload, ...patch }
  const formatted = serializeDoc(doc.value)
  setRaw(formatted)
}

function showStageMessage(message: string) {
  stageEditorMessage.value = message
  if (stageMessageTimer.value) {
    window.clearTimeout(stageMessageTimer.value)
  }
  stageMessageTimer.value = window.setTimeout(() => {
    stageEditorMessage.value = ''
    stageMessageTimer.value = null
  }, 2400)
}

function slugifyAssetName(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || `asset_${Date.now().toString().slice(-6)}`
}

function guessAssetCategory(file: File): AssetCategory | null {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type.startsWith('image/')) {
    if (
      name.includes('stand') ||
      name.includes('pose') ||
      name.includes('char') ||
      name.includes('sprite') ||
      name.includes('cg_')
    ) {
      return 'standees'
    }
    return 'backgrounds'
  }
  if (type.startsWith('audio/')) {
    if (name.includes('voice') || name.includes('cv')) return 'voice'
    if (name.includes('sfx') || name.includes('se')) return 'sfx'
    return 'bgm'
  }
  return null
}

function ensureAssetBucket(target: ScriptDocument, category: AssetCategory) {
  if (!target.assets[category]) {
    target.assets[category] = {}
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('文件读取结果无效'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('文件读取失败'))
    }
    reader.readAsDataURL(file)
  })
}

async function createImportedAsset(
  file: File,
  category?: AssetCategory,
): Promise<ImportedAssetDraft | null> {
  const resolvedCategory = category ?? guessAssetCategory(file)
  if (!resolvedCategory) return null
  const src = await readFileAsDataUrl(file)
  const assetId = slugifyAssetName(file.name)
  return {
    category: resolvedCategory,
    id: assetId,
    src,
    fileName: file.name,
  }
}

function registerAsset(
  category: AssetCategory,
  assetId: string,
  src: string,
  options?: { silent?: boolean },
) {
  const target = doc.value ?? createEmptyDoc()
  ensureAssetBucket(target, category)
  let nextId = assetId
  let seq = 2
  while (target.assets[category][nextId]) {
    nextId = `${assetId}_${seq}`
    seq += 1
  }
  target.assets[category][nextId] = src
  setRaw(serializeDoc(target))
  if (!options?.silent) {
    showStageMessage(`已加入资源库：${nextId}`)
  }
  return { id: nextId, src }
}

function setBackgroundForActiveCommand(src: string) {
  if (activeCommand.value?.type !== 'bg_set') {
    showStageMessage('请先选中一条 bg_set 指令，再应用背景')
    return
  }
  updateActiveCommandPayload({ bgKey: src })
  showStageMessage('背景已应用到当前场景指令')
}

function setBgmForActiveCommand(src: string) {
  if (activeCommand.value?.type !== 'bgm_play') {
    showStageMessage('请先选中一条 bgm_play 指令，再应用音乐')
    return
  }
  updateActiveCommandPayload({ key: src })
  showStageMessage('BGM 已应用到当前指令')
}

function setVoiceForActiveCommand(src: string) {
  if (activeCommand.value?.type !== 'voice_play') {
    showStageMessage('请先选中一条 voice_play 指令，再应用语音')
    return
  }
  updateActiveCommandPayload({ key: src })
  showStageMessage('语音已应用到当前指令')
}

function setSfxForActiveCommand(src: string) {
  if (activeCommand.value?.type !== 'sfx_play') {
    showStageMessage('请先选中一条 sfx_play 指令，再应用音效')
    return
  }
  updateActiveCommandPayload({ key: src })
  showStageMessage('音效已应用到当前指令')
}

function setStandeeForActiveCommand(src: string) {
  if (
    activeCommand.value?.type !== 'char_show' &&
    activeCommand.value?.type !== 'char_pose'
  ) {
    showStageMessage('请先选中一条 char_show 或 char_pose 指令')
    return
  }
  updateActiveCommandPayload({ poseKey: src })
  showStageMessage('立绘已应用到当前角色指令')
}

function applyDefaultSlot(slot: 'left' | 'center' | 'right') {
  if (activeCommand.value?.type !== 'char_show') {
    showStageMessage('默认站位只能直接写入 char_show 指令')
    return
  }
  updateActiveCommandPayload({ slot })
  showStageMessage(`默认站位已设为 ${slot}`)
}

function updateCharacterSlotById(
  charId: string,
  slot: 'left' | 'center' | 'right',
) {
  if (!doc.value || !activeScene.value) return
  const scene = doc.value.scenes.find((s) => s.id === activeScene.value!.id)
  if (!scene) return

  const showCommands = scene.commands.filter(
    (command) =>
      command.type === 'char_show' &&
      String(command.payload.charId ?? '') === charId,
  )
  const showCommand = showCommands[showCommands.length - 1]
  if (!showCommand) {
    showStageMessage(`未找到 ${charId} 的 char_show 指令，无法写回站位`)
    return
  }
  showCommand.payload = { ...showCommand.payload, slot }
  setRaw(serializeDoc(doc.value))
  if (activeCommand.value?.id === showCommand.id) {
    activeCommandId.value = showCommand.id
  }
  showStageMessage(
    showCommands.length > 1
      ? `${charId} 已移动到 ${slot}，并写回最近的 char_show 指令`
      : `${charId} 已移动到 ${slot}`,
  )
}

function resolveStageSlot(clientX: number): 'left' | 'center' | 'right' {
  const rect = stageFrameRef.value?.getBoundingClientRect()
  if (!rect) return 'center'
  const ratio = (clientX - rect.left) / rect.width
  if (ratio < 0.33) return 'left'
  if (ratio > 0.66) return 'right'
  return 'center'
}

function handleStageCharacterDragStart(charId: string, event: DragEvent) {
  draggingStageCharacterId.value = charId
  draggedStageSlot.value = ''
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', charId)
}

function handleStageCharacterDragEnd() {
  draggingStageCharacterId.value = ''
  draggedStageSlot.value = ''
}

function handleStageDragOver(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    event.preventDefault()
    stageDropActive.value = true
    stageDropHint.value = `将导入 ${files.length} 个资源并尝试绑定到当前指令`
    return
  }
  if (draggingStageCharacterId.value) {
    event.preventDefault()
    stageDropActive.value = true
    draggedStageSlot.value = resolveStageSlot(event.clientX)
    stageDropHint.value = `拖放后移动到 ${draggedStageSlot.value || 'center'}`
  }
}

function handleStageDragLeave(event: DragEvent) {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && stageFrameRef.value?.contains(nextTarget)) {
    return
  }
  stageDropActive.value = false
  draggedStageSlot.value = ''
  stageDropHint.value = '拖入图片或音频资源，自动加入脚本资源库'
}

async function handleStageDrop(event: DragEvent) {
  event.preventDefault()
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const imported: string[] = []
    const skipped: string[] = []
    let didAutoApply = false
    for (const file of Array.from(files)) {
      const created = await createImportedAsset(file)
      if (!created) {
        skipped.push(file.name)
        continue
      }
      const registered = registerAsset(
        created.category,
        created.id,
        created.src,
        {
          silent: true,
        },
      )
      if (!registered) continue
      imported.push(registered.id)
      if (didAutoApply) {
        continue
      }
      if (created.category === 'backgrounds') {
        setBackgroundForActiveCommand(registered.src)
        didAutoApply = true
      } else if (created.category === 'standees') {
        setStandeeForActiveCommand(registered.src)
        didAutoApply = true
      } else if (created.category === 'bgm') {
        setBgmForActiveCommand(registered.src)
        didAutoApply = true
      }
    }

    if (imported.length > 0) {
      showStageMessage(
        `已导入 ${imported.length} 个资源：${imported.join('、')}${didAutoApply ? '；已自动应用首个兼容资源' : ''}${skipped.length ? `；忽略 ${skipped.length} 个不支持文件` : ''}`,
      )
    } else if (skipped.length > 0) {
      showStageMessage(`未导入资源：${skipped.join('、')}`)
    }
    stageDropActive.value = false
    draggedStageSlot.value = ''
    stageDropHint.value = '拖入图片或音频资源，自动加入脚本资源库'
    return
  }

  if (draggingStageCharacterId.value) {
    const slot = resolveStageSlot(event.clientX)
    updateCharacterSlotById(draggingStageCharacterId.value, slot)
  }

  stageDropActive.value = false
  draggedStageSlot.value = ''
  stageDropHint.value = '拖入图片或音频资源，自动加入脚本资源库'
}

function handleSampleDropdownSelect(id: string) {
  sampleDropdownValue.value = ''
  if (id) loadSample(id)
}

watch(
  () => rawText.value,
  () => {
    if (analysisTimer.value) window.clearTimeout(analysisTimer.value)
    analysisTimer.value = window.setTimeout(refreshAnalysis, 300)
    queuePreviewSync()
  },
)

watch(
  () => doc.value,
  (next) => {
    if (!next) return
    metaForm.scriptId = next.meta.scriptId
    metaForm.title = next.meta.title
    metaForm.schemaVersion = next.meta.schemaVersion
    if (!activeSceneId.value && next.scenes.length > 0) {
      activeSceneId.value = next.scenes[0].id
    }
  },
  { immediate: true },
)

watch(
  () => activeScene.value,
  (scene) => {
    if (!scene) return
    if (!activeCommandId.value && scene.commands.length > 0) {
      activeCommandId.value = scene.commands[0].id
    }
    queuePreviewSync(180)
  },
)

watch(
  () => activeCommandId.value,
  (cmdId) => {
    if (skipNextJump) {
      skipNextJump = false
      return
    }
    if (cmdId) {
      jumpToCommand(cmdId)
      scrollCommandIntoView(cmdId)
    }
  },
)

watch(
  () => previewFullscreen.value,
  (isFs) => {
    if (isFs) {
      nextTick(() => fullscreenRef.value?.focus())
    }
  },
)

watch(
  () => activeSceneId.value,
  () => {
    inlineInsertIndex.value = null
    clearCommandInteractionState()
    clearSnippetDragState()
  },
)

function handleFullscreenKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    previewFullscreen.value = false
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    navigateCommand('prev')
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    navigateCommand('next')
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    handlePreviewNext()
  }
}

onMounted(() => {
  isAlive.value = true
  previewUnsubscribe = facade.subscribe(() => {
    updatePreviewSnapshot()
  })
  void facade.boot().then(() => {
    if (!isAlive.value) return
    updatePreviewSnapshot()
  })
  if (scriptIds.value.includes('prologue')) {
    loadSample('prologue')
  } else {
    loadTemplate()
  }
})

onUnmounted(() => {
  isAlive.value = false
  if (analysisTimer.value) {
    window.clearTimeout(analysisTimer.value)
    analysisTimer.value = null
  }
  if (focusFrame.value) {
    window.cancelAnimationFrame(focusFrame.value)
    focusFrame.value = null
  }
  if (previewTimer.value) {
    window.clearTimeout(previewTimer.value)
    previewTimer.value = null
  }
  if (stageMessageTimer.value) {
    window.clearTimeout(stageMessageTimer.value)
    stageMessageTimer.value = null
  }
  previewUnsubscribe?.()
  previewUnsubscribe = null
})
</script>

<template>
  <div
    class="relative w-full h-screen overflow-hidden bg-gal-bg-base flex flex-col font-sans"
  >
    <!-- 1. 顶部：全局工具栏 (Top App Bar) -->
    <header
      class="shrink-0 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-transparent z-20"
    >
      <div class="flex items-center gap-4">
        <h1
          class="font-serif text-xl font-extrabold text-gal-text tracking-[0.15em] m-0 inline-flex items-center gap-2"
        >
          剧本编辑
        </h1>
        <!-- File Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <GalButton
            text="新建"
            layout="horizontal"
            @click="loadTemplate"
            class="shrink-0"
          />

          <div class="shrink-0 w-28">
            <GalDropdown
              :model-value="sampleDropdownValue"
              :options="sampleDropdownOptions"
              placeholder="载入示例"
              @update:model-value="handleSampleDropdownSelect"
            />
          </div>

          <GalButton
            text="读取本地"
            layout="horizontal"
            @click="loadLocal"
            class="shrink-0"
          />
          <GalButton
            text="保存本地"
            layout="horizontal"
            @click="saveLocal"
            class="shrink-0"
          />
          <GalButton
            text="下载脚本"
            layout="horizontal"
            @click="downloadScript"
            class="shrink-0"
          />
          <span
            v-if="fileActionError"
            class="max-w-[320px] text-xs text-red-500/90 px-3 py-1.5 rounded-full bg-red-500/8"
          >
            文件操作失败：{{ fileActionError }}
          </span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <!-- Tools Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <GalButton
            text="格式化"
            layout="horizontal"
            @click="formatScript"
            class="shrink-0"
          />
          <GalButton
            text="分析"
            layout="horizontal"
            @click="refreshAnalysis"
            class="shrink-0"
          />
          <GalButton
            text="清空"
            layout="horizontal"
            @click="
              showConfirm('清空脚本', '确定要清空当前内容吗？', () => {
                setRaw('')
              })
            "
            class="shrink-0"
          />
        </div>
        <!-- Session Info -->
        <div class="flex items-center gap-2 text-xs">
          <GalTag
            :text="metaForm.title || '未命名剧本'"
            class="hidden! xl:!inline-flex"
          />
          <GalTag :text="statusSummary" />
          <GalButton text="返回标题" layout="horizontal" @click="back" />
        </div>
      </div>
    </header>

    <!-- 主体：三栏式工作区 -->
    <div class="flex-1 flex overflow-hidden p-4 gap-4">
      <!-- 2. 左侧：资源与大纲栏 (Left Sidebar) -->
      <aside class="w-64 lg:w-72 shrink-0 flex flex-col gap-4 min-h-0 pr-1">
        <!-- 剧本信息 -->
        <div class="gal-panel p-4 flex flex-col gap-3 shrink-0">
          <div
            class="text-sm font-semibold tracking-[0.1em] text-(--color-md-on-surface)"
          >
            剧本属性
          </div>
          <GalField label="ID" sub-label="Script">
            <input
              v-model="metaForm.scriptId"
              class="gal-input text-xs py-1"
              @blur="applyMeta"
            />
          </GalField>
          <GalField label="标题" sub-label="Title">
            <input
              v-model="metaForm.title"
              class="gal-input text-xs py-1"
              @blur="applyMeta"
            />
          </GalField>
        </div>

        <!-- 场景大纲 -->
        <div class="gal-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <div class="p-4 shrink-0">
            <div
              class="text-sm font-semibold tracking-[0.1em] flex justify-between items-center"
            >
              <span>场景大纲</span>
              <GalTag :text="String(sceneList.length)" />
            </div>
          </div>
          <div
            class="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar"
          >
            <button
              v-for="scene in sceneList"
              :key="scene.id"
              class="w-full text-left rounded-[16px] px-3 py-3 transition-all duration-200 bg-(--color-md-surface-container-low) hover:bg-(--color-md-surface-container-high) cursor-pointer"
              :class="
                activeScene?.id === scene.id
                  ? '!bg-(--color-md-primary-container) text-(--color-md-on-primary-container)'
                  : ''
              "
              @click="activeSceneId = scene.id"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold tracking-[0.1em] truncate">
                    {{ scene.title }}
                  </div>
                  <div class="text-[10px] opacity-75 mt-1 truncate">
                    {{ scene.id }}
                  </div>
                </div>
                <GalTag :text="String(scene.commands.length)" />
              </div>
            </button>
            <div
              v-if="!sceneList.length"
              class="text-xs text-gal-text-sub text-center py-4"
            >
              无场景
            </div>
          </div>
        </div>

        <!-- 总览数据 -->
        <div class="gal-panel p-4 grid grid-cols-2 gap-2 shrink-0">
          <div>
            <div class="text-[10px] text-gal-text-sub">指令总数</div>
            <div class="text-sm font-bold">{{ sceneCommandCount }}</div>
          </div>
          <div>
            <div class="text-[10px] text-gal-text-sub">变量</div>
            <div class="text-sm font-bold">
              {{ doc ? Object.keys(doc.variables ?? {}).length : 0 }}
            </div>
          </div>
        </div>
      </aside>

      <!-- 3. 中央：剧本核心编辑区 (Main Workspace) -->
      <main
        class="flex-1 min-w-0 flex flex-col gap-0 gal-panel overflow-hidden bg-(--color-md-surface-container)"
      >
        <!-- 中央控制头 -->
        <div
          class="shrink-0 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
        >
          <div class="flex items-center gap-3">
            <GalSegmented v-model="viewMode" :items="viewItems" />
          </div>
          <div
            class="text-xs text-gal-text-sub tracking-wider flex items-center gap-3"
          >
            <GalTag
              v-if="viewMode === 'editor'"
              :text="`${rawText.length} 字符`"
            />
            <GalTag
              v-if="viewMode === 'structure'"
              :text="`场景: ${activeScene?.id || '未选择'}`"
            />
          </div>
        </div>

        <!-- 编辑区内容 -->
        <div class="flex-1 min-h-0 overflow-hidden relative">
          <!-- Code Editor View -->
          <div v-if="viewMode === 'editor'" class="absolute inset-0">
            <textarea
              ref="editorRef"
              v-model="rawText"
              class="w-full h-full p-6 font-mono text-[13px] tracking-[0.05em] resize-none bg-transparent outline-none text-(--color-md-on-surface) custom-scrollbar"
              placeholder="在这里编写 YAML 剧本..."
              @dragover="handleEditorDragOver"
              @drop="handleEditorDrop"
            ></textarea>
            <div
              class="absolute right-6 bottom-6 z-10 text-[10px] text-gal-text-sub tracking-[0.14em] pointer-events-none opacity-50 bg-(--color-md-surface-container) px-3 py-1.5 rounded-full"
            >
              拖入积木可快速插入
            </div>
          </div>

          <!-- Structure View -->
          <div
            v-else-if="viewMode === 'structure'"
            class="absolute inset-0 flex flex-col xl:flex-row bg-transparent"
          >
            <div class="w-full xl:w-80 flex flex-col shrink-0 h-1/2 xl:h-auto">
              <div class="p-4 shrink-0 flex flex-col gap-3">
                <button
                  class="w-full rounded-[20px] px-3 py-3 text-left text-sm font-semibold bg-(--color-md-surface-container) text-(--color-md-on-surface) hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer"
                  @click="openInlineInsert(0)"
                >
                  + 在顶部新增命令
                </button>
                <input
                  v-model="searchText"
                  class="gal-input text-xs py-1.5"
                  placeholder="搜索指令..."
                />
                <GalDropdown
                  v-model="commandTypeFilter"
                  :options="typeFilterOptions"
                  :searchable="true"
                />
              </div>
              <div
                ref="commandListRef"
                class="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2 custom-scrollbar"
                @dragover.capture="handleCommandListDragOver"
                @drop.capture="handleCommandListDrop"
                @dragleave="handleCommandListDragLeave"
              >
                <div
                  v-for="(command, index) in visibleStructureCommands"
                  :key="command.id"
                  class="flex flex-col gap-2"
                >
                  <div
                    v-if="!isCommandListFiltered"
                    class="rounded-[18px] transition-colors"
                    :class="
                      dragInsertIndex === index
                        ? 'bg-(--color-md-secondary-container)'
                        : inlineInsertIndex === index
                          ? 'bg-(--color-md-surface-container)'
                          : 'bg-transparent hover:bg-(--color-md-surface-container)'
                    "
                    @dragover="handleCommandInsertZoneDragOver(index, $event)"
                    @drop="handleCommandInsertZoneDrop(index, $event)"
                  >
                    <button
                      class="w-full px-3 py-2 text-xs text-left text-(--color-md-on-surface-variant) cursor-pointer transition-opacity"
                      :class="
                        inlineInsertIndex === index || dragInsertIndex === index
                          ? 'opacity-100'
                          : 'opacity-70 hover:opacity-100'
                      "
                      @click="openInlineInsert(index)"
                    >
                      + 在此处插入命令
                    </button>
                    <div v-if="inlineInsertIndex === index" class="px-3 pb-3">
                      <GalDropdown
                        :model-value="''"
                        :options="typeDropdownOptions"
                        placeholder="选择命令类型"
                        :searchable="true"
                        @update:model-value="
                          handleInlineInsertType($event, index)
                        "
                      />
                    </div>
                  </div>

                  <div
                    :data-cmd-id="command.id"
                    class="rounded-[22px] px-4 py-3 cursor-pointer transition-colors"
                    :class="
                      activeCommand?.id === command.id
                        ? 'bg-(--color-md-primary-container) text-(--color-md-on-primary-container)'
                        : draggedCommandId === command.id
                          ? 'bg-(--color-md-tertiary-container) text-(--color-md-on-tertiary-container)'
                          : 'bg-(--color-md-surface-container) text-(--color-md-on-surface) hover:bg-(--color-md-surface-container-high)'
                    "
                    draggable="true"
                    @click="activeCommandId = command.id"
                    @dragstart="handleCommandDragStart(command.id, $event)"
                    @dragend="handleCommandDragEnd"
                    @dragover="handleCommandCardDragOver(index, $event)"
                    @drop="handleCommandCardDrop(index, $event)"
                  >
                    <div class="flex items-start gap-3">
                      <button
                        class="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-black/0 text-current/65 hover:bg-black/6 hover:text-current transition-colors cursor-grab active:cursor-grabbing"
                        type="button"
                        draggable="true"
                        title="拖拽排序"
                        @click.stop
                        @dragstart.stop="
                          handleCommandDragStart(command.id, $event)
                        "
                      >
                        ⋮⋮
                      </button>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-xs font-semibold truncate">
                            {{ command.id }}
                          </span>
                          <span class="text-[10px] opacity-70">
                            {{ typeLabel(command.type) }}
                          </span>
                        </div>
                        <div class="text-[11px] opacity-75 mt-1 line-clamp-2">
                          {{ commandSummary(command) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="!isCommandListFiltered"
                  class="rounded-[18px] transition-colors"
                  :class="
                    dragInsertIndex === structureCommands.length
                      ? 'bg-(--color-md-secondary-container)'
                      : inlineInsertIndex === structureCommands.length
                        ? 'bg-(--color-md-surface-container)'
                        : 'bg-transparent hover:bg-(--color-md-surface-container)'
                  "
                  @dragover="
                    handleCommandInsertZoneDragOver(
                      structureCommands.length,
                      $event,
                    )
                  "
                  @drop="
                    handleCommandInsertZoneDrop(
                      structureCommands.length,
                      $event,
                    )
                  "
                >
                  <button
                    class="w-full px-3 py-2 text-xs text-left text-(--color-md-on-surface-variant) cursor-pointer transition-opacity"
                    :class="
                      inlineInsertIndex === structureCommands.length ||
                      dragInsertIndex === structureCommands.length
                        ? 'opacity-100'
                        : 'opacity-70 hover:opacity-100'
                    "
                    @click="openInlineInsert(structureCommands.length)"
                  >
                    + 在末尾新增命令
                  </button>
                  <div
                    v-if="inlineInsertIndex === structureCommands.length"
                    class="px-3 pb-3"
                  >
                    <GalDropdown
                      :model-value="''"
                      :options="typeDropdownOptions"
                      placeholder="选择命令类型"
                      :searchable="true"
                      @update:model-value="
                        handleInlineInsertType($event, structureCommands.length)
                      "
                    />
                  </div>
                </div>

                <div
                  v-if="!visibleStructureCommands.length"
                  class="rounded-[20px] bg-(--color-md-surface-container) px-4 py-6 text-center text-xs text-(--color-md-on-surface-variant)"
                  @dragover="handleCommandInsertZoneDragOver(0, $event)"
                  @drop="handleCommandInsertZoneDrop(0, $event)"
                >
                  {{
                    isCommandListFiltered
                      ? '当前筛选条件下没有匹配的命令。'
                      : '当前场景还没有命令，从顶部或末尾开始新增一条。'
                  }}
                </div>
              </div>
            </div>
            <div
              class="flex-1 overflow-y-auto p-5 md:p-6 custom-scrollbar h-1/2 xl:h-auto"
            >
              <div v-if="activeCommand" class="flex flex-col gap-4 max-w-2xl">
                <!-- Header + actions -->
                <div class="flex items-center justify-between gap-3 px-1 py-1">
                  <div class="flex items-center gap-2">
                    <GalTag :text="typeLabel(activeCommand.type)" />
                    <span class="text-lg font-bold tracking-[0.1em]">{{
                      activeCommand.id
                    }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-(--color-md-surface-container-high) text-(--color-md-on-surface-variant) text-xs cursor-pointer hover:bg-(--color-md-secondary-container) hover:text-(--color-md-on-secondary-container) transition-colors"
                      title="上移"
                      @click="moveActiveCommand('up')"
                    >
                      ↑
                    </button>
                    <button
                      class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-(--color-md-surface-container-high) text-(--color-md-on-surface-variant) text-xs cursor-pointer hover:bg-(--color-md-secondary-container) hover:text-(--color-md-on-secondary-container) transition-colors"
                      title="下移"
                      @click="moveActiveCommand('down')"
                    >
                      ↓
                    </button>
                    <button
                      class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-(--color-md-surface-container-high) text-(--color-md-on-surface-variant) text-xs cursor-pointer hover:bg-red-500/18 hover:text-red-500 transition-colors"
                      title="删除"
                      @click="
                        showConfirm(
                          '删除指令',
                          `确认删除 ${activeCommand.id}？`,
                          deleteActiveCommand,
                        )
                      "
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <CommandEditor
                  class="px-1 py-2"
                  :command="activeCommand"
                  @update="updateActiveCommandPayload"
                />

                <div
                  v-if="isCommandListFiltered && !activeCommandVisibleInFilter"
                  class="rounded-[20px] bg-(--color-md-secondary-container) px-4 py-3 text-xs text-(--color-md-on-secondary-container)"
                >
                  当前选中命令未显示在筛选结果中，右侧仍在编辑原始选中项。
                  <button
                    class="ml-2 underline underline-offset-2 cursor-pointer"
                    @click="clearCommandFilters"
                  >
                    清除筛选
                  </button>
                </div>
              </div>
              <div
                v-else
                class="h-full flex items-center justify-center text-sm text-gal-text-sub"
              >
                选中左侧指令查看详情
              </div>
            </div>
          </div>

          <!-- Validation View -->
          <div
            v-else
            class="absolute inset-0 flex flex-col p-4 md:p-6 overflow-y-auto custom-scrollbar"
          >
            <div class="grid grid-cols-3 gap-4 mb-6 shrink-0">
              <div class="gal-panel p-4">
                <div class="text-xs text-gal-text-sub">解析错误</div>
                <div class="text-xl font-bold">{{ parseErrors.length }}</div>
              </div>
              <div class="gal-panel p-4">
                <div class="text-xs text-gal-text-sub">校验错误</div>
                <div class="text-xl font-bold">{{ validateErrors.length }}</div>
              </div>
              <div class="gal-panel p-4">
                <div class="text-xs text-gal-text-sub">编译错误</div>
                <div class="text-xl font-bold">{{ compileErrors.length }}</div>
              </div>
            </div>
            <div class="flex flex-col gap-3">
              <div
                v-for="err in [
                  ...parseErrors,
                  ...validateErrors,
                  ...compileErrors,
                ]"
                :key="err.message + String(err.code)"
                class="gal-panel p-4 bg-red-900/10"
              >
                <div class="text-xs text-red-400 font-mono">{{ err.code }}</div>
                <div class="text-sm font-semibold mt-1 text-red-200">
                  {{ err.message }}
                </div>
                <pre
                  class="text-[11px] text-red-300/70 whitespace-pre-wrap mt-2 m-0"
                  >{{
                    err.detail ? JSON.stringify(err.detail, null, 2) : ''
                  }}</pre
                >
              </div>
              <div
                v-if="validationIssueCount === 0"
                class="flex items-center justify-center h-40 text-sm text-green-400/80"
              >
                完美！剧本校验通过，没有发现错误。
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- 4. 右侧：预览与属性检查器 (Right Sidebar) -->
      <aside
        class="w-80 lg:w-[400px] xl:w-[480px] shrink-0 flex flex-col gap-4 min-h-0"
      >
        <!-- 上半部分：16:9 实时预览窗口 -->
        <div
          class="w-full aspect-video rounded-[24px] bg-[#0a0a0a] relative overflow-hidden shrink-0"
        >
          <div
            v-if="!previewReady"
            class="absolute inset-0 flex items-center justify-center p-6 text-center z-10"
          >
            <div
              class="text-xs text-gal-text-sub/80 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm"
            >
              {{
                previewSyncing
                  ? '正在推送到基座…'
                  : previewError || '点击下方「联动」开始预演'
              }}
            </div>
          </div>

          <!-- 背景标签提示 -->
          <div
            v-if="previewReady"
            class="absolute top-3 left-4 z-10 opacity-60 text-[10px] tracking-widest text-white pointer-events-none bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm"
          >
            BG: {{ previewBackgroundLabel }}
          </div>

          <template v-if="previewReady">
            <!-- 预演舞台内容 -->
            <div
              class="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none z-10"
            >
              <div
                v-for="character in previewCharacters"
                :key="character.charId"
                class="w-16 sm:w-20 transition-all text-center bg-(--color-md-surface-container)/80 backdrop-blur-md rounded-xl p-2 mx-1"
                :class="
                  character.visible ? 'opacity-100' : 'opacity-0 translate-y-2'
                "
              >
                <div
                  class="text-[9px] sm:text-[10px] text-gal-text-sub uppercase"
                >
                  {{ character.slot }}
                </div>
                <div
                  class="text-[10px] sm:text-xs font-bold text-(--color-md-on-surface)"
                >
                  {{ character.charId }}
                </div>
              </div>
            </div>

            <!-- 对话框 -->
            <DialogueBox
              layout="overlay"
              class="transform scale-[0.55] lg:scale-[0.65] xl:scale-[0.75] origin-bottom absolute bottom-0 left-0 right-0 z-20 pb-2"
              :speaker-name="previewDialogue?.speakerName ?? undefined"
              :display-text="previewDialogue?.textRendered || '...'"
              :is-typing="
                Boolean(
                  previewDialogue?.typing.active &&
                  !previewDialogue?.typing.completed,
                )
              "
              :choice-open="Boolean(previewChoice?.open)"
              @next="handlePreviewNext"
            />

            <!-- 选择肢 -->
            <ChoiceLayer
              class="transform scale-[0.6] lg:scale-[0.7] xl:scale-[0.8] origin-center z-30"
              :open="Boolean(previewChoice?.open)"
              :prompt="previewChoice?.prompt"
              :options="previewChoice?.options ?? []"
              @choose="handlePreviewChoose"
            />
          </template>
        </div>

        <!-- 预览控制栏 -->
        <div
          class="shrink-0 flex items-center justify-between gap-2 p-2 rounded-[24px] bg-(--color-md-surface-container)"
        >
          <button
            class="flex-1 py-1.5 text-xs font-semibold rounded-[12px] hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer flex items-center justify-center gap-1"
            :class="
              previewReady ? 'text-green-400' : 'text-(--color-md-primary)'
            "
            @click="syncPreview"
          >
            <span>{{ previewReady ? '↻' : '▶' }}</span>
            <span>{{ previewReady ? '同步' : '联动' }}</span>
          </button>
          <button
            class="flex-1 py-1.5 text-xs font-semibold rounded-[12px] hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer text-(--color-md-on-surface-variant)"
            @click="handlePreviewNext"
          >
            下一句
          </button>
          <button
            class="flex-1 py-1.5 text-xs font-semibold rounded-[12px] hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer text-(--color-md-on-surface-variant)"
            @click="handlePreviewSkip"
          >
            跳过
          </button>
          <button
            class="flex-1 py-1.5 text-xs font-semibold rounded-[12px] hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer text-(--color-md-on-surface-variant)"
            @click="handlePreviewToggleAuto"
          >
            {{ previewFlags?.autoMode ? '停止自动' : '自动' }}
          </button>
          <button
            class="flex-1 py-1.5 text-xs font-semibold rounded-[12px] hover:bg-(--color-md-surface-container-high) transition-colors cursor-pointer text-(--color-md-primary)"
            @click="previewFullscreen = true"
          >
            全屏
          </button>
        </div>

        <!-- 下半部分：属性检查器 / 创作面板 (Inspector) -->
        <div
          class="flex-1 min-h-0 overflow-hidden flex flex-col rounded-[28px] bg-(--color-md-surface-container)"
        >
          <div class="shrink-0 p-4 pb-0">
            <span
              class="text-sm font-semibold tracking-[0.1em] text-(--color-md-on-surface)"
              >创作与配置面板</span
            >
          </div>

          <div
            class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar"
          >
            <!-- 快速积木区 -->
            <div class="flex flex-col gap-3 px-1 py-1">
              <div
                class="text-[11px] text-(--color-md-primary) uppercase tracking-widest font-semibold"
              >
                快速插入（拖拽至左侧）
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="item in quickInsertItems"
                  :key="item.id"
                  draggable="true"
                  class="rounded-full bg-(--color-md-surface-container-high) px-3 py-1.5 text-xs font-medium text-(--color-md-on-surface) cursor-grab active:cursor-grabbing hover:bg-(--color-md-secondary-container) hover:text-(--color-md-on-secondary-container) transition-colors"
                  @click="handleQuickInsert(item.id as ScriptCommandType)"
                  @dragstart="
                    handleSnippetDragStart(item.id as ScriptCommandType, $event)
                  "
                  @dragend="handleSnippetDragEnd"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <!-- 新增场景 -->
            <div class="flex flex-col gap-3 px-1 py-1">
              <div
                class="text-[11px] text-(--color-md-primary) uppercase tracking-widest font-semibold"
              >
                新增场景
              </div>
              <div class="flex flex-col gap-2">
                <input
                  v-model="newScene.id"
                  class="gal-input text-xs"
                  placeholder="场景 ID (如: scene_01)"
                />
                <input
                  v-model="newScene.title"
                  class="gal-input text-xs"
                  placeholder="场景标题"
                />
                <GalButton text="创建新场景" @click="addScene" />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Fullscreen Preview Overlay -->
    <Transition name="fade">
      <div
        v-if="previewFullscreen"
        ref="fullscreenRef"
        class="fixed inset-0 z-50 bg-black flex flex-col"
        tabindex="0"
        @keydown="handleFullscreenKeydown"
      >
        <!-- Top control bar -->
        <div
          class="shrink-0 flex items-center justify-between px-5 py-2.5 bg-black/60 backdrop-blur-md z-30"
        >
          <div class="flex items-center gap-3">
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="previewFullscreen = false"
            >
              ← 退出
            </button>
            <GalTag
              v-if="activeCommand"
              :text="typeLabel(activeCommand.type)"
            />
            <span class="text-sm text-white/80 font-semibold tracking-wider">{{
              activeCommand?.id ?? '—'
            }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="navigateCommand('prev')"
            >
              ◀ 上一条
            </button>
            <span
              class="text-xs text-white/40 tabular-nums min-w-[4em] text-center"
              >{{ activeCommandIndex + 1 }} /
              {{ activeScene?.commands.length ?? 0 }}</span
            >
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="navigateCommand('next')"
            >
              下一条 ▶
            </button>
            <button
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              :class="
                showEditPanel
                  ? 'text-white bg-white/20'
                  : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
              "
              @click="showEditPanel = !showEditPanel"
            >
              面板
            </button>
          </div>
        </div>

        <!-- Fullscreen body: 16:9 stage + right panel -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Left: 16:9 locked stage -->
          <div
            class="flex-1 flex items-center justify-center bg-black/90 overflow-hidden p-3"
          >
            <div
              class="relative aspect-video w-full max-h-full rounded-2xl overflow-hidden bg-[#0a0a0a]"
            >
              <!-- Background -->
              <div
                ref="stageFrameRef"
                class="absolute inset-0 bg-cover bg-center transition-[background-image] duration-800 ease"
                :style="
                  previewStage?.backgroundKey
                    ? {
                        backgroundImage: `url(${previewStage.backgroundKey})`,
                      }
                    : {}
                "
              />

              <!-- Characters at proper positions -->
              <div
                class="absolute inset-0 flex items-end justify-center"
                @dragover="handleStageDragOver"
                @dragleave="handleStageDragLeave"
                @drop="handleStageDrop"
              >
                <template v-if="previewStage?.characters">
                  <div
                    v-for="(char, id) in previewStage.characters"
                    :key="id"
                    v-show="char.visible"
                    class="absolute bottom-0 transition-all duration-500 ease cursor-grab active:cursor-grabbing"
                    :class="{
                      'left-[10%]': char.slot === 'left',
                      'left-1/2 -translate-x-1/2': char.slot === 'center',
                      'right-[10%]': char.slot === 'right',
                      'ring-2 ring-(--color-md-primary) ring-offset-2 ring-offset-black/40 rounded-[24px]':
                        activeCharacterId === String(id),
                    }"
                    draggable="true"
                    @dragstart="
                      handleStageCharacterDragStart(String(id), $event)
                    "
                    @dragend="handleStageCharacterDragEnd"
                  >
                    <img
                      v-if="char.poseKey"
                      :src="char.poseKey"
                      :alt="String(id)"
                      class="max-h-[85%] object-contain pointer-events-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
                    />
                    <div
                      v-else
                      class="w-20 h-40 bg-white/8 backdrop-blur-md rounded-xl flex flex-col items-center justify-center mb-24"
                    >
                      <div class="text-[10px] text-white/40 uppercase">
                        {{ char.slot }}
                      </div>
                      <div class="text-xs font-bold text-white/70 mt-1">
                        {{ char.charId }}
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <div
                class="absolute inset-0 z-10"
                @dragover="handleStageDragOver"
                @dragleave="handleStageDragLeave"
                @drop="handleStageDrop"
              ></div>

              <!-- BG label -->
              <div
                class="absolute top-3 left-4 z-10 opacity-60 text-[10px] tracking-widest text-white pointer-events-none bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm"
              >
                BG: {{ previewBackgroundLabel }}
              </div>

              <div
                class="absolute top-3 right-4 z-10 opacity-80 text-[10px] tracking-widest text-white bg-black/30 px-2 py-1 rounded-md backdrop-blur-sm"
              >
                BGM: {{ previewBgmLabel }}
              </div>

              <div
                v-if="stageDropActive"
                class="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
              >
                <div
                  class="min-w-[280px] max-w-[70%] rounded-[28px] border border-white/18 bg-black/55 px-6 py-5 text-center text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
                >
                  <div
                    class="text-xs uppercase tracking-[0.35em] text-white/55"
                  >
                    Stage Editor
                  </div>
                  <div class="mt-2 text-sm font-semibold tracking-[0.08em]">
                    {{ stageDropHint }}
                  </div>
                  <div
                    class="mt-3 flex items-center justify-center gap-3 text-[11px] text-white/55"
                  >
                    <span>左</span>
                    <span
                      class="inline-flex h-2 w-24 rounded-full bg-white/12 overflow-hidden"
                    >
                      <span
                        class="h-full bg-(--color-md-primary) transition-all duration-200"
                        :style="{
                          width:
                            draggedStageSlot === 'left'
                              ? '33%'
                              : draggedStageSlot === 'center'
                                ? '66%'
                                : draggedStageSlot === 'right'
                                  ? '100%'
                                  : '0%',
                        }"
                      ></span>
                    </span>
                    <span>右</span>
                  </div>
                </div>
              </div>

              <Transition name="fade">
                <div
                  v-if="stageEditorMessage"
                  class="absolute left-1/2 top-12 z-20 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-white/85 backdrop-blur-md"
                >
                  {{ stageEditorMessage }}
                </div>
              </Transition>

              <!-- DialogueBox at full scale -->
              <DialogueBox
                v-if="previewDialogue?.visible !== false"
                layout="overlay"
                :speaker-name="previewDialogue?.speakerName ?? undefined"
                :display-text="previewDialogue?.textRendered || '...'"
                :is-typing="
                  Boolean(
                    previewDialogue?.typing.active &&
                    !previewDialogue?.typing.completed,
                  )
                "
                :choice-open="Boolean(previewChoice?.open)"
                @next="handlePreviewNext"
              />

              <!-- ChoiceLayer at full scale -->
              <ChoiceLayer
                v-if="previewChoice?.open"
                :open="true"
                :prompt="previewChoice?.prompt"
                :options="previewChoice?.options ?? []"
                @choose="handlePreviewChoose"
              />

              <!-- Not ready hint -->
              <div
                v-if="!previewReady"
                class="absolute inset-0 flex items-center justify-center bg-black/60"
              >
                <div
                  class="text-sm text-white/50 bg-black/40 px-6 py-3 rounded-full backdrop-blur-sm"
                >
                  {{
                    previewSyncing
                      ? '正在推送到基座…'
                      : previewError || '请先点击「联动」开始预演'
                  }}
                </div>
              </div>
            </div>
          </div>

          <!-- Right: command list + edit panel -->
          <Transition name="slide-panel">
            <div
              v-if="showEditPanel"
              class="w-80 xl:w-96 shrink-0 bg-black/70 backdrop-blur-xl flex flex-col pointer-events-auto theme-dark"
              @keydown.stop
            >
              <!-- Command list (top section) -->
              <div
                class="shrink-0 flex flex-col bg-black/8"
                style="max-height: 45%"
              >
                <div class="shrink-0 px-3 pt-3 pb-1 flex flex-col gap-2">
                  <input
                    v-model="fsSearchText"
                    class="gal-input text-xs"
                    placeholder="搜索指令..."
                  />
                  <div class="flex items-center gap-1">
                    <div class="flex-1">
                      <GalDropdown
                        :model-value="''"
                        :options="typeDropdownOptions"
                        placeholder="+ 插入"
                        :searchable="true"
                        @update:model-value="handleInsertCommandType"
                      />
                    </div>
                    <button
                      class="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-white/8 text-white/60 text-sm cursor-pointer hover:bg-white/18 hover:text-white transition-colors"
                      title="上移"
                      @click="moveActiveCommand('up')"
                    >
                      ↑
                    </button>
                    <button
                      class="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-white/8 text-white/60 text-sm cursor-pointer hover:bg-white/18 hover:text-white transition-colors"
                      title="下移"
                      @click="moveActiveCommand('down')"
                    >
                      ↓
                    </button>
                    <button
                      class="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-white/8 text-white/60 text-sm cursor-pointer hover:bg-red-500/30 hover:text-red-400 transition-colors"
                      title="删除"
                      @click="
                        activeCommand &&
                        showConfirm(
                          '删除指令',
                          `确认删除 ${activeCommand.id}？`,
                          deleteActiveCommand,
                        )
                      "
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div class="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                  <div
                    v-for="cmd in fsFilteredCommands"
                    :key="cmd.id"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors mb-0.5"
                    :class="
                      activeCommand?.id === cmd.id
                        ? 'bg-white/15 text-white'
                        : 'text-white/60 hover:bg-white/8 hover:text-white/80'
                    "
                    @click="activeCommandId = cmd.id"
                  >
                    <span
                      class="shrink-0 w-1.5 h-1.5 rounded-full"
                      :class="
                        activeCommand?.id === cmd.id
                          ? 'bg-(--color-md-primary)'
                          : 'bg-white/20'
                      "
                    ></span>
                    <span class="text-[11px] font-semibold truncate flex-1">{{
                      cmd.id
                    }}</span>
                    <span
                      class="text-[10px] opacity-50 shrink-0 max-w-[8em] truncate"
                      :title="commandSummary(cmd)"
                      >{{ typeLabel(cmd.type) }}</span
                    >
                  </div>
                  <div
                    v-if="!fsFilteredCommands.length"
                    class="text-xs text-white/30 text-center py-4"
                  >
                    无匹配指令
                  </div>
                </div>
              </div>

              <!-- Edit form (bottom section) -->
              <div class="flex-1 min-h-0 flex flex-col">
                <div
                  v-if="activeCommand"
                  class="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/4"
                >
                  <GalTag :text="typeLabel(activeCommand.type)" />
                  <span class="text-xs text-white/70 font-semibold truncate">{{
                    activeCommand.id
                  }}</span>
                </div>

                <div
                  class="shrink-0 border-b border-white/8 px-4 py-3 bg-white/3"
                >
                  <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between gap-2">
                      <span
                        class="text-[11px] uppercase tracking-[0.28em] text-white/45"
                        >资源抽屉</span
                      >
                      <span class="text-[10px] text-white/35"
                        >拖入新资源 / 点选应用到当前指令</span
                      >
                    </div>
                    <GalSegmented
                      v-model="resourceTab"
                      :items="[
                        { id: 'backgrounds', label: '背景' },
                        { id: 'standees', label: '立绘' },
                        { id: 'audio', label: '音频' },
                      ]"
                    />
                    <input
                      v-model="assetSearchText"
                      class="gal-input text-xs"
                      placeholder="搜索资源 ID 或路径..."
                    />

                    <div
                      v-if="resourceTab === 'backgrounds'"
                      class="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto custom-scrollbar pr-1"
                    >
                      <button
                        v-for="asset in visibleAssetGroups.backgrounds"
                        :key="asset.id"
                        class="group overflow-hidden rounded-[20px] border border-white/8 bg-white/5 text-left transition hover:bg-white/10 cursor-pointer"
                        @click="setBackgroundForActiveCommand(asset.src)"
                      >
                        <div
                          class="aspect-[16/10] bg-cover bg-center"
                          :style="{ backgroundImage: `url(${asset.src})` }"
                        ></div>
                        <div class="px-3 py-2">
                          <div
                            class="text-xs font-semibold text-white truncate"
                          >
                            {{ asset.id }}
                          </div>
                          <div class="mt-1 text-[10px] text-white/45 truncate">
                            {{ asset.src }}
                          </div>
                        </div>
                      </button>
                    </div>

                    <div
                      v-else-if="resourceTab === 'standees'"
                      class="flex flex-col gap-3"
                    >
                      <div class="flex flex-wrap gap-2">
                        <button
                          class="rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                          :class="
                            activeCommand?.type === 'char_show'
                              ? 'bg-(--color-md-primary) text-(--color-md-on-primary)'
                              : 'bg-white/8 text-white/30 cursor-not-allowed opacity-50'
                          "
                          :disabled="activeCommand?.type !== 'char_show'"
                          @click="applyDefaultSlot('left')"
                        >
                          靠左
                        </button>
                        <button
                          class="rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                          :class="
                            activeCommand?.type === 'char_show'
                              ? 'bg-(--color-md-primary) text-(--color-md-on-primary)'
                              : 'bg-white/8 text-white/30 cursor-not-allowed opacity-50'
                          "
                          :disabled="activeCommand?.type !== 'char_show'"
                          @click="applyDefaultSlot('center')"
                        >
                          居中
                        </button>
                        <button
                          class="rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                          :class="
                            activeCommand?.type === 'char_show'
                              ? 'bg-(--color-md-primary) text-(--color-md-on-primary)'
                              : 'bg-white/8 text-white/30 cursor-not-allowed opacity-50'
                          "
                          :disabled="activeCommand?.type !== 'char_show'"
                          @click="applyDefaultSlot('right')"
                        >
                          靠右
                        </button>
                      </div>
                      <div
                        v-if="activeStageCharacter"
                        class="rounded-[20px] bg-white/5 px-3 py-2 text-xs text-white/65"
                      >
                        当前角色：{{ activeStageCharacter.charId }} · 舞台站位
                        {{
                          activeStageCharacter.slot
                        }}。也可以直接在左侧舞台拖拽位置。
                      </div>
                      <div
                        class="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto custom-scrollbar pr-1"
                      >
                        <button
                          v-for="asset in visibleAssetGroups.standees"
                          :key="asset.id"
                          class="group flex min-h-28 items-end overflow-hidden rounded-[20px] border border-white/8 bg-linear-to-b from-white/8 to-white/4 px-3 py-2 text-left transition hover:bg-white/10 cursor-pointer"
                          @click="setStandeeForActiveCommand(asset.src)"
                        >
                          <div class="w-full">
                            <div
                              class="text-xs font-semibold text-white truncate"
                            >
                              {{ asset.id }}
                            </div>
                            <div
                              class="mt-1 text-[10px] text-white/45 truncate"
                            >
                              {{ asset.src }}
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div v-else class="flex flex-col gap-3">
                      <div>
                        <div
                          class="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-2"
                        >
                          BGM
                        </div>
                        <div
                          class="flex flex-col gap-2 max-h-28 overflow-y-auto custom-scrollbar pr-1"
                        >
                          <button
                            v-for="asset in visibleAssetGroups.bgm"
                            :key="asset.id"
                            class="rounded-[18px] border border-white/8 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 cursor-pointer"
                            @click="setBgmForActiveCommand(asset.src)"
                          >
                            <div
                              class="text-xs font-semibold text-white truncate"
                            >
                              {{ asset.id }}
                            </div>
                            <div
                              class="mt-1 text-[10px] text-white/45 truncate"
                            >
                              {{ asset.src }}
                            </div>
                          </button>
                        </div>
                      </div>
                      <div
                        class="grid grid-cols-2 gap-3 text-[11px] text-white/55"
                      >
                        <div
                          class="rounded-[18px] bg-white/5 px-3 py-2 min-h-28"
                        >
                          <div
                            class="uppercase tracking-[0.22em] text-white/35 mb-2"
                          >
                            Voice
                          </div>
                          <div
                            class="flex flex-col gap-2 max-h-20 overflow-y-auto custom-scrollbar pr-1"
                          >
                            <button
                              v-for="asset in visibleAssetGroups.voice"
                              :key="asset.id"
                              class="rounded-[14px] border border-white/8 bg-white/5 px-2.5 py-2 text-left transition hover:bg-white/10 cursor-pointer"
                              @click="setVoiceForActiveCommand(asset.src)"
                            >
                              <div
                                class="text-xs font-semibold text-white truncate"
                              >
                                {{ asset.id }}
                              </div>
                            </button>
                            <div
                              v-if="!visibleAssetGroups.voice.length"
                              class="text-[10px] text-white/35"
                            >
                              暂无语音资源
                            </div>
                          </div>
                        </div>
                        <div
                          class="rounded-[18px] bg-white/5 px-3 py-2 min-h-28"
                        >
                          <div
                            class="uppercase tracking-[0.22em] text-white/35 mb-2"
                          >
                            SFX
                          </div>
                          <div
                            class="flex flex-col gap-2 max-h-20 overflow-y-auto custom-scrollbar pr-1"
                          >
                            <button
                              v-for="asset in visibleAssetGroups.sfx"
                              :key="asset.id"
                              class="rounded-[14px] border border-white/8 bg-white/5 px-2.5 py-2 text-left transition hover:bg-white/10 cursor-pointer"
                              @click="setSfxForActiveCommand(asset.src)"
                            >
                              <div
                                class="text-xs font-semibold text-white truncate"
                              >
                                {{ asset.id }}
                              </div>
                            </button>
                            <div
                              v-if="!visibleAssetGroups.sfx.length"
                              class="text-[10px] text-white/35"
                            >
                              暂无音效资源
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      v-if="!hasResourceEditing"
                      class="rounded-[18px] bg-(--color-md-secondary-container)/40 px-3 py-2 text-xs text-white/70"
                    >
                      当前指令不是资源指令；你仍然可以整理资源库，但点击资源时不会直接写入。
                    </div>
                  </div>
                </div>

                <div
                  v-if="activeCommand"
                  class="flex-1 overflow-y-auto p-4 custom-scrollbar"
                >
                  <CommandEditor
                    :command="activeCommand"
                    :asset-options="commandAssetOptions"
                    @update="updateActiveCommandPayload"
                  />
                </div>

                <div
                  v-else
                  class="flex-1 flex items-center justify-center text-xs text-white/30"
                >
                  选择一条指令开始编辑
                </div>
              </div>
            </div>
          </Transition>

          <!-- Toggle panel button (when collapsed) -->
          <button
            v-if="!showEditPanel"
            class="shrink-0 w-8 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white/50 hover:text-white transition-colors cursor-pointer"
            @click="showEditPanel = true"
          >
            ◀
          </button>
        </div>

        <!-- Bottom info bar -->
        <div
          class="shrink-0 px-5 py-2.5 bg-black/60 backdrop-blur-md flex items-center gap-4 z-30"
        >
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <span
              class="text-[10px] text-white/40 uppercase tracking-widest shrink-0"
              >Stage</span
            >
            <span class="text-xs text-white/60"
              >BG: {{ previewBackgroundLabel }}</span
            >
            <span class="text-xs text-white/60"
              >BGM: {{ previewBgmLabel }}</span
            >
            <template
              v-for="character in previewCharacters"
              :key="character.charId"
            >
              <span v-if="character.visible" class="text-xs text-white/60">
                {{ character.charId }}@{{ character.slot }}
              </span>
            </template>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="syncPreview"
            >
              {{ previewReady ? '↻ 同步' : '▶ 联动' }}
            </button>
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="handlePreviewNext"
            >
              下一句
            </button>
            <button
              class="px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              @click="handlePreviewSkip"
            >
              跳过
            </button>
            <span class="text-[10px] text-white/30 tracking-wider"
              >Esc 退出 · ← → 切换指令 · Space 下一句</span
            >
          </div>
        </div>
      </div>
    </Transition>

    <!-- Confirm Dialog -->
    <GalConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      @confirm="handleConfirm"
      @cancel="confirmDialog.visible = false"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-md-outline-variant);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--color-md-outline);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Fullscreen edit panel slide */
.slide-panel-enter-active {
  transition:
    transform 0.25s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.2s ease;
}
.slide-panel-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.15s ease;
}
.slide-panel-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.slide-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
