import { useState, useEffect } from 'react';
import type { FilterState } from 'shared/types';
import { getAvailableFilters } from '../../api/client';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

const DATE_PRESETS: { label: string; days: number | 'mtd' | 'ytd' }[] = [
  { label: 'Today', days: 0 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: 'MTD', days: 'mtd' },
  { label: 'YTD', days: 'ytd' },
];

function getPresetDates(preset: number | 'mtd' | 'ytd'): { dateStart: string; dateEnd: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === 'mtd') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { dateStart: start, dateEnd: end };
  }
  if (preset === 'ytd') {
    const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { dateStart: start, dateEnd: end };
  }
  if (preset === 0) {
    return { dateStart: end, dateEnd: end };
  }
  const start = new Date(now.getTime() - preset * 86400000).toISOString().slice(0, 10);
  return { dateStart: start, dateEnd: end };
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const [productLines, setProductLines] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [territories, setTerritories] = useState<string[]>([]);
  const [dealSizes, setDealSizes] = useState<string[]>([]);
  const [minDate, setMinDate] = useState<string | undefined>(undefined);
  const [maxDate, setMaxDate] = useState<string | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    getAvailableFilters().then(data => {
      setProductLines(data.productLines);
      setCountries(data.countries);
      setTerritories(data.territories);
      setDealSizes(data.dealSizes);
      setMinDate(data.minDate?.slice(0, 10) ?? undefined);
      setMaxDate(data.maxDate?.slice(0, 10) ?? undefined);
    }).catch(() => {});
  }, []);

  const activeCount = [
    filters.product_line,
    filters.country,
    filters.territory,
    filters.deal_size,
    filters.dateStart,
    filters.dateEnd,
  ].filter(Boolean).length;

  const selectCls = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10 transition';

  const handlePreset = (preset: typeof DATE_PRESETS[number]) => {
    const dates = getPresetDates(preset.days);
    setActivePreset(preset.label);
    onFilterChange({ ...filters, ...dates });
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200/60 shadow-sm">
      {/* Top row: filter icon, label, date presets */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Filters</span>
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* Date range presets */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Period</span>
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                activePreset === preset.label
                  ? 'bg-navy-700 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {activeCount > 0 && (
          <button
            onClick={() => {
              onFilterChange({});
              setActivePreset(null);
            }}
            className="rounded-lg border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50"
          >
            Clear all
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={expanded ? 'Collapse filters' : 'Expand filters'}
        >
          <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Bottom row: dropdowns and custom dates */}
      {expanded && <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <select
          value={filters.product_line || ''}
          onChange={e => onFilterChange({ ...filters, product_line: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All Product Lines</option>
          {productLines.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={filters.territory || ''}
          onChange={e => onFilterChange({ ...filters, territory: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All Territories</option>
          {territories.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filters.country || ''}
          onChange={e => onFilterChange({ ...filters, country: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={filters.deal_size || ''}
          onChange={e => onFilterChange({ ...filters, deal_size: e.target.value || undefined })}
          className={selectCls}
        >
          <option value="">All Deal Sizes</option>
          {dealSizes.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <div className="h-4 w-px bg-slate-200" />

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
          <input
            type="date"
            value={filters.dateStart || ''}
            min={minDate}
            max={maxDate}
            onChange={e => {
              setActivePreset(null);
              onFilterChange({ ...filters, dateStart: e.target.value || undefined });
            }}
            className={selectCls}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
          <input
            type="date"
            value={filters.dateEnd || ''}
            min={minDate}
            max={maxDate}
            onChange={e => {
              setActivePreset(null);
              onFilterChange({ ...filters, dateEnd: e.target.value || undefined });
            }}
            className={selectCls}
          />
        </div>
      </div>}
    </div>
  );
}
