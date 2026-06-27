import type { FlowApiConfig } from './apiConfig.js'

export enum BpmnElementType {
  StartEvent = 'startEvent',
  EndEvent = 'endEvent',
  TimerEvent = 'timerEvent',
  UserTask = 'userTask',
  ServiceTask = 'serviceTask',
  ScriptTask = 'scriptTask',
  SendTask = 'sendTask',
  ReceiveTask = 'receiveTask',
  ExclusiveGateway = 'exclusiveGateway',
  ParallelGateway = 'parallelGateway',
  InclusiveGateway = 'inclusiveGateway',
  SubProcess = 'subProcess',
  // BPMN 2.0 Events
  MessageEvent = 'messageEvent',
  SignalEvent = 'signalEvent',
  ConditionalEvent = 'conditionalEvent',
  ErrorEvent = 'errorEvent',
  EscalationEvent = 'escalationEvent',
  CompensationEvent = 'compensationEvent',
  // BPMN 2.0 Tasks
  CallActivity = 'callActivity',
  BusinessRuleTask = 'businessRuleTask',
  ManualTask = 'manualTask',
  // BPMN 2.0 Gateways
  EventBasedGateway = 'eventBasedGateway',
  ComplexGateway = 'complexGateway',
  // BPMN 2.0 SubProcess variants
  AdHocSubProcess = 'adHocSubProcess',
  Transaction = 'transaction',
}

export type AssigneeType = 'user' | 'role' | 'expression'
export type ServiceType = 'http' | 'function' | 'script' | 'dataUpdate'

export interface DataServiceConfig {
  type: 'dataUpdate'
  workflowId?: string
  rules?: Array<{
    trigger: 'on-approved' | 'on-rejected' | 'on-completed'
    sourceField: string
    targetField: string
    transform?: string
  }>
}
export type GatewayDirection = 'converging' | 'diverging'
export type TimerType = 'duration' | 'date' | 'cycle'
export type ApprovalMode = 'single' | 'countersign' | 'or-sign'
export type FormMode = 'edit' | 'view' | 'readonly' | 'editable' | 'partial'
export type RejectPolicy = 'reject-on-all' | 'reject-on-any'

export interface MultiInstanceConfig {
  type: 'none' | 'sequential' | 'parallel'
  collection?: string
  elementVariable?: string
  completionCondition?: string
}

export interface BpmnNodeConfig {
  bpmnType: BpmnElementType
  label: string
  assigneeType?: AssigneeType
  assignee?: string
  candidateUsers?: string[]
  candidateRoles?: string[]
  approvalMode?: ApprovalMode
  assigneeCollection?: string
  minApprovalCount?: number
  formSchemaId?: string
  formPublishId?: string
  formVersion?: string
  formMode?: FormMode
  /** partial 模式下可编辑的字段列表（未指定则默认全部只读） */
  editableFields?: string[]
  /** partial 模式下只读的字段列表（与 editableFields 二选一） */
  readonlyFields?: string[]
  formVariable?: string
  hostMethods?: string[]
  serviceType?: ServiceType
  serviceConfig?: Record<string, unknown>
  apiConfig?: FlowApiConfig
  gatewayDirection?: GatewayDirection
  defaultFlow?: string
  subProcessDefinitionId?: string
  inputMapping?: Record<string, unknown>
  outputMapping?: Record<string, unknown>
  timerType?: TimerType
  timerValue?: string
  scriptLanguage?: string
  scriptContent?: string
  messageRef?: string
  signalRef?: string
  conditionExpression?: string
  errorCode?: string
  escalationCode?: string
  attachedToRef?: string
  callActivityDefinitionId?: string
  ruleRef?: string
  resultVariable?: string
  documentation?: string
  rejectPolicy?: RejectPolicy | 'follow-global'
  multiInstance?: MultiInstanceConfig
  /** Timeout in minutes for ParallelGateway join waiting tokens */
  joinTimeout?: number
}
