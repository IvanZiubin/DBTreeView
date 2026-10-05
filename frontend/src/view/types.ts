// Row model types for DBTreeView (no Vue/Pinia imports). Replaces PrimeVue's TreeNode.
import type { Node } from '../api/types'

/** One DB tree node as kept by src/stores/dbTree.ts; children stay undefined until fetched. */
export interface DbTreeNode {
  /** String(id). */
  key: string
  label: string
  leaf: boolean
  /** True while GET /api/nodes/{id}/children is in flight. */
  loading: boolean
  data: Node
  children?: DbTreeNode[]
}
