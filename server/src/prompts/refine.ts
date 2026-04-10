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

  return `You are a dashboard refinement assistant. Analyze the user's interaction data and suggest ONE adjustment to their sales dashboard.

## Current Dashboard Metrics
${currentMetrics.map((m) => `- ${m.id} (${m.label}, position: ${m.position}, size: ${m.size})`).join('\n')}

## Interaction Summary (metricId: interaction count)
${Object.entries(interactionSummary).map(([id, count]) => `- ${id}: ${count} interactions`).join('\n')}

## Available Metrics Not on Dashboard
${['total_revenue', 'avg_order_value', 'total_orders', 'units_sold', 'avg_price', 'fulfillment_rate', 'cancelled_order_rate', 'avg_deal_size_value', 'revenue_per_customer', 'order_frequency', 'product_line_count', 'territory_revenue_share']
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
