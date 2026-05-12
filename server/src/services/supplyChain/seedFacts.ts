import type { Pool } from 'pg';
import {
  addDays, batchInsert, dateRange, daysAgo, diffDays, isHoliday, isoDate, isWeekend,
  makeRng, pad, seasonalMultiplier, TODAY, type Rng,
} from './random.js';
import type {
  Carrier, Customer, DimensionsBundle, Sku, Supplier, Warehouse,
} from './seedDimensions.js';

// === Tunables ===

const DAYS_OF_HISTORY = 365;
const WEEKDAY_SHIPMENTS_BASELINE = 180;
const WEEKEND_SHIPMENTS_BASELINE = 60;
const WEEKDAY_POS_BASELINE = 100;
const WEEKEND_POS_BASELINE = 15;
const HOLIDAY_MULTIPLIER = 0.3;

const DAILY_INVENTORY_TOP_N_SKUS = 300; // top SKUs by velocity get daily snapshots; rest get monthly
const BASELINE_ON_TIME_RATE = 0.96;
const BASELINE_IN_FULL_RATE = 0.94;
const BASELINE_CANCEL_RATE = 0.02;
const BASELINE_SHIPMENT_EXCEPTION_RATE = 0.08;
const BASELINE_RETURN_RATE = 0.13;

// === Anomaly windows (relative to TODAY) ===

// Most-recent November 8-22 window in the seed range.
function apacCongestionWindow(): { start: Date; end: Date } {
  // Find November in the data range (last 365 days). Pick the November whose 22nd is most recent but <= TODAY.
  const year = TODAY.getMonth() >= 10 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
  return {
    start: new Date(year, 10, 8),
    end: new Date(year, 10, 22),
  };
}

// EMEA incident: pick a Tuesday in the most recent May within the date range.
function emeaIncidentDate(): Date {
  const year = TODAY.getMonth() >= 4 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
  return new Date(year, 4, 6); // May 6
}

// Strategic supplier (SUP-0042) OTD degradation window: last 4 months.
const SUP_DEGRADATION_DAYS = 120;
const DEGRADED_SUPPLIER_ID = 'SUP-0042';

// === Helpers ===

function pickAbcWeighted<T>(rng: Rng, items: T[], abcOf: (item: T) => 'A' | 'B' | 'C'): T {
  // A items get ~10x weight of C items; B gets 3x.
  return rng.weightedPick(
    items.map(item => ({
      item,
      weight: abcOf(item) === 'A' ? 10 : abcOf(item) === 'B' ? 3 : 1,
    }))
  );
}

function pickByWeight<T>(rng: Rng, items: ReadonlyArray<{ item: T; weight: number }>): T {
  return rng.weightedPick(items);
}

function dailyShipmentCount(date: Date, rng: Rng): number {
  if (isHoliday(date)) {
    const base = isWeekend(date) ? WEEKEND_SHIPMENTS_BASELINE : WEEKDAY_SHIPMENTS_BASELINE;
    return Math.max(0, Math.round(base * HOLIDAY_MULTIPLIER * seasonalMultiplier(date)));
  }
  const base = isWeekend(date) ? WEEKEND_SHIPMENTS_BASELINE : WEEKDAY_SHIPMENTS_BASELINE;
  const noise = rng.normal(1.0, 0.08);
  return Math.max(0, Math.round(base * seasonalMultiplier(date) * noise));
}

function dailyPOCount(date: Date, rng: Rng): number {
  if (isHoliday(date)) return 0;
  const base = isWeekend(date) ? WEEKEND_POS_BASELINE : WEEKDAY_POS_BASELINE;
  const noise = rng.normal(1.0, 0.1);
  return Math.max(0, Math.round(base * seasonalMultiplier(date) * noise));
}

function isInApacWindow(date: Date): boolean {
  const w = apacCongestionWindow();
  return date >= w.start && date <= w.end;
}

function isEmeaIncident(date: Date): boolean {
  return date.getTime() === emeaIncidentDate().getTime();
}

// Supplier OTD likelihood, with SUP-0042 degradation in the last 120 days.
function supplierOnTimeProbability(supplier: Supplier, poDate: Date): number {
  const base = supplier.tier === 'Strategic' ? 0.96 : supplier.tier === 'Preferred' ? 0.92 : 0.84;
  if (supplier.supplierId === DEGRADED_SUPPLIER_ID) {
    const daysFromToday = diffDays(TODAY, poDate);
    if (daysFromToday >= 0 && daysFromToday <= SUP_DEGRADATION_DAYS) {
      // Linear decline from 0.96 → 0.78 across the window (newer = worse)
      const t = 1 - daysFromToday / SUP_DEGRADATION_DAYS;
      return 0.96 - 0.18 * t;
    }
  }
  return base;
}

function shipmentOnTimeProbability(
  rng: Rng,
  carrier: Carrier,
  origin: string,
  dest: string,
  orderDate: Date,
  containsDegradedSupplierSku: boolean
): number {
  let p = BASELINE_ON_TIME_RATE;

  // Carrier-specific: parcel slightly better, ocean worse-tail
  if (carrier.type === 'Ocean') p -= 0.04;
  if (carrier.type === 'Air') p += 0.01;

  // APAC congestion window
  if (isInApacWindow(orderDate) && (origin === 'APAC' || dest === 'EMEA' || dest === 'APAC')) {
    p -= 0.18;
  }

  // EMEA WH-EMEA-02 incident (handled per-shipment in main flow)

  // Degraded-supplier-sourced SKUs in last 4 months: in-full pressure flows through to on-time too
  if (containsDegradedSupplierSku) p -= 0.05;

  return Math.max(0.3, Math.min(0.99, p));
}

function shipmentInFullProbability(
  rng: Rng,
  origin: string,
  orderDate: Date,
  containsDegradedSupplierSku: boolean
): number {
  let p = BASELINE_IN_FULL_RATE;
  if (isInApacWindow(orderDate) && origin === 'APAC') p -= 0.10;
  if (containsDegradedSupplierSku) p -= 0.12;
  return Math.max(0.4, Math.min(0.99, p));
}

// === Output types matching schema ===

interface PORow {
  poId: string;
  lineNumber: number;
  supplierId: string;
  warehouseId: string;
  skuId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  orderedDate: Date;
  promisedDate: Date;
  receivedDate: Date | null;
  status: string;
}

interface ShipmentRow {
  shipmentId: string;
  customerId: string;
  warehouseId: string;
  carrierId: string;
  orderDate: Date;
  promisedDate: Date;
  shippedDate: Date | null;
  deliveredDate: Date | null;
  status: string;
  originRegion: string;
  destinationRegion: string;
  totalValue: number;
}

interface ShipmentLineRow {
  shipmentId: string;
  lineNumber: number;
  skuId: string;
  qtyOrdered: number;
  qtyShipped: number;
  qtyBackordered: number;
  unitPrice: number;
  lineTotal: number;
}

interface InventoryRow {
  snapshotDate: Date;
  warehouseId: string;
  skuId: string;
  onHandQty: number;
  allocatedQty: number;
  onOrderQty: number;
  daysOfSupply: number | null;
}

interface ExceptionRow {
  eventDate: Date;
  shipmentId: string | null;
  poId: string | null;
  reasonCode: string;
  severity: 'info' | 'warning' | 'critical';
  resolvedDate: Date | null;
  resolutionNote: string | null;
}

interface ReturnRow {
  returnId: string;
  shipmentId: string;
  customerId: string;
  skuId: string;
  returnDate: Date;
  reasonCode: string;
  qtyReturned: number;
  condition: string;
  refundAmount: number;
}

// === Generators ===

function pickWarehouseForCustomer(
  rng: Rng,
  customer: Customer,
  warehouses: Warehouse[]
): Warehouse {
  // 70% chance: same-region warehouse. Else nearest-cross-region.
  const same = warehouses.filter(w => w.region === customer.region);
  if (same.length > 0 && rng.chance(0.7)) {
    return rng.pick(same);
  }
  return rng.pick(warehouses);
}

function pickCarrierForShipment(
  rng: Rng,
  origin: Warehouse,
  destination: Customer,
  carriers: Carrier[]
): Carrier {
  // Cross-region long-haul (e.g., APAC → NA) favors Ocean/Air; same-region favors Parcel/LTL/FTL.
  const sameRegion = origin.region === destination.region;
  if (sameRegion) {
    const local = carriers.filter(c =>
      (c.type === 'Parcel' || c.type === 'LTL' || c.type === 'FTL') &&
      (c.region === 'Global' || c.region === origin.region)
    );
    if (local.length) return rng.pick(local);
  } else {
    // Long-haul: Ocean (cheap, slow) or Air (fast, expensive)
    const longHaul = carriers.filter(c =>
      (c.type === 'Ocean' || c.type === 'Air') &&
      (c.region === 'Global' || c.region === origin.region || c.region === destination.region)
    );
    if (longHaul.length) {
      // 70/30 Ocean/Air
      const oceans = longHaul.filter(c => c.type === 'Ocean');
      const airs = longHaul.filter(c => c.type === 'Air');
      if (rng.chance(0.7) && oceans.length) return rng.pick(oceans);
      if (airs.length) return rng.pick(airs);
    }
  }
  return rng.pick(carriers);
}

function generatePurchaseOrders(
  rng: Rng,
  dims: DimensionsBundle
): PORow[] {
  const rows: PORow[] = [];
  const start = daysAgo(DAYS_OF_HISTORY);
  const dates = dateRange(start, TODAY);
  const activeSuppliers = dims.suppliers.filter(s => s.status === 'active');
  const sourceableSkus = dims.skus.filter(s => s.status !== 'discontinued');

  // Bucket SKUs by primary supplier so each PO has a coherent supplier→sku link
  const skusBySupplier = new Map<string, Sku[]>();
  for (const sku of sourceableSkus) {
    const arr = skusBySupplier.get(sku.primarySupplierId) ?? [];
    arr.push(sku);
    skusBySupplier.set(sku.primarySupplierId, arr);
  }

  let poCounter = 1;
  for (const date of dates) {
    const count = dailyPOCount(date, rng);
    for (let i = 0; i < count; i++) {
      const supplier = pickByWeight(rng, activeSuppliers.map(s => ({
        item: s,
        weight: s.tier === 'Strategic' ? 5 : s.tier === 'Preferred' ? 3 : 1,
      })));
      const candidateSkus = skusBySupplier.get(supplier.supplierId);
      if (!candidateSkus || candidateSkus.length === 0) continue;

      const warehouse = rng.pick(dims.warehouses);
      const numLines = rng.weightedPick([
        { item: 1, weight: 30 }, { item: 2, weight: 35 }, { item: 3, weight: 20 },
        { item: 4, weight: 10 }, { item: 5, weight: 5 },
      ]);
      const poId = `PO-${pad(poCounter++, 6)}`;

      // Picked SKUs are unique per PO
      const skuChoices = new Set<string>();
      const skusForThisPo: Sku[] = [];
      for (let attempt = 0; skusForThisPo.length < Math.min(numLines, candidateSkus.length) && attempt < numLines * 3; attempt++) {
        const sku = pickAbcWeighted(rng, candidateSkus, s => s.abcClass);
        if (!skuChoices.has(sku.skuId)) {
          skuChoices.add(sku.skuId);
          skusForThisPo.push(sku);
        }
      }

      const onTimeProb = supplierOnTimeProbability(supplier, date);
      const onTime = rng.chance(onTimeProb);
      const inFull = rng.chance(0.95); // most POs are in-full when they arrive

      for (let li = 0; li < skusForThisPo.length; li++) {
        const sku = skusForThisPo[li];
        const baseQty = sku.abcClass === 'A' ? rng.int(200, 800)
                      : sku.abcClass === 'B' ? rng.int(50, 250)
                      : rng.int(10, 80);
        const qtyOrdered = baseQty;
        const promisedDate = addDays(date, sku.leadTimeDays);

        let status: string;
        let qtyReceived = 0;
        let receivedDate: Date | null = null;

        const daysSinceOrder = diffDays(TODAY, date);
        const expectedReceived = sku.leadTimeDays;

        if (daysSinceOrder < expectedReceived - 3) {
          // Still in transit / open
          status = rng.weightedPick([
            { item: 'Open', weight: 40 },
            { item: 'Confirmed', weight: 40 },
            { item: 'In Transit', weight: 20 },
          ]);
        } else if (daysSinceOrder < expectedReceived + 5) {
          // Receiving window
          if (onTime) {
            const delay = onTime ? rng.int(-2, 2) : rng.int(2, 12);
            receivedDate = addDays(promisedDate, delay);
            if (receivedDate > TODAY) {
              status = 'In Transit';
              receivedDate = null;
            } else {
              qtyReceived = inFull ? qtyOrdered : Math.floor(qtyOrdered * rng.float(0.6, 0.9));
              status = qtyReceived === qtyOrdered ? 'Closed' : 'Received';
            }
          } else {
            const delay = rng.int(4, 18);
            receivedDate = addDays(promisedDate, delay);
            if (receivedDate > TODAY) {
              status = 'In Transit';
              receivedDate = null;
            } else {
              qtyReceived = inFull ? qtyOrdered : Math.floor(qtyOrdered * rng.float(0.5, 0.9));
              status = qtyReceived === qtyOrdered ? 'Closed' : 'Received';
            }
          }
        } else {
          // Older POs: mostly closed
          const delay = onTime ? rng.int(-3, 2) : rng.int(3, 15);
          receivedDate = addDays(promisedDate, delay);
          if (receivedDate > TODAY) receivedDate = TODAY;
          qtyReceived = inFull ? qtyOrdered : Math.floor(qtyOrdered * rng.float(0.7, 0.95));
          status = rng.chance(0.97) ? 'Closed' : 'Cancelled';
          if (status === 'Cancelled') qtyReceived = 0;
        }

        rows.push({
          poId,
          lineNumber: li + 1,
          supplierId: supplier.supplierId,
          warehouseId: warehouse.warehouseId,
          skuId: sku.skuId,
          qtyOrdered,
          qtyReceived,
          unitCost: parseFloat((sku.unitCost * rng.float(0.95, 1.05)).toFixed(2)),
          orderedDate: date,
          promisedDate,
          receivedDate,
          status,
        });
      }
    }
  }
  return rows;
}

function generateShipments(
  rng: Rng,
  dims: DimensionsBundle
): { shipments: ShipmentRow[]; lines: ShipmentLineRow[]; degradedSkuSet: Set<string> } {
  const shipments: ShipmentRow[] = [];
  const lines: ShipmentLineRow[] = [];

  // Pre-compute: which SKUs source from the degraded supplier
  const degradedSkuSet = new Set<string>(
    dims.skus.filter(s => s.primarySupplierId === DEGRADED_SUPPLIER_ID).map(s => s.skuId)
  );

  // Active customers + shippable SKUs
  const customers = dims.customers;
  const shippableSkus = dims.skus.filter(s => s.status !== 'discontinued');

  // Customer segment weighting for shipment volume:
  // Enterprise customers ship more / larger; SMB ship many / smaller.
  const customerWeights = customers.map(c => ({
    item: c,
    weight: c.segment === 'Enterprise' ? 6 : c.segment === 'Mid-Market' ? 3 : 1,
  }));

  const start = daysAgo(DAYS_OF_HISTORY);
  const dates = dateRange(start, TODAY);
  const emeaIncident = emeaIncidentDate();
  const apacWindow = apacCongestionWindow();

  let shipCounter = 1;
  for (const date of dates) {
    const count = dailyShipmentCount(date, rng);

    for (let i = 0; i < count; i++) {
      const customer = pickByWeight(rng, customerWeights);
      const warehouse = pickWarehouseForCustomer(rng, customer, dims.warehouses);
      const carrier = pickCarrierForShipment(rng, warehouse, customer, dims.carriers);

      const numLines = rng.weightedPick([
        { item: 1, weight: 25 }, { item: 2, weight: 28 }, { item: 3, weight: 20 },
        { item: 4, weight: 12 }, { item: 5, weight: 8 }, { item: 6, weight: 5 }, { item: 7, weight: 2 },
      ]);
      const shipmentId = `SHP-${pad(shipCounter++, 7)}`;

      // Pick SKUs
      const skuPicks = new Set<string>();
      const skusForThisShipment: Sku[] = [];
      while (skusForThisShipment.length < numLines && skusForThisShipment.length < 50) {
        const sku = pickAbcWeighted(rng, shippableSkus, s => s.abcClass);
        if (!skuPicks.has(sku.skuId)) {
          skuPicks.add(sku.skuId);
          skusForThisShipment.push(sku);
        }
      }
      const hasDegradedSku = skusForThisShipment.some(s => degradedSkuSet.has(s.skuId));

      // Determine outcome
      const cancelled = rng.chance(BASELINE_CANCEL_RATE);
      const onTimeP = shipmentOnTimeProbability(rng, carrier, warehouse.region, customer.region, date, hasDegradedSku);
      const inFullP = shipmentInFullProbability(rng, warehouse.region, date, hasDegradedSku);
      const onTime = !cancelled && rng.chance(onTimeP);
      const inFull = !cancelled && rng.chance(inFullP);

      // Promised date: carrier SLA + buffer
      const transitBuffer = carrier.type === 'Ocean' ? rng.int(2, 7) : carrier.type === 'Air' ? 1 : rng.int(1, 3);
      const promisedDate = addDays(date, carrier.slaDays + transitBuffer);

      // Status by age + outcome
      const ageDays = diffDays(TODAY, date);
      let status: string;
      let shippedDate: Date | null = null;
      let deliveredDate: Date | null = null;

      if (cancelled) {
        status = 'Cancelled';
      } else if (ageDays < 1) {
        status = rng.weightedPick([
          { item: 'Open', weight: 50 }, { item: 'Picking', weight: 30 }, { item: 'Packed', weight: 20 },
        ]);
      } else if (ageDays < 3) {
        status = rng.weightedPick([
          { item: 'Packed', weight: 30 }, { item: 'Shipped', weight: 70 },
        ]);
        if (status === 'Shipped') shippedDate = addDays(date, rng.int(1, 2));
      } else if (ageDays < carrier.slaDays + 2) {
        shippedDate = addDays(date, onTime ? rng.int(1, 2) : rng.int(2, 5));
        status = 'Shipped';
      } else {
        // Most likely delivered by now
        shippedDate = addDays(date, onTime ? rng.int(1, 2) : rng.int(2, 6));

        // EMEA backlog: shipments from WH-EMEA-02 on/around the incident date delayed
        if (warehouse.warehouseId === 'WH-EMEA-02' && Math.abs(diffDays(date, emeaIncident)) <= 1 && shippedDate) {
          shippedDate = addDays(shippedDate, rng.int(2, 4));
        }
        // APAC window extra delay for affected lanes
        if (date >= apacWindow.start && date <= apacWindow.end && shippedDate &&
            (warehouse.region === 'APAC' || customer.region === 'EMEA' || customer.region === 'APAC')) {
          shippedDate = addDays(shippedDate, rng.int(3, 9));
        }

        deliveredDate = addDays(shippedDate, carrier.slaDays + rng.int(-1, 3));
        if (deliveredDate > TODAY) {
          deliveredDate = null;
          status = 'Shipped';
        } else {
          status = 'Delivered';
        }
      }

      // Generate lines and total value
      let totalValue = 0;
      const linesForThisShipment: ShipmentLineRow[] = [];
      for (let li = 0; li < skusForThisShipment.length; li++) {
        const sku = skusForThisShipment[li];
        const qtyOrdered = sku.abcClass === 'A' ? rng.int(20, 200)
                         : sku.abcClass === 'B' ? rng.int(5, 60)
                         : rng.int(1, 20);

        // Partial fill if NOT in-full: each line may fail independently with concentration
        let qtyShipped = qtyOrdered;
        let qtyBackordered = 0;
        if (!cancelled && !inFull && rng.chance(0.45)) {
          // This specific line is short
          qtyShipped = Math.max(0, Math.floor(qtyOrdered * rng.float(0.3, 0.85)));
          qtyBackordered = qtyOrdered - qtyShipped;
        }
        // Cancelled shipments have qty_shipped = 0
        if (cancelled) {
          qtyShipped = 0;
          qtyBackordered = qtyOrdered;
        }

        const unitPrice = parseFloat((sku.listPrice * rng.float(0.92, 1.0)).toFixed(2));
        const lineTotal = parseFloat((unitPrice * qtyShipped).toFixed(2));
        totalValue += lineTotal;

        linesForThisShipment.push({
          shipmentId,
          lineNumber: li + 1,
          skuId: sku.skuId,
          qtyOrdered,
          qtyShipped,
          qtyBackordered,
          unitPrice,
          lineTotal,
        });
      }

      shipments.push({
        shipmentId,
        customerId: customer.customerId,
        warehouseId: warehouse.warehouseId,
        carrierId: carrier.carrierId,
        orderDate: date,
        promisedDate,
        shippedDate,
        deliveredDate,
        status,
        originRegion: warehouse.region,
        destinationRegion: customer.region,
        totalValue: parseFloat(totalValue.toFixed(2)),
      });
      lines.push(...linesForThisShipment);
    }
  }

  return { shipments, lines, degradedSkuSet };
}

function generateInventorySnapshots(
  rng: Rng,
  dims: DimensionsBundle,
  shipments: ShipmentRow[],
  pos: PORow[]
): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const start = daysAgo(DAYS_OF_HISTORY);
  const dates = dateRange(start, TODAY);
  const monthEnds = dates.filter((d, i) => i === dates.length - 1 || dates[i + 1].getMonth() !== d.getMonth());

  // SKUs sorted by ABC then status — A first
  const sorted = [...dims.skus].sort((a, b) => {
    const rank = (c: 'A' | 'B' | 'C') => (c === 'A' ? 0 : c === 'B' ? 1 : 2);
    return rank(a.abcClass) - rank(b.abcClass);
  });
  const dailySkus = sorted.slice(0, DAILY_INVENTORY_TOP_N_SKUS);
  const monthlySkus = sorted.slice(DAILY_INVENTORY_TOP_N_SKUS);

  // Per-(sku, warehouse): synthetic baseline + noise. Days-of-supply derived from baseline avg demand.
  function emit(date: Date, sku: Sku, wh: Warehouse): InventoryRow {
    // Daily avg demand scales with ABC class
    const avgDailyDemand = sku.abcClass === 'A' ? rng.normal(35, 9)
                         : sku.abcClass === 'B' ? rng.normal(8, 3)
                         : rng.normal(1.5, 0.7);
    const safeDemand = Math.max(0.1, avgDailyDemand);

    // Target stock: lead time × 2 + safety stock
    const targetStock = Math.max(20, Math.round(safeDemand * (sku.leadTimeDays * 0.6 + 14)));
    const fluctuation = rng.float(0.45, 1.25);
    let onHand = Math.max(0, Math.round(targetStock * fluctuation));

    // Stockout injection: ~2% chance overall, 7% chance for SKUs sourced from degraded supplier in last 4 months
    const stockoutChance = (sku.primarySupplierId === DEGRADED_SUPPLIER_ID && diffDays(TODAY, date) <= SUP_DEGRADATION_DAYS)
      ? 0.07 : 0.02;
    if (rng.chance(stockoutChance)) onHand = 0;

    const allocated = onHand > 0 ? Math.round(onHand * rng.float(0.05, 0.3)) : 0;
    const onOrder = rng.chance(0.55) ? Math.round(targetStock * rng.float(0.2, 0.7)) : 0;
    const dos = onHand > 0 ? parseFloat((onHand / safeDemand).toFixed(1)) : 0;

    return {
      snapshotDate: date,
      warehouseId: wh.warehouseId,
      skuId: sku.skuId,
      onHandQty: onHand,
      allocatedQty: allocated,
      onOrderQty: onOrder,
      daysOfSupply: dos,
    };
  }

  // Daily snapshots for top SKUs
  for (const date of dates) {
    for (const sku of dailySkus) {
      for (const wh of dims.warehouses) {
        rows.push(emit(date, sku, wh));
      }
    }
  }
  // Monthly snapshots for tail
  for (const date of monthEnds) {
    for (const sku of monthlySkus) {
      for (const wh of dims.warehouses) {
        rows.push(emit(date, sku, wh));
      }
    }
  }

  return rows;
}

const SHIPMENT_EXCEPTION_REASONS: Array<{ item: string; weight: number; severity: 'info' | 'warning' | 'critical' }> = [
  { item: 'Carrier Delay',     weight: 35, severity: 'warning' },
  { item: 'Address Issue',     weight: 12, severity: 'info' },
  { item: 'Damage',            weight: 8,  severity: 'warning' },
  { item: 'Weather',           weight: 6,  severity: 'warning' },
  { item: 'Capacity',          weight: 5,  severity: 'warning' },
  { item: 'Customs',           weight: 8,  severity: 'warning' },
  { item: 'Hazmat Hold',       weight: 3,  severity: 'critical' },
  { item: 'Documentation',     weight: 5,  severity: 'info' },
  { item: 'Other',             weight: 18, severity: 'info' },
];

const PO_EXCEPTION_REASONS: Array<{ item: string; weight: number; severity: 'info' | 'warning' | 'critical' }> = [
  { item: 'Supplier Delay',    weight: 55, severity: 'warning' },
  { item: 'Capacity',          weight: 12, severity: 'warning' },
  { item: 'Documentation',     weight: 8,  severity: 'info' },
  { item: 'Customs',           weight: 10, severity: 'warning' },
  { item: 'Quality Hold',      weight: 10, severity: 'critical' },
  { item: 'Other',             weight: 5,  severity: 'info' },
];

function generateExceptions(rng: Rng, shipments: ShipmentRow[], pos: PORow[]): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  const apacWindow = apacCongestionWindow();
  const emeaIncident = emeaIncidentDate();

  // Shipment exceptions
  for (const ship of shipments) {
    let rate = BASELINE_SHIPMENT_EXCEPTION_RATE;
    // Late shipments are way more likely to have an exception attached
    const late = ship.shippedDate && ship.shippedDate > ship.promisedDate;
    if (late) rate += 0.55;
    if (ship.status === 'Cancelled') rate += 0.30;
    // APAC + EMEA boost
    if (ship.orderDate >= apacWindow.start && ship.orderDate <= apacWindow.end &&
        (ship.originRegion === 'APAC' || ship.destinationRegion === 'EMEA' || ship.destinationRegion === 'APAC')) {
      rate += 0.45;
    }
    if (ship.warehouseId === 'WH-EMEA-02' && Math.abs(diffDays(ship.orderDate, emeaIncident)) <= 1) {
      rate += 0.85;
    }

    if (!rng.chance(Math.min(0.99, rate))) continue;

    // Pick reason, with anomaly-weighted overrides
    let reason: { item: string; severity: 'info' | 'warning' | 'critical' };
    if (ship.orderDate >= apacWindow.start && ship.orderDate <= apacWindow.end &&
        (ship.originRegion === 'APAC' || ship.destinationRegion === 'EMEA' || ship.destinationRegion === 'APAC')) {
      const skewed = rng.weightedPick([
        { item: { item: 'Carrier Delay', severity: 'warning' as const }, weight: 50 },
        { item: { item: 'Customs', severity: 'warning' as const }, weight: 30 },
        { item: { item: 'Weather', severity: 'warning' as const }, weight: 15 },
        { item: { item: 'Capacity', severity: 'warning' as const }, weight: 5 },
      ]);
      reason = skewed;
    } else if (ship.warehouseId === 'WH-EMEA-02' && Math.abs(diffDays(ship.orderDate, emeaIncident)) <= 1) {
      reason = { item: 'Capacity', severity: 'critical' };
    } else {
      const picked = pickByWeight(rng, SHIPMENT_EXCEPTION_REASONS.map(r => ({ item: r, weight: r.weight })));
      reason = { item: picked.item, severity: picked.severity };
    }

    // Most exceptions resolved within 1-7 days
    const resolutionDelay = rng.int(1, 7);
    const eventDate = ship.shippedDate ?? addDays(ship.orderDate, rng.int(1, 3));
    const resolvedDate = ship.deliveredDate ?? (eventDate <= daysAgo(resolutionDelay) ? addDays(eventDate, resolutionDelay) : null);

    rows.push({
      eventDate,
      shipmentId: ship.shipmentId,
      poId: null,
      reasonCode: reason.item,
      severity: reason.severity,
      resolvedDate,
      resolutionNote: null,
    });
  }

  // PO exceptions: ~6% of POs (one per po_id, not per line)
  const poIds = Array.from(new Set(pos.map(p => p.poId)));
  const poById = new Map<string, PORow[]>();
  for (const p of pos) {
    const arr = poById.get(p.poId) ?? [];
    arr.push(p);
    poById.set(p.poId, arr);
  }
  for (const poId of poIds) {
    if (!rng.chance(0.06)) continue;
    const lines = poById.get(poId)!;
    const head = lines[0];
    let reason: { item: string; severity: 'info' | 'warning' | 'critical' };
    if (head.supplierId === DEGRADED_SUPPLIER_ID && diffDays(TODAY, head.orderedDate) <= SUP_DEGRADATION_DAYS) {
      reason = { item: 'Supplier Delay', severity: 'warning' };
    } else {
      const picked = pickByWeight(rng, PO_EXCEPTION_REASONS.map(r => ({ item: r, weight: r.weight })));
      reason = { item: picked.item, severity: picked.severity };
    }
    rows.push({
      eventDate: addDays(head.orderedDate, rng.int(2, 10)),
      shipmentId: null,
      poId,
      reasonCode: reason.item,
      severity: reason.severity,
      resolvedDate: head.receivedDate,
      resolutionNote: null,
    });
  }

  return rows;
}

const RETURN_REASONS: Array<{ item: string; weight: number }> = [
  { item: 'No Longer Needed',    weight: 32 },
  { item: 'Wrong Item',          weight: 20 },
  { item: 'Defective',           weight: 15 },
  { item: 'Damaged in Transit',  weight: 14 },
  { item: 'Excess Order',        weight: 11 },
  { item: 'Other',               weight: 8 },
];

function generateReturns(
  rng: Rng,
  shipments: ShipmentRow[],
  lines: ShipmentLineRow[]
): ReturnRow[] {
  const rows: ReturnRow[] = [];
  let counter = 1;

  // Index lines by shipment for fast lookup
  const linesByShipment = new Map<string, ShipmentLineRow[]>();
  for (const l of lines) {
    const arr = linesByShipment.get(l.shipmentId) ?? [];
    arr.push(l);
    linesByShipment.set(l.shipmentId, arr);
  }

  for (const ship of shipments) {
    if (ship.status !== 'Delivered' || !ship.deliveredDate) continue;
    if (!rng.chance(BASELINE_RETURN_RATE)) continue;

    const shipLines = linesByShipment.get(ship.shipmentId);
    if (!shipLines || shipLines.length === 0) continue;
    const line = rng.pick(shipLines);
    if (line.qtyShipped === 0) continue;

    const reason = pickByWeight(rng, RETURN_REASONS.map(r => ({ item: r.item, weight: r.weight })));
    const condition = reason === 'Damaged in Transit' ? (rng.chance(0.6) ? 'Damaged' : 'Scrap')
                    : reason === 'Defective' ? 'Damaged'
                    : rng.chance(0.75) ? 'Sellable' : 'Damaged';

    const qtyReturned = Math.max(1, Math.floor(line.qtyShipped * rng.float(0.2, 1.0)));
    const refundAmount = parseFloat((qtyReturned * line.unitPrice).toFixed(2));

    // Returns happen 5-45 days after delivery
    const returnDate = addDays(ship.deliveredDate, rng.int(5, 45));
    if (returnDate > TODAY) continue;

    rows.push({
      returnId: `RET-${pad(counter++, 6)}`,
      shipmentId: ship.shipmentId,
      customerId: ship.customerId,
      skuId: line.skuId,
      returnDate,
      reasonCode: reason,
      qtyReturned,
      condition,
      refundAmount,
    });
  }

  return rows;
}

// === Persistence ===

export async function seedFacts(pool: Pool, dims: DimensionsBundle): Promise<void> {
  const rng = makeRng(0xACE10);

  console.log('  > generating purchase orders...');
  const pos = generatePurchaseOrders(rng, dims);
  await batchInsert(
    pool, 'purchase_orders',
    ['po_id', 'line_number', 'supplier_id', 'warehouse_id', 'sku_id',
     'qty_ordered', 'qty_received', 'unit_cost', 'ordered_date', 'promised_date',
     'received_date', 'status'],
    pos,
    p => [
      p.poId, p.lineNumber, p.supplierId, p.warehouseId, p.skuId,
      p.qtyOrdered, p.qtyReceived, p.unitCost, isoDate(p.orderedDate), isoDate(p.promisedDate),
      isoDate(p.receivedDate), p.status,
    ],
    400
  );
  console.log(`    seeded ${pos.length} PO lines (${new Set(pos.map(p => p.poId)).size} POs)`);

  console.log('  > generating shipments + lines...');
  const { shipments, lines } = generateShipments(rng, dims);
  await batchInsert(
    pool, 'shipments',
    ['shipment_id', 'customer_id', 'warehouse_id', 'carrier_id',
     'order_date', 'promised_date', 'shipped_date', 'delivered_date',
     'status', 'origin_region', 'destination_region', 'total_value'],
    shipments,
    s => [
      s.shipmentId, s.customerId, s.warehouseId, s.carrierId,
      isoDate(s.orderDate), isoDate(s.promisedDate), isoDate(s.shippedDate), isoDate(s.deliveredDate),
      s.status, s.originRegion, s.destinationRegion, s.totalValue,
    ],
    400
  );
  console.log(`    seeded ${shipments.length} shipments`);

  await batchInsert(
    pool, 'shipment_lines',
    ['shipment_id', 'line_number', 'sku_id', 'qty_ordered', 'qty_shipped',
     'qty_backordered', 'unit_price', 'line_total'],
    lines,
    l => [l.shipmentId, l.lineNumber, l.skuId, l.qtyOrdered, l.qtyShipped,
          l.qtyBackordered, l.unitPrice, l.lineTotal],
    500
  );
  console.log(`    seeded ${lines.length} shipment lines`);

  console.log('  > generating inventory snapshots...');
  const inv = generateInventorySnapshots(rng, dims, shipments, pos);
  await batchInsert(
    pool, 'inventory_snapshots',
    ['snapshot_date', 'warehouse_id', 'sku_id', 'on_hand_qty',
     'allocated_qty', 'on_order_qty', 'days_of_supply'],
    inv,
    i => [isoDate(i.snapshotDate), i.warehouseId, i.skuId, i.onHandQty,
          i.allocatedQty, i.onOrderQty, i.daysOfSupply],
    1000
  );
  console.log(`    seeded ${inv.length} inventory snapshots`);

  console.log('  > generating exceptions...');
  const exceptions = generateExceptions(rng, shipments, pos);
  await batchInsert(
    pool, 'exceptions',
    ['event_date', 'shipment_id', 'po_id', 'reason_code',
     'severity', 'resolved_date', 'resolution_note'],
    exceptions,
    e => [isoDate(e.eventDate), e.shipmentId, e.poId, e.reasonCode,
          e.severity, isoDate(e.resolvedDate), e.resolutionNote],
    500
  );
  console.log(`    seeded ${exceptions.length} exceptions`);

  console.log('  > generating returns...');
  const returns = generateReturns(rng, shipments, lines);
  await batchInsert(
    pool, 'returns',
    ['return_id', 'shipment_id', 'customer_id', 'sku_id',
     'return_date', 'reason_code', 'qty_returned', 'condition', 'refund_amount'],
    returns,
    r => [r.returnId, r.shipmentId, r.customerId, r.skuId,
          isoDate(r.returnDate), r.reasonCode, r.qtyReturned, r.condition, r.refundAmount],
    500
  );
  console.log(`    seeded ${returns.length} returns`);
}
