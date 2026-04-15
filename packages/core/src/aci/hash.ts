import blakejs from 'blakejs'

const encoder = new TextEncoder()
const BASE32HEX_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUV'

function toBase32Hex(bytes: Uint8Array): string {
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  while (bits.length % 5 !== 0) bits += '0'
  let out = ''
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32HEX_CHARS[Number.parseInt(bits.substring(i, i + 5), 2)]
  }
  while (out.length % 8 !== 0) out += '='
  return out
}

export function computeEventHash(eventName: string): Uint8Array {
  return blakejs.blake2b(encoder.encode(eventName), undefined, 32)
}

/**
 * Returns the blake2b-256 hash of the event name encoded as base32hex
 * (RFC 4648 §7), matching the format ae-mdw uses for `event_hash`.
 */
export function eventHashHex(eventName: string): string {
  const hash = blakejs.blake2b(encoder.encode(eventName), undefined, 32)
  return toBase32Hex(hash)
}
