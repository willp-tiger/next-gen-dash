import type { Pool } from 'pg';
import { batchInsert, daysAgo, isoDate, makeRng, pad, type Rng } from './random.js';

// === Types matching the schema ===

export interface Supplier {
  supplierId: string;
  name: string;
  country: string;
  region: string;
  tier: 'Strategic' | 'Preferred' | 'Tactical';
  onboardedAt: Date;
  paymentTerms: 'NET30' | 'NET45' | 'NET60';
  status: 'active' | 'suspended' | 'offboarded';
}

export interface Warehouse {
  warehouseId: string;
  name: string;
  country: string;
  region: string;
  type: 'DC' | 'Regional' | 'Cross-dock';
  capacityPallets: number;
  openedAt: Date;
}

export interface Carrier {
  carrierId: string;
  name: string;
  type: 'Parcel' | 'LTL' | 'FTL' | 'Ocean' | 'Air';
  region: string;
  slaDays: number;
}

export interface Customer {
  customerId: string;
  name: string;
  segment: 'Enterprise' | 'Mid-Market' | 'SMB';
  industry: 'Manufacturing' | 'Automotive' | 'Aerospace' | 'Energy' | 'Construction';
  country: string;
  region: string;
  onboardedAt: Date;
}

export interface Sku {
  skuId: string;
  name: string;
  category: 'Fasteners' | 'Bearings' | 'Hydraulics' | 'Electrical' | 'Safety' | 'MRO' | 'Cutting Tools';
  subcategory: string;
  abcClass: 'A' | 'B' | 'C';
  isCritical: boolean;
  unitCost: number;
  listPrice: number;
  weightKg: number;
  primarySupplierId: string;
  leadTimeDays: number;
  introducedAt: Date;
  status: 'active' | 'phasing_out' | 'discontinued';
}

export interface DimensionsBundle {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  carriers: Carrier[];
  customers: Customer[];
  skus: Sku[];
}

// === Static reference data ===

const SUPPLIER_NAME_STEMS = [
  'Apex', 'Meridian', 'Vanguard', 'Sterling', 'Continental', 'Pacific', 'Atlantic', 'Summit',
  'Pioneer', 'Cardinal', 'Nordic', 'Imperial', 'Crown', 'Phoenix', 'Granite', 'Titan',
  'Zenith', 'Catalyst', 'Reliant', 'Helios', 'Orion', 'Sentinel', 'Beacon', 'Forge',
  'Anchor', 'Frontier', 'Harbor', 'Keystone', 'Ironclad', 'Atlas', 'Echelon', 'Vector',
  'Quantum', 'Precision', 'Endurance', 'Acme', 'Bristol', 'Diamond', 'Eagle', 'Falcon',
];
const SUPPLIER_NAME_SUFFIXES = [
  'Industries', 'Components', 'Manufacturing', 'Group', 'Holdings', 'Systems', 'Works',
  'Industrial', 'Materials', 'Engineering', 'Supply Co', 'Corp', 'Partners', 'Trading',
];

const SUPPLIER_REGIONS: Array<{ region: string; countries: string[]; weight: number }> = [
  { region: 'APAC', countries: ['China', 'Taiwan', 'Vietnam', 'South Korea', 'Japan', 'India', 'Thailand'], weight: 40 },
  { region: 'EMEA', countries: ['Germany', 'Italy', 'Poland', 'Czech Republic', 'Turkey', 'United Kingdom', 'Spain'], weight: 25 },
  { region: 'NA', countries: ['United States', 'Mexico', 'Canada'], weight: 28 },
  { region: 'LATAM', countries: ['Brazil', 'Chile', 'Argentina'], weight: 7 },
];

const WAREHOUSE_LOCATIONS = [
  // NA
  { id: 'WH-NA-01', name: 'Atlanta DC',       country: 'United States', region: 'NA',    type: 'DC' as const,         capacity: 32000, openedYearsAgo: 14 },
  { id: 'WH-NA-02', name: 'Dallas DC',        country: 'United States', region: 'NA',    type: 'DC' as const,         capacity: 28000, openedYearsAgo: 11 },
  { id: 'WH-NA-03', name: 'Reno Regional',    country: 'United States', region: 'NA',    type: 'Regional' as const,   capacity: 14000, openedYearsAgo: 7 },
  { id: 'WH-NA-04', name: 'Toronto Cross-dock', country: 'Canada',      region: 'NA',    type: 'Cross-dock' as const, capacity: 8000,  openedYearsAgo: 4 },
  // EMEA
  { id: 'WH-EMEA-01', name: 'Rotterdam DC',   country: 'Netherlands',   region: 'EMEA',  type: 'DC' as const,         capacity: 30000, openedYearsAgo: 12 },
  { id: 'WH-EMEA-02', name: 'Frankfurt DC',   country: 'Germany',       region: 'EMEA',  type: 'DC' as const,         capacity: 26000, openedYearsAgo: 9 },
  { id: 'WH-EMEA-03', name: 'Manchester Regional', country: 'United Kingdom', region: 'EMEA', type: 'Regional' as const, capacity: 12000, openedYearsAgo: 6 },
  // APAC
  { id: 'WH-APAC-01', name: 'Singapore DC',   country: 'Singapore',     region: 'APAC',  type: 'DC' as const,         capacity: 24000, openedYearsAgo: 10 },
  { id: 'WH-APAC-02', name: 'Shanghai DC',    country: 'China',         region: 'APAC',  type: 'DC' as const,         capacity: 26000, openedYearsAgo: 8 },
  { id: 'WH-APAC-03', name: 'Osaka Cross-dock', country: 'Japan',       region: 'APAC',  type: 'Cross-dock' as const, capacity: 7000,  openedYearsAgo: 3 },
  // LATAM
  { id: 'WH-LATAM-01', name: 'São Paulo DC',  country: 'Brazil',        region: 'LATAM', type: 'DC' as const,         capacity: 18000, openedYearsAgo: 6 },
  { id: 'WH-LATAM-02', name: 'Monterrey Regional', country: 'Mexico',   region: 'LATAM', type: 'Regional' as const,   capacity: 10000, openedYearsAgo: 5 },
];

const CARRIERS: Array<Omit<Carrier, 'carrierId'> & { idSuffix: string }> = [
  { idSuffix: 'FDX-PAR',  name: 'FedEx Express',       type: 'Parcel', region: 'Global', slaDays: 2 },
  { idSuffix: 'UPS-PAR',  name: 'UPS Ground',          type: 'Parcel', region: 'Global', slaDays: 3 },
  { idSuffix: 'DHL-PAR',  name: 'DHL Express',         type: 'Parcel', region: 'Global', slaDays: 3 },
  { idSuffix: 'USP-PAR',  name: 'USPS Priority',       type: 'Parcel', region: 'NA',     slaDays: 4 },
  { idSuffix: 'YRC-LTL',  name: 'YRC Freight',         type: 'LTL',    region: 'NA',     slaDays: 5 },
  { idSuffix: 'ODF-LTL',  name: 'Old Dominion',        type: 'LTL',    region: 'NA',     slaDays: 4 },
  { idSuffix: 'DSV-LTL',  name: 'DSV Road',            type: 'LTL',    region: 'EMEA',   slaDays: 5 },
  { idSuffix: 'KNL-LTL',  name: 'Kuehne+Nagel Road',   type: 'LTL',    region: 'EMEA',   slaDays: 5 },
  { idSuffix: 'JBH-FTL',  name: 'J.B. Hunt Truckload', type: 'FTL',    region: 'NA',     slaDays: 4 },
  { idSuffix: 'XPO-FTL',  name: 'XPO Logistics',       type: 'FTL',    region: 'NA',     slaDays: 4 },
  { idSuffix: 'MSK-OCE',  name: 'Maersk Ocean',        type: 'Ocean',  region: 'Global', slaDays: 28 },
  { idSuffix: 'CMA-OCE',  name: 'CMA CGM Ocean',       type: 'Ocean',  region: 'Global', slaDays: 30 },
  { idSuffix: 'ONE-OCE',  name: 'ONE Ocean Network',   type: 'Ocean',  region: 'APAC',   slaDays: 26 },
  { idSuffix: 'EVR-OCE',  name: 'Evergreen Marine',    type: 'Ocean',  region: 'APAC',   slaDays: 27 },
  { idSuffix: 'CAR-AIR',  name: 'Cargolux Air',        type: 'Air',    region: 'Global', slaDays: 4 },
  { idSuffix: 'LUH-AIR',  name: 'Lufthansa Cargo',     type: 'Air',    region: 'EMEA',   slaDays: 4 },
  { idSuffix: 'CXP-AIR',  name: 'Cathay Pacific Cargo',type: 'Air',    region: 'APAC',   slaDays: 4 },
  { idSuffix: 'ANA-AIR',  name: 'ANA Cargo',           type: 'Air',    region: 'APAC',   slaDays: 5 },
];

const CUSTOMER_NAME_STEMS = [
  'Westfield', 'Northstar', 'Brightline', 'Cascade', 'Ironworks', 'Steelbridge', 'Riverside',
  'Lakeshore', 'Highland', 'Greystone', 'Ravenwood', 'Foundry', 'Millworks', 'Vertex',
  'Allied', 'Premier', 'Standard', 'United', 'Global', 'National', 'Continental', 'Pacific',
  'Apex', 'Sigma', 'Delta', 'Omega', 'Quasar', 'Stellar', 'Lunar', 'Solar', 'Orbital',
  'Anchor', 'Marin', 'Coastal', 'Inland', 'Mountain', 'Valley', 'Heartland', 'Prairie',
  'Bedrock', 'Granite', 'Marble', 'Copper', 'Bronze', 'Cobalt', 'Tungsten', 'Crimson',
];
const CUSTOMER_NAME_SUFFIXES: Array<{ word: string; industry: Customer['industry'] }> = [
  { word: 'Manufacturing',  industry: 'Manufacturing' },
  { word: 'Industrial',     industry: 'Manufacturing' },
  { word: 'Fabrication',    industry: 'Manufacturing' },
  { word: 'Motors',         industry: 'Automotive' },
  { word: 'Automotive',     industry: 'Automotive' },
  { word: 'Drivetrain',     industry: 'Automotive' },
  { word: 'Aerospace',      industry: 'Aerospace' },
  { word: 'Aviation',       industry: 'Aerospace' },
  { word: 'Defense',        industry: 'Aerospace' },
  { word: 'Energy',         industry: 'Energy' },
  { word: 'Petroleum',      industry: 'Energy' },
  { word: 'Grid',           industry: 'Energy' },
  { word: 'Construction',   industry: 'Construction' },
  { word: 'Builders',       industry: 'Construction' },
  { word: 'Infrastructure', industry: 'Construction' },
];

const CUSTOMER_REGIONS: Array<{ region: string; countries: string[]; weight: number }> = [
  { region: 'NA',    countries: ['United States', 'Canada', 'Mexico'], weight: 45 },
  { region: 'EMEA',  countries: ['Germany', 'United Kingdom', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Sweden'], weight: 30 },
  { region: 'APAC',  countries: ['Japan', 'South Korea', 'Singapore', 'Australia', 'India', 'China'], weight: 18 },
  { region: 'LATAM', countries: ['Brazil', 'Mexico', 'Chile', 'Argentina', 'Colombia'], weight: 7 },
];

const SKU_CATEGORIES: Array<{
  category: Sku['category'];
  subcategories: string[];
  costRange: [number, number];
  marginPct: [number, number];
  weightRange: [number, number];
  criticalChance: number;
  leadTimeRange: [number, number];
  shareOfCatalog: number; // weight
}> = [
  { category: 'Fasteners',     subcategories: ['Bolts', 'Nuts', 'Washers', 'Screws', 'Rivets', 'Anchors'], costRange: [0.05, 2.5],   marginPct: [40, 90], weightRange: [0.005, 0.5], criticalChance: 0.05, leadTimeRange: [7, 21],   shareOfCatalog: 24 },
  { category: 'Bearings',      subcategories: ['Ball', 'Roller', 'Tapered', 'Needle', 'Linear'],          costRange: [12, 380],     marginPct: [25, 55], weightRange: [0.2, 5.5],   criticalChance: 0.35, leadTimeRange: [21, 60],  shareOfCatalog: 16 },
  { category: 'Hydraulics',    subcategories: ['Cylinders', 'Pumps', 'Valves', 'Hoses', 'Fittings', 'Filters'], costRange: [22, 1200], marginPct: [22, 45], weightRange: [0.5, 18],  criticalChance: 0.40, leadTimeRange: [14, 56],  shareOfCatalog: 14 },
  { category: 'Electrical',    subcategories: ['Cable', 'Connectors', 'Relays', 'Sensors', 'Switches', 'Drives'], costRange: [4, 850], marginPct: [28, 60], weightRange: [0.05, 8], criticalChance: 0.28, leadTimeRange: [10, 45],  shareOfCatalog: 16 },
  { category: 'Safety',        subcategories: ['PPE', 'Lockout/Tagout', 'Signage', 'Spill Kits', 'Fall Protection'], costRange: [6, 420], marginPct: [35, 70], weightRange: [0.1, 6], criticalChance: 0.10, leadTimeRange: [5, 21], shareOfCatalog: 10 },
  { category: 'MRO',           subcategories: ['Lubricants', 'Adhesives', 'Cleaners', 'Tape', 'Tools', 'Spare Parts'], costRange: [3, 250], marginPct: [32, 65], weightRange: [0.1, 12], criticalChance: 0.12, leadTimeRange: [7, 28], shareOfCatalog: 14 },
  { category: 'Cutting Tools', subcategories: ['Drill Bits', 'End Mills', 'Inserts', 'Saw Blades', 'Reamers', 'Taps'], costRange: [8, 480],  marginPct: [30, 60], weightRange: [0.05, 3], criticalChance: 0.22, leadTimeRange: [14, 42], shareOfCatalog: 6 },
];

// === Generators ===

function generateSuppliers(rng: Rng): Supplier[] {
  const out: Supplier[] = [];
  // 200 suppliers: 60 Strategic / 70 Preferred / 70 Tactical
  const distribution: Array<{ tier: Supplier['tier']; count: number; paymentBias: Supplier['paymentTerms'][] }> = [
    { tier: 'Strategic', count: 60, paymentBias: ['NET60', 'NET60', 'NET45'] },
    { tier: 'Preferred', count: 70, paymentBias: ['NET45', 'NET45', 'NET30'] },
    { tier: 'Tactical',  count: 70, paymentBias: ['NET30', 'NET30', 'NET45'] },
  ];
  let n = 1;
  for (const tierDef of distribution) {
    for (let i = 0; i < tierDef.count; i++) {
      const regionPick = rng.weightedPick(SUPPLIER_REGIONS.map(r => ({ item: r, weight: r.weight })));
      const stem = rng.pick(SUPPLIER_NAME_STEMS);
      const suffix = rng.pick(SUPPLIER_NAME_SUFFIXES);
      const yearsAgo = rng.int(1, 12);
      const onboardedAt = daysAgo(yearsAgo * 365 + rng.int(0, 360));
      out.push({
        supplierId: `SUP-${pad(n, 4)}`,
        name: `${stem} ${suffix}`,
        country: rng.pick(regionPick.countries),
        region: regionPick.region,
        tier: tierDef.tier,
        onboardedAt,
        paymentTerms: rng.pick(tierDef.paymentBias),
        // 92% active, 6% suspended, 2% offboarded
        status: rng.chance(0.92) ? 'active' : rng.chance(0.75) ? 'suspended' : 'offboarded',
      });
      n++;
    }
  }
  return out;
}

function generateWarehouses(): Warehouse[] {
  return WAREHOUSE_LOCATIONS.map(w => ({
    warehouseId: w.id,
    name: w.name,
    country: w.country,
    region: w.region,
    type: w.type,
    capacityPallets: w.capacity,
    openedAt: daysAgo(w.openedYearsAgo * 365 + (w.id.charCodeAt(w.id.length - 1) % 200)),
  }));
}

function generateCarriers(): Carrier[] {
  return CARRIERS.map(c => ({
    carrierId: c.idSuffix,
    name: c.name,
    type: c.type,
    region: c.region,
    slaDays: c.slaDays,
  }));
}

function generateCustomers(rng: Rng): Customer[] {
  const out: Customer[] = [];
  // 2,000 customers: 200 Enterprise, 700 Mid-Market, 1,100 SMB
  const dist: Array<{ segment: Customer['segment']; count: number }> = [
    { segment: 'Enterprise', count: 200 },
    { segment: 'Mid-Market', count: 700 },
    { segment: 'SMB',        count: 1100 },
  ];
  let n = 1;
  for (const d of dist) {
    for (let i = 0; i < d.count; i++) {
      const regionPick = rng.weightedPick(CUSTOMER_REGIONS.map(r => ({ item: r, weight: r.weight })));
      const stem = rng.pick(CUSTOMER_NAME_STEMS);
      const suffixDef = rng.pick(CUSTOMER_NAME_SUFFIXES);
      const yearsAgo = rng.int(0, 9);
      out.push({
        customerId: `CUS-${pad(n, 5)}`,
        name: `${stem} ${suffixDef.word}`,
        segment: d.segment,
        industry: suffixDef.industry,
        country: rng.pick(regionPick.countries),
        region: regionPick.region,
        onboardedAt: daysAgo(yearsAgo * 365 + rng.int(0, 360)),
      });
      n++;
    }
  }
  return out;
}

function generateSkus(rng: Rng, suppliers: Supplier[]): Sku[] {
  const out: Sku[] = [];
  const totalSkus = 5000;
  const activeSuppliers = suppliers.filter(s => s.status === 'active');
  // ABC distribution: 10% A, 30% B, 60% C
  const targets = { A: Math.round(totalSkus * 0.10), B: Math.round(totalSkus * 0.30), C: totalSkus - Math.round(totalSkus * 0.10) - Math.round(totalSkus * 0.30) };

  // Build a weighted-category index → distribute SKUs across categories
  const totalCatalogWeight = SKU_CATEGORIES.reduce((s, c) => s + c.shareOfCatalog, 0);

  let n = 1;
  for (const cat of SKU_CATEGORIES) {
    const catSkuCount = Math.round(totalSkus * (cat.shareOfCatalog / totalCatalogWeight));
    for (let i = 0; i < catSkuCount; i++) {
      // Assign ABC class probabilistically per category (Bearings/Hydraulics skew B; Fasteners skews C).
      let abcClass: Sku['abcClass'];
      if (cat.category === 'Bearings' || cat.category === 'Hydraulics') {
        abcClass = rng.weightedPick([{ item: 'A' as const, weight: 18 }, { item: 'B' as const, weight: 45 }, { item: 'C' as const, weight: 37 }]);
      } else if (cat.category === 'Fasteners') {
        abcClass = rng.weightedPick([{ item: 'A' as const, weight: 6 }, { item: 'B' as const, weight: 22 }, { item: 'C' as const, weight: 72 }]);
      } else {
        abcClass = rng.weightedPick([{ item: 'A' as const, weight: 10 }, { item: 'B' as const, weight: 30 }, { item: 'C' as const, weight: 60 }]);
      }

      const unitCost = parseFloat(rng.float(cat.costRange[0], cat.costRange[1]).toFixed(2));
      const margin = rng.float(cat.marginPct[0], cat.marginPct[1]) / 100;
      const listPrice = parseFloat((unitCost * (1 + margin)).toFixed(2));
      const weight = parseFloat(rng.float(cat.weightRange[0], cat.weightRange[1]).toFixed(3));
      const subcategory = rng.pick(cat.subcategories);
      const isCritical = rng.chance(cat.criticalChance);
      const leadTimeDays = rng.int(cat.leadTimeRange[0], cat.leadTimeRange[1]);
      const supplier = rng.pick(activeSuppliers);
      const introducedAt = daysAgo(rng.int(120, 8 * 365));

      // SKU lifecycle: most active, ~3% phasing_out, ~1% discontinued (excluded from new shipments later).
      // Cutting Tools category gets elevated phase-out rate to support the demo narrative.
      let status: Sku['status'] = 'active';
      const phaseOutRate = cat.category === 'Cutting Tools' ? 0.18 : 0.03;
      if (rng.chance(phaseOutRate)) status = 'phasing_out';
      else if (rng.chance(0.012)) status = 'discontinued';

      out.push({
        skuId: `SKU-${pad(n, 5)}`,
        name: `${cat.category.slice(0, 3).toUpperCase()}-${subcategory.slice(0, 4).toUpperCase()}-${pad(n, 5)}`,
        category: cat.category,
        subcategory,
        abcClass,
        isCritical,
        unitCost,
        listPrice,
        weightKg: weight,
        primarySupplierId: supplier.supplierId,
        leadTimeDays,
        introducedAt,
        status,
      });
      n++;
    }
  }
  // Tail-fill if rounding left us short
  while (out.length < totalSkus) {
    const cat = SKU_CATEGORIES[out.length % SKU_CATEGORIES.length];
    const supplier = rng.pick(activeSuppliers);
    out.push({
      skuId: `SKU-${pad(out.length + 1, 5)}`,
      name: `${cat.category.slice(0, 3).toUpperCase()}-${cat.subcategories[0].slice(0, 4).toUpperCase()}-${pad(out.length + 1, 5)}`,
      category: cat.category,
      subcategory: cat.subcategories[0],
      abcClass: 'C',
      isCritical: false,
      unitCost: parseFloat(rng.float(cat.costRange[0], cat.costRange[1]).toFixed(2)),
      listPrice: parseFloat((rng.float(cat.costRange[0], cat.costRange[1]) * 1.5).toFixed(2)),
      weightKg: parseFloat(rng.float(cat.weightRange[0], cat.weightRange[1]).toFixed(3)),
      primarySupplierId: supplier.supplierId,
      leadTimeDays: rng.int(cat.leadTimeRange[0], cat.leadTimeRange[1]),
      introducedAt: daysAgo(rng.int(120, 8 * 365)),
      status: 'active',
    });
  }

  // Targeted anomaly hook: ensure SUP-0042 is Strategic and is the primary on a meaningful slice
  // of A-class SKUs so its OTD decline visibly drags inbound + downstream stockout metrics.
  // (Done in seedFacts where we control which suppliers degrade.)
  return out.slice(0, totalSkus);
}

// === Persistence ===

export async function seedDimensions(pool: Pool): Promise<DimensionsBundle> {
  const rng = makeRng(0xC0FFEE);

  console.log('  > generating suppliers...');
  const suppliers = generateSuppliers(rng);
  await batchInsert(
    pool,
    'suppliers',
    ['supplier_id', 'name', 'country', 'region', 'tier', 'onboarded_at', 'payment_terms', 'status'],
    suppliers,
    s => [s.supplierId, s.name, s.country, s.region, s.tier, isoDate(s.onboardedAt), s.paymentTerms, s.status]
  );
  console.log(`    seeded ${suppliers.length} suppliers`);

  console.log('  > generating warehouses...');
  const warehouses = generateWarehouses();
  await batchInsert(
    pool,
    'warehouses',
    ['warehouse_id', 'name', 'country', 'region', 'type', 'capacity_pallets', 'opened_at'],
    warehouses,
    w => [w.warehouseId, w.name, w.country, w.region, w.type, w.capacityPallets, isoDate(w.openedAt)]
  );
  console.log(`    seeded ${warehouses.length} warehouses`);

  console.log('  > generating carriers...');
  const carriers = generateCarriers();
  await batchInsert(
    pool,
    'carriers',
    ['carrier_id', 'name', 'type', 'region', 'sla_days'],
    carriers,
    c => [c.carrierId, c.name, c.type, c.region, c.slaDays]
  );
  console.log(`    seeded ${carriers.length} carriers`);

  console.log('  > generating customers...');
  const customers = generateCustomers(rng);
  await batchInsert(
    pool,
    'customers',
    ['customer_id', 'name', 'segment', 'industry', 'country', 'region', 'onboarded_at'],
    customers,
    c => [c.customerId, c.name, c.segment, c.industry, c.country, c.region, isoDate(c.onboardedAt)]
  );
  console.log(`    seeded ${customers.length} customers`);

  console.log('  > generating SKUs...');
  const skus = generateSkus(rng, suppliers);
  await batchInsert(
    pool,
    'skus',
    [
      'sku_id', 'name', 'category', 'subcategory', 'abc_class', 'is_critical',
      'unit_cost', 'list_price', 'weight_kg', 'primary_supplier_id',
      'lead_time_days', 'introduced_at', 'status',
    ],
    skus,
    s => [
      s.skuId, s.name, s.category, s.subcategory, s.abcClass, s.isCritical,
      s.unitCost, s.listPrice, s.weightKg, s.primarySupplierId,
      s.leadTimeDays, isoDate(s.introducedAt), s.status,
    ]
  );
  console.log(`    seeded ${skus.length} SKUs`);

  return { suppliers, warehouses, carriers, customers, skus };
}
