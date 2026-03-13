import yaml from 'js-yaml'
import type { EngineError } from '../../shared/types/engine'
import type { ScriptCommand, ScriptDocument, ScriptScene } from './schema'
import type { JsonValue } from '../../shared/types/engine'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null
  }
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
  if (isRecord(value)) {
    return Object.entries(value).reduce<Record<string, JsonValue>>(
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
  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, JsonValue>>(
    (acc, [k, v]) => {
      acc[k] = toJsonValue(v)
      return acc
    },
    {},
  )
}

function toCommands(value: unknown): ScriptCommand[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => isRecord(item))
    .map((item, idx) => ({
      id: toStringOr(item.id, `cmd_${idx}`),
      type: toStringOr(item.type, 'emit') as ScriptCommand['type'],
      payload: toJsonRecord(item.payload),
      next: typeof item.next === 'string' ? item.next : undefined,
    }))
}

function toScenes(value: unknown): ScriptScene[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => isRecord(item))
    .map((item, idx) => ({
      id: toStringOr(item.id, `scene_${idx}`),
      title: toStringOr(item.title, `Scene ${idx}`),
      entry: typeof item.entry === 'string' ? item.entry : undefined,
      commands: toCommands(item.commands),
    }))
}

export function parseScriptDocument(raw: string): {
  document: ScriptDocument | null
  errors: EngineError[]
} {
  try {
    const parsed = yaml.load(raw)
    if (!isRecord(parsed)) {
      return {
        document: null,
        errors: [
          {
            code: 'SCRIPT_PARSE_ERROR',
            message: '脚本顶层必须是对象',
          },
        ],
      }
    }

    const metaRecord = toRecord(parsed.meta)
    const document: ScriptDocument = {
      meta: {
        scriptId: toStringOr(metaRecord.scriptId, 'script_v2'),
        title: toStringOr(metaRecord.title, 'Untitled Script'),
        schemaVersion: toStringOr(metaRecord.schemaVersion, '2.0.0'),
      },
      assets: Object.entries(toRecord(parsed.assets)).reduce<
        Record<string, Record<string, string>>
      >((acc, [key, val]) => {
        const obj = toRecord(val)
        const mapped = Object.entries(obj).reduce<Record<string, string>>(
          (m, [k, v]) => {
            if (typeof v === 'string') {
              m[k] = v
            }
            return m
          },
          {},
        )
        acc[key] = mapped
        return acc
      }, {}),
      variables: toJsonRecord(parsed.variables),
      scenes: toScenes(parsed.scenes),
    }

    return { document, errors: [] }
  } catch (error) {
    return {
      document: null,
      errors: [
        {
          code: 'SCRIPT_PARSE_ERROR',
          message: '脚本解析失败',
          detail: {
            reason: error instanceof Error ? error.message : String(error),
          },
        },
      ],
    }
  }
}
