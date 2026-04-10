import { createMdwHttpClient } from './http.js'
import type { MdwClientConfig } from './types.js'
import { createMdwWebSocket } from './websocket.js'

import type { MdwHttpClient } from './http.js'
import type { MdwWebSocketClient } from './websocket.js'

export interface MdwClient {
  http: MdwHttpClient
  ws?: MdwWebSocketClient
}

export function createMdwClient(config: MdwClientConfig): MdwClient {
  const http = createMdwHttpClient(config.httpUrl, config.httpOptions)

  const ws = config.wsUrl
    ? createMdwWebSocket(config.wsUrl, config.wsOptions)
    : undefined

  return { http, ws }
}

export { createMdwHttpClient } from './http.js'
export type { MdwHttpClient } from './http.js'

export { createMdwWebSocket } from './websocket.js'
export type { MdwWebSocketClient, MdwWebSocketEvents } from './websocket.js'

export { extractCursor, paginateAll, paginateWithLimit } from './pagination.js'

export {
  MdwConnectionError,
  MdwError,
  MdwHttpError,
  MdwTimeoutError,
} from './errors.js'

export type {
  GetAex9TransfersOptions,
  GetContractCallsOptions,
  GetContractLogsOptions,
  MdwAex9Token,
  MdwAex9Transfer,
  MdwClientConfig,
  MdwContractCall,
  MdwContractLog,
  MdwHttpClientOptions,
  MdwKeyBlock,
  MdwPaginatedResponse,
  MdwStatus,
  MdwWebSocketOptions,
  PaginationOptions,
} from './types.js'
