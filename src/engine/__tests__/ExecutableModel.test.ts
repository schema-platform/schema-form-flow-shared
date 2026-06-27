import { describe, it, expect } from 'vitest'
import { ExecutableModel } from '../ExecutableModel.js'
import type { ParsedNode, ParsedEdge } from '../ExecutableModel.js'
import { BpmnElementType } from '../../types/bpmn.js'

function makeNode(id: string, bpmnType: BpmnElementType = BpmnElementType.UserTask, label?: string): ParsedNode {
  return { id, bpmnType, config: { bpmnType, label: label ?? id } }
}

function makeEdge(id: string, sourceNodeId: string, targetNodeId: string, opts?: Partial<ParsedEdge>): ParsedEdge {
  return { id, sourceNodeId, targetNodeId, isDefault: false, ...opts }
}

describe('ExecutableModel', () => {
  describe('addNode / getNode', () => {
    it('stores and retrieves a node by id', () => {
      const model = new ExecutableModel('start')
      const node = makeNode('start', BpmnElementType.StartEvent)
      model.addNode(node)
      expect(model.getNode('start')).toEqual(node)
    })

    it('returns undefined for non-existent node', () => {
      const model = new ExecutableModel('start')
      expect(model.getNode('missing')).toBeUndefined()
    })

    it('overwrites node with same id', () => {
      const model = new ExecutableModel('n1')
      model.addNode(makeNode('n1', BpmnElementType.UserTask, 'v1'))
      model.addNode(makeNode('n1', BpmnElementType.ServiceTask, 'v2'))
      expect(model.getNode('n1')!.config.label).toBe('v2')
      expect(model.size).toBe(1)
    })
  })

  describe('addEdge / getOutgoing / getIncoming', () => {
    it('returns outgoing edges for a node', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      const edge = makeEdge('e1', 'a', 'b')
      model.addEdge(edge)

      const outgoing = model.getOutgoing('a')
      expect(outgoing).toHaveLength(1)
      expect(outgoing[0]).toEqual(edge)
    })

    it('returns incoming edges for a node', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      const edge = makeEdge('e1', 'a', 'b')
      model.addEdge(edge)

      const incoming = model.getIncoming('b')
      expect(incoming).toHaveLength(1)
      expect(incoming[0]).toEqual(edge)
    })

    it('returns empty array for node with no edges', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      expect(model.getOutgoing('a')).toEqual([])
      expect(model.getIncoming('a')).toEqual([])
    })

    it('returns empty array for non-existent node', () => {
      const model = new ExecutableModel('a')
      expect(model.getOutgoing('ghost')).toEqual([])
      expect(model.getIncoming('ghost')).toEqual([])
    })
  })

  describe('multiple edges', () => {
    it('tracks multiple outgoing edges from same source', () => {
      const model = new ExecutableModel('gw')
      model.addNode(makeNode('gw', BpmnElementType.ExclusiveGateway))
      model.addNode(makeNode('t1'))
      model.addNode(makeNode('t2'))
      model.addEdge(makeEdge('e1', 'gw', 't1'))
      model.addEdge(makeEdge('e2', 'gw', 't2'))

      expect(model.getOutgoing('gw')).toHaveLength(2)
      expect(model.getOutgoing('gw').map((e) => e.targetNodeId)).toEqual(['t1', 't2'])
    })

    it('tracks multiple incoming edges to same target (converging gateway)', () => {
      const model = new ExecutableModel('s')
      model.addNode(makeNode('s'))
      model.addNode(makeNode('t1'))
      model.addNode(makeNode('t2'))
      model.addNode(makeNode('gw', BpmnElementType.ExclusiveGateway))
      model.addEdge(makeEdge('e1', 't1', 'gw'))
      model.addEdge(makeEdge('e2', 't2', 'gw'))

      expect(model.getIncoming('gw')).toHaveLength(2)
    })
  })

  describe('getAllNodes', () => {
    it('returns all added nodes', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      model.addNode(makeNode('c'))
      expect(model.getAllNodes()).toHaveLength(3)
    })

    it('returns empty array when no nodes added', () => {
      const model = new ExecutableModel('a')
      expect(model.getAllNodes()).toEqual([])
    })
  })

  describe('size', () => {
    it('returns the number of nodes', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      expect(model.size).toBe(2)
    })
  })

  describe('startNodeId', () => {
    it('is set from constructor', () => {
      const model = new ExecutableModel('myStart')
      expect(model.startNodeId).toBe('myStart')
    })
  })

  describe('conditionExpression on edges', () => {
    it('preserves condition expression on edge', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      model.addEdge(makeEdge('e1', 'a', 'b', { conditionExpression: 'amount > 1000', isDefault: false }))

      const edge = model.getOutgoing('a')[0]
      expect(edge.conditionExpression).toBe('amount > 1000')
      expect(edge.isDefault).toBe(false)
    })

    it('preserves isDefault flag', () => {
      const model = new ExecutableModel('a')
      model.addNode(makeNode('a'))
      model.addNode(makeNode('b'))
      model.addEdge(makeEdge('e1', 'a', 'b', { isDefault: true }))

      expect(model.getOutgoing('a')[0].isDefault).toBe(true)
    })
  })
})
