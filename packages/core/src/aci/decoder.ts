import { createHash } from 'node:crypto'
import type { AciEvent, SophiaType } from './types.js'

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buf: Uint8Array): string {
  let num = 0n
  for (const b of buf) num = num * 256n + BigInt(b)
  let out = ''
  while (num > 0n) {
    out = BASE58_ALPHABET[Number(num % 58n)] + out
    num /= 58n
  }
  for (const b of buf) {
    if (b === 0) out = `1${out}`
    else break
  }
  return out
}

/**
 * Convert a decimal big-integer string from ae-mdw into an Aeternity
 * address (`ak_`/`ct_`). Falls through to the raw string if it already
 * looks like an ae address or is not a pure decimal.
 */
function decodeAddress(value: string): string {
  if (/^(ak|ct|ok|nm|cm|ch|sg|ba|cb)_/.test(value)) return value
  if (!/^\d+$/.test(value)) return value

  const bigint = BigInt(value)
  const hex = bigint.toString(16).padStart(64, '0')
  const payload = Buffer.from(hex, 'hex')
  const h1 = createHash('sha256').update(payload).digest()
  const h2 = createHash('sha256').update(h1).digest()
  const checksum = h2.subarray(0, 4)
  const full = new Uint8Array(36)
  full.set(payload)
  full.set(checksum, 32)
  return `ct_${base58Encode(full)}`
}

function decodeValue(type: SophiaType, value: string): unknown {
  if (typeof type === 'string') {
    switch (type) {
      case 'int':
        return BigInt(value)
      case 'bool':
        return value !== '0'
      case 'address':
        return decodeAddress(value)
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
