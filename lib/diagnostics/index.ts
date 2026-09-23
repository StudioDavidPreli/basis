export { TOOLS } from './types'
export type { ToolKey, ToolInput, Report, ReportRow, Cell, DiagnosticSeries, EntityFacts, WindowMs, DerivedFormat } from './types'
export { windowMs, clip, isoDate, normalizeWindow, windowDays, type Window } from './window'
import { summaryReport } from './summary'
import { relateReport } from './relate'
import { attributionReport } from './attribution'
import { modelReport } from './model'
import { qualityReport } from './quality'
import { anomaliesReport } from './anomalies'
import type { Report, ToolInput, ToolKey } from './types'

export function runTool(tool: ToolKey, input: ToolInput): Report {
  switch (tool) {
    case 'summary':
      return summaryReport(input)
    case 'relate':
      return relateReport(input)
    case 'attribution':
      return attributionReport(input)
    case 'model':
      return modelReport(input)
    case 'quality':
      return qualityReport(input)
    case 'anomalies':
      return anomaliesReport(input)
  }
}
