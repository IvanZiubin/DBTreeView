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

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(`${BASE_PATH}${path}`, {
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
    throw new ApiError(response.status, problem, `${method} ${BASE_PATH}${path} failed with HTTP ${response.status}`)
  }

  return (await response.json()) as T
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

/** GET /api/nodes/{id} — single node with ancestorIds. */
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
