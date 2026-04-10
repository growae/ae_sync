export type SophiaType =
  | 'address'
  | 'int'
  | 'bool'
  | 'string'
  | 'hash'
  | 'signature'
  | 'bytes'
  | { option: SophiaType }
  | { list: SophiaType }
  | { map: [SophiaType, SophiaType] }
  | { tuple: SophiaType[] }
  | { record: { name: string; type: SophiaType }[] }
  | { variant: Record<string, SophiaType[]>[] }

export interface AciEventField {
  index: number
  name: string
  type: SophiaType
  indexed: boolean
}

export interface AciEvent {
  name: string
  hash: string
  fields: AciEventField[]
}

export interface AciEntrypoint {
  name: string
  args: { name: string; type: SophiaType }[]
  returnType: SophiaType
  stateful: boolean
  payable: boolean
}

export interface AciContract {
  name: string
  events: AciEvent[]
  entrypoints: AciEntrypoint[]
}

export type SophiaToTs<T extends SophiaType> = T extends 'address'
  ? string
  : T extends 'int'
    ? bigint
    : T extends 'bool'
      ? boolean
      : T extends 'string'
        ? string
        : T extends 'hash'
          ? string
          : T extends 'signature'
            ? string
            : T extends 'bytes'
              ? string
              : T extends { option: infer U extends SophiaType }
                ? SophiaToTs<U> | undefined
                : T extends { list: infer U extends SophiaType }
                  ? SophiaToTs<U>[]
                  : T extends {
                        map: [
                          infer K extends SophiaType,
                          infer V extends SophiaType,
                        ]
                      }
                    ? Map<SophiaToTs<K>, SophiaToTs<V>>
                    : T extends { tuple: infer U extends SophiaType[] }
                      ? { [I in keyof U]: SophiaToTs<U[I]> }
                      : unknown
