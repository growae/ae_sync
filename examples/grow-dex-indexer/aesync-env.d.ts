/// <reference types="@growae/aesync/env" />

declare module 'aesync:schema' {
  export * from './schema.js'
}

declare module 'aesync:config' {
  const config: import('@growae/aesync').AeSyncConfig
  export default config
}
