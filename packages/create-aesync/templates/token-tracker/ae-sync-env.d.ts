/// <reference types="@growae/aesync/env" />

declare module 'ae-sync:schema' {
  export * from './schema.js'
}

declare module 'ae-sync:config' {
  const config: import('@growae/aesync').AeSyncConfig
  export default config
}
