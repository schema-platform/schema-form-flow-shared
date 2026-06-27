export type FlowInstanceStatus = 'running' | 'completed' | 'terminated' | 'suspended' | 'failed'
export type TaskInstanceStatus = 'pending' | 'claimed' | 'completed' | 'cancelled' | 'delegated'
export type FlowTokenState = 'active' | 'waiting' | 'completed' | 'failed'

export interface FlowToken {
  tokenId: string
  nodeId: string
  parentTokenId?: string
  multiInstanceGroupId?: string
  state: FlowTokenState
  createdAt: Date
  waitingSince?: Date
}

export interface FlowInstanceData {
  id: string
  definitionId: string
  versionId: string
  version: string
  status: FlowInstanceStatus
  variables: Record<string, unknown>
  tokens: FlowToken[]
  initiatedBy: string
  startedAt: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TaskInstanceData {
  id: string
  instanceId: string
  nodeId: string
  nodeName: string
  status: TaskInstanceStatus
  assignee?: string
  candidateUsers?: string[]
  candidateRoles?: string[]
  formData?: Record<string, unknown>
  formSchemaId?: string
  formPublishId?: string
  formVersion?: string
  formMode?: 'edit' | 'view' | 'readonly' | 'editable' | 'partial'
  /** partial 模式下可编辑的字段列表 */
  editableFields?: string[]
  /** partial 模式下只读的字段列表 */
  readonlyFields?: string[]
  hostMethods?: string[]
  outcome?: string
  dueDate?: Date
  priority: number
  multiInstanceIndex?: number
  multiInstanceItem?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Cross-node data mapping: maps nodeId -> form field values.
 * Used to provide upstream node form data to downstream nodes
 * via {{nodeId.fieldName}} template expressions.
 */
export interface NodeFormDataMap {
  [nodeId: string]: Record<string, unknown> | undefined
}

/**
 * Response shape for the upstream data API endpoint.
 * Contains form data from all completed upstream user tasks.
 */
export interface UpstreamNodeData {
  /** Current node's task ID */
  taskId: string
  /** Current node's ID */
  currentNodeId: string
  /** Map of upstream nodeId -> form data */
  nodeData: NodeFormDataMap
}

export type ApprovalAction = 'claim' | 'approve' | 'reject' | 'reject-to-node' | 'delegate' | 'comment'

export interface ApprovalLogEntry {
  id: string
  instanceId: string
  nodeId: string
  nodeName: string
  taskId: string
  action: ApprovalAction
  operator: string
  comment?: string
  outcome?: string
  createdAt: Date
}
