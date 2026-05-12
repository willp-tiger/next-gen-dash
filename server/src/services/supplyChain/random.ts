import type { Pool } from 'pg';

export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  float: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  weightedPick: <T>(items: ReadonlyArray<{ item: T; weight: number }>) => T;
  chance: (p: number) => boolean;
  normal: (mean: number, stddev: number) => number;
};

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    pick: arr => arr[Math.floor(next() * arr.length)],
    weightedPick: items => {
      const total = items.reduce((s, x) => s + x.weight, 0);
      let r = next() * total;
      for (const x of items) {
        r -= x.weight;
        if (r <= 0) return x.item;
      }
      return items[items.length - 1].item;
    },
    chance: p => next() < p,
    normal: (mean, stddev) => {
      const u1 = Math.max(next(), 1e-9);
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    },
  };
}

// === Date helpers: anchor-to-today convention ===

export const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

export function daysAgo(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function dateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(d: Date): boolean {
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 0 && day === 1) return true; // New Year's
  if (m === 6 && day === 4) return true; // July 4
  if (m === 11 && (day === 24 || day === 25 || day === 26 || day === 31)) return true; // Christmas/NYE
  if (m === 10 && day >= 23 && day <= 27) return true; // Thanksgiving-ish week
  return false;
}

// Seasonal multiplier for shipment / order volume. Q4 peak, Q1 dip, mild summer dip.
export function seasonalMultiplier(d: Date): number {
  const m = d.getMonth();
  if (m === 10 || m === 11) return 1.35; // Nov-Dec peak
  if (m === 9) return 1.18; // Oct ramp
  if (m === 0 || m === 1) return 0.82; // Jan-Feb dip
  if (m === 6 || m === 7) return 0.92; // Jul-Aug summer dip
  return 1.0;
}

// === Bulk insert helper ===

export async function batchInsert<T>(
  pool: Pool,
  tableName: string,
  columns: string[],
  rows: T[],
  rowToValues: (row: T) => unknown[],
  batchSize = 500
): Promise<void> {
  if (rows.length === 0) return;
  const colList = columns.join(', ');
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const row of batch) {
      const values = rowToValues(row);
      placeholders.push(`(${values.map(() => `$${p++}`).join(', ')})`);
      params.push(...values);
    }
    await pool.query(
      `INSERT INTO ${tableName} (${colList}) VALUES ${placeholders.join(', ')}`,
      params
    );
  }
}

// === Format helpers ===

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
