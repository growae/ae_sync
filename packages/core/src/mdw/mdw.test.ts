import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MdwConnectionError,
  MdwError,
  MdwHttpError,
  MdwTimeoutError,
} from './errors.js'
import { createMdwHttpClient } from './http.js'
import { extractCursor, paginateAll, paginateWithLimit } from './pagination.js'
import type { MdwPaginatedResponse } from './types.js'

// ── Error classes ─────────────────────────────────────────────────────

describe('error classes', () => {
  it('MdwError is instanceof Error', () => {
    const err = new MdwError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('MdwError')
    expect(err.message).toBe('test')
  })

  it('MdwHttpError carries status and url', () => {
    const err = new MdwHttpError(404, 'http://mdw/v3/status', 'not found')
    expect(err).toBeInstanceOf(MdwError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('MdwHttpError')
    expect(err.status).toBe(404)
    expect(err.url).toBe('http://mdw/v3/status')
    expect(err.body).toBe('not found')
    expect(err.message).toBe('HTTP 404: http://mdw/v3/status')
  })

  it('MdwConnectionError is an MdwError', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new MdwConnectionError('connection failed', { cause })
    expect(err).toBeInstanceOf(MdwError)
    expect(err.name).toBe('MdwConnectionError')
    expect(err.cause).toBe(cause)
  })

  it('MdwTimeoutError carries timeoutMs', () => {
    const err = new MdwTimeoutError(5000, 'http://mdw/v3/status')
    expect(err).toBeInstanceOf(MdwError)
    expect(err.name).toBe('MdwTimeoutError')
    expect(err.timeoutMs).toBe(5000)
    expect(err.message).toContain('5000ms')
  })
})

// ── HTTP client ───────────────────────────────────────────────────────

describe('createMdwHttpClient', () => {
  const BASE_URL = 'https://mainnet.aeternity.io/mdw'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetch(body: unknown, status = 200) {
    const mock = vi.mocked(fetch)
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    return mock
  }

  function mockFetchError(status: number, body: string) {
    const mock = vi.mocked(fetch)
    mock.mockResolvedValueOnce(new Response(body, { status }))
    return mock
  }

  it('getStatus fetches /v3/status', async () => {
    const status = {
      node_version: '7.3.0',
      node_height: 500000,
      node_syncing: false,
      mdw_version: '1.75.0',
      mdw_height: 500000,
      mdw_synced: true,
      mdw_syncing: false,
      mdw_gens_per_minute: 3,
      mdw_tx_index: 12345,
      mdw_async_tasks: 0,
    }
    mockFetch(status)

    const client = createMdwHttpClient(BASE_URL)
    const result = await client.getStatus()

    expect(result).toEqual(status)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v3/status'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('getContractLogs builds correct URL with params', async () => {
    const logsResponse = {
      data: [
        {
          contract_id: 'ct_abc',
          contract_tx_hash: 'th_1',
          call_tx_hash: 'th_2',
          block_time: 1234567890000,
          height: 500000,
          micro_index: 0,
          block_hash: 'mh_xyz',
          log_idx: 0,
          args: ['12345'],
          data: '',
          event_hash: 'aabbcc',
          event_name: 'Transfer',
          ext_caller_contract_id: null,
          parent_contract_id: null,
        },
      ],
      next: '/v3/contracts/ct_abc/logs?cursor=abc123&limit=10',
      prev: null,
    }
    mockFetch(logsResponse)

    const client = createMdwHttpClient(BASE_URL)
    const result = await client.getContractLogs('ct_abc', {
      limit: 10,
      direction: 'forward',
      event: 'Transfer',
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.event_name).toBe('Transfer')
    expect(result.next).toContain('cursor=abc123')

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v3/contracts/ct_abc/logs')
    expect(calledUrl).toContain('limit=10')
    expect(calledUrl).toContain('direction=forward')
    expect(calledUrl).toContain('event=Transfer')
  })

  it('getKeyBlock fetches by height', async () => {
    const block = {
      hash: 'kh_abc',
      height: 500000,
      time: 1234567890000,
      prev_hash: 'kh_prev',
      prev_key_hash: 'kh_prevkey',
      state_hash: 'bs_state',
      miner: 'ak_miner',
      beneficiary: 'ak_ben',
      target: 12345,
      info: '',
      version: 6,
    }
    mockFetch(block)

    const client = createMdwHttpClient(BASE_URL)
    const result = await client.getKeyBlock(500000)

    expect(result.height).toBe(500000)
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v3/key-blocks/500000')
  })

  it('getKeyBlock fetches by hash', async () => {
    mockFetch({ hash: 'kh_abc', height: 500000 })

    const client = createMdwHttpClient(BASE_URL)
    await client.getKeyBlock('kh_abc')

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v3/key-blocks/kh_abc')
  })

  it('throws MdwHttpError on non-ok response', async () => {
    mockFetchError(404, 'not found')

    const client = createMdwHttpClient(BASE_URL)
    await expect(client.getStatus()).rejects.toThrow(MdwHttpError)
    await expect(
      createMdwHttpClient(BASE_URL)
        .getStatus()
        .catch((e) => {
          throw e
        }),
    ).rejects.toThrow()
  })

  it('throws MdwHttpError with status and body', async () => {
    mockFetchError(500, '{"error":"internal"}')

    const client = createMdwHttpClient(BASE_URL)
    try {
      await client.getStatus()
      expect.fail('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(MdwHttpError)
      const httpErr = err as MdwHttpError
      expect(httpErr.status).toBe(500)
      expect(httpErr.body).toBe('{"error":"internal"}')
    }
  })

  it('throws MdwConnectionError on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'))

    const client = createMdwHttpClient(BASE_URL)
    await expect(client.getStatus()).rejects.toThrow(MdwConnectionError)
  })

  it('throws MdwTimeoutError on abort', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => {
      const err = new DOMException('The operation was aborted.', 'AbortError')
      return Promise.reject(err)
    })

    const client = createMdwHttpClient(BASE_URL, { timeout: 100 })
    await expect(client.getStatus()).rejects.toThrow(MdwTimeoutError)
  })

  it('strips trailing slash from base URL', async () => {
    mockFetch({ node_version: '7.3.0' })

    const client = createMdwHttpClient('https://host.com/mdw/')
    await client.getStatus()

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('mdw//v3')
  })

  it('getAllContractLogs fetches /v3/contracts/logs', async () => {
    mockFetch({ data: [], next: null, prev: null })

    const client = createMdwHttpClient(BASE_URL)
    const result = await client.getAllContractLogs({ limit: 50 })

    expect(result.data).toEqual([])
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v3/contracts/logs')
    expect(calledUrl).toContain('limit=50')
  })

  it('getContractCalls fetches /v3/contracts/:id/calls', async () => {
    mockFetch({ data: [], next: null, prev: null })

    const client = createMdwHttpClient(BASE_URL)
    await client.getContractCalls('ct_xyz', { function: 'transfer' })

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v3/contracts/ct_xyz/calls')
    expect(calledUrl).toContain('function=transfer')
  })
})

// ── Pagination ────────────────────────────────────────────────────────

describe('extractCursor', () => {
  it('extracts cursor from ae_mdw next URL', () => {
    const cursor = extractCursor(
      '/v3/contracts/ct_abc/logs?cursor=g2QAAm&limit=10',
    )
    expect(cursor).toBe('g2QAAm')
  })

  it('returns null for URL without cursor', () => {
    expect(extractCursor('/v3/contracts/logs?limit=10')).toBeNull()
  })

  it('returns null for invalid URL', () => {
    expect(extractCursor('')).toBeNull()
  })
})

describe('paginateAll', () => {
  it('iterates through all pages', async () => {
    const pages: MdwPaginatedResponse<number>[] = [
      { data: [1, 2], next: '/v3/path?cursor=a', prev: null },
      { data: [3, 4], next: '/v3/path?cursor=b', prev: null },
      { data: [5], next: null, prev: null },
    ]

    let callIndex = 0
    const fetcher = vi.fn(async () => {
      const page = pages[callIndex]!
      callIndex++
      return page
    })

    const allBatches: number[][] = []
    for await (const batch of paginateAll(fetcher)) {
      allBatches.push(batch)
    }

    expect(allBatches).toEqual([[1, 2], [3, 4], [5]])
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher).toHaveBeenNthCalledWith(1, undefined)
    expect(fetcher).toHaveBeenNthCalledWith(2, 'a')
    expect(fetcher).toHaveBeenNthCalledWith(3, 'b')
  })

  it('stops on empty data', async () => {
    const fetcher = vi.fn(async () => ({
      data: [] as number[],
      next: null,
      prev: null,
    }))

    const batches: number[][] = []
    for await (const batch of paginateAll(fetcher)) {
      batches.push(batch)
    }

    expect(batches).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('paginateWithLimit', () => {
  it('stops after collecting maxItems', async () => {
    const pages: MdwPaginatedResponse<number>[] = [
      { data: [1, 2, 3], next: '/v3/path?cursor=a', prev: null },
      { data: [4, 5, 6], next: '/v3/path?cursor=b', prev: null },
      { data: [7, 8, 9], next: null, prev: null },
    ]

    let callIndex = 0
    const fetcher = vi.fn(async () => {
      const page = pages[callIndex]!
      callIndex++
      return page
    })

    const result = await paginateWithLimit(fetcher, 5)

    expect(result).toEqual([1, 2, 3, 4, 5])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('returns all items if fewer than maxItems', async () => {
    const fetcher = vi.fn(async () => ({
      data: [1, 2],
      next: null,
      prev: null,
    }))

    const result = await paginateWithLimit(fetcher, 100)
    expect(result).toEqual([1, 2])
  })
})

// ── WebSocket message serialization ───────────────────────────────────

describe('WebSocket message format', () => {
  it('subscribe message has correct shape', () => {
    const msg = {
      op: 'Subscribe' as const,
      payload: 'Object' as const,
      target: 'ct_abc',
      source: 'mdw' as const,
    }

    const json = JSON.parse(JSON.stringify(msg))
    expect(json.op).toBe('Subscribe')
    expect(json.payload).toBe('Object')
    expect(json.target).toBe('ct_abc')
    expect(json.source).toBe('mdw')
  })

  it('unsubscribe message has correct shape', () => {
    const msg = {
      op: 'Unsubscribe' as const,
      payload: 'Object' as const,
      target: 'ct_abc',
      source: 'mdw' as const,
    }

    const json = JSON.parse(JSON.stringify(msg))
    expect(json.op).toBe('Unsubscribe')
  })

  it('ping message has correct shape', () => {
    const msg = { op: 'Ping' as const }
    const json = JSON.parse(JSON.stringify(msg))
    expect(json.op).toBe('Ping')
  })

  it('pong response is parseable', () => {
    const raw = '{"payload":"Pong","subscriptions":["ct_abc","ct_def"]}'
    const msg = JSON.parse(raw)
    expect(msg.payload).toBe('Pong')
    expect(msg.subscriptions).toEqual(['ct_abc', 'ct_def'])
  })

  it('event payload is parseable', () => {
    const raw = JSON.stringify({
      payload: { tx: { type: 'ContractCallTx' } },
      subscription: 'Object',
      source: 'mdw',
      target: 'ct_abc',
    })
    const msg = JSON.parse(raw)
    expect(msg.subscription).toBe('Object')
    expect(msg.target).toBe('ct_abc')
    expect(msg.payload.tx.type).toBe('ContractCallTx')
  })
})
