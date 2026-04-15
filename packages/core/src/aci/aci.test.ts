import { describe, expect, it } from 'vitest'
import { generateEventTypes, sophiaTypeToTs } from './codegen.js'
import { decodeEventArgs } from './decoder.js'
import { computeEventHash, eventHashHex } from './hash.js'
import { parseAci } from './parser.js'

const PAIR_ACI = {
  contract: {
    name: 'Pair',
    kind: 'contract_main',
    event: {
      variant: [
        { Swap: ['address', 'int', 'int', 'int', 'int', 'address'] },
        { Mint: ['address', 'int', 'int'] },
        { Burn: ['address', 'int', 'int', 'address'] },
        { Sync: ['int', 'int'] },
        { Transfer: ['address', 'address', 'int'] },
        { Approval: ['address', 'address', 'int'] },
      ],
    },
    functions: [
      {
        name: 'init',
        arguments: [],
        returns: 'unit',
        stateful: true,
        payable: false,
      },
      {
        name: 'swap',
        arguments: [
          { name: 'amount_0_out', type: 'int' },
          { name: 'amount_1_out', type: 'int' },
          { name: 'to', type: 'address' },
        ],
        returns: 'unit',
        stateful: true,
        payable: false,
      },
      {
        name: 'get_reserves',
        arguments: [],
        returns: { tuple: ['int', 'int', 'int'] },
        stateful: false,
        payable: false,
      },
    ],
  },
}

const MINIMAL_ACI = {
  contract: {
    name: 'Token',
    kind: 'contract_main',
    event: {
      variant: [{ Transfer: ['address', 'address', 'int'] }],
    },
  },
}

const NO_EVENTS_ACI = {
  contract: {
    name: 'Storage',
    kind: 'contract_main',
  },
}

describe('ACI Parser', () => {
  describe('parseAci', () => {
    it('parses single-object ACI', () => {
      const result = parseAci(PAIR_ACI)

      expect(result.name).toBe('Pair')
      expect(result.events).toHaveLength(6)
      expect(result.entrypoints).toHaveLength(2) // init is excluded
    })

    it('parses array-format ACI (picks contract_main)', () => {
      const arrayAci = [
        {
          contract: {
            name: 'Library',
            kind: 'contract_child',
          },
        },
        PAIR_ACI,
      ]

      const result = parseAci(arrayAci)
      expect(result.name).toBe('Pair')
      expect(result.events).toHaveLength(6)
    })

    it('handles ACI with no events', () => {
      const result = parseAci(NO_EVENTS_ACI)

      expect(result.name).toBe('Storage')
      expect(result.events).toHaveLength(0)
      expect(result.entrypoints).toHaveLength(0)
    })

    it('handles single-event ACI', () => {
      const result = parseAci(MINIMAL_ACI)

      expect(result.events).toHaveLength(1)
      expect(result.events[0]!.name).toBe('Transfer')
      expect(result.events[0]!.fields).toHaveLength(3)
    })

    it('throws on invalid ACI format', () => {
      expect(() => parseAci('not an object')).toThrow('Invalid ACI format')
      expect(() => parseAci(42)).toThrow('Invalid ACI format')
      expect(() => parseAci(null)).toThrow('Invalid ACI format')
    })

    it('throws when no main contract found in array', () => {
      const arrayAci = [{ contract: { name: 'Lib', kind: 'namespace' } }]
      expect(() => parseAci(arrayAci)).toThrow('No main contract found')
    })
  })

  describe('event extraction', () => {
    it('extracts Swap event with correct fields', () => {
      const result = parseAci(PAIR_ACI)
      const swap = result.events.find((e) => e.name === 'Swap')!

      expect(swap).toBeDefined()
      expect(swap.fields).toHaveLength(6)

      expect(swap.fields[0]).toEqual({
        index: 0,
        name: 'arg0',
        type: 'address',
        indexed: true,
      })
      expect(swap.fields[1]).toEqual({
        index: 1,
        name: 'arg1',
        type: 'int',
        indexed: true,
      })
      expect(swap.fields[2]).toEqual({
        index: 2,
        name: 'arg2',
        type: 'int',
        indexed: true,
      })
      // 4th+ fields are NOT indexed
      expect(swap.fields[3]!.indexed).toBe(false)
      expect(swap.fields[4]!.indexed).toBe(false)
      expect(swap.fields[5]!.indexed).toBe(false)
    })

    it('extracts Mint event fields', () => {
      const result = parseAci(PAIR_ACI)
      const mint = result.events.find((e) => e.name === 'Mint')!

      expect(mint.fields).toHaveLength(3)
      expect(mint.fields[0]!.type).toBe('address')
      expect(mint.fields[1]!.type).toBe('int')
      expect(mint.fields[2]!.type).toBe('int')
      // All 3 are indexed (max)
      expect(mint.fields.every((f) => f.indexed)).toBe(true)
    })

    it('extracts Transfer event fields with correct types', () => {
      const result = parseAci(PAIR_ACI)
      const transfer = result.events.find((e) => e.name === 'Transfer')!

      expect(transfer.fields).toHaveLength(3)
      expect(transfer.fields[0]!.type).toBe('address')
      expect(transfer.fields[1]!.type).toBe('address')
      expect(transfer.fields[2]!.type).toBe('int')
    })
  })

  describe('entrypoints', () => {
    it('excludes init from entrypoints', () => {
      const result = parseAci(PAIR_ACI)
      expect(result.entrypoints.find((e) => e.name === 'init')).toBeUndefined()
    })

    it('parses entrypoint arguments and return types', () => {
      const result = parseAci(PAIR_ACI)
      const swap = result.entrypoints.find((e) => e.name === 'swap')!

      expect(swap.args).toHaveLength(3)
      expect(swap.args[0]!.name).toBe('amount_0_out')
      expect(swap.args[0]!.type).toBe('int')
      expect(swap.stateful).toBe(true)
      expect(swap.payable).toBe(false)
    })

    it('parses tuple return types', () => {
      const result = parseAci(PAIR_ACI)
      const getReserves = result.entrypoints.find(
        (e) => e.name === 'get_reserves',
      )!

      expect(getReserves.returnType).toEqual({
        tuple: ['int', 'int', 'int'],
      })
    })
  })
})

describe('Event Hash', () => {
  it('computes Blake2b-256 hash as Uint8Array', () => {
    const hash = computeEventHash('Swap')
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(32)
  })

  it('computes consistent base32hex hash', () => {
    const hex1 = eventHashHex('Swap')
    const hex2 = eventHashHex('Swap')
    expect(hex1).toBe(hex2)
    expect(hex1).toHaveLength(56)
  })

  it('produces different hashes for different event names', () => {
    expect(eventHashHex('Swap')).not.toBe(eventHashHex('Transfer'))
    expect(eventHashHex('Mint')).not.toBe(eventHashHex('Burn'))
  })

  it('event hash matches parsed event hash', () => {
    const contract = parseAci(PAIR_ACI)
    const swap = contract.events.find((e) => e.name === 'Swap')!
    expect(swap.hash).toBe(eventHashHex('Swap'))
  })
})

describe('Event Decoder', () => {
  it('decodes int fields from decimal strings', () => {
    const contract = parseAci(PAIR_ACI)
    const sync = contract.events.find((e) => e.name === 'Sync')!

    const result = decodeEventArgs(sync, ['1000', '2000'], '')

    expect(result.arg0).toBe(1000n)
    expect(result.arg1).toBe(2000n)
  })

  it('decodes address fields as strings', () => {
    const contract = parseAci(PAIR_ACI)
    const transfer = contract.events.find((e) => e.name === 'Transfer')!

    const result = decodeEventArgs(
      transfer,
      ['ak_sender', 'ak_receiver', '500'],
      '',
    )

    expect(result.arg0).toBe('ak_sender')
    expect(result.arg1).toBe('ak_receiver')
    expect(result.arg2).toBe(500n)
  })

  it('decodes Swap event with mixed types', () => {
    const contract = parseAci(PAIR_ACI)
    const swap = contract.events.find((e) => e.name === 'Swap')!

    const result = decodeEventArgs(swap, ['ak_sender', '100', '200'], 'ak_to')

    expect(result.arg0).toBe('ak_sender')
    expect(result.arg1).toBe(100n)
    expect(result.arg2).toBe(200n)
  })

  it('handles empty args gracefully', () => {
    const contract = parseAci(PAIR_ACI)
    const sync = contract.events.find((e) => e.name === 'Sync')!

    const result = decodeEventArgs(sync, [], '')
    expect(result).toEqual({})
  })
})

describe('Code Generation', () => {
  describe('sophiaTypeToTs', () => {
    it('maps address to string', () => {
      expect(sophiaTypeToTs('address')).toBe('string')
    })

    it('maps int to bigint', () => {
      expect(sophiaTypeToTs('int')).toBe('bigint')
    })

    it('maps bool to boolean', () => {
      expect(sophiaTypeToTs('bool')).toBe('boolean')
    })

    it('maps string to string', () => {
      expect(sophiaTypeToTs('string')).toBe('string')
    })

    it('maps hash to string', () => {
      expect(sophiaTypeToTs('hash')).toBe('string')
    })

    it('maps bytes to string', () => {
      expect(sophiaTypeToTs('bytes')).toBe('string')
    })

    it('maps option to T | undefined', () => {
      expect(sophiaTypeToTs({ option: 'int' })).toBe('bigint | undefined')
    })

    it('maps list to T[]', () => {
      expect(sophiaTypeToTs({ list: 'address' })).toBe('string[]')
    })

    it('maps map to Map<K, V>', () => {
      expect(sophiaTypeToTs({ map: ['address', 'int'] })).toBe(
        'Map<string, bigint>',
      )
    })

    it('maps tuple to [T1, T2, ...]', () => {
      expect(sophiaTypeToTs({ tuple: ['int', 'int', 'address'] })).toBe(
        '[bigint, bigint, string]',
      )
    })
  })

  describe('generateEventTypes', () => {
    it('generates interfaces for all events', () => {
      const contract = parseAci(PAIR_ACI)
      const output = generateEventTypes(contract)

      expect(output).toContain('export interface SwapEventArgs')
      expect(output).toContain('export interface MintEventArgs')
      expect(output).toContain('export interface BurnEventArgs')
      expect(output).toContain('export interface TransferEventArgs')
    })

    it('generates union type', () => {
      const contract = parseAci(PAIR_ACI)
      const output = generateEventTypes(contract)

      expect(output).toContain('export type PairEventArgs =')
    })

    it('generates event name literal type', () => {
      const contract = parseAci(PAIR_ACI)
      const output = generateEventTypes(contract)

      expect(output).toContain('export type PairEventName =')
      expect(output).toContain("'Swap'")
      expect(output).toContain("'Transfer'")
    })

    it('handles contract with no events', () => {
      const contract = parseAci(NO_EVENTS_ACI)
      const output = generateEventTypes(contract)

      expect(output).toBe('')
    })

    it('generates correct field types', () => {
      const contract = parseAci(MINIMAL_ACI)
      const output = generateEventTypes(contract)

      expect(output).toContain('arg0: string')
      expect(output).toContain('arg1: string')
      expect(output).toContain('arg2: bigint')
    })
  })
})

describe('Sophia Type Parser', () => {
  it('handles nested option types', () => {
    const aci = {
      contract: {
        name: 'Test',
        kind: 'contract_main',
        event: {
          variant: [{ Evt: [{ option: ['int'] }] }],
        },
      },
    }

    const result = parseAci(aci)
    const evt = result.events[0]!

    expect(evt.fields[0]!.type).toEqual({ option: 'int' })
  })

  it('handles list types', () => {
    const aci = {
      contract: {
        name: 'Test',
        kind: 'contract_main',
        event: {
          variant: [{ Evt: [{ list: ['address'] }] }],
        },
      },
    }

    const result = parseAci(aci)
    expect(result.events[0]!.fields[0]!.type).toEqual({
      list: 'address',
    })
  })

  it('handles map types', () => {
    const aci = {
      contract: {
        name: 'Test',
        kind: 'contract_main',
        event: {
          variant: [{ Evt: [{ map: ['address', 'int'] }] }],
        },
      },
    }

    const result = parseAci(aci)
    expect(result.events[0]!.fields[0]!.type).toEqual({
      map: ['address', 'int'],
    })
  })
})
