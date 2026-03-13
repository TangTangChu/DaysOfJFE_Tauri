import type { EngineError } from '../../shared/types/engine'
import type { ScriptCommandType, ScriptDocument } from './schema'

const COMMAND_TYPES: Set<ScriptCommandType> = new Set<ScriptCommandType>([
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
])

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]{0,127}$/
const ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function makeError(
  message: string,
  detail?: Record<string, unknown>,
): EngineError {
  return {
    code: 'SCRIPT_VALIDATE_ERROR',
    message,
    detail,
  }
}

function expectString(
  value: unknown,
  field: string,
  errors: EngineError[],
  min = 0,
  max = 10000,
) {
  if (typeof value !== 'string') {
    errors.push(makeError(`${field} 必须是字符串`, { field }))
    return
  }

  if (value.length < min || value.length > max) {
    errors.push(
      makeError(`${field} 长度非法`, {
        field,
        min,
        max,
        actual: value.length,
      }),
    )
  }
}

function expectId(value: unknown, field: string, errors: EngineError[]) {
  expectString(value, field, errors, 1, 128)
  if (typeof value === 'string' && !ID_PATTERN.test(value)) {
    errors.push(
      makeError(`${field} 格式非法`, { field, pattern: ID_PATTERN.source }),
    )
  }
}

function validateByType(
  type: ScriptCommandType,
  payload: Record<string, unknown>,
  errors: EngineError[],
  path: string,
) {
  switch (type) {
    case 'narration': {
      expectString(payload.text, `${path}.text`, errors, 1, 10000)
      if (payload.styleKey !== undefined) {
        expectId(payload.styleKey, `${path}.styleKey`, errors)
      }
      break
    }
    case 'dialogue': {
      expectString(payload.text, `${path}.text`, errors, 1, 10000)
      if (payload.speakerId !== undefined) {
        expectId(payload.speakerId, `${path}.speakerId`, errors)
      }
      if (payload.speakerName !== undefined) {
        expectString(payload.speakerName, `${path}.speakerName`, errors, 0, 64)
      }
      if (payload.voiceKey !== undefined) {
        expectId(payload.voiceKey, `${path}.voiceKey`, errors)
      }
      break
    }
    case 'bg_set': {
      expectId(payload.bgKey, `${path}.bgKey`, errors)
      if (
        payload.durationMs !== undefined &&
        typeof payload.durationMs !== 'number'
      ) {
        errors.push(
          makeError(`${path}.durationMs 必须是 number`, {
            field: `${path}.durationMs`,
          }),
        )
      }
      break
    }
    case 'char_show': {
      expectId(payload.charId, `${path}.charId`, errors)
      expectString(payload.slot, `${path}.slot`, errors, 1, 32)
      break
    }
    case 'choice_show': {
      expectId(payload.choiceId, `${path}.choiceId`, errors)
      expectString(payload.prompt, `${path}.prompt`, errors, 1, 200)
      if (!Array.isArray(payload.options)) {
        errors.push(
          makeError(`${path}.options 必须是数组`, { field: `${path}.options` }),
        )
      } else {
        if (payload.options.length < 2 || payload.options.length > 8) {
          errors.push(
            makeError(`${path}.options 数量必须在 2..8`, {
              field: `${path}.options`,
              count: payload.options.length,
            }),
          )
        }
        const ids = new Set<string>()
        payload.options.forEach((opt, i) => {
          if (!isRecord(opt)) {
            errors.push(makeError(`${path}.options[${i}] 必须是对象`))
            return
          }
          expectId(opt.id, `${path}.options[${i}].id`, errors)
          expectString(opt.text, `${path}.options[${i}].text`, errors, 1, 120)
          expectId(opt.to, `${path}.options[${i}].to`, errors)
          if (typeof opt.id === 'string') {
            if (ids.has(opt.id)) {
              errors.push(
                makeError(`${path}.options[${i}].id 重复`, { id: opt.id }),
              )
            }
            ids.add(opt.id)
          }
        })
      }
      break
    }
    case 'branch': {
      expectString(payload.if, `${path}.if`, errors, 1, 500)
      expectId(payload.then, `${path}.then`, errors)
      if (payload.else !== undefined) {
        expectId(payload.else, `${path}.else`, errors)
      }
      break
    }
    case 'set':
    case 'inc':
    case 'dec': {
      const key = payload.key
      if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
        errors.push(
          makeError(`${path}.key 非法`, {
            field: `${path}.key`,
            pattern: KEY_PATTERN.source,
          }),
        )
      }
      break
    }
    case 'wait': {
      if (
        typeof payload.ms !== 'number' ||
        payload.ms < 0 ||
        payload.ms > 300000
      ) {
        errors.push(
          makeError(`${path}.ms 范围非法`, {
            field: `${path}.ms`,
            range: '0..300000',
          }),
        )
      }
      break
    }
    case 'bgm_play': {
      expectId(payload.key, `${path}.key`, errors)
      break
    }
    case 'voice_play': {
      expectId(payload.key, `${path}.key`, errors)
      if (
        payload.interruptPolicy !== undefined &&
        payload.interruptPolicy !== 'interrupt' &&
        payload.interruptPolicy !== 'queue' &&
        payload.interruptPolicy !== 'ignore'
      ) {
        errors.push(
          makeError(`${path}.interruptPolicy 非法`, {
            field: `${path}.interruptPolicy`,
            allowed: ['interrupt', 'queue', 'ignore'],
          }),
        )
      }
      break
    }
    default:
      break
  }
}

export function validateScriptDocument(
  document: ScriptDocument,
): EngineError[] {
  const errors: EngineError[] = []

  if (!document.meta?.scriptId) {
    errors.push(makeError('meta.scriptId 缺失'))
  }
  if (!document.meta?.title) {
    errors.push(makeError('meta.title 缺失'))
  }

  const sceneIdSet = new Set<string>()

  document.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`
    if (!scene.id) {
      errors.push(makeError(`${scenePath}.id 缺失`))
    }
    if (!scene.title) {
      errors.push(makeError(`${scenePath}.title 缺失`))
    }

    if (sceneIdSet.has(scene.id)) {
      errors.push(makeError(`${scenePath}.id 重复`, { id: scene.id }))
    }
    sceneIdSet.add(scene.id)

    const commandIdSet = new Set<string>()
    scene.commands.forEach((command, commandIndex) => {
      const commandPath = `${scenePath}.commands[${commandIndex}]`

      if (!command.id) {
        errors.push(makeError(`${commandPath}.id 缺失`))
      } else if (!ID_PATTERN.test(command.id)) {
        errors.push(makeError(`${commandPath}.id 格式非法`, { id: command.id }))
      }

      if (commandIdSet.has(command.id)) {
        errors.push(makeError(`${commandPath}.id 重复`, { id: command.id }))
      }
      commandIdSet.add(command.id)

      if (!COMMAND_TYPES.has(command.type)) {
        errors.push({
          code: 'SCRIPT_COMMAND_NOT_FOUND',
          message: `${commandPath}.type 不存在`,
          detail: { type: command.type },
        })
        return
      }

      if (!isRecord(command.payload)) {
        errors.push(makeError(`${commandPath}.payload 必须是对象`))
        return
      }

      validateByType(
        command.type,
        command.payload,
        errors,
        `${commandPath}.payload`,
      )
    })
  })

  return errors
}
