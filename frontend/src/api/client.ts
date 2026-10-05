import type {
  ApplyRequest,
  ApplyResponse,
  HealthResponse,
  Node,
  NodeDetails,
  ProblemDetails,
} from './types'

const BASE_PATH = '/api'

/** Thrown for every non-2xx response (status = HTTP status) and for network failures (status = 0). */
export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetails | null

  constructor(status: number, problem: ProblemDetails | null, fallbackMessage: string) {
    super(problem?.detail ?? problem?.title ?? fallbackMessage)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }

  /** ProblemDetails title, or a generic title when the body was not ProblemDetails. */
  get title(): string {
    return this.problem?.title ?? `Request failed (HTTP ${this.status})`
  }

  /** ProblemDetails detail plus flattened validation errors, or the error message. */
  get detail(): string {
    const parts: string[] = []
    if (this.problem?.detail) {
      parts.push(this.problem.detail)
    }
    const errors = this.problem?.errors
    if (errors) {
      for (const [field, messages] of Object.entries(errors)) {
        parts.push(`${field}: ${messages.join(', ')}`)
      }
    }
    return parts.length > 0 ? parts.join('; ') : this.message
  }
}

type HttpMethod = 'GET' | 'POST'

/**
 * Receives every request made through request() (network log). start() runs before fetch and returns an
 * entry id; finish() runs exactly once afterwards with the HTTP status (0 = network failure) and the duration in ms
 * measured until the response body was read.
 */
export interface RequestObserver {
  start(method: string, path: string): number
  finish(id: number, status: number, durationMs: number): void
}

let requestObserver: RequestObserver | null = null

/** Registered once in main.ts (network log store); null detaches it (tests). */
export function setRequestObserver(observer: RequestObserver | null): void {
  requestObserver = observer
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_PATH}${path}`
  const observer = requestObserver
  const entryId = observer === null ? null : observer.start(method, url)
  const startedAt = performance.now()
  let status = 0
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(
        0,
        { title: 'Network error', detail: 'The API could not be reached.' },
        'Network error',
      )
    }
    status = response.status

    if (!response.ok) {
      let problem: ProblemDetails | null = null
      const text = await response.text()
      if (text) {
        try {
          problem = JSON.parse(text) as ProblemDetails
        } catch {
          problem = null
        }
      }
      throw new ApiError(response.status, problem, `${method} ${url} failed with HTTP ${response.status}`)
    }

    return (await response.json()) as T
  } finally {
    if (observer !== null && entryId !== null) {
      observer.finish(entryId, status, Math.round(performance.now() - startedAt))
    }
  }
}

/** GET /api/health */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('GET', '/health')
}

/** GET /api/nodes/roots */
export function getRoots(): Promise<Node[]> {
  return request<Node[]>('GET', '/nodes/roots')
}

/** GET /api/nodes/{id}/children — direct children only. */
export function getChildren(id: number): Promise<Node[]> {
  return request<Node[]>('GET', `/nodes/${id}/children`)
}

/** GET /api/nodes/{id} — single node with ancestorIds. Called only by useTransferStore().loadIntoCache. */
export function getNode(id: number): Promise<NodeDetails> {
  return request<NodeDetails>('GET', `/nodes/${id}`)
}

/** POST /api/reset — returns roots after reset. */
export function resetDatabase(): Promise<Node[]> {
  return request<Node[]>('POST', '/reset')
}

/** POST /api/nodes/apply — one transactional batch (contract v2). Callers send refreshIds = every real cached id (cache.realIds). */
export function applyChanges(body: ApplyRequest): Promise<ApplyResponse> {
  return request<ApplyResponse>('POST', '/nodes/apply', body)
}
