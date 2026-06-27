import { describe, it, expect } from 'vitest'
import { parseBpmnGraph, BpmnParseError } from '../BpmnParser.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData, FlowEdgeData } from '../../types/graph.js'

function node(id: string, bpmnType: BpmnElementType, label?: string): FlowNodeData {
  return {
    id,
    shape: `bpmn-${bpmnType}`,
    x: 0,
    y: 0,
    width: 160,
    height: 80,
    data: { bpmnType, label: label ?? id },
  }
}

function edge(id: string, source: string, target: string, data?: Partial<FlowEdgeData['data']>): FlowEdgeData {
  return {
    id,
    shape: 'bpmn-edge',
    source: { cell: source },
    target: { cell: target },
    data: { ...data },
  }
}

function graph(nodes: FlowNodeData[], edges: FlowEdgeData[] = []): FlowGraph {
  return { nodes, edges }
}

describe('parseBpmnGraph', () => {
  describe('valid graph parsing', () => {
    it('parses a start -> userTask -> end graph into ExecutableModel', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('t1', BpmnElementType.UserTask), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 's', 't1'), edge('e2', 't1', 'e')],
      )
      const model = parseBpmnGraph(g)
      expect(model.startNodeId).toBe('s')
      expect(model.getAllNodes()).toHaveLength(3)
      expect(model.getNode('s')!.bpmnType).toBe(BpmnElementType.StartEvent)
      expect(model.getNode('t1')!.bpmnType).toBe(BpmnElementType.UserTask)
      expect(model.getOutgoing('s')).toHaveLength(1)
      expect(model.getOutgoing('s')[0].targetNodeId).toBe('t1')
      expect(model.getIncoming('e')).toHaveLength(1)
      expect(model.getIncoming('e')[0].sourceNodeId).toBe('t1')
    })

    it('parses graph with exclusive gateway and correct adjacency', () => {
      const g = graph(
        [
          node('s', BpmnElementType.StartEvent),
          node('gw', BpmnElementType.ExclusiveGateway),
          node('t1', BpmnElementType.UserTask, 'Approve'),
          node('t2', BpmnElementType.UserTask, 'Reject'),
          node('e', BpmnElementType.EndEvent),
        ],
        [
          edge('e1', 's', 'gw'),
          edge('e2', 'gw', 't1', { conditionExpression: "status === 'approved'" }),
          edge('e3', 'gw', 't2', { isDefault: true }),
          edge('e4', 't1', 'e'),
          edge('e5', 't2', 'e'),
        ],
      )
      const model = parseBpmnGraph(g)
      expect(model.getOutgoing('gw')).toHaveLength(2)
      expect(model.getIncoming('e')).toHaveLength(2)
      expect(model.getOutgoing('gw')[0].conditionExpression).toBe("status === 'approved'")
      expect(model.getOutgoing('gw')[1].isDefault).toBe(true)
    })

    it('preserves node config from data', () => {
      const g = graph([
        node('s', BpmnElementType.StartEvent),
        node('e', BpmnElementType.EndEvent),
      ], [edge('e1', 's', 'e')])
      const model = parseBpmnGraph(g)
      expect(model.getNode('s')!.config.label).toBe('s')
    })
  })

  describe('missing start event', () => {
    it('throws BpmnParseError when no start event exists', () => {
      const g = graph([node('t1', BpmnElementType.UserTask)])
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/开始事件/)
    })
  })

  describe('multiple start events', () => {
    it('throws BpmnParseError when more than one start event exists', () => {
      const g = graph([
        node('s1', BpmnElementType.StartEvent),
        node('s2', BpmnElementType.StartEvent),
        node('e', BpmnElementType.EndEvent),
      ])
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/只能包含一个开始事件/)
    })
  })

  describe('missing end event', () => {
    it('throws BpmnParseError when no end event exists', () => {
      const g = graph([node('s', BpmnElementType.StartEvent)])
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/结束事件/)
    })
  })

  describe('edge references non-existent node', () => {
    it('throws when edge source does not exist in nodes', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 'ghost', 'e')],
      )
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/源节点.*不存在/)
    })

    it('throws when edge target does not exist in nodes', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 's', 'ghost')],
      )
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/目标节点.*不存在/)
    })
  })

  describe('unreachable node', () => {
    it('throws BpmnParseError when a node cannot be reached from start', () => {
      const g = graph(
        [
          node('s', BpmnElementType.StartEvent),
          node('t1', BpmnElementType.UserTask, 'Reachable'),
          node('t2', BpmnElementType.UserTask, 'Orphan'),
          node('e', BpmnElementType.EndEvent),
        ],
        [edge('e1', 's', 't1'), edge('e2', 't1', 'e')],
        // t2 has no incoming edges — unreachable
      )
      expect(() => parseBpmnGraph(g)).toThrow(BpmnParseError)
      expect(() => parseBpmnGraph(g)).toThrow(/无法从开始事件到达/)
    })
  })

  describe('model.getNode / getOutgoing / getIncoming', () => {
    it('getNode returns the correct parsed node', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 's', 'e')],
      )
      const model = parseBpmnGraph(g)
      const n = model.getNode('s')
      expect(n).toBeDefined()
      expect(n!.id).toBe('s')
      expect(n!.bpmnType).toBe(BpmnElementType.StartEvent)
    })

    it('getOutgoing returns edges with correct target', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 's', 'e')],
      )
      const model = parseBpmnGraph(g)
      const out = model.getOutgoing('s')
      expect(out).toHaveLength(1)
      expect(out[0].targetNodeId).toBe('e')
    })

    it('getIncoming returns edges with correct source', () => {
      const g = graph(
        [node('s', BpmnElementType.StartEvent), node('e', BpmnElementType.EndEvent)],
        [edge('e1', 's', 'e')],
      )
      const model = parseBpmnGraph(g)
      const inc = model.getIncoming('e')
      expect(inc).toHaveLength(1)
      expect(inc[0].sourceNodeId).toBe('s')
    })
  })

  describe('BpmnParseError', () => {
    it('is an instance of Error with correct name', () => {
      try {
        parseBpmnGraph(graph([node('t1', BpmnElementType.UserTask)]))
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(BpmnParseError)
        expect(err).toBeInstanceOf(Error)
        expect((err as Error).name).toBe('BpmnParseError')
      }
    })
  })
})
