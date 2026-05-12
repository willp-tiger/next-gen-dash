import { useState } from 'react';
import type { MetricConfig } from 'shared/types';

const METRIC_DESCRIPTIONS: Record<string, string> = {
  // Fulfillment
  otif_rate: 'On-Time In-Full: % of delivered shipments arriving by promised date AND with no backordered lines. Headline customer-experience metric.',
  perfect_order_rate: 'Strictest fulfillment metric — on-time, in-full, no exceptions, no return. Composite quality signal.',
  order_cycle_time: 'Average days from customer order placement to delivery.',
  line_fill_rate: '% of order lines shipped complete (no backorder). Independent of timing.',
  backorder_rate: '% of shipped order lines with any unfilled quantity. Inverse of line fill rate.',
  same_day_ship_rate: '% of orders shipped same calendar day as placed. Warehouse responsiveness signal.',
  // Inventory
  inventory_turns: 'Annualized inventory turnover ratio. Higher = more efficient working capital.',
  days_of_supply: 'Average forward-looking days of supply across active SKU-warehouse positions.',
  stockout_rate: '% of SKU-warehouse positions at zero on-hand inventory.',
  excess_inventory_value: 'Total $ value of inventory in positions with > 90 days of supply.',
  critical_sku_stockout_rate: '% of critical-path SKUs (production-stopping parts) at zero stock anywhere. Most urgent inventory signal.',
  // Procurement
  supplier_otd: 'Supplier On-Time Delivery: % of received POs where received_date <= promised_date.',
  supplier_otif: 'Supplier On-Time In-Full: received on time AND with full ordered quantity.',
  po_cycle_time: 'Average days from PO placement to receipt.',
  avg_lead_time: 'Average promised lead time across active POs.',
  supplier_defect_rate: '% of POs with a Quality Hold exception. Tracks inbound quality regression.',
  // Logistics
  carrier_otd: 'Carrier On-Time Delivery: % of shipments delivered by promised date.',
  avg_transit_days: 'Average days from shipped to delivered.',
  damage_rate: '% of shipments with a logged Damage exception.',
  // Operations
  exception_rate: '% of shipments with at least one exception event. Composite operational health.',
  avg_exception_mttr: 'Mean time to resolve exceptions, in hours.',
  return_rate: '% of delivered shipments with at least one return.',
  warehouse_capacity_util: 'Pallet positions in use vs. warehouse capacity. Higher = less headroom.',
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
