import EventEmitter from 'eventemitter3'
import type { MdwWebSocketOptions } from './types.js'

interface MdwWsSubscribeMessage {
  op: 'Subscribe'
  payload: 'Object'
  target: string
  source: 'mdw'
}

interface MdwWsUnsubscribeMessage {
  op: 'Unsubscribe'
  payload: 'Object'
  target: string
  source: 'mdw'
}

interface MdwWsPingMessage {
  op: 'Ping'
}

type MdwWsOutgoingMessage =
  | MdwWsSubscribeMessage
  | MdwWsUnsubscribeMessage
  | MdwWsPingMessage

interface MdwWsEventPayload {
  payload: Record<string, unknown>
  subscription: string
  source: string
  target: string
}

interface MdwWsPongPayload {
  payload: 'Pong'
  subscriptions: string[]
}

export interface MdwWebSocketEvents {
  event: [data: MdwWsEventPayload]
  connected: []
  disconnected: [code: number, reason: string]
  error: [error: Error]
  subscribed: [target: string]
}

export interface MdwWebSocketClient {
  connect(): void
  subscribe(target: string): void
  unsubscribe(target: string): void
  ping(): Promise<MdwWsPongPayload>
  close(): void
  on<K extends keyof MdwWebSocketEvents>(
    event: K,
    fn: (...args: MdwWebSocketEvents[K]) => void,
  ): void
  off<K extends keyof MdwWebSocketEvents>(
    event: K,
    fn: (...args: MdwWebSocketEvents[K]) => void,
  ): void
}

const DEFAULT_RECONNECT_BASE_DELAY = 1_000
const DEFAULT_RECONNECT_MAX_DELAY = 30_000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = Number.POSITIVE_INFINITY
const DEFAULT_HEARTBEAT_INTERVAL = 30_000

export function createMdwWebSocket(
  wsUrl: string,
  options?: MdwWebSocketOptions,
): MdwWebSocketClient {
  const emitter = new EventEmitter<MdwWebSocketEvents>()
  const reconnect = options?.reconnect ?? true
  const maxAttempts =
    options?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
  const baseDelay = options?.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY
  const maxDelay = options?.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY
  const heartbeatMs = options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pendingPong: ((value: MdwWsPongPayload) => void) | null = null
  let intentionalClose = false
  const subscriptions = new Set<string>()

  function send(msg: MdwWsOutgoingMessage) {
    ws?.send(JSON.stringify(msg))
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        send({ op: 'Ping' })
      }
    }, heartbeatMs)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (!reconnect || reconnectAttempts >= maxAttempts || intentionalClose)
      return

    const delay = Math.min(baseDelay * 2 ** reconnectAttempts, maxDelay)
    reconnectAttempts++

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function resubscribe() {
    for (const target of subscriptions) {
      send({ op: 'Subscribe', payload: 'Object', target, source: 'mdw' })
    }
  }

  function handleMessage(raw: MessageEvent) {
    try {
      const msg = JSON.parse(String(raw.data)) as
        | MdwWsEventPayload
        | MdwWsPongPayload
        | { ref: unknown }

      if ('payload' in msg && msg.payload === 'Pong') {
        pendingPong?.(msg as MdwWsPongPayload)
        pendingPong = null
        return
      }

      if ('subscription' in msg) {
        emitter.emit('event', msg as MdwWsEventPayload)
      }
    } catch {
      emitter.emit('error', new Error('Failed to parse WebSocket message'))
    }
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return
    intentionalClose = false

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      reconnectAttempts = 0
      emitter.emit('connected')
      startHeartbeat()
      resubscribe()
    }

    ws.onmessage = handleMessage

    ws.onclose = (e) => {
      stopHeartbeat()
      emitter.emit('disconnected', e.code, e.reason)
      if (!intentionalClose) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      emitter.emit('error', new Error(`WebSocket error on ${wsUrl}`))
    }
  }

  function close() {
    intentionalClose = true
    stopHeartbeat()

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close()
      ws = null
    }
  }

  return {
    connect,

    subscribe(target) {
      subscriptions.add(target)
      if (ws?.readyState === WebSocket.OPEN) {
        send({ op: 'Subscribe', payload: 'Object', target, source: 'mdw' })
        emitter.emit('subscribed', target)
      }
    },

    unsubscribe(target) {
      subscriptions.delete(target)
      if (ws?.readyState === WebSocket.OPEN) {
        send({ op: 'Unsubscribe', payload: 'Object', target, source: 'mdw' })
      }
    },

    ping() {
      return new Promise<MdwWsPongPayload>((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket is not connected'))
          return
        }
        pendingPong = resolve
        send({ op: 'Ping' })
      })
    },

    close,

    on(event, fn) {
      emitter.on(event, fn as (...args: any[]) => void)
    },

    off(event, fn) {
      emitter.off(event, fn as (...args: any[]) => void)
    },
  }
}
