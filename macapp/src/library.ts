import { ipcMain } from 'electron'

const OLLAMA_LIBRARY_BASE = 'https://ollama.com'
const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

type LibraryModel = {
  name: string
  path: string
  description: string
  capabilities: string[]
  sizes: string[]
  pulls: string
  tags: string
  updated: string
}

type LibrarySearchResponse = {
  models: LibraryModel[]
  nextPage: number | null
}

const searchCache = new Map<string, CacheEntry<LibrarySearchResponse>>()

function decodeEntities(value: string) {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    '#39': "'",
  }

  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (_, entity: string) => {
    const key = entity.toLowerCase()
    if (entities[key]) {
      return entities[key]
    }

    if (key.startsWith('#x')) {
      return String.fromCodePoint(parseInt(key.slice(2), 16))
    }

    if (key.startsWith('#')) {
      return String.fromCodePoint(parseInt(key.slice(1), 10))
    }

    return `&${entity};`
  })
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function matchText(html: string, pattern: RegExp) {
  const match = html.match(pattern)
  return match ? stripTags(match[1]) : ''
}

function matchAllText(html: string, pattern: RegExp) {
  return [...html.matchAll(pattern)]
    .map(match => stripTags(match[1]))
    .filter(Boolean)
}

async function fetchLibraryHTML(path: string, target = 'searchresults') {
  const response = await fetch(`${OLLAMA_LIBRARY_BASE}${path}`, {
    headers: {
      accept: 'text/html',
      'hx-request': 'true',
      'hx-target': target,
      'user-agent': 'Ollama Downloader',
    },
  })

  if (!response.ok) {
    throw new Error(`Ollama library request failed: ${response.status}`)
  }

  return response.text()
}

function parseSearchResults(html: string): LibrarySearchResponse {
  const items = [...html.matchAll(/<li[^>]*x-test-model[\s\S]*?<\/li>/g)]
  const models = items.map(match => {
    const item = match[0]
    const href = item.match(/href="(\/library\/[^"]+)"/)?.[1] || ''
    const nameFromHref = href.replace('/library/', '').split(':')[0]
    const name = matchText(item, /<span[^>]*x-test-search-response-title[^>]*>([\s\S]*?)<\/span>/) || nameFromHref

    return {
      name,
      path: href || `/library/${name}`,
      description: matchText(item, /<p[^>]*>([\s\S]*?)<\/p>/),
      capabilities: matchAllText(item, /<span[^>]*x-test-capability[^>]*>([\s\S]*?)<\/span>/g),
      sizes: matchAllText(item, /<span[^>]*x-test-size[^>]*>([\s\S]*?)<\/span>/g),
      pulls: matchText(item, /<span[^>]*x-test-pull-count[^>]*>([\s\S]*?)<\/span>/),
      tags: matchText(item, /<span[^>]*x-test-tag-count[^>]*>([\s\S]*?)<\/span>/),
      updated: matchText(item, /<span[^>]*x-test-updated[^>]*>([\s\S]*?)<\/span>/),
    }
  })

  const nextPageMatch = html.match(/hx-get="\/search\?page=(\d+)[^"]*"/)

  return {
    models: models.filter(model => model.name).slice(0, 24),
    nextPage: nextPageMatch ? Number(nextPageMatch[1]) : null,
  }
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }

  cache.delete(key)
  return null
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  })
}

async function searchModels(query: string, page: number) {
  const normalized = query.trim()
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const cacheKey = `${normalized.toLowerCase()}:${safePage}`
  const cached = readCache(searchCache, cacheKey)
  if (cached) {
    return cached
  }

  const params = new URLSearchParams()
  if (safePage > 1) {
    params.set('page', String(safePage))
  }
  if (normalized) {
    params.set('q', normalized)
  }

  const queryString = params.toString()
  const path = `/search${queryString ? `?${queryString}` : ''}`
  const html = await fetchLibraryHTML(path)
  const results = parseSearchResults(html)
  writeCache(searchCache, cacheKey, results)
  return results
}

export function registerLibraryHandlers() {
  ipcMain.handle('ollama-library:search', async (_event, query: string, page = 1) => searchModels(query || '', page))
}
