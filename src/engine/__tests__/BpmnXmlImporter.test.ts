// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { importFromBpmnXml } from '../BpmnXmlImporter.js'
import { exportToBpmnXml } from '../BpmnXmlExporter.js'
import { BpmnElementType } from '../../types/bpmn.js'
import type { FlowGraph, FlowNodeData } from '../../types/graph.js'

const MINIMAL_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Test" isExecutable="true">
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

describe('importFromBpmnXml', () => {
  it('parses a minimal BPMN with no elements', () => {
    const graph = importFromBpmnXml(MINIMAL_BPMN)
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('throws on invalid XML', () => {
    expect(() => importFromBpmnXml('<invalid')).toThrow('Invalid XML')
  })

  it('throws when no bpmn:process is found', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
</bpmn:definitions>`
    expect(() => importFromBpmnXml(xml)).toThrow('No bpmn:process found')
  })

  it('parses a startEvent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="start1" name="Begin" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Shape_start1" bpmnElement="start1">
        <dc:Bounds x="100" y="200" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].id).toBe('start1')
    expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.StartEvent)
    expect(graph.nodes[0].data.label).toBe('Begin')
    expect(graph.nodes[0].x).toBe(100)
    expect(graph.nodes[0].y).toBe(200)
    expect(graph.nodes[0].width).toBe(36)
    expect(graph.nodes[0].height).toBe(36)
  })

  it('parses userTask', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="Review" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Shape_task1" bpmnElement="task1">
        <dc:Bounds x="200" y="100" width="160" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.UserTask)
    expect(graph.nodes[0].data.label).toBe('Review')
  })

  it('parses timerEvent with timeDuration', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="timer1" name="Wait">
      <bpmn:timerEventDefinition id="TimerDef_timer1">
        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT5M</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.TimerEvent)
    expect(graph.nodes[0].data.label).toBe('Wait')
    expect(graph.nodes[0].data.timerType).toBe('duration')
    expect(graph.nodes[0].data.timerValue).toBe('PT5M')
  })

  it('parses timerEvent with timeDate', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="timer1" name="Deadline">
      <bpmn:timerEventDefinition id="TimerDef_timer1">
        <bpmn:timeDate>2026-06-01T00:00:00Z</bpmn:timeDate>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.timerType).toBe('date')
    expect(graph.nodes[0].data.timerValue).toBe('2026-06-01T00:00:00Z')
  })

  it('parses timerEvent with timeCycle', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="timer1" name="Repeat">
      <bpmn:timerEventDefinition id="TimerDef_timer1">
        <bpmn:timeCycle>R3/PT1H</bpmn:timeCycle>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.timerType).toBe('cycle')
    expect(graph.nodes[0].data.timerValue).toBe('R3/PT1H')
  })

  it('parses sequenceFlow', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="start1" />
    <bpmn:endEvent id="end1" />
    <bpmn:sequenceFlow id="flow1" sourceRef="start1" targetRef="end1" />
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].id).toBe('flow1')
    expect(graph.edges[0].source.cell).toBe('start1')
    expect(graph.edges[0].target.cell).toBe('end1')
  })

  it('parses sequenceFlow with conditionExpression', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:exclusiveGateway id="gw1" />
    <bpmn:endEvent id="end1" />
    <bpmn:sequenceFlow id="flow1" sourceRef="gw1" targetRef="end1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${approved}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].data.conditionExpression).toBe('${approved}')
  })

  it('parses sequenceFlow with name as label', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:sequenceFlow id="flow1" name="Yes" sourceRef="a" targetRef="b" />
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.edges[0].data.label).toBe('Yes')
  })

  it('skips unknown element types', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="start1" />
    <bpmn:dataObject id="do1" name="Data" />
    <bpmn:endEvent id="end1" />
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes.map((n) => n.id)).toEqual(['start1', 'end1'])
  })

  it('uses default size when DI shape is missing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="Task" />
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].x).toBe(0)
    expect(graph.nodes[0].y).toBe(0)
    expect(graph.nodes[0].width).toBe(160)
    expect(graph.nodes[0].height).toBe(80)
  })

  it('parses all supported BPMN element types', () => {
    const elements = [
      { tag: 'bpmn:startEvent', type: BpmnElementType.StartEvent },
      { tag: 'bpmn:endEvent', type: BpmnElementType.EndEvent },
      { tag: 'bpmn:userTask', type: BpmnElementType.UserTask },
      { tag: 'bpmn:serviceTask', type: BpmnElementType.ServiceTask },
      { tag: 'bpmn:scriptTask', type: BpmnElementType.ScriptTask },
      { tag: 'bpmn:sendTask', type: BpmnElementType.SendTask },
      { tag: 'bpmn:receiveTask', type: BpmnElementType.ReceiveTask },
      { tag: 'bpmn:exclusiveGateway', type: BpmnElementType.ExclusiveGateway },
      { tag: 'bpmn:parallelGateway', type: BpmnElementType.ParallelGateway },
      { tag: 'bpmn:inclusiveGateway', type: BpmnElementType.InclusiveGateway },
      { tag: 'bpmn:intermediateCatchEvent', type: BpmnElementType.TimerEvent },
      { tag: 'bpmn:subProcess', type: BpmnElementType.SubProcess },
      { tag: 'bpmn:callActivity', type: BpmnElementType.CallActivity },
      { tag: 'bpmn:businessRuleTask', type: BpmnElementType.BusinessRuleTask },
      { tag: 'bpmn:manualTask', type: BpmnElementType.ManualTask },
      { tag: 'bpmn:eventBasedGateway', type: BpmnElementType.EventBasedGateway },
      { tag: 'bpmn:complexGateway', type: BpmnElementType.ComplexGateway },
      { tag: 'bpmn:adHocSubProcess', type: BpmnElementType.AdHocSubProcess },
      { tag: 'bpmn:transaction', type: BpmnElementType.Transaction },
    ]

    const xmlElements = elements
      .map((el, i) => `    <${el.tag} id="n${i}" name="Node${i}" />`)
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
${xmlElements}
  </bpmn:process>
</bpmn:definitions>`

    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(elements.length)
    for (let i = 0; i < elements.length; i++) {
      expect(graph.nodes[i].data.bpmnType).toBe(elements[i].type)
    }
  })
})

describe('importFromBpmnXml — extension elements', () => {
  it('parses sf:nodeConfig extension elements', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="审批">
      <bpmn:extensionElements>
        <sf:nodeConfig>{"assigneeType":"user","candidateUsers":["u1","u2"],"approvalMode":"single","formSchemaId":"form-abc"}</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes).toHaveLength(1)
    const data = graph.nodes[0].data
    expect(data.bpmnType).toBe(BpmnElementType.UserTask)
    expect(data.label).toBe('审批')
    expect(data.assigneeType).toBe('user')
    expect(data.candidateUsers).toEqual(['u1', 'u2'])
    expect(data.approvalMode).toBe('single')
    expect(data.formSchemaId).toBe('form-abc')
  })

  it('parses extension elements on gateway', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:exclusiveGateway id="gw1" name="Decision">
      <bpmn:extensionElements>
        <sf:nodeConfig>{"gatewayDirection":"diverging","defaultFlow":"flow-yes"}</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:exclusiveGateway>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.gatewayDirection).toBe('diverging')
    expect(graph.nodes[0].data.defaultFlow).toBe('flow-yes')
  })

  it('parses extension elements on timerEvent alongside timer definition', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:intermediateCatchEvent id="timer1" name="Wait">
      <bpmn:timerEventDefinition id="TimerDef_timer1">
        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT5M</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
      <bpmn:extensionElements>
        <sf:nodeConfig>{"documentation":"Wait before proceeding"}</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:intermediateCatchEvent>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    const data = graph.nodes[0].data
    expect(data.bpmnType).toBe(BpmnElementType.TimerEvent)
    expect(data.timerType).toBe('duration')
    expect(data.timerValue).toBe('PT5M')
    expect(data.documentation).toBe('Wait before proceeding')
  })

  it('handles missing extension elements gracefully', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="Task" />
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.UserTask)
    expect(graph.nodes[0].data.label).toBe('Task')
    expect(graph.nodes[0].data.assigneeType).toBeUndefined()
  })

  it('handles invalid JSON in extension elements gracefully', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:userTask id="task1" name="Task">
      <bpmn:extensionElements>
        <sf:nodeConfig>not valid json{</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.bpmnType).toBe(BpmnElementType.UserTask)
    expect(graph.nodes[0].data.label).toBe('Task')
  })

  it('parses extension elements with nested objects (serviceConfig, apiConfig, multiInstance)', () => {
    const apiConfig = { url: 'https://api.example.com', method: 'post', timeout: 5000 }
    const serviceConfig = { endpoint: '/webhook', retries: 3 }
    const multiInstance = { type: 'parallel', collection: '${userList}', elementVariable: 'assignee' }
    const configJson = JSON.stringify({
      serviceType: 'http',
      apiConfig,
      serviceConfig,
      multiInstance,
    })
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:serviceTask id="svc1" name="Call API">
      <bpmn:extensionElements>
        <sf:nodeConfig>${configJson}</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    const data = graph.nodes[0].data
    expect(data.serviceType).toBe('http')
    expect(data.apiConfig).toEqual(apiConfig)
    expect(data.serviceConfig).toEqual(serviceConfig)
    expect(data.multiInstance).toEqual(multiInstance)
  })

  it('parses extension elements on subProcess', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:sf="http://schema-form.io/schema/bpmn"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:subProcess id="sub1" name="Sub">
      <bpmn:extensionElements>
        <sf:nodeConfig>{"subProcessDefinitionId":"sub-def-123"}</sf:nodeConfig>
      </bpmn:extensionElements>
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>`
    const graph = importFromBpmnXml(xml)
    expect(graph.nodes[0].data.subProcessDefinitionId).toBe('sub-def-123')
  })
})

describe('importFromBpmnXml — round-trip', () => {
  it('preserves full node config through export → import cycle', () => {
    const original: FlowGraph = {
      nodes: [
        {
          id: 'start', shape: 'bpmn-startEvent', x: 100, y: 200, width: 36, height: 36,
          data: { bpmnType: BpmnElementType.StartEvent, label: 'Begin' },
        },
        {
          id: 'task1', shape: 'bpmn-userTask', x: 200, y: 180, width: 160, height: 80,
          data: {
            bpmnType: BpmnElementType.UserTask,
            label: '审批',
            assigneeType: 'user',
            candidateUsers: ['u1', 'u2'],
            approvalMode: 'single',
            formSchemaId: 'form-abc',
            formMode: 'edit',
            rejectPolicy: 'reject-on-any',
          },
        },
        {
          id: 'gw', shape: 'bpmn-exclusiveGateway', x: 420, y: 200, width: 40, height: 40,
          data: {
            bpmnType: BpmnElementType.ExclusiveGateway,
            label: 'Check',
            gatewayDirection: 'diverging',
            defaultFlow: 'e3',
          },
        },
        {
          id: 'timer1', shape: 'bpmn-timerEvent', x: 100, y: 300, width: 36, height: 36,
          data: {
            bpmnType: BpmnElementType.TimerEvent,
            label: 'Wait',
            timerType: 'duration',
            timerValue: 'PT5M',
          },
        },
        {
          id: 'end', shape: 'bpmn-endEvent', x: 520, y: 200, width: 36, height: 36,
          data: { bpmnType: BpmnElementType.EndEvent, label: 'Done' },
        },
      ],
      edges: [
        { id: 'e1', shape: 'smoothstep', source: { cell: 'start' }, target: { cell: 'task1' }, data: {} },
        { id: 'e2', shape: 'smoothstep', source: { cell: 'task1' }, target: { cell: 'gw' }, data: {} },
        { id: 'e3', shape: 'smoothstep', source: { cell: 'gw' }, target: { cell: 'end' }, data: { conditionExpression: '${approved}' } },
      ],
    }

    const xml = exportToBpmnXml(original)
    const restored = importFromBpmnXml(xml)

    expect(restored.nodes).toHaveLength(original.nodes.length)
    expect(restored.edges).toHaveLength(original.edges.length)

    // UserTask config preserved
    const task = restored.nodes.find((n) => n.id === 'task1')!
    expect(task.data.assigneeType).toBe('user')
    expect(task.data.candidateUsers).toEqual(['u1', 'u2'])
    expect(task.data.approvalMode).toBe('single')
    expect(task.data.formSchemaId).toBe('form-abc')
    expect(task.data.formMode).toBe('edit')
    expect(task.data.rejectPolicy).toBe('reject-on-any')

    // Gateway config preserved
    const gw = restored.nodes.find((n) => n.id === 'gw')!
    expect(gw.data.gatewayDirection).toBe('diverging')
    expect(gw.data.defaultFlow).toBe('e3')

    // Timer config preserved
    const timer = restored.nodes.find((n) => n.id === 'timer1')!
    expect(timer.data.timerType).toBe('duration')
    expect(timer.data.timerValue).toBe('PT5M')

    // Edge condition preserved
    const edge = restored.edges.find((e) => e.id === 'e3')!
    expect(edge.data.conditionExpression).toBe('${approved}')

    // Positions preserved
    for (const origNode of original.nodes) {
      const match = restored.nodes.find((n) => n.id === origNode.id)!
      expect(match.x).toBe(origNode.x)
      expect(match.y).toBe(origNode.y)
    }
  })

  it('preserves serviceTask with nested apiConfig through round-trip', () => {
    const original: FlowGraph = {
      nodes: [{
        id: 'svc1', shape: 'bpmn-serviceTask', x: 200, y: 200, width: 160, height: 80,
        data: {
          bpmnType: BpmnElementType.ServiceTask,
          label: 'Call API',
          serviceType: 'http',
          apiConfig: {
            url: 'https://api.example.com/submit',
            method: 'post',
            timeout: 5000,
            headers: { Authorization: 'Bearer token' },
          },
        },
      }],
      edges: [],
    }

    const xml = exportToBpmnXml(original)
    const restored = importFromBpmnXml(xml)

    const task = restored.nodes[0]
    expect(task.data.serviceType).toBe('http')
    expect(task.data.apiConfig).toEqual({
      url: 'https://api.example.com/submit',
      method: 'post',
      timeout: 5000,
      headers: { Authorization: 'Bearer token' },
    })
  })
})
