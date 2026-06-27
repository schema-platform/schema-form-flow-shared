/**
 * Variable Bus & Execution Engine Verification Tests
 *
 * Validates:
 * 1. Variable bus set/get functionality
 * 2. Expression evaluation with variables
 * 3. Variable propagation across nodes
 * 4. Execution engine node execution flow
 */
import { describe, it, expect } from 'vitest'
import { parseBpmnGraph } from '../BpmnParser.js'
import { evaluateExpression, evaluateScript, ExpressionEvaluationError } from '../ExpressionEvaluator.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData, FlowEdgeData } from '../../types/graph.js'
import type { ExecutableModel } from '../ExecutableModel.js'
import type { FlowToken } from '../../types/instance.js'

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

// --- Variable Bus Implementation ---

interface VariableBus {
  get(key: string): unknown
  set(key: string, value: unknown): void
  getAll(): Record<string, unknown>
  has(key: string): boolean
  keys(): string[]
}

class SimpleVariableBus implements VariableBus {
  private variables: Record<string, unknown> = {}

  constructor(initial: Record<string, unknown> = {}) {
    this.variables = { ...initial }
  }

  get(key: string): unknown {
    return this.variables[key]
  }

  set(key: string, value: unknown): void {
    this.variables[key] = value
  }

  getAll(): Record<string, unknown> {
    return { ...this.variables }
  }

  has(key: string): boolean {
    return key in this.variables
  }

  keys(): string[] {
    return Object.keys(this.variables)
  }
}

// --- Token Simulator ---

interface SimTask {
  nodeId: string
  assignees: string[]
  status: 'pending' | 'completed'
}

class TokenSimulator {
  readonly model: ExecutableModel
  tokens: FlowToken[] = []
  variables: VariableBus
  status: 'running' | 'completed' = 'running'
  tasks: SimTask[] = []
  private _nextId = 0

  private nextTokenId(): string {
    return `tok-${++this._nextId}`
  }

  constructor(model: ExecutableModel, initialVars: Record<string, unknown> = {}) {
    this.model = model
    this.variables = new SimpleVariableBus(initialVars)
  }

  start(): void {
    this.tokens = [{
      tokenId: this.nextTokenId(),
      nodeId: this.model.startNodeId,
      state: 'active',
      createdAt: new Date(),
    }]
    this.advance()
  }

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
                const allVars = this.variables.getAll()
                const result = evaluateScript(scriptContent, allVars)
                if (result !== undefined) {
                  const resultKey: string = node.config.label ?? `scriptResult_${token.nodeId}`
                  this.variables.set(resultKey, result)
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
                if (evaluateExpression(edge.conditionExpression, this.variables.getAll())) {
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
              const otherActive = this.tokens.filter(
                t => t.nodeId === token.nodeId && t.state === 'active' && t.tokenId !== token.tokenId,
              )
              if (otherActive.length < inEdges.length - 1) {
                token.state = 'waiting'
                if (!token.waitingSince) token.waitingSince = new Date()
                changed = true
                break
              }
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

// --- Tests ---

describe('Variable Bus Verification', () => {
  describe('Basic set/get operations', () => {
    it('stores and retrieves primitive values', () => {
      const bus = new SimpleVariableBus()
      bus.set('stringVar', 'hello')
      bus.set('numberVar', 42)
      bus.set('booleanVar', true)
      bus.set('nullVar', null)

      expect(bus.get('stringVar')).toBe('hello')
      expect(bus.get('numberVar')).toBe(42)
      expect(bus.get('booleanVar')).toBe(true)
      expect(bus.get('nullVar')).toBe(null)
    })

    it('stores and retrieves complex objects', () => {
      const bus = new SimpleVariableBus()
      const obj = { name: 'test', values: [1, 2, 3] }
      bus.set('objectVar', obj)

      expect(bus.get('objectVar')).toEqual(obj)
    })

    it('overwrites existing values', () => {
      const bus = new SimpleVariableBus()
      bus.set('key', 'initial')
      bus.set('key', 'updated')

      expect(bus.get('key')).toBe('updated')
    })

    it('returns undefined for non-existent keys', () => {
      const bus = new SimpleVariableBus()
      expect(bus.get('nonExistent')).toBeUndefined()
    })

    it('initializes with provided values', () => {
      const bus = new SimpleVariableBus({ a: 1, b: 'two' })
      expect(bus.get('a')).toBe(1)
      expect(bus.get('b')).toBe('two')
    })
  })

  describe('has() and keys() operations', () => {
    it('correctly reports key existence', () => {
      const bus = new SimpleVariableBus()
      bus.set('exists', 'value')

      expect(bus.has('exists')).toBe(true)
      expect(bus.has('notExists')).toBe(false)
    })

    it('returns all keys', () => {
      const bus = new SimpleVariableBus({ a: 1, b: 2, c: 3 })
      expect(bus.keys()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('getAll() returns copy', () => {
    it('returns a shallow copy of all variables', () => {
      const bus = new SimpleVariableBus({ a: 1 })
      const all = bus.getAll()
      all['b'] = 2

      expect(bus.has('b')).toBe(false)
      expect(bus.get('a')).toBe(1)
    })
  })
})

describe('Execution Engine Verification', () => {
  describe('Simple linear flow with variable propagation', () => {
    it('propagates variables through ScriptTask to ExclusiveGateway', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('calc', BpmnElementType.ScriptTask, {
            label: 'total',
            scriptContent: 'price * qty',
          }),
          makeNode('gw', BpmnElementType.ExclusiveGateway),
          makeNode('task_vip', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['vip'],
          }),
          makeNode('task_normal', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['normal'],
          }),
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

      // ScriptTask should have set 'total' variable
      expect(sim.variables.get('total')).toBe(1500)

      // Gateway should have routed to vip task based on condition
      const waitingToken = sim.tokens.find(t => t.state === 'waiting')
      expect(waitingToken!.nodeId).toBe('task_vip')
    })
  })

  describe('Multiple variable updates across nodes', () => {
    it('chains multiple ScriptTask variable updates', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('step1', BpmnElementType.ScriptTask, {
            label: 'doubled',
            scriptContent: 'x * 2',
          }),
          makeNode('step2', BpmnElementType.ScriptTask, {
            label: 'added',
            scriptContent: 'doubled + 10',
          }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'step1'),
          makeEdge('e2', 'step1', 'step2'),
          makeEdge('e3', 'step2', 'end'),
        ],
      )

      const model = parseBpmnGraph(graph)
      const sim = new TokenSimulator(model, { x: 5 })
      sim.start()

      expect(sim.variables.get('doubled')).toBe(10)
      expect(sim.variables.get('added')).toBe(20)
      expect(sim.status).toBe('completed')
    })
  })

  describe('Gateway condition evaluation with variables', () => {
    it('evaluates complex conditions correctly', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('gw', BpmnElementType.ExclusiveGateway),
          makeNode('task_high', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['mgr'],
          }),
          makeNode('task_med', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['lead'],
          }),
          makeNode('task_low', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['staff'],
          }),
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

      const model = parseBpmnGraph(graph)

      // Test high score
      const sim1 = new TokenSimulator(model, { score: 95 })
      sim1.start()
      expect(sim1.tokens[0].nodeId).toBe('task_high')

      // Test medium score
      const sim2 = new TokenSimulator(model, { score: 75 })
      sim2.start()
      expect(sim2.tokens[0].nodeId).toBe('task_med')

      // Test low score (default)
      const sim3 = new TokenSimulator(model, { score: 40 })
      sim3.start()
      expect(sim3.tokens[0].nodeId).toBe('task_low')
    })
  })

  describe('Variable isolation between instances', () => {
    it('each simulator instance has independent variables', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('script', BpmnElementType.ScriptTask, {
            label: 'result',
            scriptContent: 'x + 1',
          }),
          makeNode('end', BpmnElementType.EndEvent),
        ],
        [
          makeEdge('e1', 'start', 'script'),
          makeEdge('e2', 'script', 'end'),
        ],
      )

      const model = parseBpmnGraph(graph)

      const sim1 = new TokenSimulator(model, { x: 10 })
      const sim2 = new TokenSimulator(model, { x: 20 })

      sim1.start()
      sim2.start()

      expect(sim1.variables.get('result')).toBe(11)
      expect(sim2.variables.get('result')).toBe(21)
    })
  })

  describe('Expression evaluation safety', () => {
    it('blocks dangerous expressions', () => {
      expect(() => evaluateExpression('eval("1+1")', {})).toThrow(ExpressionEvaluationError)
      expect(() => evaluateExpression('Function("return 1")', {})).toThrow(ExpressionEvaluationError)
    })

    it('blocks access to unsafe identifiers', () => {
      expect(() => evaluateExpression('__proto__', {})).toThrow(ExpressionEvaluationError)
      expect(() => evaluateExpression('constructor', {})).toThrow(ExpressionEvaluationError)
    })

    it('allows safe variable access', () => {
      expect(evaluateExpression('myVar > 0', { myVar: 1 })).toBe(true)
      expect(evaluateExpression('myVar > 0', { myVar: -1 })).toBe(false)
    })
  })

  describe('Parallel gateway with variable conditions', () => {
    it('fork creates tokens for all branches regardless of conditions', () => {
      const graph = makeGraph(
        [
          makeNode('start', BpmnElementType.StartEvent),
          makeNode('fork', BpmnElementType.ParallelGateway),
          makeNode('task_a', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['a'],
          }),
          makeNode('task_b', BpmnElementType.UserTask, {
            assigneeType: 'user',
            candidateUsers: ['b'],
          }),
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
      const sim = new TokenSimulator(model, { amount: 5000 })
      sim.start()

      const waitingTokens = sim.tokens.filter(t => t.state === 'waiting')
      expect(waitingTokens).toHaveLength(2)
      expect(sim.status).toBe('running')
    })
  })
})
