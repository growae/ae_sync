import blakejs from 'blakejs'

const encoder = new TextEncoder()

export function computeEventHash(eventName: string): Uint8Array {
  return blakejs.blake2b(encoder.encode(eventName), undefined, 32)
}

export function eventHashHex(eventName: string): string {
  return blakejs.blake2bHex(encoder.encode(eventName), undefined, 32)
}
