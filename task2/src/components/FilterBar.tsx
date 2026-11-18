import React, { useEffect, useState } from 'react';
import { AccountsFilterParams } from '../types';

interface FilterBarProps {
  filters: AccountsFilterParams;
  onFilterChange: (newFilters: Partial<AccountsFilterParams>) => void;
  onResetFilters: () => void;
  selectedCount: number;
  onClearSelection: () => void;
  isSyncing: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  selectedCount,
  onClearSelection,
  isSyncing
}) => {
  // Local state for debounced search input
  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Debounce search input by 300ms so we don't spam the server on every letter
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput !== (filters.search || '')) {
        onFilterChange({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput, filters.search, onFilterChange]);

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status ||
    filters.country ||
    filters.plan ||
    filters.date_from ||
    filters.date_to
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 md:p-5 shadow-sm mb-6 space-y-4">
      {/* Top Row: Search + Status sync pill + Selection summary */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            {/* Inline Search SVG */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search accounts by name, email, or company..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                onFilterChange({ search: '', page: 1 });
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sync Status & Stable Selection Count */}
        <div className="flex items-center gap-3">
          {/* Periodic Sync Badge */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing drift...' : 'Live auto-refresh'}</span>
          </div>

          {/* Stable Selection Badge across Pages */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xs">
              <span>{selectedCount} selected</span>
              <button
                onClick={onClearSelection}
                className="text-slate-300 hover:text-white underline ml-1 cursor-pointer focus:outline-none"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Multi-Dropdown Filters & Date Pickers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
        {/* Status Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => onFilterChange({ status: e.target.value || undefined, page: 1 })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* Plan Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Plan
          </label>
          <select
            value={filters.plan || ''}
            onChange={(e) => onFilterChange({ plan: e.target.value || undefined, page: 1 })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">All Plans</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Country Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Country
          </label>
          <select
            value={filters.country || ''}
            onChange={(e) => onFilterChange({ country: e.target.value || undefined, page: 1 })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">All Countries</option>
            <option value="US">United States (US)</option>
            <option value="IN">India (IN)</option>
            <option value="GB">United Kingdom (GB)</option>
            <option value="CA">Canada (CA)</option>
            <option value="AU">Australia (AU)</option>
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Signup From
          </label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onFilterChange({ date_from: e.target.value || undefined, page: 1 })}
            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Signup To
          </label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onFilterChange({ date_to: e.target.value || undefined, page: 1 })}
            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Reset Action */}
        <div className="flex items-end">
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="w-full px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

