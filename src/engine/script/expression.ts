import type { JsonValue } from '../../shared/types/engine'

function getPathValue(
  vars: Record<string, JsonValue>,
  path: string,
): JsonValue {
  const parts = path.split('.').filter(Boolean)
  let cursor: JsonValue = vars

  for (const part of parts) {
    if (
      typeof cursor !== 'object' ||
      cursor === null ||
      Array.isArray(cursor)
    ) {
      return null
    }
    cursor = (cursor as Record<string, JsonValue>)[part] ?? null
  }

  return cursor
}

function parseLiteral(
  token: string,
  vars: Record<string, JsonValue>,
): JsonValue {
  const trimmed = token.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }

  if (trimmed.startsWith('$var.')) {
    return getPathValue(vars, trimmed.slice('$var.'.length))
  }

  const num = Number(trimmed)
  if (!Number.isNaN(num)) {
    return num
  }

  return trimmed
}

function compare(left: JsonValue, operator: string, right: JsonValue): boolean {
  switch (operator) {
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '>':
      return (
        typeof left === 'number' && typeof right === 'number' && left > right
      )
    case '>=':
      return (
        typeof left === 'number' && typeof right === 'number' && left >= right
      )
    case '<':
      return (
        typeof left === 'number' && typeof right === 'number' && left < right
      )
    case '<=':
      return (
        typeof left === 'number' && typeof right === 'number' && left <= right
      )
    default:
      return false
  }
}

const COMPARISON_REGEX = /(.+)\s*(==|!=|>=|<=|>|<)\s*(.+)/

export function evaluateCondition(
  expression: string,
  vars: Record<string, JsonValue>,
): boolean {
  const trimmed = expression.trim()
  if (!trimmed) return false

  if (trimmed.includes('&&')) {
    return trimmed.split('&&').every((part) => evaluateCondition(part, vars))
  }

  if (trimmed.includes('||')) {
    return trimmed.split('||').some((part) => evaluateCondition(part, vars))
  }

  const match = trimmed.match(COMPARISON_REGEX)
  if (match) {
    const [, l, op, r] = match
    return compare(parseLiteral(l, vars), op, parseLiteral(r, vars))
  }

  const value = parseLiteral(trimmed, vars)
  return value === true
}

export function evaluateExpressionStatement(
  statement: string,
  vars: Record<string, JsonValue>,
): JsonValue {
  return parseLiteral(statement, vars)
}
