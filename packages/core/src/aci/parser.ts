import { eventHashHex } from './hash.js'
import type {
  AciContract,
  AciEntrypoint,
  AciEvent,
  AciEventField,
  SophiaType,
} from './types.js'

const MAX_INDEXED_FIELDS = 3

interface RawAciContract {
  contract: {
    name: string
    kind?: string
    event?: {
      variant: Record<string, unknown[]>[]
    }
    functions?: RawFunction[]
    type_defs?: unknown[]
  }
}

interface RawFunction {
  name: string
  arguments: { name: string; type: unknown }[]
  returns: unknown
  stateful: boolean
  payable: boolean
}

function isRawAciContract(value: unknown): value is RawAciContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'contract' in value &&
    typeof (value as RawAciContract).contract === 'object' &&
    (value as RawAciContract).contract !== null &&
    typeof (value as RawAciContract).contract.name === 'string'
  )
}

export function parseSophiaType(raw: unknown): SophiaType {
  if (typeof raw === 'string') {
    const primitives = [
      'address',
      'int',
      'bool',
      'string',
      'hash',
      'signature',
      'bytes',
    ] as const
    for (const p of primitives) {
      if (raw === p) return p
    }
    // bytes(N) and other string-encoded types — treat as bytes
    if (raw.startsWith('bytes(')) return 'bytes'
    return 'string'
  }

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>

    if ('option' in obj) {
      return {
        option: parseSophiaType((obj as { option: unknown[] }).option[0]),
      }
    }
    if ('list' in obj) {
      return { list: parseSophiaType((obj as { list: unknown[] }).list[0]) }
    }
    if ('map' in obj) {
      const mapArgs = (obj as { map: unknown[] }).map
      return { map: [parseSophiaType(mapArgs[0]), parseSophiaType(mapArgs[1])] }
    }
    if ('tuple' in obj) {
      return {
        tuple: (obj as { tuple: unknown[] }).tuple.map(parseSophiaType),
      }
    }
    if ('record' in obj) {
      return {
        record: (
          obj as { record: { name: string; type: unknown }[] }
        ).record.map((f) => ({ name: f.name, type: parseSophiaType(f.type) })),
      }
    }
    if ('variant' in obj) {
      return {
        variant: (obj as { variant: Record<string, unknown[]>[] }).variant.map(
          (v) => {
            const result: Record<string, SophiaType[]> = {}
            for (const [key, val] of Object.entries(v)) {
              result[key] = (val as unknown[]).map(parseSophiaType)
            }
            return result
          },
        ),
      }
    }
  }

  return 'string'
}

const INDEXABLE_TYPES: Set<string> = new Set([
  'int',
  'bool',
  'address',
  'hash',
  'signature',
  'bytes',
])

function isIndexable(t: SophiaType): boolean {
  if (typeof t === 'string') return INDEXABLE_TYPES.has(t)
  return false
}

function parseEvents(variant: Record<string, unknown[]>[]): AciEvent[] {
  return variant.map((entry) => {
    const name = Object.keys(entry)[0]!
    const rawTypes = entry[name]!

    let indexedCount = 0
    const fields: AciEventField[] = rawTypes.map((rawType, i) => {
      const type = parseSophiaType(rawType)
      const indexed = isIndexable(type) && indexedCount < MAX_INDEXED_FIELDS
      if (indexed) indexedCount++
      return { index: i, name: `arg${i}`, type, indexed }
    })

    return {
      name,
      hash: eventHashHex(name),
      fields,
    }
  })
}

function parseEntrypoints(fns: RawFunction[]): AciEntrypoint[] {
  return fns
    .filter((f) => f.name !== 'init')
    .map((f) => ({
      name: f.name,
      args: f.arguments.map((a) => ({
        name: a.name,
        type: parseSophiaType(a.type),
      })),
      returnType: parseSophiaType(f.returns),
      stateful: f.stateful,
      payable: f.payable,
    }))
}

function parseContractObject(raw: RawAciContract): AciContract {
  const { contract } = raw
  const events = contract.event?.variant
    ? parseEvents(contract.event.variant)
    : []
  const entrypoints = contract.functions
    ? parseEntrypoints(contract.functions)
    : []

  return {
    name: contract.name,
    events,
    entrypoints,
  }
}

/**
 * Parse a raw ACI JSON value into a typed AciContract.
 * Handles both single-object `{ contract: {...} }` and
 * array `[{ contract: {...} }, ...]` formats.
 */
export function parseAci(aci: unknown): AciContract {
  if (Array.isArray(aci)) {
    const main = aci.find(
      (item: unknown) =>
        isRawAciContract(item) &&
        (item.contract.kind === 'contract_main' || !item.contract.kind),
    )
    if (!main) {
      throw new Error(
        'No main contract found in ACI array. Expected an entry with kind "contract_main".',
      )
    }
    return parseContractObject(main as RawAciContract)
  }

  if (isRawAciContract(aci)) {
    return parseContractObject(aci)
  }

  throw new Error(
    'Invalid ACI format. Expected { contract: {...} } or [{ contract: {...} }, ...]',
  )
}
