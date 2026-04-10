// ── Pagination ──────────────────────────────────────────────────────

export interface MdwPaginatedResponse<T> {
  data: T[]
  next: string | null
  prev: string | null
}

export interface PaginationOptions {
  limit?: number
  cursor?: string
  direction?: 'forward' | 'backward'
  scope?: string
}

// ── Contract Logs ───────────────────────────────────────────────────

export interface MdwContractLog {
  contract_id: string
  contract_tx_hash: string
  call_tx_hash: string
  block_time: number
  height: number
  micro_index: number
  block_hash: string
  log_idx: number
  args: string[]
  data: string
  event_hash: string
  event_name: string | null
  ext_caller_contract_id: string | null
  parent_contract_id: string | null
}

export interface GetContractLogsOptions extends PaginationOptions {
  event?: string
}

// ── Contract Calls ──────────────────────────────────────────────────

export interface MdwContractCall {
  contract_id: string
  call_tx_hash: string
  function: string
  height: number
  micro_index: number
  block_hash: string
  local_idx: number
  internal_tx: boolean
}

export interface GetContractCallsOptions extends PaginationOptions {
  function?: string
}

// ── Status ──────────────────────────────────────────────────────────

export interface MdwStatus {
  node_version: string
  node_height: number
  node_syncing: boolean
  mdw_version: string
  mdw_height: number
  mdw_synced: boolean
  mdw_syncing: boolean
  mdw_gens_per_minute: number
  mdw_tx_index: number
  mdw_async_tasks: number
}

// ── Key Blocks ──────────────────────────────────────────────────────

export interface MdwKeyBlock {
  hash: string
  height: number
  time: number
  prev_hash: string
  prev_key_hash: string
  state_hash: string
  miner: string
  beneficiary: string
  target: number
  info: string
  version: number
}

// ── AEX-9 ───────────────────────────────────────────────────────────

export interface MdwAex9Token {
  name: string
  symbol: string
  decimals: number
  contract_id: string
  extensions: string[]
  holders: number
  initial_supply: number
  event_supply: number
}

export interface MdwAex9Transfer {
  sender: string
  recipient: string
  amount: number
  tx_hash: string
  block_height: number
  micro_index: number
  log_idx: number
  contract_id: string
}

export interface GetAex9TransfersOptions extends PaginationOptions {
  sender?: string
  recipient?: string
}

// ── Client Config ───────────────────────────────────────────────────

export interface MdwHttpClientOptions {
  timeout?: number
}

export interface MdwWebSocketOptions {
  reconnect?: boolean
  maxReconnectAttempts?: number
  reconnectBaseDelay?: number
  reconnectMaxDelay?: number
  heartbeatInterval?: number
}

export interface MdwClientConfig {
  httpUrl: string
  wsUrl?: string
  httpOptions?: MdwHttpClientOptions
  wsOptions?: MdwWebSocketOptions
}
