import { numeric, text } from 'drizzle-orm/pg-core/columns'

/**
 * Column for Aeternity addresses (`ak_...` accounts, `ct_...` contracts).
 * Stored as TEXT — the branded type is purely for documentation.
 */
export function aeAddress(name: string) {
  return text(name)
}

/**
 * Column for arbitrary-precision token amounts.
 * Sophia's `int` type has unlimited precision, so we use
 * `NUMERIC(78, 0)` which covers up to ~10^78 (well beyond uint256).
 */
export function aeAmount(name: string) {
  return numeric(name, { precision: 78, scale: 0 })
}

/**
 * Column for transaction hashes (`th_...`).
 * Stored as TEXT.
 */
export function aeTxHash(name: string) {
  return text(name)
}

/**
 * Column for block hashes (`mh_...` micro, `kh_...` key blocks).
 * Stored as TEXT.
 */
export function aeBlockHash(name: string) {
  return text(name)
}
