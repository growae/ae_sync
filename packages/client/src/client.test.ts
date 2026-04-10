import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from './client.js'
import { HttpError, createHttpTransport } from './http.js'
import { createQueryProxy } from './query.js'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createHttpTransport', () => {
  it('builds correct GET URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const transport = createHttpTransport('http://localhost:3000')
    await transport.get('/health')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('strips trailing slash from base URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const transport = createHttpTransport('http://localhost:3000/')
    await transport.get('/health')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.anything(),
    )
  })

  it('includes custom headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}))
    const transport = createHttpTransport('http://localhost:3000', {
      Authorization: 'Bearer token123',
    })
    await transport.get('/test')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(callArgs[1].headers).toMatchObject({
      Authorization: 'Bearer token123',
    })
  })

  it('sends POST with JSON body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [], rowCount: 0 }))
    const transport = createHttpTransport('http://localhost:3000')
    await transport.post('/sql', { sql: 'SELECT 1', params: [] })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(callArgs[0]).toBe('http://localhost:3000/sql')
    expect(callArgs[1].method).toBe('POST')
    expect(callArgs[1].headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect(callArgs[1].body).toBe(
      JSON.stringify({ sql: 'SELECT 1', params: [] }),
    )
  })

  it('throws HttpError on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    const transport = createHttpTransport('http://localhost:3000')
    try {
      await transport.get('/missing')
      expect.fail('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).status).toBe(404)
      expect((error as HttpError).body).toBe('Not Found')
    }
  })
})

describe('createQueryProxy', () => {
  it('sends raw SQL to /sql endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ rows: [{ id: 1 }], rowCount: 1 }),
    )
    const transport = createHttpTransport('http://localhost:3000')
    const db = createQueryProxy(transport)
    const result = await db.sql('SELECT * FROM users WHERE id = $1', [1])
    expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body).toEqual({
      sql: 'SELECT * FROM users WHERE id = $1',
      params: [1],
    })
  })

  it('defaults params to empty array for raw SQL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [], rowCount: 0 }))
    const transport = createHttpTransport('http://localhost:3000')
    const db = createQueryProxy(transport)
    await db.sql('SELECT 1')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.params).toEqual([])
  })

  it('generates SQL from query builder', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [], rowCount: 0 }))
    const transport = createHttpTransport('http://localhost:3000')
    const db = createQueryProxy(transport)
    await db
      .from('users')
      .where('status', '=', 'active')
      .orderBy('name', 'asc')
      .limit(10)
      .offset(20)
      .execute()
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.sql).toBe(
      'SELECT * FROM "users" WHERE "status" = $1 ORDER BY "name" ASC LIMIT 10 OFFSET 20',
    )
    expect(body.params).toEqual(['active'])
  })

  it('chains multiple where conditions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [], rowCount: 0 }))
    const transport = createHttpTransport('http://localhost:3000')
    const db = createQueryProxy(transport)
    await db
      .from('events')
      .where('height', '>', 100)
      .where('contract', '=', 'ct_abc')
      .execute()
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.sql).toBe(
      'SELECT * FROM "events" WHERE "height" > $1 AND "contract" = $2',
    )
    expect(body.params).toEqual([100, 'ct_abc'])
  })

  it('builds simple select without filters', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ rows: [], rowCount: 0 }))
    const transport = createHttpTransport('http://localhost:3000')
    const db = createQueryProxy(transport)
    await db.from('tokens').execute()
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.sql).toBe('SELECT * FROM "tokens"')
    expect(body.params).toEqual([])
  })
})

describe('createClient', () => {
  it('returns expected shape', () => {
    const client = createClient({ url: 'http://localhost:3000' })
    expect(client).toHaveProperty('db')
    expect(client).toHaveProperty('getHealth')
    expect(client).toHaveProperty('isReady')
    expect(client).toHaveProperty('getStatus')
    expect(client).toHaveProperty('graphql')
    expect(typeof client.getHealth).toBe('function')
    expect(typeof client.isReady).toBe('function')
    expect(typeof client.getStatus).toBe('function')
    expect(typeof client.graphql).toBe('function')
    expect(typeof client.db.sql).toBe('function')
    expect(typeof client.db.from).toBe('function')
  })

  it('getHealth calls GET /health', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const client = createClient({ url: 'http://localhost:3000' })
    const health = await client.getHealth()
    expect(health).toEqual({ status: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('isReady returns true when server is ready', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ready' }))
    const client = createClient({ url: 'http://localhost:3000' })
    const ready = await client.isReady()
    expect(ready).toBe(true)
  })

  it('isReady returns false when server returns 503', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"status":"not_ready"}', { status: 503 }),
    )
    const client = createClient({ url: 'http://localhost:3000' })
    const ready = await client.isReady()
    expect(ready).toBe(false)
  })

  it('getStatus returns sync status', async () => {
    const status = {
      version: '0.0.1',
      ready: true,
      contracts: [
        {
          name: 'DexPair',
          status: 'live',
          eventsProcessed: 5000,
          lastHeight: 100000,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(jsonResponse(status))
    const client = createClient({ url: 'http://localhost:3000' })
    const result = await client.getStatus()
    expect(result).toEqual(status)
  })

  it('graphql sends POST /graphql with query and variables', async () => {
    const data = { data: { users: [{ id: '1', name: 'Alice' }] } }
    mockFetch.mockResolvedValueOnce(jsonResponse(data))
    const client = createClient({ url: 'http://localhost:3000' })
    const result = await client.graphql('{ users { id name } }', { first: 10 })
    expect(result).toEqual(data)
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(callArgs[0]).toBe('http://localhost:3000/graphql')
    expect(callArgs[1].method).toBe('POST')
    const body = JSON.parse(callArgs[1].body as string)
    expect(body).toEqual({
      query: '{ users { id name } }',
      variables: { first: 10 },
    })
  })

  it('graphql works without variables', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { health: 'ok' } }))
    const client = createClient({ url: 'http://localhost:3000' })
    await client.graphql('{ health }')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(callArgs[1].body as string)
    expect(body.query).toBe('{ health }')
  })
})
