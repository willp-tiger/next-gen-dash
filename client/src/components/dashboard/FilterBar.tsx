import { useState, useEffect } from 'react';
import type { FilterState } from 'shared/types';
import { getAvailableFilters } from '../../api/client';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<{ min: string; max: string }>({ min: '', max: '' });

  useEffect(() => {
    getAvailableFilters().then(data => {
      setMakes(data.makes);
      setModels(data.models);
      setDateRange(data.dateRange);
    }).catch(() => {});
  }, []);

  const availableModels = filters.make ? (models[filters.make] || []) : [];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filters</span>

      <select
        value={filters.make || ''}
        onChange={e => onFilterChange({
          ...filters,
          make: e.target.value || undefined,
          model: undefined, // reset model when make changes
        })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      >
        <option value="">All Makes</option>
        {makes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <select
        value={filters.model || ''}
        onChange={e => onFilterChange({ ...filters, model: e.target.value || undefined })}
        disabled={!filters.make}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">All Models</option>
        {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <input
        type="date"
        value={filters.dateFrom || ''}
        min={dateRange.min}
        max={dateRange.max}
        onChange={e => onFilterChange({ ...filters, dateFrom: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      />
      <span className="text-xs text-gray-400">to</span>
      <input
        type="date"
        value={filters.dateTo || ''}
        min={filters.dateFrom || dateRange.min}
        max={dateRange.max}
        onChange={e => onFilterChange({ ...filters, dateTo: e.target.value || undefined })}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
      />

      {(filters.make || filters.model || filters.dateFrom || filters.dateTo) && (
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
