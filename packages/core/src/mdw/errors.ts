export class MdwError extends Error {
  override readonly name: string = 'MdwError'
}

export class MdwHttpError extends MdwError {
  override readonly name = 'MdwHttpError'
  readonly status: number
  readonly url: string
  readonly body: string | undefined

  constructor(
    status: number,
    url: string,
    body?: string,
    options?: ErrorOptions,
  ) {
    super(`HTTP ${status}: ${url}`, options)
    this.status = status
    this.url = url
    this.body = body
  }
}

export class MdwConnectionError extends MdwError {
  override readonly name = 'MdwConnectionError'
}

export class MdwTimeoutError extends MdwError {
  override readonly name = 'MdwTimeoutError'
  readonly timeoutMs: number

  constructor(timeoutMs: number, url: string, options?: ErrorOptions) {
    super(`Request timed out after ${timeoutMs}ms: ${url}`, options)
    this.timeoutMs = timeoutMs
  }
}
