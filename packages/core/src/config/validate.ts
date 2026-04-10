import type { CreateConfigParameters } from './types.js'

export function validateConfig(config: CreateConfigParameters): void {
  if (!config.network) {
    throw new Error("Config error: 'network' is required")
  }

  if (!config.network.mdwUrl) {
    throw new Error(
      "Config error: 'network.mdwUrl' is required (middleware URL)",
    )
  }

  if (!config.contracts || Object.keys(config.contracts).length === 0) {
    throw new Error(
      'Config error: at least one contract must be defined in `contracts`',
    )
  }

  if (
    config.finalityDepth !== undefined &&
    (!Number.isInteger(config.finalityDepth) || config.finalityDepth <= 0)
  ) {
    throw new Error(
      `Config error: 'finalityDepth' must be a positive integer, got ${String(config.finalityDepth)}`,
    )
  }

  const contractNames = Object.keys(config.contracts)

  for (const name of contractNames) {
    const contract = config.contracts[name]!
    validateContract(name, contract, contractNames)
  }
}

function validateContract(
  name: string,
  contract: {
    aci?: object
    source?: string
    address?: string
    factory?: { contract: string; event: string; parameter: string }
  },
  allContractNames: string[],
): void {
  const hasAci = contract.aci !== undefined
  const hasSource = contract.source !== undefined

  if (!hasAci && !hasSource) {
    throw new Error(
      `Config error: contract '${name}' must have either 'aci' or 'source', got neither`,
    )
  }
  if (hasAci && hasSource) {
    throw new Error(
      `Config error: contract '${name}' must have either 'aci' or 'source', got both`,
    )
  }

  const hasAddress = contract.address !== undefined
  const hasFactory = contract.factory !== undefined

  if (!hasAddress && !hasFactory) {
    throw new Error(
      `Config error: contract '${name}' must have either 'address' or 'factory', got neither`,
    )
  }
  if (hasAddress && hasFactory) {
    throw new Error(
      `Config error: contract '${name}' must have either 'address' or 'factory', got both`,
    )
  }

  if (hasFactory) {
    const ref = contract.factory!.contract
    if (!allContractNames.includes(ref)) {
      throw new Error(
        `Config error: contract '${name}' factory references unknown contract '${ref}'`,
      )
    }
  }
}
