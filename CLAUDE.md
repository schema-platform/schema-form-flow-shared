# schema-form-flow-shared

`@schema-platform/flow-shared` — 流程引擎共享层，BPMN 类型定义、图数据结构、执行模型、表达式求值。

## 项目规则

### 技术栈
- TypeScript 纯逻辑库（无 UI 依赖）
- 前后端共用

### 架构规则
- **纯类型与逻辑**：只包含类型定义、引擎核心、表达式求值，不含任何 UI 代码
- **零外部 UI 依赖**：禁止引入 Vue、Element Plus 等前端框架
- **API 稳定性**：作为共享包，导出接口变更需考虑下游（flow-web、server）兼容性

### 导出结构
- `engine/` — BPMN 引擎核心
- `types/` — 类型定义

## 迭代规则

- **禁止回滚 git**，渐进式推进
- 类型变更需同步通知下游消费者（flow-web、server）
- 新增节点类型需完整实现：类型定义 + 执行逻辑 + 表达式支持

## 常用命令

```bash
pnpm build    # tsc 编译
pnpm test     # vitest run
```
