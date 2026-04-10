import EventEmitter from 'eventemitter3'
import type { MdwHttpClient } from '../mdw/http.js'
import type { MdwContractLog } from '../mdw/types.js'
import type { MdwWebSocketClient } from '../mdw/websocket.js'
import { createCheckpointManager } from './checkpoint.js'
import { createFactoryTracker } from './factory.js'
import { createHistoricalSync } from './historical.js'
import { matchEvent } from './matcher.js'
import { createRealtimeSync } from './realtime.js'
import { createSyncStateManager } from './state.js'
import type {
  CompiledContract,
  EventCallback,
  MatchedEvent,
  SyncProgress,
} from './types.js'

export type { CheckpointManager } from './checkpoint.js'
export type { FactoryTracker } from './factory.js'
export type { HistoricalSyncOptions } from './historical.js'
export type { RealtimeSync, RealtimeSyncEvents } from './realtime.js'
export type { SyncStateManager } from './state.js'
export type {
  Checkpoint,
  CompiledContract,
  ContractSyncState,
  EventCallback,
  HandlerEvent,
  MatchedEvent,
  SyncProgress,
  SyncStatus,
} from './types.js'

export { createCheckpointManager } from './checkpoint.js'
export { createFactoryTracker } from './factory.js'
export { createHistoricalSync } from './historical.js'
export { matchEvent } from './matcher.js'
export { createRealtimeSync } from './realtime.js'
export { createSyncStateManager } from './state.js'

export interface SyncEvents {
  progress: [progress: SyncProgress]
  event: [matched: MatchedEvent]
  error: [error: Error]
  backfillComplete: [contractName: string]
  realtimeStarted: []
}

export interface SyncEngine {
  start(): Promise<void>
  stop(): void
  getStatus(): SyncProgress
  onProgress(fn: (progress: SyncProgress) => void): void
  on<K extends keyof SyncEvents>(
    event: K,
    fn: (...args: SyncEvents[K]) => void,
  ): void
}

export interface CreateSyncParams {
  mdwHttp: MdwHttpClient
  mdwWs?: MdwWebSocketClient
  contracts: Map<string, CompiledContract>
  eventCallbacks: Map<string, EventCallback>
}

/**
 * Main sync orchestrator. Runs historical backfill for each contract,
 * then transitions to real-time WebSocket following. Matched events
 * are emitted for the indexing layer to consume.
 */
export function createSync(params: CreateSyncParams): SyncEngine {
  const { mdwHttp, mdwWs, contracts, eventCallbacks } = params
  const emitter = new EventEmitter<SyncEvents>()
  const stateManager = createSyncStateManager()
  const checkpointManager = createCheckpointManager()

  const factoryConfigs = new Map(
    [...contracts.entries()]
      .filter(([_, c]) => c.factory)
      .map(([_, c]) => [c.name, c.factory!]),
  )
  const factoryTracker = createFactoryTracker(factoryConfigs, contracts)

  let stopped = false
  let startTime = Date.now()
  let totalEvents = 0

  function emitProgress() {
    const progress = getStatus()
    emitter.emit('progress', progress)
  }

  function processLog(log: MdwContractLog) {
    const matched = matchEvent(log, contracts, eventCallbacks)
    if (!matched) return

    totalEvents++
    emitter.emit('event', matched)

    const newAddress = factoryTracker.processEvent(
      matched.contractName,
      matched.eventName,
      matched.event,
    )
    if (newAddress) {
      const factorySource = contracts.get(matched.event.contractId)
      if (factorySource?.factory) {
        const childName = factorySource.factory.contract
        const childContract = [...contracts.values()].find(
          (c) => c.name === childName,
        )
        if (childContract) {
          const dynamicContract: CompiledContract = {
            ...childContract,
            address: newAddress,
          }
          contracts.set(newAddress, dynamicContract)
        }
      }
    }

    stateManager.updateState(log.contract_id, matched.contractName, {
      lastHeight: log.height,
      eventsProcessed:
        (stateManager.getState(log.contract_id, matched.contractName)
          ?.eventsProcessed ?? 0) + 1,
    })

    checkpointManager.addCheckpoint(log.height, log.block_hash)
  }

  async function runBackfill(contract: CompiledContract) {
    const state = stateManager.getState(contract.address, contract.name)

    stateManager.updateState(contract.address, contract.name, {
      status: 'backfilling',
    })

    try {
      const generator = createHistoricalSync(mdwHttp, contract, {
        lastCursor: state?.lastCursor,
        startHeight: undefined, // determined by contract config externally
      })

      for await (const batch of generator) {
        if (stopped) return
        for (const log of batch) {
          processLog(log)
        }
        emitProgress()
      }

      stateManager.updateState(contract.address, contract.name, {
        status: 'realtime',
      })
      emitter.emit('backfillComplete', contract.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      stateManager.updateState(contract.address, contract.name, {
        status: 'error',
        error: message,
      })
      emitter.emit('error', err instanceof Error ? err : new Error(message))
    }
  }

  function getStatus(): SyncProgress {
    const elapsed = (Date.now() - startTime) / 1000
    return {
      totalEvents,
      eventsPerSecond: elapsed > 0 ? totalEvents / elapsed : 0,
      contracts: stateManager.getAllStates(),
    }
  }

  return {
    async start() {
      stopped = false
      startTime = Date.now()
      totalEvents = 0

      for (const contract of contracts.values()) {
        stateManager.updateState(contract.address, contract.name, {
          status: 'pending',
        })
      }

      const backfillPromises = [...contracts.values()].map((c) =>
        runBackfill(c),
      )
      await Promise.all(backfillPromises)

      if (stopped) return

      if (mdwWs) {
        const realtime = createRealtimeSync(mdwHttp, mdwWs, contracts)
        realtime.on('event', (log) => processLog(log))
        realtime.on('error', (err) => emitter.emit('error', err))
        realtime.start()
        emitter.emit('realtimeStarted')
      }

      emitProgress()
    },

    stop() {
      stopped = true
      for (const contract of contracts.values()) {
        stateManager.updateState(contract.address, contract.name, {
          status: 'stopped',
        })
      }
    },

    getStatus,

    onProgress(fn) {
      emitter.on('progress', fn)
    },

    on(event, fn) {
      emitter.on(event, fn as (...args: unknown[]) => void)
    },
  }
}
