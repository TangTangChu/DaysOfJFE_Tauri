import {
  SNAPSHOT_VERSION,
  CONTRACT_VERSION,
} from '../../shared/constants/version'
import type {
  EngineEvent,
  EngineEventListener,
  EngineState,
  GameSettings,
  JsonValue,
  RuntimeAction,
  RuntimeSnapshot,
  Unsubscribe,
} from '../../shared/types/engine'
import type { CompiledScriptIR, IRCommand, IRScene } from '../script/schema'
import {
  createDefaultSettings,
  createInitialEngineState,
} from '../state/defaults'
import { CommandBus } from '../command/commandBus'
import {
  evaluateCondition,
  evaluateExpressionStatement,
} from '../script/expression'

interface RuntimeContext {
  state: EngineState
  scene: IRScene
  command: IRCommand
  jumpToCommandId: (id: string) => void
  emitEvent: (type: EngineEvent['type'], payload: unknown) => void
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item))
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.entries(rec).reduce<Record<string, JsonValue>>(
      (acc, [k, v]) => {
        acc[k] = toJsonValue(v)
        return acc
      },
      {},
    )
  }
  return String(value)
}

function toJsonRecord(value: unknown): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, JsonValue>
  >((acc, [k, v]) => {
    acc[k] = toJsonValue(v)
    return acc
  }, {})
}

export class Runtime {
  private ir: CompiledScriptIR | null = null
  private state: EngineState
  private readonly bus = new CommandBus<RuntimeContext>()
  private readonly listeners = new Set<EngineEventListener>()
  private pendingJumpId: string | null = null
  private pendingSceneId: string | null = null

  constructor() {
    this.state = createInitialEngineState(createDefaultSettings())
    this.registerDefaultHandlers()
  }

  load(ir: CompiledScriptIR): void {
    this.ir = ir
    this.state.variables = structuredClone(ir.initialVariables)
    this.state.runtime.scriptId = ir.scriptId
    this.state.runtime.paused = true
    this.state.runtime.tick = 0
  }

  start(sceneId?: string, commandId?: string): void {
    if (!this.ir) {
      throw new Error('RUNTIME_ILLEGAL_STATE: script not loaded')
    }

    const scene = sceneId
      ? this.ir.sceneIndex[sceneId]
      : Object.values(this.ir.sceneIndex)[0]
    if (!scene) {
      throw new Error('RUNTIME_ILLEGAL_STATE: scene not found')
    }

    const startCommandId = commandId ?? scene.entryCommandId
    const commandIndex = scene.commandMap[startCommandId]
    if (commandIndex === undefined) {
      throw new Error('RUNTIME_ILLEGAL_STATE: entry command not found')
    }

    this.state.runtime.sceneId = scene.id
    this.state.runtime.commandId = startCommandId
    this.state.runtime.commandIndex = commandIndex
    this.state.runtime.paused = false
    this.emit('engine.booted', { sceneId: scene.id, commandId: startCommandId })
  }

  getState(): EngineState {
    return structuredClone(this.state)
  }

  getSettings(): GameSettings {
    return structuredClone(this.state.settings)
  }

  applySettings(settings: GameSettings): void {
    this.state.settings = structuredClone(settings)
    this.state.audio.master = settings.audio.master
    this.state.audio.muted = settings.audio.mute
    this.state.audio.channels.bgm.volume = settings.audio.bgm
    this.state.audio.channels.voice.volume = settings.audio.voice
    this.state.audio.channels.sfx.volume = settings.audio.sfx
    this.emit('settings.changed', { settings: this.state.settings })
  }

  subscribe(listener: EngineEventListener): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispatch(action: RuntimeAction): Promise<void> {
    switch (action.type) {
      case 'engine.auto.set':
        this.state.flags.autoMode = action.enabled
        this.emit('engine.state.changed', { runtime: this.state.runtime })
        return
      case 'engine.fast_forward.set':
        this.state.flags.fastForward = action.enabled
        this.emit('engine.state.changed', { runtime: this.state.runtime })
        return
      case 'engine.ui_hidden.set':
        this.state.flags.uiHidden = action.enabled
        this.emit('engine.state.changed', { runtime: this.state.runtime })
        return
      case 'engine.skip.current':
        this.state.dialogue.textRendered = this.state.dialogue.textRaw
        this.state.dialogue.typing.completed = true
        this.state.dialogue.typing.active = false
        this.emit('engine.state.changed', { runtime: this.state.runtime })
        return
      case 'choice.select': {
        if (!this.state.choice.open) return
        const option = this.state.choice.options.find(
          (it) => it.id === action.optionId && !it.disabled,
        )
        if (!option) return
        this.state.choice.open = false
        this.pendingJumpId = option.to
        this.emit('choice.closed', { optionId: action.optionId })
        this.applyPendingJump()
        this.emit('engine.state.changed', { runtime: this.state.runtime })
        break
      }
      case 'system.load.snapshot':
        await this.restore(action.snapshot)
        return
      case 'system.reset':
        this.state = createInitialEngineState(
          structuredClone(this.state.settings),
        )
        if (this.ir) {
          this.state.variables = structuredClone(this.ir.initialVariables)
          this.state.runtime.scriptId = this.ir.scriptId
        }
        return
      case 'engine.next':
        break
      default:
        return
    }

    await this.tick()
  }

  async tick(): Promise<void> {
    while (true) {
      if (!this.ir || this.state.runtime.paused) {
        return
      }

      if (this.state.choice.open) {
        return
      }

      const scene = this.ir.sceneIndex[this.state.runtime.sceneId]
      if (!scene) {
        throw new Error('RUNTIME_ILLEGAL_STATE: active scene missing')
      }

      const command = scene.commands[this.state.runtime.commandIndex]
      if (!command) {
        this.state.runtime.paused = true
        return
      }

      this.state.runtime.tick += 1
      this.emit('engine.command.will_run', {
        commandId: command.id,
        type: command.type,
      })

      await this.bus.execute(command, {
        state: this.state,
        scene,
        command,
        jumpToCommandId: (id: string) => {
          this.pendingJumpId = id
        },
        emitEvent: (type, payload) => this.emit(type, payload),
      } satisfies RuntimeContext)

      this.emit('engine.command.did_run', {
        commandId: command.id,
        type: command.type,
      })
      this.advance(scene, command)
      this.emit('engine.state.changed', { runtime: this.state.runtime })

      const blockingTypes = [
        'narration',
        'dialogue',
        'choice_show',
        'end',
        'call',
        'return',
      ]
      if (blockingTypes.includes(command.type)) {
        break
      }
    }
  }

  snapshot(): RuntimeSnapshot {
    return {
      snapshotVersion: SNAPSHOT_VERSION,
      contractVersion: CONTRACT_VERSION,
      buildId: 'dev',
      createdAt: Date.now(),
      checksum: '',
      engine: structuredClone(this.state),
      history: structuredClone(this.state.dialogue.backlog),
    }
  }

  async restore(snapshot: RuntimeSnapshot): Promise<void> {
    this.state = structuredClone(snapshot.engine)
    this.state.dialogue.backlog = structuredClone(snapshot.history)
    this.emit('engine.state.changed', { restored: true })
  }

  private advance(scene: IRScene, command: IRCommand): void {
    let targetId: string | undefined
    let targetSceneId: string | undefined

    if (this.pendingJumpId) {
      targetId = this.pendingJumpId
      targetSceneId = this.pendingSceneId ?? undefined
      this.pendingJumpId = null
      this.pendingSceneId = null
    } else if (command.next) {
      targetId = command.next
    }

    if (targetId) {
      const sceneToUse = targetSceneId
        ? this.ir?.sceneIndex[targetSceneId]
        : scene
      const idx = sceneToUse?.commandMap[targetId] ?? undefined
      if (idx !== undefined) {
        if (sceneToUse) {
          this.state.runtime.sceneId = sceneToUse.id
        }
        this.state.runtime.commandId = targetId
        this.state.runtime.commandIndex = idx
        return
      }
    }

    const nextIndex = this.state.runtime.commandIndex + 1
    if (nextIndex >= scene.commands.length) {
      this.state.runtime.paused = true
      return
    }

    this.state.runtime.commandIndex = nextIndex
    this.state.runtime.commandId = scene.commands[nextIndex].id
  }

  private emit(type: EngineEvent['type'], payload: unknown): void {
    const event: EngineEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: Date.now(),
      type,
      payload,
      trace: {
        scriptId: this.state.runtime.scriptId,
        sceneId: this.state.runtime.sceneId,
        commandId: this.state.runtime.commandId,
      },
    }
    this.listeners.forEach((listener) => listener(event))
  }

  private applyPendingJump(): void {
    if (!this.ir || !this.pendingJumpId) {
      return
    }

    const activeScene = this.pendingSceneId
      ? this.ir.sceneIndex[this.pendingSceneId]
      : this.ir.sceneIndex[this.state.runtime.sceneId]

    if (!activeScene) {
      this.pendingJumpId = null
      this.pendingSceneId = null
      return
    }

    const idx = activeScene.commandMap[this.pendingJumpId]
    if (idx === undefined) {
      this.pendingJumpId = null
      this.pendingSceneId = null
      return
    }

    this.state.runtime.sceneId = activeScene.id
    this.state.runtime.commandId = this.pendingJumpId
    this.state.runtime.commandIndex = idx
    this.pendingJumpId = null
    this.pendingSceneId = null
  }

  private registerDefaultHandlers(): void {
    this.bus.register('narration', (command, ctx) => {
      const context = ctx
      const text = String(command.payload.text ?? '')
      context.state.dialogue.mode = 'narration'
      context.state.dialogue.speakerId = null
      context.state.dialogue.speakerName = null
      context.state.dialogue.textRaw = text
      context.state.dialogue.textRendered = text
      context.state.dialogue.typing.active = true
      context.state.dialogue.typing.completed = false
      context.state.dialogue.typing.cursor = 0
      context.state.dialogue.backlog.push({
        id: `${Date.now()}`,
        mode: 'narration',
        speakerName: null,
        text,
        timestamp: Date.now(),
      })
      context.emitEvent('dialogue.updated', { mode: 'narration' })
    })

    this.bus.register('dialogue', (command, ctx) => {
      const context = ctx
      const text = String(command.payload.text ?? '')
      const speakerId = command.payload.speakerId
        ? String(command.payload.speakerId)
        : null
      const speakerName = command.payload.speakerName
        ? String(command.payload.speakerName)
        : null
      context.state.dialogue.mode = 'dialogue'
      context.state.dialogue.speakerId = speakerId
      context.state.dialogue.speakerName = speakerName
      context.state.dialogue.textRaw = text
      context.state.dialogue.textRendered = text
      context.state.dialogue.typing.active = true
      context.state.dialogue.typing.completed = false
      context.state.dialogue.typing.cursor = 0
      context.state.dialogue.backlog.push({
        id: `${Date.now()}`,
        mode: 'dialogue',
        speakerName,
        text,
        timestamp: Date.now(),
      })
      context.emitEvent('dialogue.updated', { mode: 'dialogue' })
    })

    this.bus.register('clear_dialogue', (_command, ctx) => {
      const context = ctx
      context.state.dialogue.textRaw = ''
      context.state.dialogue.textRendered = ''
      context.state.dialogue.speakerId = null
      context.state.dialogue.speakerName = null
      context.state.dialogue.mode = 'narration'
      context.emitEvent('dialogue.updated', { cleared: true })
    })

    this.bus.register('bg_set', (command, ctx) => {
      const context = ctx
      context.state.stage.backgroundKey = String(command.payload.bgKey ?? '')
    })

    this.bus.register('char_show', (command, ctx) => {
      const context = ctx
      const charId = String(command.payload.charId ?? '')
      context.state.stage.characters[charId] = {
        charId,
        poseKey: command.payload.poseKey
          ? String(command.payload.poseKey)
          : null,
        slot: String(command.payload.slot ?? 'center'),
        visible: true,
      }
    })

    this.bus.register('char_hide', (command, ctx) => {
      const context = ctx
      const charId = String(command.payload.charId ?? '')
      const current = context.state.stage.characters[charId]
      if (current) {
        current.visible = false
      }
    })

    this.bus.register('char_pose', (command, ctx) => {
      const context = ctx
      const charId = String(command.payload.charId ?? '')
      const current = context.state.stage.characters[charId]
      if (current) {
        current.poseKey = String(command.payload.poseKey ?? '')
      }
    })

    this.bus.register('layer_set', (command, ctx) => {
      const context = ctx
      const layer = String(command.payload.layer ?? 'effect')
      const props = toJsonRecord(command.payload.props ?? {})
      context.state.stage.layers[layer] = props
    })

    this.bus.register('choice_show', (command, ctx) => {
      const context = ctx
      const optionsRaw = Array.isArray(command.payload.options)
        ? command.payload.options
        : []
      const options = optionsRaw.map((it) => {
        const row = (it as Record<string, unknown>) ?? {}
        const cond = typeof row.if === 'string' ? row.if : 'true'
        const disabled = !evaluateCondition(cond, context.state.variables)
        return {
          id: String(row.id ?? ''),
          text: String(row.text ?? ''),
          to: String(row.to ?? ''),
          disabled,
        }
      })

      context.state.choice.open = true
      context.state.choice.choiceId = String(command.payload.choiceId ?? '')
      context.state.choice.prompt = String(command.payload.prompt ?? '')
      context.state.choice.options = options
      context.emitEvent('choice.opened', { id: context.state.choice.choiceId })
    })

    this.bus.register('jump', (command, ctx) => {
      const context = ctx
      context.jumpToCommandId(String(command.payload.to ?? ''))
    })

    this.bus.register('branch', (command, ctx) => {
      const context = ctx
      const expression = String(command.payload.if ?? 'false')
      const result = evaluateCondition(expression, context.state.variables)
      context.jumpToCommandId(
        String(result ? command.payload.then : (command.payload.else ?? '')),
      )
    })

    this.bus.register('label', () => {
      // no-op
    })

    this.bus.register('call', (command, ctx) => {
      const context = ctx
      const sceneId = String(command.payload.sceneId ?? '')
      if (!this.ir) return
      const scene = this.ir.sceneIndex[sceneId]
      if (!scene) return
      const entry = String(command.payload.entry ?? scene.entryCommandId)
      this.pendingSceneId = sceneId
      context.jumpToCommandId(entry)
    })

    this.bus.register('return', () => {})

    this.bus.register('end', (command, ctx) => {
      const context = ctx
      context.state.runtime.paused = true
      context.emitEvent('engine.state.changed', {
        endingKey: String(command.payload.endingKey ?? ''),
      })
    })

    this.bus.register('set', (command, ctx) => {
      const context = ctx
      const key = String(command.payload.key ?? '')
      context.state.variables[key] = command.payload.value as never
    })

    this.bus.register('inc', (command, ctx) => {
      const context = ctx
      const key = String(command.payload.key ?? '')
      const by = Number(command.payload.by ?? 1)
      const current = Number(context.state.variables[key] ?? 0)
      context.state.variables[key] = current + by
    })

    this.bus.register('dec', (command, ctx) => {
      const context = ctx
      const key = String(command.payload.key ?? '')
      const by = Number(command.payload.by ?? 1)
      const current = Number(context.state.variables[key] ?? 0)
      context.state.variables[key] = current - by
    })

    this.bus.register('expr', (command, ctx) => {
      const context = ctx
      const statement = String(command.payload.statement ?? 'null')
      context.state.variables._ = evaluateExpressionStatement(
        statement,
        context.state.variables,
      )
    })

    this.bus.register('bgm_play', (command, ctx) => {
      const context = ctx
      context.state.audio.channels.bgm.currentKey = String(
        command.payload.key ?? '',
      )
      context.state.audio.channels.bgm.playing = true
      context.emitEvent('audio.channel.changed', { channel: 'bgm' })
    })

    this.bus.register('bgm_stop', (_command, ctx) => {
      const context = ctx
      context.state.audio.channels.bgm.currentKey = null
      context.state.audio.channels.bgm.playing = false
      context.emitEvent('audio.channel.changed', { channel: 'bgm' })
    })

    this.bus.register('voice_play', (command, ctx) => {
      const context = ctx
      context.state.audio.channels.voice.currentKey = String(
        command.payload.key ?? '',
      )
      context.state.audio.channels.voice.playing = true
      context.emitEvent('audio.channel.changed', { channel: 'voice' })
    })

    this.bus.register('sfx_play', (command, ctx) => {
      const context = ctx
      context.state.audio.channels.sfx.currentKey = String(
        command.payload.key ?? '',
      )
      context.state.audio.channels.sfx.playing = true
      context.emitEvent('audio.channel.changed', { channel: 'sfx' })
    })

    this.bus.register('wait', async (command) => {
      const ms = Number(command.payload.ms ?? 0)
      if (ms <= 0) return
      await new Promise((resolve) => setTimeout(resolve, ms))
    })

    this.bus.register('transition', (_command) => {})

    this.bus.register('emit', (command, ctx) => {
      const context = ctx
      const event = String(command.payload.event ?? 'engine.state.changed')
      context.emitEvent(
        event as EngineEvent['type'],
        command.payload.payload ?? {},
      )
    })

    this.bus.register('autosave', () => {})
  }
}
