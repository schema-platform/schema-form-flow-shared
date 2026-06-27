import { describe, it, expect } from 'vitest'
import { exportToBpmnXml } from '../BpmnXmlExporter.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData } from '../../types/graph.js'

function makeGraph(nodes: FlowGraph['nodes'] = [], edges: FlowGraph['edges'] = []): FlowGraph {
  return { nodes, edges }
}

describe('exportToBpmnXml', () => {
  it('exports a minimal graph with header and process element', () => {
    const xml = exportToBpmnXml(makeGraph())
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<bpmn:definitions')
    expect(xml).toContain('<bpmn:process id="Process_1"')
    expect(xml).toContain('</bpmn:process>')
    expect(xml).toContain('</bpmn:definitions>')
  })

  it('exports startEvent as self-closing tag', () => {
    const graph = makeGraph([{
      id: 'start1',
      shape: 'bpmn-startEvent',
      x: 100,
      y: 200,
      width: 36,
      height: 36,
      data: { bpmnType: BpmnElementType.StartEvent, label: 'Start' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:startEvent id="start1" name="Start" />')
  })

  it('exports endEvent as self-closing tag', () => {
    const graph = makeGraph([{
      id: 'end1',
      shape: 'bpmn-endEvent',
      x: 300,
      y: 200,
      width: 36,
      height: 36,
      data: { bpmnType: BpmnElementType.EndEvent, label: 'End' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:endEvent id="end1" name="End" />')
  })

  it('exports userTask as self-closing tag', () => {
    const graph = makeGraph([{
      id: 'task1',
      shape: 'bpmn-userTask',
      x: 200,
      y: 100,
      width: 160,
      height: 80,
      data: { bpmnType: BpmnElementType.UserTask, label: 'Review' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:userTask id="task1" name="Review" />')
  })

  it('exports exclusiveGateway as self-closing tag', () => {
    const graph = makeGraph([{
      id: 'gw1',
      shape: 'bpmn-exclusiveGateway',
      x: 200,
      y: 200,
      width: 40,
      height: 40,
      data: { bpmnType: BpmnElementType.ExclusiveGateway, label: 'Decision' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:exclusiveGateway id="gw1" name="Decision" />')
  })

  it('exports timerEvent with timerEventDefinition', () => {
    const graph = makeGraph([{
      id: 'timer1',
      shape: 'bpmn-timerEvent',
      x: 100,
      y: 300,
      width: 36,
      height: 36,
      data: { bpmnType: BpmnElementType.TimerEvent, label: 'Wait', timerType: 'duration', timerValue: 'PT5M' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:intermediateCatchEvent id="timer1" name="Wait">')
    expect(xml).toContain('<bpmn:timerEventDefinition id="TimerDef_timer1">')
    expect(xml).toContain('<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT5M</bpmn:timeDuration>')
    expect(xml).toContain('</bpmn:intermediateCatchEvent>')
  })

  it('exports timerEvent with timeDate', () => {
    const graph = makeGraph([{
      id: 'timer2',
      shape: 'bpmn-timerEvent',
      x: 100,
      y: 300,
      width: 36,
      height: 36,
      data: { bpmnType: BpmnElementType.TimerEvent, label: 'Deadline', timerType: 'date', timerValue: '2026-06-01T00:00:00Z' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:timeDate xsi:type="bpmn:tFormalExpression">2026-06-01T00:00:00Z</bpmn:timeDate>')
  })

  it('exports timerEvent with timeCycle', () => {
    const graph = makeGraph([{
      id: 'timer3',
      shape: 'bpmn-timerEvent',
      x: 100,
      y: 300,
      width: 36,
      height: 36,
      data: { bpmnType: BpmnElementType.TimerEvent, label: 'Repeat', timerType: 'cycle', timerValue: 'R3/PT1H' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:timeCycle xsi:type="bpmn:tFormalExpression">R3/PT1H</bpmn:timeCycle>')
  })

  it('exports subProcess as empty container', () => {
    const graph = makeGraph([{
      id: 'sub1',
      shape: 'bpmn-subProcess',
      x: 50,
      y: 50,
      width: 300,
      height: 200,
      data: { bpmnType: BpmnElementType.SubProcess, label: 'Sub' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:subProcess id="sub1" name="Sub">')
    expect(xml).toContain('</bpmn:subProcess>')
  })

  it('exports sequenceFlow edges', () => {
    const graph = makeGraph([], [{
      id: 'edge1',
      shape: 'smoothstep',
      source: { cell: 'start1' },
      target: { cell: 'end1' },
      data: {},
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:sequenceFlow id="edge1" sourceRef="start1" targetRef="end1" />')
  })

  it('exports sequenceFlow with conditionExpression', () => {
    const graph = makeGraph([], [{
      id: 'edge1',
      shape: 'smoothstep',
      source: { cell: 'gw1' },
      target: { cell: 'task1' },
      data: { conditionExpression: '${amount > 1000}' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmn:sequenceFlow id="edge1" sourceRef="gw1" targetRef="task1">')
    expect(xml).toContain('<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${amount &gt; 1000}</bpmn:conditionExpression>')
    expect(xml).toContain('</bpmn:sequenceFlow>')
  })

  it('escapes XML special characters in labels', () => {
    const graph = makeGraph([{
      id: 'task1',
      shape: 'bpmn-userTask',
      x: 0,
      y: 0,
      width: 160,
      height: 80,
      data: { bpmnType: BpmnElementType.UserTask, label: 'Task <with> "special" & chars' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('name="Task &lt;with&gt; &quot;special&quot; &amp; chars"')
  })

  it('includes DI shapes with bounds', () => {
    const graph = makeGraph([{
      id: 'task1',
      shape: 'bpmn-userTask',
      x: 200,
      y: 100,
      width: 160,
      height: 80,
      data: { bpmnType: BpmnElementType.UserTask, label: 'Task' },
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmndi:BPMNShape id="Shape_task1" bpmnElement="task1">')
    expect(xml).toContain('<dc:Bounds x="200" y="100" width="160" height="80" />')
  })

  it('includes DI edges', () => {
    const graph = makeGraph([], [{
      id: 'edge1',
      shape: 'smoothstep',
      source: { cell: 'a' },
      target: { cell: 'b' },
      data: {},
    }])
    const xml = exportToBpmnXml(graph)
    expect(xml).toContain('<bpmndi:BPMNEdge id="Edge_edge1" bpmnElement="edge1">')
  })

  it('supports custom processId and processName', () => {
    const xml = exportToBpmnXml(makeGraph(), 'MyProcess', 'My Process')
    expect(xml).toContain('<bpmn:process id="MyProcess" name="My Process"')
    expect(xml).toContain('bpmnElement="MyProcess"')
  })

  it('exports a complete graph with multiple node types and edges', () => {
    const graph: FlowGraph = {
      nodes: [
        { id: 'start', shape: 'bpmn-startEvent', x: 100, y: 200, width: 36, height: 36, data: { bpmnType: BpmnElementType.StartEvent, label: 'Begin' } },
        { id: 'task1', shape: 'bpmn-userTask', x: 200, y: 180, width: 160, height: 80, data: { bpmnType: BpmnElementType.UserTask, label: 'Do Work' } },
        { id: 'gw', shape: 'bpmn-exclusiveGateway', x: 420, y: 200, width: 40, height: 40, data: { bpmnType: BpmnElementType.ExclusiveGateway, label: 'Check' } },
        { id: 'end', shape: 'bpmn-endEvent', x: 520, y: 200, width: 36, height: 36, data: { bpmnType: BpmnElementType.EndEvent, label: 'Done' } },
      ],
      edges: [
        { id: 'e1', shape: 'smoothstep', source: { cell: 'start' }, target: { cell: 'task1' }, data: {} },
        { id: 'e2', shape: 'smoothstep', source: { cell: 'task1' }, target: { cell: 'gw' }, data: {} },
        { id: 'e3', shape: 'smoothstep', source: { cell: 'gw' }, target: { cell: 'end' }, data: { conditionExpression: '${approved}' } },
      ],
    }
    const xml = exportToBpmnXml(graph)

    // All elements present
    expect(xml).toContain('<bpmn:startEvent id="start"')
    expect(xml).toContain('<bpmn:userTask id="task1"')
    expect(xml).toContain('<bpmn:exclusiveGateway id="gw"')
    expect(xml).toContain('<bpmn:endEvent id="end"')

    // All edges present
    expect(xml).toContain('id="e1" sourceRef="start" targetRef="task1"')
    expect(xml).toContain('id="e2" sourceRef="task1" targetRef="gw"')
    expect(xml).toContain('id="e3" sourceRef="gw" targetRef="end"')
    expect(xml).toContain('${approved}')

    // All DI shapes present
    expect(xml).toContain('bpmnElement="start"')
    expect(xml).toContain('bpmnElement="task1"')
    expect(xml).toContain('bpmnElement="gw"')
    expect(xml).toContain('bpmnElement="end"')
  })

  it('skips nodes with unknown bpmnType from process elements', () => {
    const graph = makeGraph([{
      id: 'unknown1',
      shape: 'custom',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      data: { bpmnType: 'unknownType' as BpmnElementType, label: 'Unknown' },
    }])
    const xml = exportToBpmnXml(graph)
    // The node should not appear in the process section as a BPMN element
    expect(xml).not.toMatch(/<bpmn:\w+ id="unknown1"/)
  })

  describe('extension elements', () => {
    it('includes sf namespace in definitions', () => {
      const xml = exportToBpmnXml(makeGraph())
      expect(xml).toContain('xmlns:sf="http://schema-form.io/schema/bpmn"')
    })

    it('omits extension elements when node has no extra config', () => {
      const graph = makeGraph([{
        id: 'start1',
        shape: 'bpmn-startEvent',
        x: 0, y: 0, width: 36, height: 36,
        data: { bpmnType: BpmnElementType.StartEvent, label: 'Start' },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).not.toContain('extensionElements')
      // Should remain self-closing
      expect(xml).toContain('<bpmn:startEvent id="start1" name="Start" />')
    })

    it('exports userTask with rich config as extension elements', () => {
      const graph = makeGraph([{
        id: 'task1',
        shape: 'bpmn-userTask',
        x: 200, y: 100, width: 160, height: 80,
        data: {
          bpmnType: BpmnElementType.UserTask,
          label: '审批',
          assigneeType: 'user',
          candidateUsers: ['u1', 'u2'],
          approvalMode: 'single',
          formSchemaId: 'form-abc',
          formMode: 'edit',
        },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('<bpmn:extensionElements>')
      expect(xml).toContain('<sf:nodeConfig>')
      expect(xml).toContain('</sf:nodeConfig>')
      expect(xml).toContain('</bpmn:extensionElements>')
      // Verify the JSON content contains the config (XML-escaped quotes)
      expect(xml).toContain('&quot;assigneeType&quot;:&quot;user&quot;')
      expect(xml).toContain('&quot;formSchemaId&quot;:&quot;form-abc&quot;')
      expect(xml).toContain('&quot;approvalMode&quot;:&quot;single&quot;')
      // bpmnType and label should NOT be in the extension
      expect(xml).not.toMatch(/<sf:nodeConfig>.*&quot;bpmnType&quot;.*<\/sf:nodeConfig>/)
    })

    it('exports gateway with gatewayDirection', () => {
      const graph = makeGraph([{
        id: 'gw1',
        shape: 'bpmn-exclusiveGateway',
        x: 400, y: 200, width: 40, height: 40,
        data: {
          bpmnType: BpmnElementType.ExclusiveGateway,
          label: 'Decision',
          gatewayDirection: 'diverging',
          defaultFlow: 'flow-yes',
        },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('&quot;gatewayDirection&quot;:&quot;diverging&quot;')
      expect(xml).toContain('&quot;defaultFlow&quot;:&quot;flow-yes&quot;')
    })

    it('exports timerEvent with both timer definition and extension config', () => {
      const graph = makeGraph([{
        id: 'timer1',
        shape: 'bpmn-timerEvent',
        x: 100, y: 300, width: 36, height: 36,
        data: {
          bpmnType: BpmnElementType.TimerEvent,
          label: 'Wait',
          timerType: 'duration',
          timerValue: 'PT5M',
          documentation: 'Wait 5 minutes before proceeding',
        },
      }])
      const xml = exportToBpmnXml(graph)
      // Standard timer definition preserved
      expect(xml).toContain('<bpmn:timerEventDefinition')
      expect(xml).toContain('<bpmn:timeDuration')
      // Extension elements for extra config
      expect(xml).toContain('<sf:nodeConfig>')
      expect(xml).toContain('&quot;documentation&quot;:&quot;Wait 5 minutes before proceeding&quot;')
      // timerType/timerValue should NOT be duplicated in extension
      expect(xml).not.toMatch(/<sf:nodeConfig>.*&quot;timerType&quot;.*<\/sf:nodeConfig>/)
    })

    it('exports subProcess with subProcessDefinitionId', () => {
      const graph = makeGraph([{
        id: 'sub1',
        shape: 'bpmn-subProcess',
        x: 50, y: 50, width: 300, height: 200,
        data: {
          bpmnType: BpmnElementType.SubProcess,
          label: 'Sub',
          subProcessDefinitionId: 'sub-def-123',
        },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('&quot;subProcessDefinitionId&quot;:&quot;sub-def-123&quot;')
    })

    it('exports serviceTask with apiConfig', () => {
      const graph = makeGraph([{
        id: 'svc1',
        shape: 'bpmn-serviceTask',
        x: 200, y: 200, width: 160, height: 80,
        data: {
          bpmnType: BpmnElementType.ServiceTask,
          label: 'Call API',
          serviceType: 'http',
          apiConfig: {
            url: 'https://api.example.com/submit',
            method: 'post',
            timeout: 5000,
          },
        },
      }])
      const xml = exportToBpmnXml(graph)
      expect(xml).toContain('&quot;serviceType&quot;:&quot;http&quot;')
      expect(xml).toContain('&quot;url&quot;:&quot;https://api.example.com/submit&quot;')
    })

    it('properly escapes XML special characters in JSON content', () => {
      const graph = makeGraph([{
        id: 'task1',
        shape: 'bpmn-userTask',
        x: 0, y: 0, width: 160, height: 80,
        data: {
          bpmnType: BpmnElementType.UserTask,
          label: 'Task',
          documentation: 'Use <b>bold</b> & "quotes"',
        },
      }])
      const xml = exportToBpmnXml(graph)
      // The JSON string itself should be XML-escaped
      expect(xml).toContain('&lt;b&gt;bold&lt;/b&gt;')
      expect(xml).toContain('&amp;')
      expect(xml).toContain('&quot;')
    })
  })
})
