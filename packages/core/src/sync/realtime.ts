import EventEmitter from 'eventemitter3'
import type { MdwHttpClient } from '../mdw/http.js'
import type { MdwContractLog } from '../mdw/types.js'
import type { MdwWebSocketClient } from '../mdw/websocket.js'
import type { CompiledContract } from './types.js'

export interface RealtimeSyncEvents {
  event: [log: MdwContractLog]
  error: [error: Error]
  connected: []
  disconnected: []
}

export interface RealtimeSync {
  start(): void
  stop(): void
  subscribe(contractId: string): void
  on<K extends keyof RealtimeSyncEvents>(
    event: K,
    handler: (...args: RealtimeSyncEvents[K]) => void,
  ): void
  off<K extends keyof RealtimeSyncEvents>(
    event: K,
    handler: (...args: RealtimeSyncEvents[K]) => void,
  ): void
}

/**
 * Manages real-time event subscriptions via MDW WebSocket.
 * On each incoming WS event, fetches full log details via HTTP
 * and emits them for consumption by the sync engine.
 */
export function createRealtimeSync(
  mdwHttp: MdwHttpClient,
  mdwWs: MdwWebSocketClient,
  contracts: Map<string, CompiledContract>,
): RealtimeSync {
  const emitter = new EventEmitter<RealtimeSyncEvents>()
  let running = false

  function handleWsEvent(data: { target: string }) {
    if (!running) return
    const contractId = data.target
    if (!contracts.has(contractId)) return

    mdwHttp
      .getContractLogs(contractId, { limit: 1 })
      .then((page) => {
        for (const log of page.data) {
          emitter.emit('event', log)
        }
      })
      .catch((err: unknown) => {
        emitter.emit(
          'error',
          err instanceof Error ? err : new Error(String(err)),
        )
      })
  }

  return {
    start() {
      if (running) return
      running = true

      mdwWs.on('event', handleWsEvent as (...args: unknown[]) => void)
      mdwWs.on('connected', () => emitter.emit('connected'))
      mdwWs.on('disconnected', () => emitter.emit('disconnected'))
      mdwWs.on('error', (err) => emitter.emit('error', err))

      mdwWs.connect()

      for (const contractId of contracts.keys()) {
        mdwWs.subscribe(contractId)
      }
    },

    stop() {
      running = false
      mdwWs.close()
    },

    subscribe(contractId) {
      mdwWs.subscribe(contractId)
    },

    on(event, handler) {
      emitter.on(event, handler as (...args: unknown[]) => void)
    },

    off(event, handler) {
      emitter.off(event, handler as (...args: unknown[]) => void)
    },
  }
}
