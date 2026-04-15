import type { EventCallbackFn } from '@growae/aesync'
import { token } from '../schema.js'

/**
 * BclFactory:CreateCommunity handler.
 *
 * ACI: CreateCommunity(string, DAO, TokenSale, CommunityManagement)
 * Decoded args: arg0 = name, arg1 = DAO address, arg2 = TokenSale address, arg3 = CommunityManagement address
 */
export const onCreateCommunity: EventCallbackFn = async ({
  event,
  context,
}) => {
  const name = event.args.arg0 as string
  const daoAddress = event.args.arg1 as string
  const tokenSaleAddress = event.args.arg2 as string
  const communityManagementAddress = event.args.arg3 as string

  await context.db.insert(token).values({
    address: tokenSaleAddress,
    name,
    daoAddress,
    communityManagementAddress,
    createdAtHeight: event.height,
    createdAtTx: event.txHash,
  })

  context.contracts.register('BclTokenSale', tokenSaleAddress)
}
