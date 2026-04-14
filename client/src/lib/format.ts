// Shared value formatters for dashboard tiles and charts.
// Goal: client-presentable numbers — currency symbols, % suffix, K/M/B
// abbreviation for large values, thousands separators for small ones.

export type Unit = 'dollars' | 'percent' | 'count' | string;

interface FormatOptions {
  // 'full' keeps full precision with commas (e.g. $1,234,567)
  // 'compact' abbreviates large values (e.g. $1.23M)
  mode?: 'full' | 'compact';
  // Force this many fraction digits. Defaults depend on unit + magnitude.
  maxFractionDigits?: number;
}

function abbreviate(n: number, maxFrac = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(maxFrac)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(maxFrac)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(maxFrac)}K`;
  return `${sign}${abs.toFixed(abs % 1 === 0 ? 0 : Math.min(maxFrac, 1))}`;
}

function withCommas(n: number, maxFrac: number): string {
  return n.toLocaleString('en-US', {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: n % 1 === 0 ? 0 : Math.min(maxFrac, 1),
  });
}

export function formatValue(
  value: number | string | null | undefined,
  unit: Unit = '',
  options: FormatOptions = {}
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return value;
    value = parsed;
  }
  if (!Number.isFinite(value)) return '—';

  const { mode = 'compact', maxFractionDigits } = options;
  const u = (unit || '').toLowerCase();

  if (u === 'dollars') {
    const maxFrac = maxFractionDigits ?? 2;
    if (mode === 'compact' && Math.abs(value) >= 1000) {
      return `$${abbreviate(value, 2)}`;
    }
    return `$${withCommas(value, maxFrac)}`;
  }

  if (u === 'percent') {
    const maxFrac = maxFractionDigits ?? 1;
    return `${withCommas(value, maxFrac)}%`;
  }

  if (u === 'count') {
    const maxFrac = maxFractionDigits ?? 0;
    if (mode === 'compact' && Math.abs(value) >= 10_000) {
      return abbreviate(value, 2);
    }
    return withCommas(value, maxFrac);
  }

  // Unknown unit: format number cleanly, append unit word if short
  const maxFrac = maxFractionDigits ?? 1;
  const num = mode === 'compact' && Math.abs(value) >= 10_000
    ? abbreviate(value, 2)
    : withCommas(value, maxFrac);
  return unit ? `${num} ${unit}` : num;
}

// Format just the numeric part (no $ or %) — useful when unit is rendered separately
export function formatNumber(
  value: number | string | null | undefined,
  options: FormatOptions = {}
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const { mode = 'compact', maxFractionDigits = 1 } = options;
  if (mode === 'compact' && Math.abs(n) >= 10_000) return abbreviate(n, 2);
  return withCommas(n, maxFractionDigits);
}

// Short axis-label formatter (e.g. Y-axis ticks, compact bar labels)
export function formatAxis(value: number, unit: Unit = ''): string {
  return formatValue(value, unit, { mode: 'compact' });
}

// Percent delta with sign + arrow — used for change indicators
export function formatDelta(delta: number): string {
  const arrow = delta >= 0 ? '\u2191' : '\u2193';
  return `${arrow} ${Math.abs(delta).toFixed(1)}%`;
}
