import type { BpmnElementType } from '../types/bpmn.js'
import type { BpmnNodeConfig } from '../types/bpmn.js'

export interface ParsedNode {
  id: string
  bpmnType: BpmnElementType
  config: BpmnNodeConfig
}

export interface ParsedEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  conditionExpression?: string
  isDefault: boolean
}

export class ExecutableModel {
  readonly startNodeId: string
  private nodes = new Map<string, ParsedNode>()
  private outgoing = new Map<string, ParsedEdge[]>()
  private incoming = new Map<string, ParsedEdge[]>()

  constructor(startNodeId: string) {
    this.startNodeId = startNodeId
  }

  addNode(node: ParsedNode): void {
    this.nodes.set(node.id, node)
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, [])
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, [])
  }

  addEdge(edge: ParsedEdge): void {
    const outList = this.outgoing.get(edge.sourceNodeId) ?? []
    outList.push(edge)
    this.outgoing.set(edge.sourceNodeId, outList)
    const inList = this.incoming.get(edge.targetNodeId) ?? []
    inList.push(edge)
    this.incoming.set(edge.targetNodeId, inList)
  }

  getNode(id: string): ParsedNode | undefined {
    return this.nodes.get(id)
  }

  getOutgoing(nodeId: string): ParsedEdge[] {
    return this.outgoing.get(nodeId) ?? []
  }

  getIncoming(nodeId: string): ParsedEdge[] {
    return this.incoming.get(nodeId) ?? []
  }

  getAllNodes(): ParsedNode[] {
    return [...this.nodes.values()]
  }

  get size(): number {
    return this.nodes.size
  }
}
