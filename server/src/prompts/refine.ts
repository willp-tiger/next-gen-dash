import type { InteractionEvent, MetricConfig } from '../../../shared/types.js';

export function buildRefinementPrompt(
  interactions: InteractionEvent[],
  currentMetrics: MetricConfig[]
): string {
  const currentIds = currentMetrics.map((m) => m.id);
  const interactionSummary = interactions.reduce<Record<string, number>>((acc, e) => {
    acc[e.metricId] = (acc[e.metricId] || 0) + 1;
    return acc;
  }, {});

  return `You are a dashboard refinement assistant. Analyze the user's interaction data and suggest ONE adjustment to their dashboard.

## Current Dashboard Metrics
${currentMetrics.map((m) => `- ${m.id} (${m.label}, position: ${m.position}, size: ${m.size})`).join('\n')}

## Interaction Summary (metricId: interaction count)
${Object.entries(interactionSummary).map(([id, count]) => `- ${id}: ${count} interactions`).join('\n')}

## Available Metrics Not on Dashboard
${['avg_wait_time', 'max_wait_time', 'queue_depth', 'staffing_ratio', 'sla_compliance', 'escalation_rate', 'first_contact_resolution', 'cost_per_ticket', 'csat_score', 'agent_utilization', 'abandon_rate', 'avg_handle_time']
  .filter((id) => !currentIds.includes(id))
  .map((id) => `- ${id}`)
  .join('\n') || '(none)'}

## Instructions
Suggest exactly ONE adjustment. Types:
- "add_metric": A metric not on the dashboard that the user seems interested in
- "promote_metric": A frequently interacted metric that deserves a larger size or higher position
- "adjust_threshold": A metric whose thresholds may need tuning based on usage patterns
- "remove_metric": A metric with zero or minimal interactions that may be clutter

Return ONLY valid JSON:
{
  "type": "add_metric" | "promote_metric" | "adjust_threshold" | "remove_metric",
  "metricId": "the metric id",
  "reason": "Brief explanation",
  "suggestedChange": { partial MetricConfig fields to apply }
}`;
}
