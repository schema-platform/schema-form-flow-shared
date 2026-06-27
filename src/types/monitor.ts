/** 流程监控仪表盘数据类型 */

/** 按状态分组的实例统计 */
export interface FlowMonitorStats {
  total: number
  running: number
  completed: number
  terminated: number
  suspended: number
  failed: number
}

/** 带占比的状态统计 */
export interface FlowMonitorStatsWithPercent extends FlowMonitorStats {
  runningPct: number
  completedPct: number
  terminatedPct: number
  suspendedPct: number
  failedPct: number
}

/** 时间范围筛选参数 */
export type TimeRangePreset = 'today' | 'week' | 'month' | 'custom'

export interface FlowMonitorTimeRange {
  preset: TimeRangePreset
  startDate?: string
  endDate?: string
}

/** 平均审批时长（毫秒） */
export interface FlowMonitorAvgDuration {
  avgDuration: number
}

/** 单个节点的统计信息 */
export interface FlowMonitorNodeStat {
  nodeId: string
  nodeName: string
  count: number
  avgDuration: number
}

/** 趋势图数据点 */
export interface FlowMonitorTrendPoint {
  date: string
  count: number
}

/** 热门流程 Top N */
export interface FlowMonitorTopFlow {
  definitionId: string
  flowName: string
  count: number
}

/** 监控仪表盘完整数据 */
export interface FlowMonitorDashboard {
  stats: FlowMonitorStats
  avgDuration: number
  nodeStats: FlowMonitorNodeStat[]
  trend: FlowMonitorTrendPoint[]
  topFlows: FlowMonitorTopFlow[]
}
