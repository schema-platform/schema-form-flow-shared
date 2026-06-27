import type { BpmnNodeConfig, RejectPolicy } from './bpmn.js'

export interface FlowNodeData {
  id: string
  shape: string
  x: number
  y: number
  width: number
  height: number
  data: BpmnNodeConfig
}

export interface FlowEdgeData {
  id: string
  shape: string
  source: { cell: string; port?: string }
  target: { cell: string; port?: string }
  data: {
    label?: string
    conditionExpression?: string
    isDefault?: boolean
  }
}

export interface FlowGraph {
  nodes: FlowNodeData[]
  edges: FlowEdgeData[]
}

export interface FlowPermissionItem {
  type: 'user' | 'role'
  id: string
}

export interface FlowPermissions {
  editors?: FlowPermissionItem[]
  launchers?: FlowPermissionItem[]
  viewers?: FlowPermissionItem[]
}

export interface FlowGraphMetadata {
  viewport?: { x: number; y: number; zoom: number }
  defaultRejectPolicy?: RejectPolicy
  permissions?: FlowPermissions
}
