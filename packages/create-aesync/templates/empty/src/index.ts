import type { EventCallbackFn } from '@growae/aesync'
import { transferEvent } from '../schema.js'

export const onTransfer: EventCallbackFn = async (event, context) => {
  const { args, meta } = event

  await context.db.insert(transferEvent).values({
    from: args[0] as string,
    to: args[1] as string,
    value: args[2] as bigint,
    ...meta,
  })
}
