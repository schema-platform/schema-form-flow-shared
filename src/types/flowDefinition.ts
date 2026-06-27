import type { FlowGraph, FlowGraphMetadata, FlowPermissions } from './graph.js'
import type { FlowInstanceData, TaskInstanceData, ApprovalLogEntry } from './instance.js'

export type FlowDefinitionStatus = 'draft' | 'published' | 'archived'

export interface FlowDefinitionData {
  id: string
  name: string
  description?: string
  category?: string
  status: FlowDefinitionStatus
  currentVersionId?: string
  thumbnail?: string
  createdBy: string
  permissions?: FlowPermissions
  createdAt: Date
  updatedAt: Date
}

export interface FlowVersionData {
  id: string
  definitionId: string
  version: string
  graph: FlowGraph
  metadata?: FlowGraphMetadata
  createdAt: Date
  updatedAt: Date
}

// Paginated list response
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// API response data shapes (matching server's json.data)
export type FlowDefinitionListData = PaginatedResponse<FlowDefinitionData>
export type FlowVersionListData = PaginatedResponse<FlowVersionData>
export type FlowInstanceListData = PaginatedResponse<FlowInstanceData>
export type TaskInstanceListData = PaginatedResponse<TaskInstanceData>
export type ApprovalLogListData = PaginatedResponse<ApprovalLogEntry>
