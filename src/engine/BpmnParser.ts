import { BpmnElementType } from '../types/bpmn.js'
import type { FlowGraph } from '../types/graph.js'
import { ExecutableModel } from './ExecutableModel.js'

export class BpmnParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BpmnParseError'
  }
}

export function parseBpmnGraph(graph: FlowGraph): ExecutableModel {
  const startNodes = graph.nodes.filter((n) => n.data.bpmnType === BpmnElementType.StartEvent)

  if (startNodes.length === 0) throw new BpmnParseError('流程必须包含一个开始事件')
  if (startNodes.length > 1) throw new BpmnParseError('流程只能包含一个开始事件')

  const endNodes = graph.nodes.filter((n) => n.data.bpmnType === BpmnElementType.EndEvent)
  if (endNodes.length === 0) throw new BpmnParseError('流程必须包含至少一个结束事件')

  const model = new ExecutableModel(startNodes[0].id)

  for (const node of graph.nodes) {
    model.addNode({
      id: node.id,
      bpmnType: node.data.bpmnType,
      config: node.data,
    })
  }

  for (const edge of graph.edges) {
    if (!model.getNode(edge.source.cell)) {
      throw new BpmnParseError(`连线源节点 ${edge.source.cell} 不存在`)
    }
    if (!model.getNode(edge.target.cell)) {
      throw new BpmnParseError(`连线目标节点 ${edge.target.cell} 不存在`)
    }
    model.addEdge({
      id: edge.id,
      sourceNodeId: edge.source.cell,
      targetNodeId: edge.target.cell,
      conditionExpression: edge.data.conditionExpression,
      isDefault: edge.data.isDefault ?? false,
    })
  }

  validateReachability(model)
  return model
}

function validateReachability(model: ExecutableModel): void {
  const visited = new Set<string>()
  const queue = [model.startNodeId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    for (const edge of model.getOutgoing(nodeId)) {
      queue.push(edge.targetNodeId)
    }
  }

  for (const node of model.getAllNodes()) {
    if (!visited.has(node.id)) {
      throw new BpmnParseError(`节点 "${node.config.label}" (${node.id}) 无法从开始事件到达`)
    }
  }
}
