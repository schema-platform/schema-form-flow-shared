/** 流程节点数据请求配置（对齐 editor SchemaApiConfig） */
export interface FlowApiConfig {
  url: string
  method?: 'get' | 'post'
  params?: Record<string, unknown>
  headers?: Record<string, string>
  body?: Record<string, unknown>
  timeout?: number
  dataPath?: string
  ttl?: number
  immediate?: boolean
  cacheLevel?: 'memory' | 'indexeddb' | 'both'
  enableRetry?: boolean
  retryCount?: number
}
