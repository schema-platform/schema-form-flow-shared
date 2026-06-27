import type { FlowGraph } from './graph.js'

export interface FlowTemplateData {
  id: string
  name: string
  description?: string
  category?: string
  graph: FlowGraph
  thumbnail?: string
  tags?: string[]
  isBuiltin: boolean
  useCount?: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateFlowTemplateDto {
  name: string
  description?: string
  category?: string
  graph: FlowGraph
  thumbnail?: string
  tags?: string[]
  isBuiltin?: boolean
}

export interface UpdateFlowTemplateDto {
  name?: string
  description?: string
  category?: string
  graph?: FlowGraph
  thumbnail?: string
  tags?: string[]
  isBuiltin?: boolean
}

export interface ApplyFlowTemplateDto {
  name?: string
  description?: string
}

export interface FlowTemplateQuery {
  search?: string
  category?: string
  isBuiltin?: boolean
  page?: number
  pageSize?: number
}
