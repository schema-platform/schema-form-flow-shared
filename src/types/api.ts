import type { FlowGraph, FlowGraphMetadata, FlowPermissions } from './graph.js'
import type { FlowInstanceStatus } from './instance.js'

export type { FlowApiConfig } from './apiConfig.js'

export interface CreateFlowDefinitionDto {
  name: string
  description?: string
  category?: string
  permissions?: FlowPermissions
}

export interface UpdateFlowDefinitionDto {
  name?: string
  description?: string
  category?: string
  thumbnail?: string
  permissions?: FlowPermissions
}

export interface SaveFlowVersionDto {
  graph: FlowGraph
  metadata?: FlowGraphMetadata
}

export interface StartFlowInstanceDto {
  definitionId: string
  variables?: Record<string, unknown>
}

export interface CompleteTaskDto {
  formData?: Record<string, unknown>
  outcome?: string
}

export interface DelegateTaskDto {
  targetUserId: string
}

export interface RejectToNodeDto {
  targetNodeId: string
  comment?: string
}

export interface RejectTargetNode {
  nodeId: string
  nodeName: string
  nodeType: string
}

export interface FlowListQuery {
  search?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface FlowInstanceQuery {
  definitionId?: string
  status?: FlowInstanceStatus
  search?: string
  page?: number
  pageSize?: number
}

// ── Batch operations ──

export interface BatchTaskDto {
  taskIds: string[]
}

export interface BatchRejectDto {
  taskIds: string[]
  reason?: string
}

export interface BatchTaskResult {
  taskId: string
  success: boolean
  error?: string
}

export interface BatchResult {
  results: BatchTaskResult[]
  summary: { total: number; success: number; failed: number }
}
