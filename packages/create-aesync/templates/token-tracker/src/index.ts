import type { EventCallbackFn } from '@growae/aesync'
import { eq } from 'drizzle-orm'
import { balanceState, transferEvent } from '../schema.js'

export const onTransfer: EventCallbackFn = async (event, context) => {
  const { args, meta } = event
  const from = args[0] as string
  const to = args[1] as string
  const value = args[2] as bigint

  await context.db.insert(transferEvent).values({
    from,
    to,
    value,
    ...meta,
  })

  await updateBalance(context, from, -value, meta)
  await updateBalance(context, to, value, meta)
}

async function updateBalance(
  context: { db: { select: Function; insert: Function; update: Function } },
  account: string,
  delta: bigint,
  meta: Record<string, unknown>,
): Promise<void> {
  const existing = await (context.db as any)
    .select()
    .from(balanceState)
    .where(eq(balanceState.account, account))
    .limit(1)

  if (existing.length > 0) {
    const current = existing[0].balance as bigint
    await (context.db as any)
      .update(balanceState)
      .set({ balance: current + delta, ...meta })
      .where(eq(balanceState.account, account))
  } else {
    const balance = delta < 0n ? 0n : delta
    await (context.db as any).insert(balanceState).values({
      account,
      balance,
      ...meta,
    })
  }
}
