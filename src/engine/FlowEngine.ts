/**
 * FlowEngine — 流程执行引擎核心
 *
 * 三项目关联：
 * - Editor: 提供表单 Schema，嵌入流程预览/审批组件
 * - Flow: 执行 BPMN 流程，管理任务生命周期
 * - AI: 生成流程 + 表单，提供智能决策
 */

import { BpmnElementType } from '../types/bpmn.js'
import type { BpmnNodeConfig } from '../types/bpmn.js'
import type { FlowGraph } from '../types/graph.js'
import type {
  FlowInstanceData,
  TaskInstanceData,
  FlowToken,
  FlowInstanceStatus,
  TaskInstanceStatus,
  ApprovalAction,
  ApprovalLogEntry,
} from '../types/instance.js'
import { ExecutableModel, type ParsedNode, type ParsedEdge } from './ExecutableModel.js'
import { parseBpmnGraph } from './BpmnParser.js'
import { validateFlow } from './FlowValidator.js'
import { evaluateExpression } from './ExpressionEvaluator.js'

// ────────────────────────────────────────────
// 执行上下文
// ────────────────────────────────────────────

export interface ExecutionContext {
  /** 流程实例 ID */
  instanceId: string
  /** 流程变量 */
  variables: Record<string, unknown>
  /** 各节点表单数据 (nodeId -> formData) */
  nodeFormData: Record<string, Record<string, unknown>>
  /** 当前操作人 */
  operator?: string
  /** 发起人 */
  initiator?: string
}

// ────────────────────────────────────────────
// 节点执行结果
// ────────────────────────────────────────────

export type NodeExecutionResult =
  | { action: 'continue'; nextNodeIds: string[] }
  | { action: 'wait'; task?: TaskInstanceData }
  | { action: 'complete' }
  | { action: 'error'; error: string }
  | { action: 'terminate' }

// ────────────────────────────────────────────
// 节点执行器接口
// ────────────────────────────────────────────

export interface NodeExecutor {
  bpmnType: BpmnElementType
  execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult>
}

// ────────────────────────────────────────────
// 引擎 API（供执行器调用）
// ────────────────────────────────────────────

export interface FlowEngineAPI {
  /** 评估条件表达式 */
  evaluateCondition(expression: string, variables: Record<string, unknown>): boolean
  /** 创建任务 */
  createTask(
    instanceId: string,
    node: ParsedNode,
    context: ExecutionContext,
  ): TaskInstanceData
  /** 记录审批日志 */
  logApproval(entry: Omit<ApprovalLogEntry, 'id' | 'createdAt'>): void
  /** 启动子流程 */
  startSubProcess(
    definitionId: string,
    variables: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<FlowInstanceData>
}

// ────────────────────────────────────────────
// 持久化适配器接口
// ────────────────────────────────────────────

export interface FlowPersistence {
  // 实例
  createInstance(data: Omit<FlowInstanceData, 'id' | 'createdAt' | 'updatedAt'>): Promise<FlowInstanceData>
  getInstance(id: string): Promise<FlowInstanceData | null>
  updateInstance(id: string, patch: Partial<FlowInstanceData>): Promise<void>

  // 任务
  createTask(data: Omit<TaskInstanceData, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskInstanceData>
  getTask(id: string): Promise<TaskInstanceData | null>
  updateTask(id: string, patch: Partial<TaskInstanceData>): Promise<void>
  getTasksByInstance(instanceId: string): Promise<TaskInstanceData[]>

  // 审批日志
  createLog(data: Omit<ApprovalLogEntry, 'id' | 'createdAt'>): Promise<void>
  getLogsByInstance(instanceId: string): Promise<ApprovalLogEntry[]>

  // 流程定义
  getDefinition(id: string): Promise<FlowGraph | null>
}

// ────────────────────────────────────────────
// 引擎配置
// ────────────────────────────────────────────

export interface FlowEngineConfig {
  /** 持久化适配器 */
  persistence: FlowPersistence
  /** 事件回调 */
  callbacks?: FlowEngineCallbacks
}

export interface FlowEngineCallbacks {
  /** 节点进入 */
  onNodeEnter?: (nodeId: string, context: ExecutionContext) => void
  /** 节点完成 */
  onNodeComplete?: (nodeId: string, context: ExecutionContext) => void
  /** 任务创建（可用于通知 AI 或 Editor） */
  onTaskCreated?: (task: TaskInstanceData) => void
  /** 流程完成 */
  onFlowComplete?: (instance: FlowInstanceData) => void
  /** 流程异常 */
  onFlowError?: (instanceId: string, error: string) => void
  /** 需要 AI 介入（如智能指派） */
  onAIAssist?: (request: AIAssistRequest) => Promise<unknown>
}

// ────────────────────────────────────────────
// AI 介入请求
// ────────────────────────────────────────────

export type AIAssistRequest =
  | { type: 'recommend-assignee'; task: TaskInstanceData; context: ExecutionContext }
  | { type: 'evaluate-condition'; expression: string; context: ExecutionContext }
  | { type: 'predict-outcome'; task: TaskInstanceData; formData: Record<string, unknown> }

// ────────────────────────────────────────────
// FlowEngine 主类
// ────────────────────────────────────────────

export class FlowEngine implements FlowEngineAPI {
  private persistence: FlowPersistence
  private callbacks: FlowEngineCallbacks
  private executors = new Map<BpmnElementType, NodeExecutor>()

  constructor(config: FlowEngineConfig) {
    this.persistence = config.persistence
    this.callbacks = config.callbacks ?? {}

    // 注册内置执行器
    this.registerExecutor(new StartEventExecutor())
    this.registerExecutor(new EndEventExecutor())
    this.registerExecutor(new UserTaskExecutor())
    this.registerExecutor(new ExclusiveGatewayExecutor())
    this.registerExecutor(new ParallelGatewayExecutor())
    this.registerExecutor(new ServiceTaskExecutor())
    this.registerExecutor(new ScriptTaskExecutor())
    this.registerExecutor(new TimerEventExecutor())
    this.registerExecutor(new SubProcessExecutor())
  }

  // ────── 公共 API ──────

  /**
   * 注册节点执行器
   */
  registerExecutor(executor: NodeExecutor): void {
    this.executors.set(executor.bpmnType, executor)
  }

  /**
   * 启动流程实例
   */
  async startInstance(
    definitionId: string,
    variables: Record<string, unknown>,
    initiatedBy: string,
  ): Promise<FlowInstanceData> {
    // 1. 获取流程定义
    const graph = await this.persistence.getDefinition(definitionId)
    if (!graph) {
      throw new FlowEngineError('DEFINITION_NOT_FOUND', `流程定义 ${definitionId} 不存在`)
    }

    // 2. 解析为可执行模型
    const model = parseBpmnGraph(graph)

    // 3. 校验
    const errors = validateFlow(graph)
    const criticalErrors = errors.filter(e => e.level === 'error')
    if (criticalErrors.length > 0) {
      throw new FlowEngineError(
        'VALIDATION_FAILED',
        `流程校验失败: ${criticalErrors.map(e => e.message).join('; ')}`,
      )
    }

    // 4. 创建实例
    const instance = await this.persistence.createInstance({
      definitionId,
      versionId: 'v1', // TODO: 版本管理
      version: '1',
      status: 'running',
      variables,
      tokens: [],
      initiatedBy,
      startedAt: new Date(),
    })

    // 5. 创建起始令牌并执行
    const startNode = model.getNode(model.startNodeId)
    if (!startNode) {
      throw new FlowEngineError('NO_START_NODE', '流程缺少开始节点')
    }

    const context: ExecutionContext = {
      instanceId: instance.id,
      variables: { ...variables },
      nodeFormData: {},
      operator: initiatedBy,
      initiator: initiatedBy,
    }

    // 6. 递归执行节点
    await this.executeNode(model, startNode.id, context)

    return instance
  }

  /**
   * 审批任务（通过/驳回）
   */
  async approveTask(
    taskId: string,
    action: 'approve' | 'reject',
    formData?: Record<string, unknown>,
    comment?: string,
    operator?: string,
  ): Promise<void> {
    // 1. 获取任务
    const task = await this.persistence.getTask(taskId)
    if (!task) {
      throw new FlowEngineError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`)
    }
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new FlowEngineError('TASK_ALREADY_COMPLETED', `任务 ${taskId} 已完成`)
    }

    // 2. 更新任务状态
    await this.persistence.updateTask(taskId, {
      status: 'completed',
      outcome: action,
      formData,
      updatedAt: new Date(),
    })

    // 3. 记录审批日志
    await this.persistence.createLog({
      instanceId: task.instanceId,
      nodeId: task.nodeId,
      nodeName: task.nodeName,
      taskId: task.id,
      action: action as ApprovalAction,
      operator: operator ?? 'system',
      comment,
    })

    // 4. 获取实例，恢复执行
    const instance = await this.persistence.getInstance(task.instanceId)
    if (!instance) {
      throw new FlowEngineError('INSTANCE_NOT_FOUND', `实例 ${task.instanceId} 不存在`)
    }

    // 5. 获取流程定义，继续执行
    const graph = await this.persistence.getDefinition(instance.definitionId)
    if (!graph) {
      throw new FlowEngineError('DEFINITION_NOT_FOUND', `流程定义 ${instance.definitionId} 不存在`)
    }

    const model = parseBpmnGraph(graph)
    const context: ExecutionContext = {
      instanceId: instance.id,
      variables: { ...instance.variables },
      nodeFormData: await this.collectNodeFormData(instance.id),
      operator,
      initiator: instance.initiatedBy,
    }

    // 6. 从当前节点继续执行
    const nextEdges = model.getOutgoing(task.nodeId)
    const nextNodeIds = nextEdges.map(e => e.targetNodeId)

    for (const nextNodeId of nextNodeIds) {
      await this.executeNode(model, nextNodeId, context)
    }
  }

  /**
   * 认领任务
   */
  async claimTask(taskId: string, userId: string): Promise<TaskInstanceData> {
    const task = await this.persistence.getTask(taskId)
    if (!task) {
      throw new FlowEngineError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`)
    }
    if (task.status !== 'pending') {
      throw new FlowEngineError('TASK_NOT_CLAIMABLE', `任务 ${taskId} 不可认领`)
    }

    await this.persistence.updateTask(taskId, {
      status: 'claimed',
      assignee: userId,
      updatedAt: new Date(),
    })

    // 记录认领日志
    await this.persistence.createLog({
      instanceId: task.instanceId,
      nodeId: task.nodeId,
      nodeName: task.nodeName,
      taskId: task.id,
      action: 'claim',
      operator: userId,
    })

    return { ...task, status: 'claimed', assignee: userId }
  }

  /**
   * 驳回到指定节点
   */
  async rejectToNode(
    taskId: string,
    targetNodeId: string,
    comment?: string,
    operator?: string,
  ): Promise<void> {
    // 1. 获取任务
    const task = await this.persistence.getTask(taskId)
    if (!task) {
      throw new FlowEngineError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`)
    }
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new FlowEngineError('TASK_ALREADY_COMPLETED', `任务 ${taskId} 已完成`)
    }

    // 2. 获取流程实例
    const instance = await this.persistence.getInstance(task.instanceId)
    if (!instance) {
      throw new FlowEngineError('INSTANCE_NOT_FOUND', `实例 ${task.instanceId} 不存在`)
    }

    // 3. 获取流程定义，验证目标节点存在
    const graph = await this.persistence.getDefinition(instance.definitionId)
    if (!graph) {
      throw new FlowEngineError('DEFINITION_NOT_FOUND', `流程定义 ${instance.definitionId} 不存在`)
    }

    const model = parseBpmnGraph(graph)
    const targetNode = model.getNode(targetNodeId)
    if (!targetNode) {
      throw new FlowEngineError('TARGET_NODE_NOT_FOUND', `目标节点 ${targetNodeId} 不存在`)
    }

    // 4. 更新当前任务状态
    await this.persistence.updateTask(taskId, {
      status: 'completed',
      outcome: 'reject-to-node',
      updatedAt: new Date(),
    })

    // 5. 记录审批日志
    await this.persistence.createLog({
      instanceId: task.instanceId,
      nodeId: task.nodeId,
      nodeName: task.nodeName,
      taskId: task.id,
      action: 'reject-to-node',
      operator: operator ?? 'system',
      comment,
    })

    // 6. 取消当前节点的所有待处理任务
    const currentTasks = await this.persistence.getTasksByInstance(task.instanceId)
    for (const t of currentTasks) {
      if (t.nodeId === task.nodeId && t.id !== taskId && (t.status === 'pending' || t.status === 'claimed')) {
        await this.persistence.updateTask(t.id, {
          status: 'cancelled',
          updatedAt: new Date(),
        })
      }
    }

    // 7. 从目标节点重新执行
    const context: ExecutionContext = {
      instanceId: instance.id,
      variables: { ...instance.variables },
      nodeFormData: await this.collectNodeFormData(instance.id),
      operator,
      initiator: instance.initiatedBy,
    }

    await this.executeNode(model, targetNodeId, context)
  }

  /**
   * 委派任务
   */
  async delegateTask(
    taskId: string,
    assignee: string,
    comment?: string,
    operator?: string,
  ): Promise<TaskInstanceData> {
    // 1. 获取任务
    const task = await this.persistence.getTask(taskId)
    if (!task) {
      throw new FlowEngineError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`)
    }
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new FlowEngineError('TASK_ALREADY_COMPLETED', `任务 ${taskId} 已完成`)
    }

    // 2. 更新任务指派人
    await this.persistence.updateTask(taskId, {
      assignee,
      status: 'claimed',
      updatedAt: new Date(),
    })

    // 3. 记录审批日志
    await this.persistence.createLog({
      instanceId: task.instanceId,
      nodeId: task.nodeId,
      nodeName: task.nodeName,
      taskId: task.id,
      action: 'delegate',
      operator: operator ?? 'system',
      comment,
    })

    return { ...task, assignee, status: 'claimed' }
  }

  /**
   * 获取驳回目标节点列表
   */
  async getRejectTargets(taskId: string): Promise<Array<{ nodeId: string; nodeName: string; bpmnType: string }>> {
    // 1. 获取任务
    const task = await this.persistence.getTask(taskId)
    if (!task) {
      throw new FlowEngineError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`)
    }

    // 2. 获取流程实例
    const instance = await this.persistence.getInstance(task.instanceId)
    if (!instance) {
      throw new FlowEngineError('INSTANCE_NOT_FOUND', `实例 ${task.instanceId} 不存在`)
    }

    // 3. 获取流程定义
    const graph = await this.persistence.getDefinition(instance.definitionId)
    if (!graph) {
      throw new FlowEngineError('DEFINITION_NOT_FOUND', `流程定义 ${instance.definitionId} 不存在`)
    }

    const model = parseBpmnGraph(graph)

    // 4. 获取已完成的任务节点
    const completedTasks = await this.persistence.getTasksByInstance(task.instanceId)
    const completedNodeIds = new Set(
      completedTasks
        .filter(t => t.status === 'completed' && t.id !== taskId)
        .map(t => t.nodeId)
    )

    // 5. 返回可驳回的节点（已完成的 userTask 节点）
    const targets: Array<{ nodeId: string; nodeName: string; bpmnType: string }> = []
    for (const nodeId of completedNodeIds) {
      const node = model.getNode(nodeId)
      if (node && node.bpmnType === BpmnElementType.UserTask) {
        targets.push({
          nodeId: node.id,
          nodeName: node.config.label ?? node.id,
          bpmnType: node.bpmnType,
        })
      }
    }

    return targets
  }

  /**
   * 获取流程图（供 Editor 嵌入预览）
   */
  async getFlowGraph(instanceId: string): Promise<FlowGraph | null> {
    const instance = await this.persistence.getInstance(instanceId)
    if (!instance) return null
    return this.persistence.getDefinition(instance.definitionId)
  }

  /**
   * 获取执行状态（供 Editor 高亮节点）
   */
  async getExecutionState(instanceId: string): Promise<{
    currentNodeIds: string[]
    completedNodeIds: string[]
    tokens: FlowToken[]
  }> {
    const instance = await this.persistence.getInstance(instanceId)
    if (!instance) {
      return { currentNodeIds: [], completedNodeIds: [], tokens: [] }
    }

    const tasks = await this.persistence.getTasksByInstance(instanceId)
    const completedNodeIds = tasks
      .filter(t => t.status === 'completed')
      .map(t => t.nodeId)

    const currentNodeIds = tasks
      .filter(t => t.status === 'pending' || t.status === 'claimed')
      .map(t => t.nodeId)

    return {
      currentNodeIds,
      completedNodeIds,
      tokens: instance.tokens,
    }
  }

  /**
   * 获取审批日志（供 Editor 嵌入日志组件）
   */
  async getApprovalLogs(instanceId: string): Promise<ApprovalLogEntry[]> {
    return this.persistence.getLogsByInstance(instanceId)
  }

  // ────── FlowEngineAPI 实现 ──────

  evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
    return evaluateExpression(expression, variables)
  }

  createTask(
    instanceId: string,
    node: ParsedNode,
    context: ExecutionContext,
  ): TaskInstanceData {
    const config = node.config

    // 解析指派人
    let assignee: string | undefined
    if (config.assigneeType === 'expression' && config.assignee) {
      if (config.assignee === '${initiator}') {
        assignee = context.initiator
      } else {
        // 尝试从变量解析
        assignee = String(evaluateExpression(config.assignee, context.variables))
      }
    }

    return {
      id: '', // 由持久化层生成
      instanceId,
      nodeId: node.id,
      nodeName: config.label ?? node.id,
      status: 'pending',
      assignee,
      candidateUsers: config.candidateUsers,
      candidateRoles: config.candidateRoles,
      formSchemaId: config.formSchemaId,
      formPublishId: config.formPublishId,
      formVersion: config.formVersion,
      formMode: config.formMode ?? 'edit',
      editableFields: config.editableFields,
      readonlyFields: config.readonlyFields,
      hostMethods: config.hostMethods,
      priority: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  logApproval(entry: Omit<ApprovalLogEntry, 'id' | 'createdAt'>): void {
    this.persistence.createLog(entry)
  }

  async startSubProcess(
    definitionId: string,
    variables: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<FlowInstanceData> {
    return this.startInstance(definitionId, variables, context.operator ?? 'system')
  }

  // ────── 内部方法 ──────

  /**
   * 递归执行节点
   */
  private async executeNode(
    model: ExecutableModel,
    nodeId: string,
    context: ExecutionContext,
  ): Promise<void> {
    const node = model.getNode(nodeId)
    if (!node) {
      throw new FlowEngineError('NODE_NOT_FOUND', `节点 ${nodeId} 不存在`)
    }

    // 触发回调
    this.callbacks.onNodeEnter?.(nodeId, context)

    // 获取执行器
    const executor = this.executors.get(node.bpmnType)
    if (!executor) {
      throw new FlowEngineError(
        'NO_EXECUTOR',
        `节点类型 ${node.bpmnType} 没有对应的执行器`,
      )
    }

    // 执行节点
    const result = await executor.execute(
      node,
      model.getOutgoing(nodeId),
      context,
      this,
    )

    // 处理结果
    switch (result.action) {
      case 'continue':
        // 继续执行下一节点
        for (const nextNodeId of result.nextNodeIds) {
          await this.executeNode(model, nextNodeId, context)
        }
        break

      case 'wait':
        // 创建任务并等待
        if (result.task) {
          const savedTask = await this.persistence.createTask(result.task)
          this.callbacks.onTaskCreated?.(savedTask)
        }
        break

      case 'complete':
        // 流程完成
        await this.persistence.updateInstance(context.instanceId, {
          status: 'completed',
          completedAt: new Date(),
        })
        const instance = await this.persistence.getInstance(context.instanceId)
        if (instance) {
          this.callbacks.onFlowComplete?.(instance)
        }
        break

      case 'error':
        // 流程异常
        await this.persistence.updateInstance(context.instanceId, {
          status: 'failed',
        })
        this.callbacks.onFlowError?.(context.instanceId, result.error)
        throw new FlowEngineError('EXECUTION_ERROR', result.error)

      case 'terminate':
        // 流程终止
        await this.persistence.updateInstance(context.instanceId, {
          status: 'terminated',
        })
        break
    }

    // 触发完成回调
    this.callbacks.onNodeComplete?.(nodeId, context)
  }

  /**
   * 收集已完成节点的表单数据
   */
  private async collectNodeFormData(
    instanceId: string,
  ): Promise<Record<string, Record<string, unknown>>> {
    const tasks = await this.persistence.getTasksByInstance(instanceId)
    const formData: Record<string, Record<string, unknown>> = {}

    for (const task of tasks) {
      if (task.status === 'completed' && task.formData) {
        formData[task.nodeId] = task.formData
      }
    }

    return formData
  }
}

// ────────────────────────────────────────────
// 错误类型
// ────────────────────────────────────────────

export class FlowEngineError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'FlowEngineError'
    this.code = code
  }
}

// ────────────────────────────────────────────
// 内置执行器
// ────────────────────────────────────────────

class StartEventExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.StartEvent

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const nextNodeIds = edges.map(e => e.targetNodeId)
    return { action: 'continue', nextNodeIds }
  }
}

class EndEventExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.EndEvent

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    return { action: 'complete' }
  }
}

class UserTaskExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.UserTask

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const task = engine.createTask(context.instanceId, node, context)
    return { action: 'wait', task }
  }
}

class ExclusiveGatewayExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.ExclusiveGateway

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    // 评估每条出边的条件
    for (const edge of edges) {
      if (edge.isDefault) continue
      if (edge.conditionExpression) {
        const result = engine.evaluateCondition(edge.conditionExpression, context.variables)
        if (result) {
          return { action: 'continue', nextNodeIds: [edge.targetNodeId] }
        }
      }
    }

    // 走默认流
    const defaultEdge = edges.find(e => e.isDefault) ??
                        (node.config.defaultFlow ? edges.find(e => e.id === node.config.defaultFlow) : undefined)

    if (defaultEdge) {
      return { action: 'continue', nextNodeIds: [defaultEdge.targetNodeId] }
    }

    return { action: 'error', error: `排他网关 ${node.id} 无匹配条件且无默认流` }
  }
}

class ParallelGatewayExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.ParallelGateway

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const direction = node.config.gatewayDirection ?? 'diverging'

    if (direction === 'diverging') {
      // 并行分支：所有出边都走
      const nextNodeIds = edges.map(e => e.targetNodeId)
      return { action: 'continue', nextNodeIds }
    }

    // converging: 等待所有入边令牌到达
    // TODO: 实现令牌合并逻辑
    return { action: 'continue', nextNodeIds: edges.map(e => e.targetNodeId) }
  }
}

class ServiceTaskExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.ServiceTask

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const config = node.config

    // 根据 serviceType 执行
    switch (config.serviceType) {
      case 'http':
        // TODO: 执行 HTTP 请求
        break
      case 'script':
        // TODO: 执行脚本
        break
      case 'function':
        // TODO: 调用函数
        break
    }

    const nextNodeIds = edges.map(e => e.targetNodeId)
    return { action: 'continue', nextNodeIds }
  }
}

class ScriptTaskExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.ScriptTask

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const nextNodeIds = edges.map(e => e.targetNodeId)
    return { action: 'continue', nextNodeIds }
  }
}

class TimerEventExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.TimerEvent

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    // TODO: 实现定时器逻辑
    const nextNodeIds = edges.map(e => e.targetNodeId)
    return { action: 'continue', nextNodeIds }
  }
}

class SubProcessExecutor implements NodeExecutor {
  bpmnType = BpmnElementType.SubProcess

  async execute(
    node: ParsedNode,
    edges: ParsedEdge[],
    context: ExecutionContext,
    engine: FlowEngineAPI,
  ): Promise<NodeExecutionResult> {
    const config = node.config
    if (config.subProcessDefinitionId) {
      await engine.startSubProcess(
        config.subProcessDefinitionId,
        context.variables,
        context,
      )
    }

    const nextNodeIds = edges.map(e => e.targetNodeId)
    return { action: 'continue', nextNodeIds }
  }
}
