import type { MdwPaginatedResponse } from './types.js'

export function extractCursor(nextUrl: string): string | null {
  try {
    const url = new URL(nextUrl, 'http://placeholder')
    return url.searchParams.get('cursor')
  } catch {
    return null
  }
}

export async function* paginateAll<T>(
  fetcher: (cursor?: string) => Promise<MdwPaginatedResponse<T>>,
): AsyncGenerator<T[], void, undefined> {
  let cursor: string | undefined

  while (true) {
    const page = await fetcher(cursor)
    if (page.data.length > 0) {
      yield page.data
    }

    if (!page.next) break

    const nextCursor = extractCursor(page.next)
    if (!nextCursor) break
    cursor = nextCursor
  }
}

export async function paginateWithLimit<T>(
  fetcher: (cursor?: string) => Promise<MdwPaginatedResponse<T>>,
  maxItems: number,
): Promise<T[]> {
  const result: T[] = []

  for await (const batch of paginateAll(fetcher)) {
    result.push(...batch)
    if (result.length >= maxItems) {
      return result.slice(0, maxItems)
    }
  }

  return result
}
