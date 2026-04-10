import type { AciContract, SophiaType } from './types.js'

export function sophiaTypeToTs(type: SophiaType): string {
  if (typeof type === 'string') {
    switch (type) {
      case 'address':
      case 'hash':
      case 'signature':
      case 'bytes':
      case 'string':
        return 'string'
      case 'int':
        return 'bigint'
      case 'bool':
        return 'boolean'
    }
  }

  if (typeof type === 'object' && type !== null) {
    if ('option' in type) return `${sophiaTypeToTs(type.option)} | undefined`
    if ('list' in type) return `${sophiaTypeToTs(type.list)}[]`
    if ('map' in type) {
      return `Map<${sophiaTypeToTs(type.map[0])}, ${sophiaTypeToTs(type.map[1])}>`
    }
    if ('tuple' in type) {
      return `[${type.tuple.map(sophiaTypeToTs).join(', ')}]`
    }
    if ('record' in type) {
      const fields = type.record
        .map((f) => `  ${f.name}: ${sophiaTypeToTs(f.type)}`)
        .join('\n')
      return `{\n${fields}\n}`
    }
    if ('variant' in type) {
      const variants = type.variant.map((v) => {
        const [name, args] = Object.entries(v)[0]!
        if (args.length === 0) return `{ tag: '${name}' }`
        const fields = args
          .map((a, i) => `  arg${i}: ${sophiaTypeToTs(a)}`)
          .join('\n')
        return `{ tag: '${name}'\n${fields}\n}`
      })
      return variants.join(' | ')
    }
  }

  return 'unknown'
}

export function generateEventTypes(contract: AciContract): string {
  const lines: string[] = []

  for (const event of contract.events) {
    lines.push(`export interface ${event.name}EventArgs {`)
    for (const field of event.fields) {
      lines.push(`  ${field.name}: ${sophiaTypeToTs(field.type)}`)
    }
    lines.push('}')
    lines.push('')
  }

  if (contract.events.length > 0) {
    const unionMembers = contract.events
      .map((e) => `${e.name}EventArgs`)
      .join(' | ')
    lines.push(`export type ${contract.name}EventArgs = ${unionMembers}`)
    lines.push('')

    const nameUnion = contract.events.map((e) => `'${e.name}'`).join(' | ')
    lines.push(`export type ${contract.name}EventName = ${nameUnion}`)
    lines.push('')
  }

  return lines.join('\n')
}
