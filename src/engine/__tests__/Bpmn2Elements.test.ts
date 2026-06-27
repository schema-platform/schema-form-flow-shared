/**
 * BPMN 2.0 Standard Elements Tests
 *
 * Tests for the new BPMN 2.0 element types:
 * - Events: MessageEvent, SignalEvent, ConditionalEvent, ErrorEvent, EscalationEvent, CompensationEvent
 * - Tasks: CallActivity, BusinessRuleTask, ManualTask
 * - Gateways: EventBasedGateway, ComplexGateway
 * - SubProcess variants: AdHocSubProcess, Transaction
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { exportToBpmnXml } from '../BpmnXmlExporter.js'
import { importFromBpmnXml } from '../BpmnXmlImporter.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData } from '../../types/graph.js'

function makeGraph(nodes: FlowGraph['nodes'] = [], edges: FlowGraph['edges'] = []): FlowGraph {
  return { nodes, edges }
}

describe('BPMN 2.0 Elements', () => {
  describe('MessageEvent', () => {
    it('exports messageEvent with messageEventDefinition', () => {
      const graph = makeGraph([{
        id: 'msg1',
        shape: 'bpmn-messageEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.MessageEvent, label: 'Wait for Msg', messageRef: 'msg-order' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:intermediateCatchEvent id="msg1" name="Wait for Msg">')
      expect(xml).toContain('<bpmn:messageEventDefinition id="MsgDef_msg1" messageRef="msg-order" />')
      expect(xml).toContain('</bpmn:intermediateCatchEvent>')
    })

    it('imports messageEvent from XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="msg1" name="Wait">
      <bpmn:messageEventDefinition id="MsgDef_msg1" messageRef="msg-order" />
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      expect(graph.nodes).toHaveLength(1)
      expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.MessageEvent)
      expect(graph.nodes[0].data.messageRef).toBe('msg-order')
    })

    it('round-trip preserves messageRef', () => {
      const original = makeGraph([{
        id: 'msg1', shape: 'bpmn-messageEvent', x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.MessageEvent, label: 'Wait', messageRef: 'msg-order' },
      }])
      const xml = exportToBpmnXml(original)
      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.MessageEvent)
      expect(restored.nodes[0].data.messageRef).toBe('msg-order')
    })
  })

  describe('SignalEvent', () => {
    it('exports signalEvent with signalEventDefinition', () => {
      const graph = makeGraph([{
        id: 'sig1',
        shape: 'bpmn-signalEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.SignalEvent, label: 'Signal', signalRef: 'sig-cancel' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:intermediateCatchEvent id="sig1" name="Signal">')
      expect(xml).toContain('<bpmn:signalEventDefinition id="SigDef_sig1" signalRef="sig-cancel" />')
    })

    it('imports signalEvent from XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="sig1" name="Cancel">
      <bpmn:signalEventDefinition id="SigDef_sig1" signalRef="sig-cancel" />
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.SignalEvent)
      expect(graph.nodes[0].data.signalRef).toBe('sig-cancel')
    })
  })

  describe('ConditionalEvent', () => {
    it('exports conditionalEvent with condition', () => {
      const graph = makeGraph([{
        id: 'cond1',
        shape: 'bpmn-conditionalEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.ConditionalEvent, label: 'Check', conditionExpression: 'amount > 100' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:conditionalEventDefinition id="CondDef_cond1">')
      expect(xml).toContain('<bpmn:condition xsi:type="bpmn:tFormalExpression">amount &gt; 100</bpmn:condition>')
    })

    it('imports conditionalEvent from XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="cond1" name="Check">
      <bpmn:conditionalEventDefinition id="CondDef_cond1">
        <bpmn:condition xsi:type="bpmn:tFormalExpression">amount > 100</bpmn:condition>
      </bpmn:conditionalEventDefinition>
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.ConditionalEvent)
      expect(graph.nodes[0].data.conditionExpression).toBe('amount > 100')
    })
  })

  describe('ErrorEvent', () => {
    it('exports errorEvent as boundaryEvent', () => {
      const graph = makeGraph([{
        id: 'err1',
        shape: 'bpmn-errorEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.ErrorEvent, label: 'Error', errorCode: 'ERR_001', attachedToRef: 'task1' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:boundaryEvent id="err1" name="Error" attachedToRef="task1">')
      expect(xml).toContain('<bpmn:errorEventDefinition id="ErrDef_err1" errorCode="ERR_001" />')
    })

    it('imports errorEvent from boundaryEvent XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="Task" />
    <bpmn:boundaryEvent id="err1" name="Error" attachedToRef="task1">
      <bpmn:errorEventDefinition id="ErrDef_err1" errorCode="ERR_001" />
    </bpmn:boundaryEvent>
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      const errNode = graph.nodes.find(n => n.id === 'err1')!
      expect(errNode.data.bpmnType).toBe(BpmnElementType.ErrorEvent)
      expect(errNode.data.errorCode).toBe('ERR_001')
      expect(errNode.data.attachedToRef).toBe('task1')
    })
  })

  describe('EscalationEvent', () => {
    it('exports escalationEvent as boundaryEvent', () => {
      const graph = makeGraph([{
        id: 'esc1',
        shape: 'bpmn-escalationEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.EscalationEvent, label: 'Esc', escalationCode: 'ESC_001' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:boundaryEvent id="esc1" name="Esc">')
      expect(xml).toContain('<bpmn:escalationEventDefinition id="EscDef_esc1" escalationCode="ESC_001" />')
    })
  })

  describe('CompensationEvent', () => {
    it('exports compensationEvent', () => {
      const graph = makeGraph([{
        id: 'comp1',
        shape: 'bpmn-compensationEvent',
        x: 100, y: 200, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.CompensationEvent, label: 'Compensate' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:compensationEventDefinition id="CompDef_comp1" />')
    })
  })

  describe('CallActivity', () => {
    it('exports callActivity', () => {
      const graph = makeGraph([{
        id: 'call1',
        shape: 'bpmn-callActivity',
        x: 200, y: 100, width: 160, height: 80,
        data: { bpmnType: BpmnElementType.CallActivity, label: 'Call External', callActivityDefinitionId: 'ext-def-1' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:callActivity id="call1" name="Call External">')
      expect(xml).toContain('&quot;callActivityDefinitionId&quot;:&quot;ext-def-1&quot;')
    })

    it('imports callActivity', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:callActivity id="call1" name="External" />
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.CallActivity)
    })
  })

  describe('BusinessRuleTask', () => {
    it('exports businessRuleTask', () => {
      const graph = makeGraph([{
        id: 'br1',
        shape: 'bpmn-businessRuleTask',
        x: 200, y: 100, width: 160, height: 80,
        data: { bpmnType: BpmnElementType.BusinessRuleTask, label: 'Evaluate', ruleRef: 'score >= 90', resultVariable: 'grade' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:businessRuleTask id="br1" name="Evaluate">')
    })

    it('imports businessRuleTask', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:businessRuleTask id="br1" name="Evaluate" />
  </bpmn:process>
</bpmn:definitions>`
      const graph = importFromBpmnXml(xml)
      expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.BusinessRuleTask)
    })
  })

  describe('ManualTask', () => {
    it('exports and imports manualTask', () => {
      const graph = makeGraph([{
        id: 'mt1',
        shape: 'bpmn-manualTask',
        x: 200, y: 100, width: 160, height: 80,
        data: { bpmnType: BpmnElementType.ManualTask, label: 'Manual Work' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:manualTask id="mt1" name="Manual Work" />')

      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.ManualTask)
    })
  })

  describe('EventBasedGateway', () => {
    it('exports and imports eventBasedGateway', () => {
      const graph = makeGraph([{
        id: 'ebg1',
        shape: 'bpmn-eventBasedGateway',
        x: 200, y: 200, width: 40, height: 40,
        data: { bpmnType: BpmnElementType.EventBasedGateway, label: 'Event GW' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:eventBasedGateway id="ebg1" name="Event GW" />')

      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.EventBasedGateway)
    })
  })

  describe('ComplexGateway', () => {
    it('exports and imports complexGateway', () => {
      const graph = makeGraph([{
        id: 'cg1',
        shape: 'bpmn-complexGateway',
        x: 200, y: 200, width: 40, height: 40,
        data: { bpmnType: BpmnElementType.ComplexGateway, label: 'Complex GW' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:complexGateway id="cg1" name="Complex GW" />')

      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.ComplexGateway)
    })
  })

  describe('AdHocSubProcess', () => {
    it('exports and imports adHocSubProcess', () => {
      const graph = makeGraph([{
        id: 'adhoc1',
        shape: 'bpmn-adHocSubProcess',
        x: 50, y: 50, width: 300, height: 200,
        data: { bpmnType: BpmnElementType.AdHocSubProcess, label: 'Ad Hoc' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:adHocSubProcess id="adhoc1" name="Ad Hoc">')

      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.AdHocSubProcess)
    })
  })

  describe('Transaction', () => {
    it('exports and imports transaction', () => {
      const graph = makeGraph([{
        id: 'tx1',
        shape: 'bpmn-transaction',
        x: 50, y: 50, width: 300, height: 200,
        data: { bpmnType: BpmnElementType.Transaction, label: 'TX' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:transaction id="tx1" name="TX">')

      const restored = importFromBpmnXml(xml)
      expect(restored.nodes[0].data.bpmnType).toBe(BpmnElementType.Transaction)
    })
  })

  describe('all 25 element types supported', () => {
    it('has DEFAULT_NODE_SIZES and DEFAULT_NODE_CONFIGS for every BpmnElementType', async () => {
      const { DEFAULT_NODE_SIZES, DEFAULT_NODE_CONFIGS } = await import('../constants.js')
      const allTypes = Object.values(BpmnElementType)
      for (const type of allTypes) {
        expect(DEFAULT_NODE_SIZES[type], `Missing size for ${type}`).toBeDefined()
        expect(DEFAULT_NODE_SIZES[type].width).toBeGreaterThan(0)
        expect(DEFAULT_NODE_SIZES[type].height).toBeGreaterThan(0)
        expect(DEFAULT_NODE_CONFIGS[type], `Missing config for ${type}`).toBeDefined()
        expect(DEFAULT_NODE_CONFIGS[type].label).toBeDefined()
      }
    })
  })

  describe('round-trip with all new element types', () => {
    it('preserves all new element types through export -> import', () => {
      const nodes: FlowNodeData[] = [
        { id: 'msg1', shape: 'bpmn-messageEvent', x: 0, y: 0, width: 36, height: 36, data: { bpmnType: BpmnElementType.MessageEvent, label: 'Msg', messageRef: 'msg-1' } },
        { id: 'sig1', shape: 'bpmn-signalEvent', x: 50, y: 0, width: 36, height: 36, data: { bpmnType: BpmnElementType.SignalEvent, label: 'Sig', signalRef: 'sig-1' } },
        { id: 'cond1', shape: 'bpmn-conditionalEvent', x: 100, y: 0, width: 36, height: 36, data: { bpmnType: BpmnElementType.ConditionalEvent, label: 'Cond', conditionExpression: 'x > 0' } },
        { id: 'err1', shape: 'bpmn-errorEvent', x: 150, y: 0, width: 36, height: 36, data: { bpmnType: BpmnElementType.ErrorEvent, label: 'Err', errorCode: 'E1', attachedToRef: 'task1' } },
        { id: 'call1', shape: 'bpmn-callActivity', x: 200, y: 0, width: 160, height: 80, data: { bpmnType: BpmnElementType.CallActivity, label: 'Call', callActivityDefinitionId: 'def-1' } },
        { id: 'br1', shape: 'bpmn-businessRuleTask', x: 400, y: 0, width: 160, height: 80, data: { bpmnType: BpmnElementType.BusinessRuleTask, label: 'BR', ruleRef: 'x > 0', resultVariable: 'r' } },
        { id: 'mt1', shape: 'bpmn-manualTask', x: 600, y: 0, width: 160, height: 80, data: { bpmnType: BpmnElementType.ManualTask, label: 'Manual' } },
        { id: 'ebg1', shape: 'bpmn-eventBasedGateway', x: 800, y: 0, width: 40, height: 40, data: { bpmnType: BpmnElementType.EventBasedGateway, label: 'EBG' } },
        { id: 'cg1', shape: 'bpmn-complexGateway', x: 900, y: 0, width: 40, height: 40, data: { bpmnType: BpmnElementType.ComplexGateway, label: 'CG' } },
      ]

      const graph = makeGraph(nodes)
      const xml = exportToBpmnXml(graph)
      const restored = importFromBpmnXml(xml)

      expect(restored.nodes).toHaveLength(nodes.length)

      const msgNode = restored.nodes.find(n => n.id === 'msg1')!
      expect(msgNode.data.bpmnType).toBe(BpmnElementType.MessageEvent)
      expect(msgNode.data.messageRef).toBe('msg-1')

      const sigNode = restored.nodes.find(n => n.id === 'sig1')!
      expect(sigNode.data.bpmnType).toBe(BpmnElementType.SignalEvent)
      expect(sigNode.data.signalRef).toBe('sig-1')

      const condNode = restored.nodes.find(n => n.id === 'cond1')!
      expect(condNode.data.bpmnType).toBe(BpmnElementType.ConditionalEvent)
      expect(condNode.data.conditionExpression).toBe('x > 0')

      const errNode = restored.nodes.find(n => n.id === 'err1')!
      expect(errNode.data.bpmnType).toBe(BpmnElementType.ErrorEvent)
      expect(errNode.data.errorCode).toBe('E1')
      expect(errNode.data.attachedToRef).toBe('task1')

      const callNode = restored.nodes.find(n => n.id === 'call1')!
      expect(callNode.data.bpmnType).toBe(BpmnElementType.CallActivity)
      expect(callNode.data.callActivityDefinitionId).toBe('def-1')

      const brNode = restored.nodes.find(n => n.id === 'br1')!
      expect(brNode.data.bpmnType).toBe(BpmnElementType.BusinessRuleTask)

      const mtNode = restored.nodes.find(n => n.id === 'mt1')!
      expect(mtNode.data.bpmnType).toBe(BpmnElementType.ManualTask)

      const ebgNode = restored.nodes.find(n => n.id === 'ebg1')!
      expect(ebgNode.data.bpmnType).toBe(BpmnElementType.EventBasedGateway)

      const cgNode = restored.nodes.find(n => n.id === 'cg1')!
      expect(cgNode.data.bpmnType).toBe(BpmnElementType.ComplexGateway)
    })
  })
})
