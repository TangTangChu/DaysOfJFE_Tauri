import type { EngineError } from '../../shared/types/engine'
import type {
  CompiledScriptIR,
  IRCommand,
  IRScene,
  ScriptDocument,
} from './schema'

function compileScene(scene: ScriptDocument['scenes'][number]): {
  scene: IRScene
  errors: EngineError[]
} {
  const errors: EngineError[] = []
  const commands: IRCommand[] = scene.commands.map((command) => ({
    id: command.id,
    type: command.type,
    payload: command.payload,
    next: command.next,
  }))

  const commandMap = commands.reduce<Record<string, number>>(
    (acc, command, index) => {
      acc[command.id] = index
      return acc
    },
    {},
  )

  const entryCommandId = scene.entry ?? commands[0]?.id

  if (!entryCommandId) {
    errors.push({
      code: 'SCRIPT_VALIDATE_ERROR',
      message: `场景 ${scene.id} 没有可执行入口命令`,
      detail: { sceneId: scene.id },
    })
  } else if (commandMap[entryCommandId] === undefined) {
    errors.push({
      code: 'SCRIPT_VALIDATE_ERROR',
      message: `场景 ${scene.id} 的 entry 无法解析`,
      detail: { sceneId: scene.id, entry: entryCommandId },
    })
  }

  return {
    scene: {
      id: scene.id,
      title: scene.title,
      entryCommandId: entryCommandId ?? '',
      commands,
      commandMap,
    },
    errors,
  }
}

export function compileScriptDocument(document: ScriptDocument): {
  ir: CompiledScriptIR | null
  errors: EngineError[]
} {
  const errors: EngineError[] = []
  const sceneIndex: Record<string, IRScene> = {}

  document.scenes.forEach((scene) => {
    const compiled = compileScene(scene)
    errors.push(...compiled.errors)
    sceneIndex[compiled.scene.id] = compiled.scene
  })

  if (Object.keys(sceneIndex).length === 0) {
    errors.push({
      code: 'SCRIPT_VALIDATE_ERROR',
      message: '脚本至少需要一个场景',
    })
  }

  if (errors.length > 0) {
    return { ir: null, errors }
  }

  const commandCount = Object.values(sceneIndex).reduce(
    (acc, scene) => acc + scene.commands.length,
    0,
  )

  return {
    ir: {
      scriptId: document.meta.scriptId,
      title: document.meta.title,
      schemaVersion: document.meta.schemaVersion,
      assets: document.assets,
      initialVariables: document.variables,
      commandCount,
      sceneIndex,
    },
    errors,
  }
}
