import { BpmnElementType } from '../types/bpmn.js'
import type { BpmnNodeConfig } from '../types/bpmn.js'

export const DEFAULT_NODE_SIZES: Record<BpmnElementType, { width: number; height: number }> = {
  [BpmnElementType.StartEvent]: { width: 200, height: 36 },
  [BpmnElementType.EndEvent]: { width: 200, height: 36 },
  [BpmnElementType.TimerEvent]: { width: 200, height: 36 },
  [BpmnElementType.UserTask]: { width: 160, height: 80 },
  [BpmnElementType.ServiceTask]: { width: 160, height: 80 },
  [BpmnElementType.ScriptTask]: { width: 160, height: 80 },
  [BpmnElementType.SendTask]: { width: 160, height: 80 },
  [BpmnElementType.ReceiveTask]: { width: 160, height: 80 },
  [BpmnElementType.ExclusiveGateway]: { width: 40, height: 40 },
  [BpmnElementType.ParallelGateway]: { width: 40, height: 40 },
  [BpmnElementType.InclusiveGateway]: { width: 40, height: 40 },
  [BpmnElementType.SubProcess]: { width: 300, height: 200 },
  // BPMN 2.0 Events
  [BpmnElementType.MessageEvent]: { width: 200, height: 36 },
  [BpmnElementType.SignalEvent]: { width: 200, height: 36 },
  [BpmnElementType.ConditionalEvent]: { width: 200, height: 36 },
  [BpmnElementType.ErrorEvent]: { width: 200, height: 36 },
  [BpmnElementType.EscalationEvent]: { width: 200, height: 36 },
  [BpmnElementType.CompensationEvent]: { width: 200, height: 36 },
  // BPMN 2.0 Tasks
  [BpmnElementType.CallActivity]: { width: 160, height: 80 },
  [BpmnElementType.BusinessRuleTask]: { width: 160, height: 80 },
  [BpmnElementType.ManualTask]: { width: 160, height: 80 },
  // BPMN 2.0 Gateways
  [BpmnElementType.EventBasedGateway]: { width: 40, height: 40 },
  [BpmnElementType.ComplexGateway]: { width: 40, height: 40 },
  // BPMN 2.0 SubProcess variants
  [BpmnElementType.AdHocSubProcess]: { width: 300, height: 200 },
  [BpmnElementType.Transaction]: { width: 300, height: 200 },
}

export const DEFAULT_NODE_CONFIGS: Record<BpmnElementType, Partial<BpmnNodeConfig>> = {
  [BpmnElementType.StartEvent]: { label: '开始' },
  [BpmnElementType.EndEvent]: { label: '结束' },
  [BpmnElementType.TimerEvent]: { label: '定时事件', timerType: 'duration' },
  [BpmnElementType.UserTask]: { label: '用户任务', assigneeType: 'user' } as Partial<BpmnNodeConfig>,
  [BpmnElementType.ServiceTask]: { label: '服务任务', serviceType: 'http' },
  [BpmnElementType.ScriptTask]: { label: '脚本任务', serviceType: 'script' },
  [BpmnElementType.SendTask]: { label: '发送任务', serviceType: 'http' },
  [BpmnElementType.ReceiveTask]: { label: '接收任务', assigneeType: 'user' } as Partial<BpmnNodeConfig>,
  [BpmnElementType.ExclusiveGateway]: { label: '排他网关', gatewayDirection: 'diverging' },
  [BpmnElementType.ParallelGateway]: { label: '并行网关', gatewayDirection: 'diverging' },
  [BpmnElementType.InclusiveGateway]: { label: '包含网关', gatewayDirection: 'diverging' },
  [BpmnElementType.SubProcess]: { label: '子流程' },
  // BPMN 2.0 Events
  [BpmnElementType.MessageEvent]: { label: '消息事件' },
  [BpmnElementType.SignalEvent]: { label: '信号事件' },
  [BpmnElementType.ConditionalEvent]: { label: '条件事件' },
  [BpmnElementType.ErrorEvent]: { label: '错误事件' },
  [BpmnElementType.EscalationEvent]: { label: '升级事件' },
  [BpmnElementType.CompensationEvent]: { label: '补偿事件' },
  // BPMN 2.0 Tasks
  [BpmnElementType.CallActivity]: { label: '调用活动' },
  [BpmnElementType.BusinessRuleTask]: { label: '业务规则任务' },
  [BpmnElementType.ManualTask]: { label: '手动任务' },
  // BPMN 2.0 Gateways
  [BpmnElementType.EventBasedGateway]: { label: '事件网关', gatewayDirection: 'diverging' },
  [BpmnElementType.ComplexGateway]: { label: '复杂网关', gatewayDirection: 'diverging' },
  // BPMN 2.0 SubProcess variants
  [BpmnElementType.AdHocSubProcess]: { label: '临时子流程' },
  [BpmnElementType.Transaction]: { label: '事务' },
}
