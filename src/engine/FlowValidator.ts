import { BpmnElementType } from '../types/bpmn.js'
import type { FlowGraph } from '../types/graph.js'

export interface ValidationError {
  nodeId?: string
  edgeId?: string
  level: 'error' | 'warning'
  message: string
}

export function validateFlow(graph: FlowGraph): ValidationError[] {
  const errors: ValidationError[] = []
  const { nodes, edges } = graph

  // 1. Must have exactly one startEvent
  const startNodes = nodes.filter((n) => n.data.bpmnType === BpmnElementType.StartEvent)
  if (startNodes.length === 0) {
    errors.push({ level: 'error', message: '流程必须包含一个开始事件' })
  } else if (startNodes.length > 1) {
    for (const sn of startNodes) {
      errors.push({ nodeId: sn.id, level: 'error', message: '流程只能有一个开始事件' })
    }
  }

  // 2. Must have at least one endEvent
  const endNodes = nodes.filter((n) => n.data.bpmnType === BpmnElementType.EndEvent)
  if (endNodes.length === 0) {
    errors.push({ level: 'error', message: '流程必须包含至少一个结束事件' })
  }

  // 3. Check for orphan nodes (no edges connected)
  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    connectedNodeIds.add(edge.source.cell)
    connectedNodeIds.add(edge.target.cell)
  }
  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id)) {
      errors.push({ nodeId: node.id, level: 'error', message: `节点「${node.data.label}」未连接到任何连线` })
    }
  }

  // 4. Gateway validation
  for (const node of nodes) {
    const outEdges = edges.filter((e) => e.source.cell === node.id)

    if (node.data.bpmnType === BpmnElementType.ExclusiveGateway ||
        node.data.bpmnType === BpmnElementType.ParallelGateway ||
        node.data.bpmnType === BpmnElementType.InclusiveGateway) {
      // Diverging gateway should have >= 2 outgoing edges
      if (outEdges.length < 2) {
        errors.push({
          nodeId: node.id,
          level: 'warning',
          message: `网关「${node.data.label}」出线少于 2 条，可能不需要网关`,
        })
      }

      // Exclusive gateway: must have default flow or all edges have conditions
      if (node.data.bpmnType === BpmnElementType.ExclusiveGateway && outEdges.length >= 2) {
        const hasDefault = outEdges.some((e) => e.data.isDefault) || node.data.defaultFlow
        const allHaveConditions = outEdges.every((e) => !!e.data.conditionExpression)
        if (!hasDefault && !allHaveConditions) {
          errors.push({
            nodeId: node.id,
            level: 'error',
            message: `排他网关「${node.data.label}」需要设置默认连线或为所有出线配置条件`,
          })
        }
      }
    }
  }

  // 5. Edge condition on exclusive gateway outEdges
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source.cell)
    if (sourceNode?.data.bpmnType === BpmnElementType.ExclusiveGateway) {
      const outEdges = edges.filter((e) => e.source.cell === sourceNode.id)
      if (outEdges.length >= 2 && !edge.data.conditionExpression && !edge.data.isDefault) {
        errors.push({
          edgeId: edge.id,
          level: 'warning',
          message: '排他网关的出线缺少条件表达式（将被视为默认连线）',
        })
      }
    }
  }

  // 6. UserTask must have assignee configured
  for (const node of nodes) {
    if (node.data.bpmnType === BpmnElementType.UserTask) {
      const hasAssignee = node.data.assigneeType === 'user' && (node.data.candidateUsers?.length ?? 0) > 0
      const hasRole = node.data.assigneeType === 'role' && (node.data.candidateRoles?.length ?? 0) > 0
      const hasExpression = node.data.assigneeType === 'expression' && !!node.data.assignee
      const hasLegacy = !node.data.assigneeType && !!node.data.assignee
      const hasCollection = !!(node.data.assigneeCollection || node.data.multiInstance?.collection)

      if (!hasAssignee && !hasRole && !hasExpression && !hasLegacy && !hasCollection) {
        errors.push({
          nodeId: node.id,
          level: 'error',
          message: `用户任务「${node.data.label}」未配置审批人`,
        })
      }
    }
  }

  // 7. TimerEvent must have timer config
  for (const node of nodes) {
    if (node.data.bpmnType === BpmnElementType.TimerEvent) {
      if (!node.data.timerType || !node.data.timerValue) {
        errors.push({
          nodeId: node.id,
          level: 'error',
          message: `定时事件「${node.data.label}」未配置定时器`,
        })
      }
    }
  }

  // 8. SubProcess must reference a definition
  for (const node of nodes) {
    if (node.data.bpmnType === BpmnElementType.SubProcess) {
      if (!node.data.subProcessDefinitionId) {
        errors.push({
          nodeId: node.id,
          level: 'error',
          message: `子流程「${node.data.label}」未关联子流程定义`,
        })
      }
    }
  }

  return errors
}
