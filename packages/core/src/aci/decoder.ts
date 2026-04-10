import type { AciEvent, SophiaType } from './types.js'

function decodeValue(type: SophiaType, value: string): unknown {
  if (typeof type === 'string') {
    switch (type) {
      case 'int':
        return BigInt(value)
      case 'bool':
        return value !== '0'
      case 'address':
      case 'hash':
      case 'signature':
      case 'bytes':
      case 'string':
        return value
    }
  }

  if (typeof type === 'object' && type !== null) {
    if ('option' in type) {
      return value === '' || value === '0'
        ? undefined
        : decodeValue(type.option, value)
    }
  }

  return value
}

/**
 * Decode raw ae_mdw event arguments into a typed object.
 *
 * ae_mdw returns indexed fields as decimal strings in `rawArgs`
 * and non-indexed data in `rawData`. Sophia limits indexed args to 3.
 */
export function decodeEventArgs(
  event: AciEvent,
  rawArgs: string[],
  rawData: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const indexedFields = event.fields.filter((f) => f.indexed)
  const dataFields = event.fields.filter((f) => !f.indexed)

  for (let i = 0; i < indexedFields.length; i++) {
    const field = indexedFields[i]!
    const raw = rawArgs[i]
    if (raw !== undefined) {
      result[field.name] = decodeValue(field.type, raw)
    }
  }

  if (dataFields.length > 0 && rawData) {
    if (dataFields.length === 1) {
      result[dataFields[0]!.name] = decodeValue(dataFields[0]!.type, rawData)
    } else {
      for (const field of dataFields) {
        result[field.name] = rawData
      }
    }
  }

  return result
}
