import { useState, useEffect } from 'react';
import type { FilterState } from 'shared/types';
import { getAvailableFilters } from '../../api/client';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const [productLines, setProductLines] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [territories, setTerritories] = useState<string[]>([]);
  const [dealSizes, setDealSizes] = useState<string[]>([]);

  useEffect(() => {
    getAvailableFilters().then(data => {
      setProductLines(data.productLines);
      setCountries(data.countries);
      setTerritories(data.territories);
      setDealSizes(data.dealSizes);
    }).catch(() => {});
  }, []);

  const hasFilters = filters.product_line || filters.country || filters.territory || filters.deal_size;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filters</span>

      <select
        value={filters.product_line || ''}
        onChange={e => onFilterChange({ ...filters, product_line: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      >
        <option value="">All Product Lines</option>
        {productLines.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <select
        value={filters.territory || ''}
        onChange={e => onFilterChange({ ...filters, territory: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      >
        <option value="">All Territories</option>
        {territories.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        value={filters.country || ''}
        onChange={e => onFilterChange({ ...filters, country: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      >
        <option value="">All Countries</option>
        {countries.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        value={filters.deal_size || ''}
        onChange={e => onFilterChange({ ...filters, deal_size: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      >
        <option value="">All Deal Sizes</option>
        {dealSizes.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      {hasFilters && (
        <button
          onClick={() => onFilterChange({})}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}
