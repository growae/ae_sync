import { decodeEventArgs } from '../aci/decoder.js'
import type { MdwContractLog } from '../mdw/types.js'
import type {
  CompiledContract,
  EventCallback,
  HandlerEvent,
  MatchedEvent,
} from './types.js'

function buildHandlerEvent(
  log: MdwContractLog,
  decodedArgs: Record<string, unknown>,
): HandlerEvent {
  return {
    args: decodedArgs,
    contractId: log.contract_id,
    txHash: log.call_tx_hash,
    logIndex: log.log_idx,
    height: log.height,
    blockTime: log.block_time,
    blockHash: log.block_hash,
    microIndex: log.micro_index,
    callerContractId: log.ext_caller_contract_id ?? undefined,
    parentContractId: log.parent_contract_id ?? undefined,
    raw: log,
  }
}

/**
 * Match a raw MDW contract log to a compiled contract and event callback.
 *
 * Lookup flow:
 * 1. Find the contract by `contract_id`
 * 2. Find the event definition by `event_hash`
 * 3. Decode args using the ACI event schema
 * 4. Find the callback by `"ContractName:EventName"`
 */
export function matchEvent(
  log: MdwContractLog,
  contracts: Map<string, CompiledContract>,
  eventCallbacks: Map<string, EventCallback>,
): MatchedEvent | null {
  const contract = contracts.get(log.contract_id)
  if (!contract) return null

  const event = contract.events.find((e) => e.hash === log.event_hash)
  if (!event) return null

  const callbackKey = `${contract.name}:${event.name}`
  const callback = eventCallbacks.get(callbackKey)
  if (!callback) return null

  const decodedArgs = decodeEventArgs(event, log.args, log.data)
  const handlerEvent = buildHandlerEvent(log, decodedArgs)

  return {
    contractName: contract.name,
    eventName: event.name,
    event: handlerEvent,
    callback,
  }
}
