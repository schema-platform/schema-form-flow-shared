import type { FlowGraph, FlowNodeData, FlowEdgeData } from '../types/graph.js'
import { BpmnElementType } from '../types/bpmn.js'
import type { TimerType } from '../types/bpmn.js'
import { DEFAULT_NODE_SIZES } from './constants.js'

const TAG_TO_BPMN_TYPE: Record<string, BpmnElementType> = {
  'bpmn:startevent': BpmnElementType.StartEvent,
  'bpmn:endevent': BpmnElementType.EndEvent,
  'bpmn:usertask': BpmnElementType.UserTask,
  'bpmn:servicetask': BpmnElementType.ServiceTask,
  'bpmn:scripttask': BpmnElementType.ScriptTask,
  'bpmn:sendtask': BpmnElementType.SendTask,
  'bpmn:receivetask': BpmnElementType.ReceiveTask,
  'bpmn:exclusivegateway': BpmnElementType.ExclusiveGateway,
  'bpmn:parallelgateway': BpmnElementType.ParallelGateway,
  'bpmn:inclusivegateway': BpmnElementType.InclusiveGateway,
  'bpmn:intermediatecatchevent': BpmnElementType.TimerEvent,
  'bpmn:subprocess': BpmnElementType.SubProcess,
  // BPMN 2.0 Tasks
  'bpmn:callactivity': BpmnElementType.CallActivity,
  'bpmn:businessruletask': BpmnElementType.BusinessRuleTask,
  'bpmn:manualtask': BpmnElementType.ManualTask,
  // BPMN 2.0 Gateways
  'bpmn:eventbasedgateway': BpmnElementType.EventBasedGateway,
  'bpmn:complexgateway': BpmnElementType.ComplexGateway,
  // BPMN 2.0 SubProcess variants
  'bpmn:adhocsubprocess': BpmnElementType.AdHocSubProcess,
  'bpmn:transaction': BpmnElementType.Transaction,
}

function parseNodeConfig(element: Element): Record<string, unknown> {
  const extElements = element.querySelector('bpmn\\:extensionElements, extensionElements')
  if (!extElements) return {}

  const configEl = extElements.querySelector('sf\\:nodeConfig, nodeConfig')
  if (!configEl?.textContent) return {}

  try {
    return JSON.parse(configEl.textContent)
  } catch {
    return {}
  }
}

function parseTimerConfig(element: Element): { timerType?: TimerType; timerValue?: string } {
  const timerDef = element.querySelector('bpmn\\:timerEventDefinition, timerEventDefinition')
  if (!timerDef) return {}

  const duration = timerDef.querySelector('bpmn\\:timeDuration, timeDuration')
  if (duration?.textContent) return { timerType: 'duration', timerValue: duration.textContent }

  const date = timerDef.querySelector('bpmn\\:timeDate, timeDate')
  if (date?.textContent) return { timerType: 'date', timerValue: date.textContent }

  const cycle = timerDef.querySelector('bpmn\\:timeCycle, timeCycle')
  if (cycle?.textContent) return { timerType: 'cycle', timerValue: cycle.textContent }

  return {}
}

/**
 * Detect the actual BpmnElementType for an intermediateCatchEvent or boundaryEvent
 * by inspecting which event definition child element is present.
 */
function resolveEventSubtype(element: Element, fallbackType: BpmnElementType): BpmnElementType {
  if (element.querySelector('bpmn\\:timerEventDefinition, timerEventDefinition')) {
    return BpmnElementType.TimerEvent
  }
  if (element.querySelector('bpmn\\:messageEventDefinition, messageEventDefinition')) {
    return BpmnElementType.MessageEvent
  }
  if (element.querySelector('bpmn\\:signalEventDefinition, signalEventDefinition')) {
    return BpmnElementType.SignalEvent
  }
  if (element.querySelector('bpmn\\:conditionalEventDefinition, conditionalEventDefinition')) {
    return BpmnElementType.ConditionalEvent
  }
  if (element.querySelector('bpmn\\:errorEventDefinition, errorEventDefinition')) {
    return BpmnElementType.ErrorEvent
  }
  if (element.querySelector('bpmn\\:escalationEventDefinition, escalationEventDefinition')) {
    return BpmnElementType.EscalationEvent
  }
  if (element.querySelector('bpmn\\:compensationEventDefinition, compensationEventDefinition')) {
    return BpmnElementType.CompensationEvent
  }
  return fallbackType
}

function parseMessageEventConfig(element: Element): { messageRef?: string } {
  const msgDef = element.querySelector('bpmn\\:messageEventDefinition, messageEventDefinition')
  if (!msgDef) return {}
  const ref = msgDef.getAttribute('messageRef')
  return ref ? { messageRef: ref } : {}
}

function parseSignalEventConfig(element: Element): { signalRef?: string } {
  const sigDef = element.querySelector('bpmn\\:signalEventDefinition, signalEventDefinition')
  if (!sigDef) return {}
  const ref = sigDef.getAttribute('signalRef')
  return ref ? { signalRef: ref } : {}
}

function parseConditionalEventConfig(element: Element): { conditionExpression?: string } {
  const condDef = element.querySelector('bpmn\\:conditionalEventDefinition, conditionalEventDefinition')
  if (!condDef) return {}
  const condition = condDef.querySelector('bpmn\\:condition, condition')
  return condition?.textContent ? { conditionExpression: condition.textContent } : {}
}

function parseErrorEventConfig(element: Element): { errorCode?: string } {
  const errDef = element.querySelector('bpmn\\:errorEventDefinition, errorEventDefinition')
  if (!errDef) return {}
  const code = errDef.getAttribute('errorCode')
  return code ? { errorCode: code } : {}
}

function parseEscalationEventConfig(element: Element): { escalationCode?: string } {
  const escDef = element.querySelector('bpmn\\:escalationEventDefinition, escalationEventDefinition')
  if (!escDef) return {}
  const code = escDef.getAttribute('escalationCode')
  return code ? { escalationCode: code } : {}
}

/** Extract event-specific config based on the resolved event subtype. */
function extractEventConfig(bpmnType: BpmnElementType, element: Element): Record<string, unknown> {
  switch (bpmnType) {
    case BpmnElementType.TimerEvent:
      return parseTimerConfig(element)
    case BpmnElementType.MessageEvent:
      return parseMessageEventConfig(element)
    case BpmnElementType.SignalEvent:
      return parseSignalEventConfig(element)
    case BpmnElementType.ConditionalEvent:
      return parseConditionalEventConfig(element)
    case BpmnElementType.ErrorEvent:
      return parseErrorEventConfig(element)
    case BpmnElementType.EscalationEvent:
      return parseEscalationEventConfig(element)
    default:
      return {}
  }
}

export function importFromBpmnXml(xml: string): FlowGraph {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const errors = doc.getElementsByTagName('parsererror')
  if (errors.length > 0) {
    throw new Error('Invalid XML: ' + (errors[0].textContent ?? 'parse error'))
  }

  const process = doc.querySelector('bpmn\\:process, process')
  if (!process) throw new Error('No bpmn:process found')

  const nodes: FlowNodeData[] = []
  const edges: FlowEdgeData[] = []

  // Parse shapes from DI for positions
  const shapeMap = new Map<string, { x: number; y: number; width: number; height: number }>()
  const shapes = doc.querySelectorAll('bpmndi\\:BPMNShape, BPMNShape')
  for (const shape of shapes) {
    const bpmnElement = shape.getAttribute('bpmnElement')
    const bounds = shape.querySelector('dc\\:Bounds, Bounds')
    if (bpmnElement && bounds) {
      shapeMap.set(bpmnElement, {
        x: parseFloat(bounds.getAttribute('x') ?? '0'),
        y: parseFloat(bounds.getAttribute('y') ?? '0'),
        width: parseFloat(bounds.getAttribute('width') ?? '100'),
        height: parseFloat(bounds.getAttribute('height') ?? '80'),
      })
    }
  }

  // Parse elements
  for (const child of Array.from(process.children)) {
    const tagName = child.tagName.toLowerCase()
    const mappedType = TAG_TO_BPMN_TYPE[tagName]

    // Handle boundary events (not in the main map)
    if (tagName === 'bpmn:boundaryevent' || tagName === 'boundaryevent') {
      const element = child as Element
      const id = element.getAttribute('id') ?? `node-${Date.now()}`
      const name = element.getAttribute('name') ?? ''
      const pos = shapeMap.get(id)

      const bpmnType = resolveEventSubtype(element, BpmnElementType.ErrorEvent)
      const defaultSize = DEFAULT_NODE_SIZES[bpmnType]

      const eventConfig = extractEventConfig(bpmnType, element)
      const extensionConfig = parseNodeConfig(element)
      const attachedToRef = element.getAttribute('attachedToRef')

      nodes.push({
        id,
        shape: `bpmn-${bpmnType}`,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        width: pos?.width || defaultSize.width,
        height: pos?.height || defaultSize.height,
        data: {
          bpmnType,
          label: name,
          ...extensionConfig,
          ...eventConfig,
          ...(attachedToRef ? { attachedToRef } : {}),
        },
      })
      continue
    }

    if (!mappedType) continue

    const element = child as Element
    const id = element.getAttribute('id') ?? `node-${Date.now()}`
    const name = element.getAttribute('name') ?? ''
    const pos = shapeMap.get(id)

    // Resolve event subtypes for intermediateCatchEvent
    let bpmnType = mappedType
    if (mappedType === BpmnElementType.TimerEvent) {
      bpmnType = resolveEventSubtype(element, BpmnElementType.TimerEvent)
    }

    const defaultSize = DEFAULT_NODE_SIZES[bpmnType]

    const eventConfig = extractEventConfig(bpmnType, element)

    const extensionConfig = parseNodeConfig(element)

    nodes.push({
      id,
      shape: `bpmn-${bpmnType}`,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      width: pos?.width || defaultSize.width,
      height: pos?.height || defaultSize.height,
      data: {
        bpmnType,
        label: name,
        ...extensionConfig,
        ...eventConfig,
      },
    })
  }

  // Parse sequence flows
  const flows = process.querySelectorAll('bpmn\\:sequenceFlow, sequenceFlow')
  for (const flow of flows) {
    const id = flow.getAttribute('id') ?? `edge-${Date.now()}`
    const source = flow.getAttribute('sourceRef') ?? ''
    const target = flow.getAttribute('targetRef') ?? ''

    const condition = flow.querySelector('bpmn\\:conditionExpression, conditionExpression')

    const edgeData: FlowEdgeData = {
      id,
      shape: 'smoothstep',
      source: { cell: source },
      target: { cell: target },
      data: {
        label: flow.getAttribute('name') ?? undefined,
        conditionExpression: condition?.textContent ?? undefined,
      },
    }

    edges.push(edgeData)
  }

  return { nodes, edges }
}
