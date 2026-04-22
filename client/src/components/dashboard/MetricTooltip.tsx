import { useState } from 'react';
import type { MetricConfig } from 'shared/types';

const METRIC_DESCRIPTIONS: Record<string, string> = {
  total_revenue: 'Sum of all sales amounts across order line items. Primary top-line revenue metric.',
  avg_order_value: 'Mean sales amount per order line item. Indicates pricing efficiency and order quality.',
  total_orders: 'Count of distinct orders in the period. Measures sales volume and pipeline throughput.',
  units_sold: 'Total quantity of items ordered. Measures product movement velocity.',
  avg_price: 'Average selling price per unit. Tracks pricing power and discount trends.',
  fulfillment_rate: 'Percentage of order line items with Shipped status. Key operational health indicator.',
  cancelled_order_rate: 'Percentage of orders with Cancelled status. Tracks order quality and retention risk.',
  avg_deal_size_value: 'Average total sales value per order. Measures deal quality and upsell effectiveness.',
  revenue_per_customer: 'Total revenue divided by distinct customers. Measures customer lifetime value.',
  order_frequency: 'Average orders per customer. Indicates repeat purchase behavior and loyalty.',
  product_line_count: 'Count of distinct product lines with orders. Measures catalog breadth.',
  territory_revenue_share: 'Revenue share of the top territory. Lower means more geographic diversification.',
};

interface MetricTooltipProps {
  metric: MetricConfig;
  children: React.ReactNode;
}

export function MetricTooltip({ metric, children }: MetricTooltipProps) {
  const [show, setShow] = useState(false);

  const description = METRIC_DESCRIPTIONS[metric.id] || 'No description available.';
  const directionLabel = metric.thresholds.direction === 'lower-is-better'
    ? 'Lower is better'
    : 'Higher is better';

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute left-1/2 top-0 z-50 w-72 -translate-x-1/2 -translate-y-full pb-2">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-white shadow-xl">
            <p className="font-semibold">{metric.label}</p>
            <p className="mt-1 text-slate-300 leading-relaxed">{description}</p>

            <div className="mt-2.5 flex items-center gap-3 border-t border-slate-700 pt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-slate-400">&le; {metric.thresholds.green.max}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-slate-400">&le; {metric.thresholds.yellow.max}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-slate-400">above</span>
              </div>
            </div>

            <p className="mt-1.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{directionLabel}</p>

            {metric.reasoning && (
              <p className="mt-2 border-t border-slate-700 pt-2 italic text-accent-light">
                &ldquo;{metric.reasoning}&rdquo;
              </p>
            )}

            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-[2px]">
              <div className="h-2 w-2 rotate-45 bg-slate-900" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
