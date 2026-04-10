import type { FactoryConfig } from '../config/types.js'
import type { CompiledContract, HandlerEvent } from './types.js'

export interface FactoryTracker {
  /** Process an event and return a new contract address if this is a factory creation event. */
  processEvent(
    contractName: string,
    eventName: string,
    event: HandlerEvent,
  ): string | null
  /** Get all dynamically discovered contract addresses. */
  getTrackedAddresses(): string[]
}

/**
 * Tracks factory contract events and extracts new child contract addresses.
 *
 * When a factory event fires (matching the configured event name on the
 * configured parent contract), the specified parameter is extracted from
 * the event args and registered as a new contract address to track.
 */
export function createFactoryTracker(
  factoryConfigs: Map<string, FactoryConfig>,
  contracts: Map<string, CompiledContract>,
): FactoryTracker {
  for (const [name, config] of factoryConfigs) {
    const childExists = [...contracts.values()].some(
      (c) => c.name === config.contract,
    )
    if (contracts.size > 0 && !childExists) {
      console.log(
        `[ae-sync] warn: factory "${name}" references unknown child contract "${config.contract}"`,
      )
    }
  }

  const trackedAddresses: string[] = []

  return {
    processEvent(contractName, eventName, event) {
      const config = factoryConfigs.get(contractName)
      if (!config) return null
      if (config.event !== eventName) return null

      const newAddress = event.args[config.parameter]
      if (typeof newAddress !== 'string' || !newAddress) return null

      if (!trackedAddresses.includes(newAddress)) {
        trackedAddresses.push(newAddress)
      }

      return newAddress
    },

    getTrackedAddresses() {
      return [...trackedAddresses]
    },
  }
}
