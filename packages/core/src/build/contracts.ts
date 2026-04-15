import { parseAci } from '../aci/index.js'
import type { AeSyncConfig } from '../config/types.js'
import type { CompiledContract } from '../sync/types.js'

export async function compileContracts(
  config: AeSyncConfig,
): Promise<Map<string, CompiledContract>> {
  const result = new Map<string, CompiledContract>()

  for (const [name, contractConfig] of Object.entries(config.contracts)) {
    if (!contractConfig.aci) {
      throw new Error(`Contract "${name}" is missing an ACI definition`)
    }

    const parsed = parseAci(contractConfig.aci)
    const address = contractConfig.address ?? ''

    const compiled: CompiledContract = {
      name,
      address,
      aci: parsed,
      events: parsed.events,
      factory: contractConfig.factory,
      startHeight: contractConfig.startHeight,
      endHeight: contractConfig.endHeight,
    }

    result.set(address || name, compiled)
  }

  return result
}
