import type { AciContract, AciEvent } from '../aci/types.js'
import type { FactoryConfig } from '../config/types.js'
import type { MdwContractLog } from '../mdw/types.js'

export type SyncStatus =
  | 'pending'
  | 'backfilling'
  | 'realtime'
  | 'error'
  | 'stopped'

export interface Checkpoint {
  height: number
  blockHash: string
}

export interface ContractSyncState {
  contractId: string
  contractName: string
  status: SyncStatus
  lastCursor?: string
  lastHeight: number
  eventsProcessed: number
  error?: string
}

export interface HandlerEvent<T = Record<string, unknown>> {
  args: T
  contractId: string
  txHash: string
  logIndex: number
  height: number
  blockTime: number
  blockHash: string
  microIndex: number
  callerContractId?: string
  parentContractId?: string
  raw: MdwContractLog
}

export interface EventCallback {
  name: string
  fn: (args: { event: HandlerEvent; context: unknown }) => Promise<void>
}

export interface CompiledContract {
  name: string
  address: string
  aci: AciContract
  events: AciEvent[]
  factory?: FactoryConfig
  startHeight?: number
  endHeight?: number
}

export interface MatchedEvent {
  contractName: string
  eventName: string
  event: HandlerEvent
  callback: EventCallback
}

export interface SyncProgress {
  totalEvents: number
  eventsPerSecond: number
  contracts: ContractSyncState[]
}
