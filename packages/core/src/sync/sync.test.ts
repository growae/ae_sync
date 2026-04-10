import { describe, expect, it, vi } from 'vitest'
import { eventHashHex } from '../aci/hash.js'
import { parseAci } from '../aci/parser.js'
import type { AciContract, AciEvent } from '../aci/types.js'
import type { MdwHttpClient } from '../mdw/http.js'
import type { MdwContractLog, MdwPaginatedResponse } from '../mdw/types.js'
import { createCheckpointManager } from './checkpoint.js'
import { createFactoryTracker } from './factory.js'
import { createHistoricalSync } from './historical.js'
import { matchEvent } from './matcher.js'
import { createSyncStateManager } from './state.js'
import type { CompiledContract, EventCallback, HandlerEvent } from './types.js'

// ── Test fixtures ────────────────────────────────────────────────────

const TOKEN_ACI_RAW = {
  contract: {
    name: 'Token',
    kind: 'contract_main',
    event: {
      variant: [
        { Transfer: ['address', 'address', 'int'] },
        { Approval: ['address', 'address', 'int'] },
      ],
    },
    functions: [],
  },
}

const TOKEN_ACI: AciContract = parseAci(TOKEN_ACI_RAW)

const TRANSFER_HASH = eventHashHex('Transfer')
const APPROVAL_HASH = eventHashHex('Approval')

const CONTRACT_ID = 'ct_token123'

const COMPILED_TOKEN: CompiledContract = {
  name: 'Token',
  address: CONTRACT_ID,
  aci: TOKEN_ACI,
  events: TOKEN_ACI.events,
}

function makeLog(overrides: Partial<MdwContractLog> = {}): MdwContractLog {
  return {
    contract_id: CONTRACT_ID,
    contract_tx_hash: 'th_deploy1',
    call_tx_hash: 'th_tx1',
    block_time: 1700000000,
    height: 100,
    micro_index: 0,
    block_hash: 'mh_block1',
    log_idx: 0,
    args: ['ak_sender', 'ak_receiver', '1000'],
    data: '',
    event_hash: TRANSFER_HASH,
    event_name: 'Transfer',
    ext_caller_contract_id: null,
    parent_contract_id: null,
    ...overrides,
  }
}

function makeContracts(): Map<string, CompiledContract> {
  return new Map([[CONTRACT_ID, COMPILED_TOKEN]])
}

function makeCallbacks(): Map<string, EventCallback> {
  return new Map([
    [
      'Token:Transfer',
      {
        name: 'Token:Transfer',
        fn: vi
          .fn<
            (args: { event: HandlerEvent; context: unknown }) => Promise<void>
          >()
          .mockResolvedValue(undefined),
      },
    ],
    [
      'Token:Approval',
      {
        name: 'Token:Approval',
        fn: vi
          .fn<
            (args: { event: HandlerEvent; context: unknown }) => Promise<void>
          >()
          .mockResolvedValue(undefined),
      },
    ],
  ])
}

// ── Event Matching ───────────────────────────────────────────────────

describe('Event Matcher', () => {
  it('matches Transfer event by contract_id and event_hash', () => {
    const log = makeLog()
    const result = matchEvent(log, makeContracts(), makeCallbacks())

    expect(result).not.toBeNull()
    expect(result!.contractName).toBe('Token')
    expect(result!.eventName).toBe('Transfer')
  })

  it('decodes event args correctly', () => {
    const log = makeLog()
    const result = matchEvent(log, makeContracts(), makeCallbacks())

    expect(result!.event.args).toEqual({
      arg0: 'ak_sender',
      arg1: 'ak_receiver',
      arg2: 1000n,
    })
  })

  it('returns null for unknown contract_id', () => {
    const log = makeLog({ contract_id: 'ct_unknown' })
    const result = matchEvent(log, makeContracts(), makeCallbacks())
    expect(result).toBeNull()
  })

  it('returns null for unknown event_hash', () => {
    const log = makeLog({ event_hash: 'deadbeef' })
    const result = matchEvent(log, makeContracts(), makeCallbacks())
    expect(result).toBeNull()
  })

  it('returns null when no callback registered for event', () => {
    const log = makeLog()
    const callbacks = new Map<string, EventCallback>()
    const result = matchEvent(log, makeContracts(), callbacks)
    expect(result).toBeNull()
  })

  it('matches Approval event', () => {
    const log = makeLog({
      event_hash: APPROVAL_HASH,
      event_name: 'Approval',
      args: ['ak_owner', 'ak_spender', '500'],
    })
    const result = matchEvent(log, makeContracts(), makeCallbacks())

    expect(result).not.toBeNull()
    expect(result!.eventName).toBe('Approval')
    expect(result!.event.args).toEqual({
      arg0: 'ak_owner',
      arg1: 'ak_spender',
      arg2: 500n,
    })
  })

  it('builds HandlerEvent with correct metadata', () => {
    const log = makeLog({
      call_tx_hash: 'th_abc',
      height: 200,
      block_time: 1700000500,
      block_hash: 'mh_block2',
      micro_index: 3,
      log_idx: 1,
      ext_caller_contract_id: 'ct_caller',
      parent_contract_id: 'ct_parent',
    })
    const result = matchEvent(log, makeContracts(), makeCallbacks())

    expect(result!.event.txHash).toBe('th_abc')
    expect(result!.event.height).toBe(200)
    expect(result!.event.blockTime).toBe(1700000500)
    expect(result!.event.blockHash).toBe('mh_block2')
    expect(result!.event.microIndex).toBe(3)
    expect(result!.event.logIndex).toBe(1)
    expect(result!.event.callerContractId).toBe('ct_caller')
    expect(result!.event.parentContractId).toBe('ct_parent')
    expect(result!.event.contractId).toBe(CONTRACT_ID)
    expect(result!.event.raw).toBe(log)
  })
})

// ── Checkpoint Management ────────────────────────────────────────────

describe('Checkpoint Manager', () => {
  it('adds and retrieves checkpoints in order', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(100, 'mh_100')
    mgr.addCheckpoint(50, 'mh_50')
    mgr.addCheckpoint(200, 'mh_200')

    const all = mgr.getCheckpoints()
    expect(all).toEqual([
      { height: 50, blockHash: 'mh_50' },
      { height: 100, blockHash: 'mh_100' },
      { height: 200, blockHash: 'mh_200' },
    ])
  })

  it('returns undefined for empty checkpoint list', () => {
    const mgr = createCheckpointManager()
    expect(mgr.getLastCheckpoint()).toBeUndefined()
  })

  it('returns last checkpoint', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(50, 'mh_50')
    mgr.addCheckpoint(100, 'mh_100')

    expect(mgr.getLastCheckpoint()).toEqual({
      height: 100,
      blockHash: 'mh_100',
    })
  })

  it('removes checkpoints above a given height', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(50, 'mh_50')
    mgr.addCheckpoint(100, 'mh_100')
    mgr.addCheckpoint(150, 'mh_150')
    mgr.addCheckpoint(200, 'mh_200')

    mgr.removeAbove(100)

    expect(mgr.getCheckpoints()).toEqual([
      { height: 50, blockHash: 'mh_50' },
      { height: 100, blockHash: 'mh_100' },
    ])
  })

  it('removeAbove with height above all keeps everything', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(50, 'mh_50')
    mgr.addCheckpoint(100, 'mh_100')

    mgr.removeAbove(200)
    expect(mgr.getCheckpoints()).toHaveLength(2)
  })

  it('removeAbove with height below all removes everything', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(50, 'mh_50')
    mgr.addCheckpoint(100, 'mh_100')

    mgr.removeAbove(10)
    expect(mgr.getCheckpoints()).toHaveLength(0)
  })

  it('updates existing checkpoint at same height', () => {
    const mgr = createCheckpointManager()
    mgr.addCheckpoint(100, 'mh_old')
    mgr.addCheckpoint(100, 'mh_new')

    expect(mgr.getCheckpoints()).toEqual([{ height: 100, blockHash: 'mh_new' }])
  })
})

// ── Historical Sync ──────────────────────────────────────────────────

describe('Historical Sync', () => {
  function makeMockMdw(
    pages: MdwPaginatedResponse<MdwContractLog>[],
  ): MdwHttpClient {
    let callCount = 0
    return {
      getContractLogs: vi.fn().mockImplementation(() => {
        const page = pages[callCount]
        callCount++
        return Promise.resolve(page)
      }),
      getAllContractLogs: vi.fn(),
      getContractCalls: vi.fn(),
      getStatus: vi.fn(),
      getKeyBlock: vi.fn(),
      getAex9Tokens: vi.fn(),
      getAex9Transfers: vi.fn(),
    } as unknown as MdwHttpClient
  }

  it('yields batches from paginated responses', async () => {
    const log1 = makeLog({ height: 100, log_idx: 0 })
    const log2 = makeLog({ height: 101, log_idx: 0 })
    const log3 = makeLog({ height: 102, log_idx: 0 })

    const mdw = makeMockMdw([
      {
        data: [log1, log2],
        next: '/v3/contracts/ct_token123/logs?cursor=abc',
        prev: null,
      },
      { data: [log3], next: null, prev: null },
    ])

    const batches: MdwContractLog[][] = []
    for await (const batch of createHistoricalSync(mdw, COMPILED_TOKEN)) {
      batches.push(batch)
    }

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(2)
    expect(batches[1]).toHaveLength(1)
  })

  it('passes scope for startHeight', async () => {
    const mdw = makeMockMdw([{ data: [], next: null, prev: null }])

    const batches: MdwContractLog[][] = []
    for await (const batch of createHistoricalSync(mdw, COMPILED_TOKEN, {
      startHeight: 500,
    })) {
      batches.push(batch)
    }

    expect(mdw.getContractLogs).toHaveBeenCalledWith(CONTRACT_ID, {
      cursor: undefined,
      scope: 'gen:500',
      limit: 100,
    })
  })

  it('resumes from lastCursor', async () => {
    const mdw = makeMockMdw([{ data: [], next: null, prev: null }])

    const batches: MdwContractLog[][] = []
    for await (const batch of createHistoricalSync(mdw, COMPILED_TOKEN, {
      lastCursor: 'resume_cursor',
    })) {
      batches.push(batch)
    }

    expect(mdw.getContractLogs).toHaveBeenCalledWith(CONTRACT_ID, {
      cursor: 'resume_cursor',
      scope: undefined,
      limit: 100,
    })
  })

  it('handles empty response', async () => {
    const mdw = makeMockMdw([{ data: [], next: null, prev: null }])

    const batches: MdwContractLog[][] = []
    for await (const batch of createHistoricalSync(mdw, COMPILED_TOKEN)) {
      batches.push(batch)
    }

    expect(batches).toHaveLength(0)
  })
})

// ── Factory Tracker ──────────────────────────────────────────────────

describe('Factory Tracker', () => {
  const FACTORY_ACI_RAW = {
    contract: {
      name: 'Factory',
      kind: 'contract_main',
      event: {
        variant: [{ PairCreated: ['address', 'address', 'address'] }],
      },
    },
  }

  const FACTORY_ACI: AciContract = parseAci(FACTORY_ACI_RAW)
  const factoryEvents: AciEvent[] = FACTORY_ACI.events

  it('extracts new address from factory event', () => {
    const factoryConfigs = new Map([
      [
        'Factory',
        { contract: 'Pair', event: 'PairCreated', parameter: 'arg2' },
      ],
    ])
    const contracts = new Map<string, CompiledContract>([
      [
        'ct_factory',
        {
          name: 'Factory',
          address: 'ct_factory',
          aci: FACTORY_ACI,
          events: factoryEvents,
        },
      ],
    ])

    const tracker = createFactoryTracker(factoryConfigs, contracts)

    const event: HandlerEvent = {
      args: { arg0: 'ak_token0', arg1: 'ak_token1', arg2: 'ct_newpair' },
      contractId: 'ct_factory',
      txHash: 'th_tx1',
      logIndex: 0,
      height: 100,
      blockTime: 1700000000,
      blockHash: 'mh_block1',
      microIndex: 0,
      raw: makeLog(),
    }

    const result = tracker.processEvent('Factory', 'PairCreated', event)
    expect(result).toBe('ct_newpair')
    expect(tracker.getTrackedAddresses()).toEqual(['ct_newpair'])
  })

  it('returns null for non-factory events', () => {
    const factoryConfigs = new Map([
      [
        'Factory',
        { contract: 'Pair', event: 'PairCreated', parameter: 'arg2' },
      ],
    ])
    const tracker = createFactoryTracker(factoryConfigs, new Map())

    const event: HandlerEvent = {
      args: { arg0: 'ak_sender' },
      contractId: 'ct_other',
      txHash: 'th_tx1',
      logIndex: 0,
      height: 100,
      blockTime: 1700000000,
      blockHash: 'mh_block1',
      microIndex: 0,
      raw: makeLog(),
    }

    expect(tracker.processEvent('Other', 'Transfer', event)).toBeNull()
  })

  it('returns null when event name does not match', () => {
    const factoryConfigs = new Map([
      [
        'Factory',
        { contract: 'Pair', event: 'PairCreated', parameter: 'arg2' },
      ],
    ])
    const tracker = createFactoryTracker(factoryConfigs, new Map())

    const event: HandlerEvent = {
      args: { arg0: 'value' },
      contractId: 'ct_factory',
      txHash: 'th_tx1',
      logIndex: 0,
      height: 100,
      blockTime: 1700000000,
      blockHash: 'mh_block1',
      microIndex: 0,
      raw: makeLog(),
    }

    expect(tracker.processEvent('Factory', 'WrongEvent', event)).toBeNull()
  })

  it('does not duplicate tracked addresses', () => {
    const factoryConfigs = new Map([
      [
        'Factory',
        { contract: 'Pair', event: 'PairCreated', parameter: 'arg2' },
      ],
    ])
    const tracker = createFactoryTracker(factoryConfigs, new Map())

    const event: HandlerEvent = {
      args: { arg2: 'ct_same' },
      contractId: 'ct_factory',
      txHash: 'th_tx1',
      logIndex: 0,
      height: 100,
      blockTime: 1700000000,
      blockHash: 'mh_block1',
      microIndex: 0,
      raw: makeLog(),
    }

    tracker.processEvent('Factory', 'PairCreated', event)
    tracker.processEvent('Factory', 'PairCreated', event)

    expect(tracker.getTrackedAddresses()).toEqual(['ct_same'])
  })
})

// ── Sync State Manager ───────────────────────────────────────────────

describe('Sync State Manager', () => {
  it('returns undefined for unknown state', () => {
    const mgr = createSyncStateManager()
    expect(mgr.getState('ct_unknown', 'Unknown')).toBeUndefined()
  })

  it('creates and updates state', () => {
    const mgr = createSyncStateManager()
    mgr.updateState('ct_token', 'Token', {
      status: 'backfilling',
      lastHeight: 100,
      eventsProcessed: 50,
    })

    const state = mgr.getState('ct_token', 'Token')
    expect(state).toBeDefined()
    expect(state!.status).toBe('backfilling')
    expect(state!.lastHeight).toBe(100)
    expect(state!.eventsProcessed).toBe(50)
  })

  it('updates partial state', () => {
    const mgr = createSyncStateManager()
    mgr.updateState('ct_token', 'Token', { status: 'backfilling' })
    mgr.updateState('ct_token', 'Token', { lastHeight: 200 })

    const state = mgr.getState('ct_token', 'Token')
    expect(state!.status).toBe('backfilling')
    expect(state!.lastHeight).toBe(200)
  })

  it('getAllStates returns all tracked contracts', () => {
    const mgr = createSyncStateManager()
    mgr.updateState('ct_a', 'A', { status: 'backfilling' })
    mgr.updateState('ct_b', 'B', { status: 'realtime' })

    expect(mgr.getAllStates()).toHaveLength(2)
  })

  it('resetAboveHeight resets contracts above threshold', () => {
    const mgr = createSyncStateManager()
    mgr.updateState('ct_a', 'A', { status: 'realtime', lastHeight: 100 })
    mgr.updateState('ct_b', 'B', { status: 'realtime', lastHeight: 200 })

    mgr.resetAboveHeight(150)

    expect(mgr.getState('ct_a', 'A')!.status).toBe('realtime')
    expect(mgr.getState('ct_a', 'A')!.lastHeight).toBe(100)
    expect(mgr.getState('ct_b', 'B')!.status).toBe('pending')
    expect(mgr.getState('ct_b', 'B')!.lastHeight).toBe(150)
  })
})

// ── SyncProgress computation ─────────────────────────────────────────

describe('SyncProgress', () => {
  it('computes progress from state manager', () => {
    const mgr = createSyncStateManager()
    mgr.updateState('ct_a', 'A', {
      status: 'backfilling',
      lastHeight: 100,
      eventsProcessed: 50,
    })
    mgr.updateState('ct_b', 'B', {
      status: 'realtime',
      lastHeight: 200,
      eventsProcessed: 100,
    })

    const states = mgr.getAllStates()
    const totalEvents = states.reduce((sum, s) => sum + s.eventsProcessed, 0)

    expect(totalEvents).toBe(150)
    expect(states).toHaveLength(2)
    expect(states.find((s) => s.contractName === 'A')!.status).toBe(
      'backfilling',
    )
    expect(states.find((s) => s.contractName === 'B')!.status).toBe('realtime')
  })
})
