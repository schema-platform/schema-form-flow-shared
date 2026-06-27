# @schema-form/flow-shared

Schema Form Flow 流程引擎共享层，提供 BPMN 类型定义、图数据结构、执行模型和表达式求值。

## 安装

```bash
npm install @schema-form/flow-shared
```

## 主要内容

### 类型定义（types）
- `FlowNodeData` - 流程节点数据
- `FlowEdgeData` - 流程边数据
- `FlowGraph` - 流程图结构
- `BpmnElementType` - BPMN 元素类型枚举

### 引擎（engine）
- `FlowEngine` - 流程执行引擎
- Token 执行模型
- 表达式求值器

## 使用

```typescript
// 类型
import type { FlowNodeData, FlowEdgeData, FlowGraph } from '@schema-form/flow-shared/types'
import { BpmnElementType } from '@schema-form/flow-shared/types'

// 引擎
import { FlowEngine } from '@schema-form/flow-shared/engine'

const engine = new FlowEngine(flowDefinition)
const result = await engine.execute(inputData)
```

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 测试
pnpm test
```

## 许可证

MIT
