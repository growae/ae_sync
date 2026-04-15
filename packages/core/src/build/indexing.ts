import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ViteNodeRunner } from 'vite-node/client'
import type { CompiledContract, EventCallback } from '../sync/types.js'

export async function compileIndexing(
  runner: ViteNodeRunner,
  rootDir: string,
  contracts: Map<string, CompiledContract>,
): Promise<EventCallback[]> {
  const indexPath = resolve(rootDir, 'src/index.ts')
  if (!existsSync(indexPath)) {
    return []
  }

  await runner.executeFile(indexPath)

  const registry = (await runner.executeId('aesync:registry')) as {
    aesync: { fns: EventCallback[] }
  }
  const handlers = registry.aesync.fns

  for (const handler of handlers) {
    validateHandlerName(handler.name, contracts)
  }

  return handlers
}

function validateHandlerName(
  name: string,
  contracts: Map<string, CompiledContract>,
): void {
  const parts = name.split(':')
  const contractName = parts[0]
  const eventName = parts[1]

  if (!contractName || !eventName) {
    throw new Error(
      `Invalid handler name "${name}". Expected format: "ContractName:EventName"`,
    )
  }

  const contract = [...contracts.values()].find((c) => c.name === contractName)
  if (!contract) {
    throw new Error(
      `Handler "${name}" references unknown contract "${contractName}". ` +
        `Available: ${[...contracts.values()].map((c) => c.name).join(', ')}`,
    )
  }

  const event = contract.events.find((e) => e.name === eventName)
  if (!event) {
    throw new Error(
      `Handler "${name}" references unknown event "${eventName}" on contract "${contractName}". ` +
        `Available events: ${contract.events.map((e) => e.name).join(', ')}`,
    )
  }
}
