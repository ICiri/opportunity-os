export type ChartSpec = {
  type: 'line' | 'bar' | 'funnel' | 'pie' | 'metric';
  min?: number;
  max?: number;
  categories?: number;
  dualAxis?: boolean;
  context?: string;
};
export function lintChart(chart: ChartSpec) {
  const findings: string[] = [];
  if (chart.type === 'bar' && chart.min && chart.min > 0) findings.push('TRUNCATED_BAR_AXIS');
  if (chart.type === 'pie' && (chart.categories ?? 0) > 5) findings.push('TOO_MANY_PIE_CATEGORIES');
  if (chart.dualAxis) findings.push('DUAL_AXIS_REQUIRES_JUSTIFICATION');
  if (!chart.context) findings.push('MISSING_DECISION_CONTEXT');
  return findings;
}
