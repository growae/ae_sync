export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${body}`)
    this.name = 'HttpError'
  }
}

export interface HttpTransport {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

export function createHttpTransport(
  baseUrl: string,
  headers?: Record<string, string>,
): HttpTransport {
  const normalizedUrl = baseUrl.replace(/\/$/, '')

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const mergedHeaders: Record<string, string> = { ...headers }

    if (init.headers) {
      Object.assign(mergedHeaders, init.headers as Record<string, string>)
    }

    const res = await fetch(`${normalizedUrl}${path}`, {
      method: init.method,
      body: init.body,
      headers: mergedHeaders,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new HttpError(res.status, text)
    }

    return res.json() as Promise<T>
  }

  return {
    get<T>(path: string): Promise<T> {
      return request<T>(path, { method: 'GET' })
    },
    post<T>(path: string, body: unknown): Promise<T> {
      return request<T>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
  }
}
