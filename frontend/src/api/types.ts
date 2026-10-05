// Mirrors schemas in docs/ai/api-contract.yaml. Keep in sync with the contract; never diverge.

/** Contract schema `Node`. */
export interface Node {
  id: number
  parentId: number | null
  value: string
  isDeleted: boolean
  hasChildren: boolean
}

/** Contract schema `NodeDetails`: Node plus ancestor ids ordered root -> parent ([] for a root). */
export interface NodeDetails extends Node {
  ancestorIds: number[]
}

export interface ApplyEdit {
  id: number
  value: string
}

/** Exactly one of parentId / parentTempId is set. */
export interface ApplyAdd {
  tempId: string
  parentId?: number | null
  parentTempId?: string | null
  value: string
}

/** Contract schema `ApplyRequest`. */
export interface ApplyRequest {
  edits: ApplyEdit[]
  adds: ApplyAdd[]
  deletes: number[]
  refreshIds?: number[]
}

/** Contract schema `ApplyResponse`. idMap: tempId -> real id. */
export interface ApplyResponse {
  idMap: Record<string, number>
  nodes: NodeDetails[]
}

/** RFC 7807 ProblemDetails; `errors` present for ValidationProblemDetails. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
  /** Apply 404 / 409: the offending node ids. */
  nodeIds?: number[]
}

/** GET /api/health 200 body. */
export interface HealthResponse {
  status: string
}
