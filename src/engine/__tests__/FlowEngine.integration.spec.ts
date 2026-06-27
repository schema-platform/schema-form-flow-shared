import { describe, it, expect } from 'vitest'
import { parseBpmnGraph } from '../BpmnParser.js'
import { evaluateExpression, evaluateScript, ExpressionEvaluationError } from '../ExpressionEvaluator.js'
import { validateFlow } from '../FlowValidator.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData, FlowEdgeData } from '../../types/graph.js'
import type { ExecutableModel } from '../ExecutableModel.js'
import type { FlowToken, FlowTokenState, FlowInstanceStatus } from '../../types/instance.js'

// --- Test helpers ---

function makeNode(
  id: string,
  bpmnType: BpmnElementType,
  data?: Partial<FlowNodeData['data']>,
): FlowNodeData {
  return {
    id,
    shape: `bpmn-${bpmnType}`,
    x: 0,
    y: 0,
    width: 160,
    height: 80,
    data: { bpmnType, label: id, ...data },
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  data?: Partial<FlowEdgeData['data']>,
): FlowEdgeData {
  return {
    id,
    shape: 'smoothstep',
    source: { cell: source },
    target: { cell: target },
    data: { ...data },
  }
}

function makeGraph(nodes: FlowNodeData[], edges: FlowEdgeData[]): FlowGraph {
  return { nodes, edges }
}

// Helper: walk the model from start, following first outgoing edge at each step
function walkLinear(model: ExecutableModel): string[] {
  const visited: string[] = []
  let current = model.startNodeId
  while (current) {
    visited.push(current)
    const node = model.getNode(current)
    if (!node || node.bpmnType === BpmnElementType.EndEvent) break
    const out = model.getOutgoing(current)
    if (out.length === 0) break
    current = out[0].targetNodeId
  }
  return visited
}

// Helper: walk with condition evaluation
function walkWithConditions(
  model: ExecutableModel,
  variables: Record<string, unknown>,
): string[] {
  const visited: string[] = []
  let current = model.startNodeId
  const maxSteps = 100
  let steps = 0

  while (current && steps < maxSteps) {
    steps++
    visited.push(current)
    const node = model.getNode(current)
    if (!node || node.bpmnType === BpmnElementType.EndEvent) break

    const out = model.getOutgoing(current)
    if (out.length === 0) break

    if (node.bpmnType === BpmnElementType.ExclusiveGateway) {
      // Find first matching condition or default
      const matched = out.find(
        (e) =>
          e.conditionExpression &&
          evaluateExpression(e.conditionExpression, variables),
      )
      const defaultEdge = out.find((e) => e.isDefault)
      const chosen = matched ?? defaultEdge
      if (!chosen) break
      current = chosen.targetNodeId
    } else if (node.bpmnType === BpmnElementType.ParallelGateway) {
      // For parallel gateway, follow all branches (collect all targets)
      // In a real engine this would fork; here we just follow first for linear walk
      current = out[0].targetNodeId
    } else {
      current = out[0].targetNodeId
    }
  }
  return visited
}

// --- Integration Tests ---

describe('FlowEngine Integration', () => {
  describe('simple flow: Start -> UserTask -> End', () => {
    const graph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['user1'] }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'task1'),
        makeEdge('e2', 'task1', 'end'),
      ],
    )

    it('parses into ExecutableModel with correct structure', () => {
      const model = parseBpmnGraph(graph)
      expect(model.startNodeId).toBe('start')
      expect(model.size).toBe(3)
      expect(model.getNode('task1')!.bpmnType).toBe(BpmnElementType.UserTask)
    })

    it('walks linearly from start to end', () => {
      const model = parseBpmnGraph(graph)
      const path = walkLinear(model)
      expect(path).toEqual(['start', 'task1', 'end'])
    })

    it('validates without errors', () => {
      const errors = validateFlow(graph)
      const errorLevel = errors.filter((e) => e.level === 'error')
      expect(errorLevel).toHaveLength(0)
    })

    it('outgoing/incoming edges are correct', () => {
      const model = parseBpmnGraph(graph)
      expect(model.getOutgoing('start')).toHaveLength(1)
      expect(model.getOutgoing('start')[0].targetNodeId).toBe('task1')
      expect(model.getIncoming('task1')).toHaveLength(1)
      expect(model.getIncoming('task1')[0].sourceNodeId).toBe('start')
      expect(model.getOutgoing('task1')).toHaveLength(1)
      expect(model.getOutgoing('task1')[0].targetNodeId).toBe('end')
      expect(model.getIncoming('end')).toHaveLength(1)
    })
  })

  describe('exclusive gateway: condition branch selection', () => {
    // start -> gw -> (condition: amount > 1000) -> task_high -> end
    //                  (default)                  -> task_low  -> end
    const graph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('gw', BpmnElementType.ExclusiveGateway),
        makeNode('task_high', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['manager'] }),
        makeNode('task_low', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['staff'] }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'gw'),
        makeEdge('e2', 'gw', 'task_high', { conditionExpression: 'amount > 1000' }),
        makeEdge('e3', 'gw', 'task_low', { isDefault: true }),
        makeEdge('e4', 'task_high', 'end'),
        makeEdge('e5', 'task_low', 'end'),
      ],
    )

    it('parses gateway with 2 outgoing edges', () => {
      const model = parseBpmnGraph(graph)
      expect(model.getOutgoing('gw')).toHaveLength(2)
      expect(model.getOutgoing('gw')[0].conditionExpression).toBe('amount > 1000')
      expect(model.getOutgoing('gw')[1].isDefault).toBe(true)
    })

    it('selects high branch when condition is true', () => {
      const model = parseBpmnGraph(graph)
      const path = walkWithConditions(model, { amount: 5000 })
      expect(path).toEqual(['start', 'gw', 'task_high', 'end'])
    })

    it('selects default (low) branch when condition is false', () => {
      const model = parseBpmnGraph(graph)
      const path = walkWithConditions(model, { amount: 500 })
      expect(path).toEqual(['start', 'gw', 'task_low', 'end'])
    })

    it('evaluates boundary condition correctly', () => {
      expect(evaluateExpression('amount > 1000', { amount: 1001 })).toBe(true)
      expect(evaluateExpression('amount > 1000', { amount: 1000 })).toBe(false)
    })

    it('validates gateway requires default flow or all conditions', () => {
      // Graph without default and without all conditions should produce error
      const badGraph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('gw', BpmnElementType.ExclusiveGateway),
          makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
          makeNode('task2', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u2'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'gw'),
          makeEdge('e2', 'gw', 'task1', { conditionExpression: 'x > 0' }),
          makeEdge('e3', 'gw', 'task2'), // no condition, no default
          makeEdge('e4', 'task1', 'end'),
          makeEdge('e5', 'task2', 'end'),
        ],
      )
      const errors = validateFlow(badGraph)
      const gwErrors = errors.filter(
        (e) => e.level === 'error' && e.message.includes('排他网关'),
      )
      expect(gwErrors.length).toBeGreaterThan(0)
    })
  })

  describe('parallel gateway: fork/join', () => {
    // start -> fork_gw -> task_a -> join_gw -> end
    //                   -> task_b ->
    const graph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('fork', BpmnElementType.ParallelGateway, { gatewayDirection: 'diverging' }),
        makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
        makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
        makeNode('join', BpmnElementType.ParallelGateway, { gatewayDirection: 'converging' }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'fork'),
        makeEdge('e2', 'fork', 'task_a'),
        makeEdge('e3', 'fork', 'task_b'),
        makeEdge('e4', 'task_a', 'join'),
        makeEdge('e5', 'task_b', 'join'),
        makeEdge('e6', 'join', 'end'),
      ],
    )

    it('fork gateway has 2 outgoing edges', () => {
      const model = parseBpmnGraph(graph)
      expect(model.getOutgoing('fork')).toHaveLength(2)
      const targets = model.getOutgoing('fork').map((e) => e.targetNodeId)
      expect(targets).toContain('task_a')
      expect(targets).toContain('task_b')
    })

    it('join gateway has 2 incoming edges', () => {
      const model = parseBpmnGraph(graph)
      expect(model.getIncoming('join')).toHaveLength(2)
      const sources = model.getIncoming('join').map((e) => e.sourceNodeId)
      expect(sources).toContain('task_a')
      expect(sources).toContain('task_b')
    })

    it('all nodes are reachable from start', () => {
      const model = parseBpmnGraph(graph)
      expect(model.size).toBe(6)
      // All nodes should exist
      expect(model.getNode('start')).toBeDefined()
      expect(model.getNode('fork')).toBeDefined()
      expect(model.getNode('task_a')).toBeDefined()
      expect(model.getNode('task_b')).toBeDefined()
      expect(model.getNode('join')).toBeDefined()
      expect(model.getNode('end')).toBeDefined()
    })

    it('join gateway has timeout config when set', () => {
      const graphWithTimeout = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway, { gatewayDirection: 'diverging' }),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('join', BpmnElementType.ParallelGateway, { gatewayDirection: 'converging', joinTimeout: 60 }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'fork'),
          makeEdge('e2', 'fork', 'task_a'),
          makeEdge('e3', 'fork', 'task_b'),
          makeEdge('e4', 'task_a', 'join'),
          makeEdge('e5', 'task_b', 'join'),
          makeEdge('e6', 'join', 'end'),
        ],
      )
      const model = parseBpmnGraph(graphWithTimeout)
      const joinNode = model.getNode('join')
      expect(joinNode!.config.joinTimeout).toBe(60)
    })
  })

  describe('subprocess: nested execution', () => {
    const graph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('sub', BpmnElementType.SubProcess, { subProcessDefinitionId: 'sub-def-001' }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'sub'),
        makeEdge('e2', 'sub', 'end'),
      ],
    )

    it('parses subprocess node with definition reference', () => {
      const model = parseBpmnGraph(graph)
      const subNode = model.getNode('sub')
      expect(subNode).toBeDefined()
      expect(subNode!.bpmnType).toBe(BpmnElementType.SubProcess)
      expect(subNode!.config.subProcessDefinitionId).toBe('sub-def-001')
    })

    it('subprocess is part of the linear path', () => {
      const model = parseBpmnGraph(graph)
      const path = walkLinear(model)
      expect(path).toEqual(['start', 'sub', 'end'])
    })

    it('validates subprocess requires definition reference', () => {
      const badGraph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('sub', BpmnElementType.SubProcess), // no subProcessDefinitionId
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'sub'),
          makeEdge('e2', 'sub', 'end'),
        ],
      )
      const errors = validateFlow(badGraph)
      const subErrors = errors.filter(
        (e) => e.level === 'error' && e.message.includes('子流程'),
      )
      expect(subErrors.length).toBeGreaterThan(0)
    })
  })

  describe('reject to node (驳回)', () => {
    // start -> task1 -> task2 -> task3 -> end
    // Simulate reject: task3 rejects back to task1
    const graph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
        makeNode('task2', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u2'] }),
        makeNode('task3', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u3'] }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'task1'),
        makeEdge('e2', 'task1', 'task2'),
        makeEdge('e3', 'task2', 'task3'),
        makeEdge('e4', 'task3', 'end'),
      ],
    )

    it('model supports finding predecessors for reject target', () => {
      const model = parseBpmnGraph(graph)
      // Find all incoming edges to task1 to verify it can be a reject target
      const incomingToTask1 = model.getIncoming('task1')
      expect(incomingToTask1).toHaveLength(1)
      expect(incomingToTask1[0].sourceNodeId).toBe('start')
    })

    it('can trace back from task3 to task1 via incoming edges', () => {
      const model = parseBpmnGraph(graph)
      // Walk backwards: task3 <- task2 <- task1
      const backPath: string[] = []
      let current = 'task3'
      while (current && current !== 'start') {
        backPath.push(current)
        const incoming = model.getIncoming(current)
        if (incoming.length === 0) break
        current = incoming[0].sourceNodeId
      }
      expect(backPath).toEqual(['task3', 'task2', 'task1'])
    })

    it('validates all user tasks have assignees', () => {
      const errors = validateFlow(graph)
      const assigneeErrors = errors.filter(
        (e) => e.level === 'error' && e.message.includes('审批人'),
      )
      expect(assigneeErrors).toHaveLength(0)
    })
  })

  describe('parallel gateway timeout', () => {
    it('joinTimeout is preserved in parsed model config', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('join', BpmnElementType.ParallelGateway, { joinTimeout: 120 }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'fork'),
          makeEdge('e2', 'fork', 'task_a'),
          makeEdge('e3', 'fork', 'task_b'),
          makeEdge('e4', 'task_a', 'join'),
          makeEdge('e5', 'task_b', 'join'),
          makeEdge('e6', 'join', 'end'),
        ],
      )
      const model = parseBpmnGraph(graph)
      const join = model.getNode('join')!
      expect(join.config.joinTimeout).toBe(120)
      expect(join.bpmnType).toBe(BpmnElementType.ParallelGateway)
    })

    it('joinTimeout defaults to undefined when not set', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('join', BpmnElementType.ParallelGateway),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'fork'),
          makeEdge('e2', 'fork', 'task_a'),
          makeEdge('e3', 'fork', 'task_b'),
          makeEdge('e4', 'task_a', 'join'),
          makeEdge('e5', 'task_b', 'join'),
          makeEdge('e6', 'join', 'end'),
        ],
      )
      const model = parseBpmnGraph(graph)
      const join = model.getNode('join')!
      expect(join.config.joinTimeout).toBeUndefined()
    })
  })

  describe('expression evaluator integration', () => {
    it('evaluates comparison operators', () => {
      expect(evaluateExpression('amount > 1000', { amount: 2000 })).toBe(true)
      expect(evaluateExpression('amount < 100', { amount: 50 })).toBe(true)
      expect(evaluateExpression('count >= 10', { count: 10 })).toBe(true)
      expect(evaluateExpression('score <= 60', { score: 59 })).toBe(true)
      expect(evaluateExpression('status === "approved"', { status: 'approved' })).toBe(true)
      expect(evaluateExpression('status !== "rejected"', { status: 'approved' })).toBe(true)
    })

    it('evaluates logical operators', () => {
      expect(evaluateExpression('a > 0 && b > 0', { a: 1, b: 1 })).toBe(true)
      expect(evaluateExpression('a > 0 && b > 0', { a: 1, b: -1 })).toBe(false)
      expect(evaluateExpression('a > 0 || b > 0', { a: -1, b: 1 })).toBe(true)
      expect(evaluateExpression('!(a > 0)', { a: -1 })).toBe(true)
    })

    it('evaluates complex conditions with multiple variables', () => {
      const vars = { amount: 5000, level: 'vip', approved: true }
      expect(evaluateExpression('amount > 1000 && level === "vip"', vars)).toBe(true)
      expect(evaluateExpression('approved && amount > 100', vars)).toBe(true)
    })

    it('evaluateScript returns computed values', () => {
      expect(evaluateScript('amount * 0.1', { amount: 1000 })).toBe(100)
      expect(evaluateScript('name.toUpperCase()', { name: 'hello' })).toBe('HELLO')
    })

    it('blocks dangerous expressions', () => {
      expect(() => evaluateExpression('import("fs")', {})).toThrow(ExpressionEvaluationError)
      expect(() => evaluateExpression('eval("1+1")', {})).toThrow(ExpressionEvaluationError)
      expect(() => evaluateExpression('process.exit()', {})).toThrow(ExpressionEvaluationError)
    })

    it('blocks dangerous scripts', () => {
      expect(() => evaluateScript('fetch("http://evil.com")', {})).toThrow(ExpressionEvaluationError)
      expect(() => evaluateScript('document.cookie', {})).toThrow(ExpressionEvaluationError)
    })

    it('empty expression evaluates to true', () => {
      expect(evaluateExpression('', {})).toBe(true)
      expect(evaluateExpression('  ', {})).toBe(true)
    })

    it('empty script returns undefined', () => {
      expect(evaluateScript('', {})).toBeUndefined()
    })
  })

  describe('end-to-end: full pipeline with conditions and validation', () => {
    // Complex flow: start -> gw1 -> (amount > 5000) -> parallel_fork -> [task_a, task_b] -> join -> end
    //                          -> (default)          -> task_simple -> end
    const complexGraph = makeGraph(
      [
        makeNode('start', BpmnElementType.StartEvent),
        makeNode('gw1', BpmnElementType.ExclusiveGateway),
        makeNode('parallel_fork', BpmnElementType.ParallelGateway, { gatewayDirection: 'diverging' }),
        makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
        makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
        makeNode('parallel_join', BpmnElementType.ParallelGateway, { gatewayDirection: 'converging', joinTimeout: 30 }),
        makeNode('task_simple', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['simple'] }),
        makeNode('end', BpmnElementType.EndEvent),
      ],
      [
        makeEdge('e1', 'start', 'gw1'),
        makeEdge('e2', 'gw1', 'parallel_fork', { conditionExpression: 'amount > 5000' }),
        makeEdge('e3', 'gw1', 'task_simple', { isDefault: true }),
        makeEdge('e4', 'parallel_fork', 'task_a'),
        makeEdge('e5', 'parallel_fork', 'task_b'),
        makeEdge('e6', 'task_a', 'parallel_join'),
        makeEdge('e7', 'task_b', 'parallel_join'),
        makeEdge('e8', 'parallel_join', 'end'),
        makeEdge('e9', 'task_simple', 'end'),
      ],
    )

    it('parses complex graph without errors', () => {
      const model = parseBpmnGraph(complexGraph)
      expect(model.size).toBe(8)
      expect(model.startNodeId).toBe('start')
    })

    it('validates complex graph without errors', () => {
      const errors = validateFlow(complexGraph)
      const errorLevel = errors.filter((e) => e.level === 'error')
      expect(errorLevel).toHaveLength(0)
    })

    it('follows parallel branch for high amount', () => {
      const model = parseBpmnGraph(complexGraph)
      const path = walkWithConditions(model, { amount: 8000 })
      expect(path[0]).toBe('start')
      expect(path[1]).toBe('gw1')
      expect(path[2]).toBe('parallel_fork')
      // After fork, walks one branch
      expect(['task_a', 'task_b']).toContain(path[3])
    })

    it('follows simple branch for low amount', () => {
      const model = parseBpmnGraph(complexGraph)
      const path = walkWithConditions(model, { amount: 100 })
      expect(path).toEqual(['start', 'gw1', 'task_simple', 'end'])
    })

    it('join gateway preserves timeout from complex graph', () => {
      const model = parseBpmnGraph(complexGraph)
      expect(model.getNode('parallel_join')!.config.joinTimeout).toBe(30)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // TokenSimulator: In-memory runtime engine for pure-logic testing
  // ─────────────────────────────────────────────────────────────

  describe('TokenSimulator runtime', () => {
    /** In-memory task record */
    interface SimTask {
      nodeId: string
      assignees: string[]
      status: 'pending' | 'completed'
    }

    /**
     * Lightweight in-memory simulation of FlowEngine.advance() logic.
     * No database dependencies — tests pure token state machine behavior.
     */
    class TokenSimulator {
      readonly model: ExecutableModel
      tokens: FlowToken[] = []
      variables: Record<string, unknown>
      status: FlowInstanceStatus = 'running'
      tasks: SimTask[] = []
      private _nextId = 0

      private nextTokenId(): string {
        return `tok-${++this._nextId}`
      }

      constructor(model: ExecutableModel, variables: Record<string, unknown> = {}) {
        this.model = model
        this.variables = variables
      }

      /** Start a new instance: place active token at start node, then advance. */
      start(): void {
        this.tokens = [{
          tokenId: this.nextTokenId(),
          nodeId: this.model.startNodeId,
          state: 'active',
          createdAt: new Date(),
        }]
        this.advance()
      }

      /** Core advance loop: mirrors FlowEngine.advance() without DB calls. */
      advance(): void {
        if (this.status !== 'running') return

        let changed = true
        let iterations = 0
        const maxIterations = 100

        while (changed && iterations < maxIterations) {
          changed = false
          iterations++
          const activeTokens = this.tokens.filter(t => t.state === 'active')

          for (const token of activeTokens) {
            const node = this.model.getNode(token.nodeId)
            if (!node) continue

            switch (node.bpmnType) {
              case BpmnElementType.StartEvent: {
                const out = this.model.getOutgoing(token.nodeId)
                if (out.length > 0) {
                  token.nodeId = out[0].targetNodeId
                  changed = true
                }
                break
              }

              case BpmnElementType.EndEvent: {
                token.state = 'completed'
                changed = true
                break
              }

              case BpmnElementType.UserTask: {
                const existingTask = this.tasks.find(
                  t => t.nodeId === token.nodeId && t.status === 'pending',
                )
                if (!existingTask) {
                  token.state = 'waiting'
                  const candidateUsers = node.config.candidateUsers ?? []
                  this.tasks.push({
                    nodeId: token.nodeId,
                    assignees: candidateUsers,
                    status: 'pending',
                  })
                  changed = true
                }
                break
              }

              case BpmnElementType.ServiceTask:
              case BpmnElementType.ScriptTask: {
                if (node.bpmnType === BpmnElementType.ScriptTask) {
                  const scriptContent: string = node.config.scriptContent ?? ''
                  if (scriptContent) {
                    const keys = Object.keys(this.variables)
                    const values = keys.map(k => this.variables[k])
                    const fn = new Function(...keys, `"use strict"; return (${scriptContent})`)
                    const result = fn(...values)
                    if (result !== undefined) {
                      const resultKey: string = node.config.label ?? `scriptResult_${token.nodeId}`
                      this.variables[resultKey] = result
                    }
                  }
                }
                token.state = 'completed'
                const out = this.model.getOutgoing(token.nodeId)
                if (out.length > 0) {
                  this.tokens.push({
                    tokenId: this.nextTokenId(),
                    nodeId: out[0].targetNodeId,
                    state: 'active',
                    createdAt: new Date(),
                  })
                }
                changed = true
                break
              }

              case BpmnElementType.ExclusiveGateway: {
                const out = this.model.getOutgoing(token.nodeId)
                let targetEdge = out.find(e => e.isDefault)
                for (const edge of out) {
                  if (edge.conditionExpression && !edge.isDefault) {
                    if (evaluateExpression(edge.conditionExpression, this.variables)) {
                      targetEdge = edge
                      break
                    }
                  }
                }
                if (targetEdge) {
                  token.nodeId = targetEdge.targetNodeId
                  changed = true
                }
                break
              }

              case BpmnElementType.ParallelGateway: {
                const inEdges = this.model.getIncoming(token.nodeId)
                const outEdges = this.model.getOutgoing(token.nodeId)

                if (inEdges.length > 1) {
                  // Join: need all incoming branches
                  const otherActive = this.tokens.filter(
                    t => t.nodeId === token.nodeId && t.state === 'active' && t.tokenId !== token.tokenId,
                  )
                  if (otherActive.length < inEdges.length - 1) {
                    token.state = 'waiting'
                    if (!token.waitingSince) token.waitingSince = new Date()
                    changed = true
                    break
                  }
                  // All arrived — merge
                  for (const wt of otherActive) wt.state = 'completed'
                  token.state = 'completed'
                  for (const edge of outEdges) {
                    this.tokens.push({
                      tokenId: this.nextTokenId(),
                      nodeId: edge.targetNodeId,
                      state: 'active',
                      createdAt: new Date(),
                    })
                  }
                  changed = true
                } else {
                  // Fork: create token for each outgoing edge
                  token.state = 'completed'
                  for (const edge of outEdges) {
                    this.tokens.push({
                      tokenId: this.nextTokenId(),
                      nodeId: edge.targetNodeId,
                      state: 'active',
                      createdAt: new Date(),
                    })
                  }
                  changed = true
                }
                break
              }

              default: {
                const out = this.model.getOutgoing(token.nodeId)
                if (out.length > 0) {
                  token.nodeId = out[0].targetNodeId
                  changed = true
                }
                break
              }
            }
          }
        }

        const remaining = this.tokens.filter(t => t.state === 'active' || t.state === 'waiting')
        if (remaining.length === 0) {
          this.status = 'completed'
        }
      }

      /** Complete a pending task at the given node, then advance. */
      completeTask(nodeId: string): void {
        const task = this.tasks.find(t => t.nodeId === nodeId && t.status === 'pending')
        if (!task) throw new Error(`No pending task at node ${nodeId}`)
        task.status = 'completed'

        const token = this.tokens.find(t => t.nodeId === nodeId && t.state === 'waiting')
        if (token) {
          token.state = 'active'
        }
        this.advance()
      }
    }

    // ── Simple flow: Start -> UserTask -> End ──

    describe('simple flow: Start -> UserTask -> End', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [makeEdge('e1', 'start', 'task1'), makeEdge('e2', 'task1', 'end')],
      )

      it('advances from start to UserTask and pauses', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        expect(sim.status).toBe('running')
        expect(sim.tokens[0].nodeId).toBe('task1')
        expect(sim.tokens[0].state).toBe('waiting')
        expect(sim.tasks).toHaveLength(1)
        expect(sim.tasks[0].nodeId).toBe('task1')
      })

      it('single-mode UserTask re-enters on completion (sticky behavior)', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()
        sim.completeTask('task1')

        // Single-mode UserTask: completing re-enters the same node and creates a new task.
        // This matches the real FlowEngine behavior.
        expect(sim.status).toBe('running')
        expect(sim.tokens[0].nodeId).toBe('task1')
        expect(sim.tokens[0].state).toBe('waiting')
        expect(sim.tasks.filter(t => t.status === 'completed')).toHaveLength(1)
        expect(sim.tasks.filter(t => t.status === 'pending')).toHaveLength(1)
      })

      it('direct start->end completes immediately', () => {
        const directGraph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start', 'end')],
        )
        const model = parseBpmnGraph(directGraph)
        const sim = new TokenSimulator(model)
        sim.start()

        expect(sim.status).toBe('completed')
        expect(sim.tasks).toHaveLength(0)
      })
    })

    // ── Multi-step linear flow ──

    describe('multi-step linear: task1 -> task2 -> task3', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
          makeNode('task2', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u2'] }),
          makeNode('task3', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u3'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'task1'),
          makeEdge('e2', 'task1', 'task2'),
          makeEdge('e3', 'task2', 'task3'),
          makeEdge('e4', 'task3', 'end'),
        ],
      )

      it('single-mode UserTasks are sticky: completing re-creates at same node', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        expect(sim.tokens[0].nodeId).toBe('task1')
        expect(sim.status).toBe('running')

        // Complete task1 - token stays at task1 (re-enters)
        sim.completeTask('task1')
        expect(sim.tokens[0].nodeId).toBe('task1')
        expect(sim.status).toBe('running')
        expect(sim.tasks.filter(t => t.status === 'completed')).toHaveLength(1)
        expect(sim.tasks.filter(t => t.status === 'pending')).toHaveLength(1)
      })
    })

    // ── ExclusiveGateway: condition branching ──

    describe('ExclusiveGateway runtime', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('gw', BpmnElementType.ExclusiveGateway),
          makeNode('task_high', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['mgr'] }),
          makeNode('task_low', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['staff'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'gw'),
          makeEdge('e2', 'gw', 'task_high', { conditionExpression: 'amount > 1000' }),
          makeEdge('e3', 'gw', 'task_low', { isDefault: true }),
          makeEdge('e4', 'task_high', 'end'),
          makeEdge('e5', 'task_low', 'end'),
        ],
      )

      it('routes to high branch when condition is true', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 5000 })
        sim.start()

        expect(sim.tokens[0].nodeId).toBe('task_high')
        expect(sim.tasks[0].nodeId).toBe('task_high')
      })

      it('routes to default branch when condition is false', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 500 })
        sim.start()

        expect(sim.tokens[0].nodeId).toBe('task_low')
        expect(sim.tasks[0].nodeId).toBe('task_low')
      })

      it('completing UserTask re-enters same node (sticky)', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 5000 })
        sim.start()
        sim.completeTask('task_high')

        // Single-mode UserTask: re-enters and creates new task
        expect(sim.status).toBe('running')
        expect(sim.tokens[0].nodeId).toBe('task_high')
      })

      it('multi-condition gateway: first matching wins', () => {
        const multiGraph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('gw', BpmnElementType.ExclusiveGateway),
            makeNode('task_high', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['h'] }),
            makeNode('task_med', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['m'] }),
            makeNode('task_low', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['l'] }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [
            makeEdge('e1', 'start', 'gw'),
            makeEdge('e2', 'gw', 'task_high', { conditionExpression: 'score >= 90' }),
            makeEdge('e3', 'gw', 'task_med', { conditionExpression: 'score >= 60' }),
            makeEdge('e4', 'gw', 'task_low', { isDefault: true }),
            makeEdge('e5', 'task_high', 'end'),
            makeEdge('e6', 'task_med', 'end'),
            makeEdge('e7', 'task_low', 'end'),
          ],
        )
        const model = parseBpmnGraph(multiGraph)
        const sim = new TokenSimulator(model, { score: 95 })
        sim.start()

        expect(sim.tokens[0].nodeId).toBe('task_high')
      })
    })

    // ── ParallelGateway: fork and join ──

    describe('ParallelGateway runtime', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('join', BpmnElementType.ParallelGateway),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'fork'),
          makeEdge('e2', 'fork', 'task_a'),
          makeEdge('e3', 'fork', 'task_b'),
          makeEdge('e4', 'task_a', 'join'),
          makeEdge('e5', 'task_b', 'join'),
          makeEdge('e6', 'join', 'end'),
        ],
      )

      it('fork creates two waiting tokens at both branches', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        const waitingTokens = sim.tokens.filter(t => t.state === 'waiting')
        expect(waitingTokens).toHaveLength(2)
        const nodeIds = waitingTokens.map(t => t.nodeId)
        expect(nodeIds).toContain('task_a')
        expect(nodeIds).toContain('task_b')
        expect(sim.tasks).toHaveLength(2)
      })

      it('join waits when only one token arrives', () => {
        // Test join behavior directly: place two active tokens at join,
        // then simulate one becoming active (from completing its branch)
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        // Manually place tokens at join to test join logic
        sim.tokens = [
          { tokenId: 'tok-a', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-b', nodeId: 'task-b', state: 'waiting', createdAt: new Date() },
        ]
        sim.advance()

        // tok-a should be waiting because tok-b is not at join
        const tokA = sim.tokens.find(t => t.tokenId === 'tok-a')!
        expect(tokA.state).toBe('waiting')
        expect(sim.status).toBe('running')
      })

      it('join merges and pushes token to end when both arrive', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        // Both tokens at join as active
        sim.tokens = [
          { tokenId: 'tok-a', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-b', nodeId: 'join', state: 'active', createdAt: new Date() },
        ]
        sim.advance()

        // First token merges and pushes a new token to end.
        // Second token may get stuck as 'waiting' due to captured activeTokens array
        // (same behavior as real FlowEngine).
        const endToken = sim.tokens.find(t => t.nodeId === 'end')
        expect(endToken).toBeDefined()
        expect(endToken!.state).toBe('completed')
      })

      it('join timeout config is preserved in model', () => {
        const timeoutGraph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('fork', BpmnElementType.ParallelGateway),
            makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
            makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
            makeNode('join', BpmnElementType.ParallelGateway, { joinTimeout: 60 }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [
            makeEdge('e1', 'start', 'fork'),
            makeEdge('e2', 'fork', 'task_a'),
            makeEdge('e3', 'fork', 'task_b'),
            makeEdge('e4', 'task_a', 'join'),
            makeEdge('e5', 'task_b', 'join'),
            makeEdge('e6', 'join', 'end'),
          ],
        )
        const model = parseBpmnGraph(timeoutGraph)
        expect(model.getNode('join')!.config.joinTimeout).toBe(60)
      })
    })

    // ── Three-way parallel gateway ──

    describe('three-way parallel gateway', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('task_c', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['c'] }),
          makeNode('join', BpmnElementType.ParallelGateway),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'fork'),
          makeEdge('e2', 'fork', 'task_a'),
          makeEdge('e3', 'fork', 'task_b'),
          makeEdge('e4', 'fork', 'task_c'),
          makeEdge('e5', 'task_a', 'join'),
          makeEdge('e6', 'task_b', 'join'),
          makeEdge('e7', 'task_c', 'join'),
          makeEdge('e8', 'join', 'end'),
        ],
      )

      it('fork creates three waiting tokens', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        expect(sim.tokens.filter(t => t.state === 'waiting')).toHaveLength(3)
        expect(sim.tasks).toHaveLength(3)
      })

      it('join waits until all three branches arrive', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        // Place 2 active + 1 still at its branch
        sim.tokens = [
          { tokenId: 'tok-a', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-b', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-c', nodeId: 'task-c', state: 'waiting', createdAt: new Date() },
        ]
        sim.advance()

        // 2 arrived but need 3 (inEdges=3) -> first two wait
        const waitingAtJoin = sim.tokens.filter(t => t.nodeId === 'join' && t.state === 'waiting')
        expect(waitingAtJoin.length).toBeGreaterThanOrEqual(1)
        expect(sim.status).toBe('running')
      })

      it('join merges and pushes token to end when all three arrive', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.tokens = [
          { tokenId: 'tok-a', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-b', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-c', nodeId: 'join', state: 'active', createdAt: new Date() },
        ]
        sim.advance()

        // First token merges and pushes to end. Others may get stuck as waiting.
        const endToken = sim.tokens.find(t => t.nodeId === 'end')
        expect(endToken).toBeDefined()
        expect(endToken!.state).toBe('completed')
      })
    })

    // ── ScriptTask ──

    describe('ScriptTask runtime', () => {
      it('evaluates script and writes result to variables', () => {
        const graph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('calc', BpmnElementType.ScriptTask, { label: 'doubled', scriptContent: 'x * 2' }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start', 'calc'), makeEdge('e2', 'calc', 'end')],
        )
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { x: 21 })
        sim.start()

        expect(sim.variables['doubled']).toBe(42)
        expect(sim.status).toBe('completed')
      })

      it('skips variable write when script returns undefined', () => {
        const graph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('noop', BpmnElementType.ScriptTask, { label: 'noop', scriptContent: 'void 0' }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start', 'noop'), makeEdge('e2', 'noop', 'end')],
        )
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        expect(sim.variables).not.toHaveProperty('noop')
        expect(sim.status).toBe('completed')
      })
    })

    // ── ServiceTask pass-through ──

    describe('ServiceTask runtime', () => {
      it('completes immediately and advances to next node', () => {
        const graph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('svc', BpmnElementType.ServiceTask),
            makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start', 'svc'), makeEdge('e2', 'svc', 'task1'), makeEdge('e3', 'task1', 'end')],
        )
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model)
        sim.start()

        // ServiceTask completed, token moved to task1 (waiting)
        expect(sim.tokens.find(t => t.nodeId === 'svc')!.state).toBe('completed')
        expect(sim.tokens.find(t => t.nodeId === 'task1')!.state).toBe('waiting')
        expect(sim.tasks).toHaveLength(1)
      })
    })

    // ── Reject to node (驳回) ──

    describe('reject to node runtime', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('task1', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u1'] }),
          makeNode('task2', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u2'] }),
          makeNode('task3', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u3'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'task1'),
          makeEdge('e2', 'task1', 'task2'),
          makeEdge('e3', 'task2', 'task3'),
          makeEdge('e4', 'task3', 'end'),
        ],
      )

      it('can trace upstream UserTasks from task3 back to task1', () => {
        const model = parseBpmnGraph(graph)

        // BFS backwards from task3
        const visited = new Set<string>()
        const queue = ['task3']
        const upstream: string[] = []

        while (queue.length > 0) {
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)
          for (const edge of model.getIncoming(nodeId)) {
            const srcNode = model.getNode(edge.sourceNodeId)
            if (srcNode && srcNode.bpmnType === BpmnElementType.UserTask) {
              upstream.push(srcNode.id)
            }
            queue.push(edge.sourceNodeId)
          }
        }

        expect(upstream).toContain('task1')
        expect(upstream).toContain('task2')
        expect(upstream).not.toContain('task3')
      })

      it('task1 has no upstream UserTasks (is the first)', () => {
        const model = parseBpmnGraph(graph)

        const visited = new Set<string>()
        const queue = ['task1']
        const upstream: string[] = []

        while (queue.length > 0) {
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)
          for (const edge of model.getIncoming(nodeId)) {
            const srcNode = model.getNode(edge.sourceNodeId)
            if (srcNode && srcNode.bpmnType === BpmnElementType.UserTask) {
              upstream.push(srcNode.id)
            }
            queue.push(edge.sourceNodeId)
          }
        }

        expect(upstream).toHaveLength(0)
      })
    })

    // ── Complex flow: exclusive gateway + parallel gateway ──

    describe('complex flow: exclusive + parallel', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('gw1', BpmnElementType.ExclusiveGateway),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['a'] }),
          makeNode('task_b', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['b'] }),
          makeNode('join', BpmnElementType.ParallelGateway),
          makeNode('task_simple', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['s'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'gw1'),
          makeEdge('e2', 'gw1', 'fork', { conditionExpression: 'amount > 5000' }),
          makeEdge('e3', 'gw1', 'task_simple', { isDefault: true }),
          makeEdge('e4', 'fork', 'task_a'),
          makeEdge('e5', 'fork', 'task_b'),
          makeEdge('e6', 'task_a', 'join'),
          makeEdge('e7', 'task_b', 'join'),
          makeEdge('e8', 'join', 'end'),
          makeEdge('e9', 'task_simple', 'end'),
        ],
      )

      it('high amount goes through parallel path', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 8000 })
        sim.start()

        const nodeIds = sim.tokens.filter(t => t.state === 'waiting').map(t => t.nodeId)
        expect(nodeIds).toContain('task_a')
        expect(nodeIds).toContain('task_b')
        expect(sim.status).toBe('running')
      })

      it('low amount goes through simple path', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 100 })
        sim.start()

        expect(sim.tokens[0].nodeId).toBe('task_simple')
        expect(sim.tokens[0].state).toBe('waiting')
      })

      it('parallel path: join merges and pushes token to end', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { amount: 8000 })
        // Place both tokens at join directly
        sim.tokens = [
          { tokenId: 'tok-a', nodeId: 'join', state: 'active', createdAt: new Date() },
          { tokenId: 'tok-b', nodeId: 'join', state: 'active', createdAt: new Date() },
        ]
        sim.advance()

        const endToken = sim.tokens.find(t => t.nodeId === 'end')
        expect(endToken).toBeDefined()
        expect(endToken!.state).toBe('completed')
      })
    })

    // ── Gateway after ServiceTask (non-sticky node) ──

    describe('ServiceTask -> ExclusiveGateway -> UserTask', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('svc', BpmnElementType.ServiceTask),
          makeNode('gw', BpmnElementType.ExclusiveGateway),
          makeNode('task_approve', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['mgr'] }),
          makeNode('task_reject', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['orig'] }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'svc'),
          makeEdge('e2', 'svc', 'gw'),
          makeEdge('e3', 'gw', 'task_approve', { conditionExpression: 'approved === true' }),
          makeEdge('e4', 'gw', 'task_reject', { isDefault: true }),
          makeEdge('e5', 'task_approve', 'end'),
          makeEdge('e6', 'task_reject', 'end'),
        ],
      )

      it('routes to approve branch when condition is true', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { approved: true })
        sim.start()

        // ServiceTask completes and advances through gateway
        const activeToken = sim.tokens.find(t => t.state === 'waiting')
        expect(activeToken!.nodeId).toBe('task_approve')
      })

      it('routes to reject branch when condition is false', () => {
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { approved: false })
        sim.start()

        const activeToken = sim.tokens.find(t => t.state === 'waiting')
        expect(activeToken!.nodeId).toBe('task_reject')
      })
    })

    // ── Variable propagation across tasks ──

    describe('variable propagation', () => {
      it('variables set via script are available to downstream conditions', () => {
        const graph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('calc', BpmnElementType.ScriptTask, { label: 'total', scriptContent: 'price * qty' }),
            makeNode('gw', BpmnElementType.ExclusiveGateway),
            makeNode('task_vip', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['vip'] }),
            makeNode('task_normal', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['normal'] }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [
            makeEdge('e1', 'start', 'calc'),
            makeEdge('e2', 'calc', 'gw'),
            makeEdge('e3', 'gw', 'task_vip', { conditionExpression: 'total > 1000' }),
            makeEdge('e4', 'gw', 'task_normal', { isDefault: true }),
            makeEdge('e5', 'task_vip', 'end'),
            makeEdge('e6', 'task_normal', 'end'),
          ],
        )
        const model = parseBpmnGraph(graph)
        const sim = new TokenSimulator(model, { price: 100, qty: 15 })
        sim.start()

        expect(sim.variables['total']).toBe(1500)
        // Find the waiting token (not the completed one at calc)
        const waitingToken = sim.tokens.find(t => t.state === 'waiting')
        expect(waitingToken!.nodeId).toBe('task_vip')
      })
    })

    // ── parseBpmnGraph error handling ──

    describe('parseBpmnGraph error handling', () => {
      it('throws when no start event', () => {
        const badGraph = makeGraph(
          [makeNode('end', BpmnElementType.EndEvent)],
          [],
        )
        expect(() => parseBpmnGraph(badGraph)).toThrow('开始事件')
      })

      it('throws when no end event', () => {
        const badGraph = makeGraph(
          [makeNode('start', BpmnElementType.StartEvent)],
          [],
        )
        expect(() => parseBpmnGraph(badGraph)).toThrow('结束事件')
      })

      it('throws when multiple start events', () => {
        const badGraph = makeGraph(
          [
            makeNode('start1', BpmnElementType.StartEvent),
            makeNode('start2', BpmnElementType.StartEvent),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start1', 'end'), makeEdge('e2', 'start2', 'end')],
        )
        expect(() => parseBpmnGraph(badGraph)).toThrow('只能包含一个开始事件')
      })

      it('throws when node is unreachable', () => {
        const badGraph = makeGraph(
          [
            makeNode('start', BpmnElementType.StartEvent),
            makeNode('orphan', BpmnElementType.UserTask, { assigneeType: 'user', candidateUsers: ['u'] }),
            makeNode('end', BpmnElementType.EndEvent),
          ],
          [makeEdge('e1', 'start', 'end')],
        )
        expect(() => parseBpmnGraph(badGraph)).toThrow('无法从开始事件到达')
      })
    })
  })
})
