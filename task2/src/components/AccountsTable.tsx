import React from 'react';
import { Account, AccountsFilterParams } from '../types';

interface AccountsTableProps {
  accounts: Account[];
  total: number;
  loading: boolean;
  error: string | null;
  filters: AccountsFilterParams;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onSortChange: (column: string) => void;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  onOpenSettings: (account: Account) => void;
  onRetry: () => void;
}

export const AccountsTable: React.FC<AccountsTableProps> = ({
  accounts,
  total,
  loading,
  error,
  filters,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onOpenSettings,
  onRetry
}) => {
  const currentPage = filters.page || 1;
  const pageSize = filters.page_size || 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Determine master checkbox state for the visible page
  const allCurrentPageSelected =
    accounts.length > 0 && accounts.every((acc) => selectedIds.has(acc.id));
  const someCurrentPageSelected =
    accounts.some((acc) => selectedIds.has(acc.id)) && !allCurrentPageSelected;

  // Currency & number formatting helpers
  const formatCost = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(cents / 100);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Status badge styling
  const renderStatusBadge = (status: Account['status']) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-emerald-600/20',
      trial: 'bg-blue-50 text-blue-700 border-blue-200/60 ring-blue-600/20',
      suspended: 'bg-rose-50 text-rose-700 border-rose-200/60 ring-rose-600/20'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          status === 'active' ? 'bg-emerald-500' : status === 'trial' ? 'bg-blue-500' : 'bg-rose-500'
        }`} />
        <span className="capitalize">{status}</span>
      </span>
    );
  };

  // Plan badge styling
  const renderPlanBadge = (plan: Account['plan']) => {
    const styles = {
      basic: 'text-slate-600 bg-slate-100',
      pro: 'text-violet-700 bg-violet-50 border border-violet-200/50',
      enterprise: 'text-amber-700 bg-amber-50 border border-amber-200/50'
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider ${styles[plan]}`}>
        {plan}
      </span>
    );
  };

  // Helper to render sort indicator arrow
  const renderSortIndicator = (column: string) => {
    if (filters.sort_by !== column) {
      return (
        <span className="ml-1 text-slate-300 group-hover:text-slate-400 text-xs">↕</span>
      );
    }
    return (
      <span className="ml-1 text-slate-900 font-bold text-xs">
        {filters.sort_dir === 'desc' ? '↓' : '↑'}
      </span>
    );
  };

  // -------------------------------------------------------------
  // STATE 1: ERROR STATE WITH RETRY
  // -------------------------------------------------------------
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 shadow-sm text-center my-6">
        <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Failed to load accounts</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
      {/* Table responsive container (Usable at 375px mobile width via smooth horizontal scroll) */}
      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold tracking-wider uppercase text-[10px]">
              {/* Select All Checkbox */}
              <th className="py-3.5 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allCurrentPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someCurrentPageSelected;
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Select all accounts on current page"
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0 cursor-pointer"
                />
              </th>

              {/* Account (Name, Email, Company) */}
              <th
                onClick={() => onSortChange('name')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none"
              >
                <div className="flex items-center">
                  <span>Account</span>
                  {renderSortIndicator('name')}
                </div>
              </th>

              {/* Plan */}
              <th
                onClick={() => onSortChange('plan')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none"
              >
                <div className="flex items-center">
                  <span>Plan</span>
                  {renderSortIndicator('plan')}
                </div>
              </th>

              {/* Status */}
              <th
                onClick={() => onSortChange('status')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none"
              >
                <div className="flex items-center">
                  <span>Status</span>
                  {renderSortIndicator('status')}
                </div>
              </th>

              {/* Country */}
              <th
                onClick={() => onSortChange('country')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none"
              >
                <div className="flex items-center">
                  <span>Country</span>
                  {renderSortIndicator('country')}
                </div>
              </th>

              {/* Current Month Minutes */}
              <th
                onClick={() => onSortChange('current_month_minutes')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none text-right"
              >
                <div className="flex items-center justify-end">
                  <span>Minutes</span>
                  {renderSortIndicator('current_month_minutes')}
                </div>
              </th>

              {/* Current Month Cost */}
              <th
                onClick={() => onSortChange('cost_cents')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none text-right"
              >
                <div className="flex items-center justify-end">
                  <span>Spend (USD)</span>
                  {renderSortIndicator('cost_cents')}
                </div>
              </th>

              {/* Signup Date */}
              <th
                onClick={() => onSortChange('signup_date')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 group select-none"
              >
                <div className="flex items-center">
                  <span>Joined</span>
                  {renderSortIndicator('signup_date')}
                </div>
              </th>

              {/* Action */}
              <th className="py-3.5 px-4 text-center">Settings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {/* ------------------------------------------------------------- */}
            {/* STATE 2: LOADING SKELETON ROWS */}
            {/* ------------------------------------------------------------- */}
            {loading && accounts.length === 0 ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="py-4 px-4 text-center"><div className="w-4 h-4 bg-slate-100 rounded mx-auto" /></td>
                  <td className="py-4 px-4"><div className="w-36 h-3.5 bg-slate-100 rounded mb-1.5" /><div className="w-24 h-2.5 bg-slate-100 rounded" /></td>
                  <td className="py-4 px-4"><div className="w-14 h-4 bg-slate-100 rounded" /></td>
                  <td className="py-4 px-4"><div className="w-16 h-4 bg-slate-100 rounded" /></td>
                  <td className="py-4 px-4"><div className="w-8 h-3 bg-slate-100 rounded" /></td>
                  <td className="py-4 px-4 text-right"><div className="w-12 h-3.5 bg-slate-100 rounded ml-auto" /></td>
                  <td className="py-4 px-4 text-right"><div className="w-16 h-3.5 bg-slate-100 rounded ml-auto" /></td>
                  <td className="py-4 px-4"><div className="w-20 h-3 bg-slate-100 rounded" /></td>
                  <td className="py-4 px-4 text-center"><div className="w-14 h-6 bg-slate-100 rounded mx-auto" /></td>
                </tr>
              ))
            ) : accounts.length === 0 ? (
              /* ------------------------------------------------------------- */
              /* STATE 3: EMPTY STATE */
              /* ------------------------------------------------------------- */
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-700">No accounts found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try relaxing your search terms or clearing filters.</p>
                </td>
              </tr>
            ) : (
              /* ------------------------------------------------------------- */
              /* STATE 4: SUCCESS DATA ROWS */
              /* ------------------------------------------------------------- */
              accounts.map((acc) => {
                const isSelected = selectedIds.has(acc.id);
                return (
                  <tr
                    key={acc.id}
                    className={`hover:bg-slate-50/80 transition-colors group ${
                      isSelected ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    {/* Stable Selection Checkbox */}
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(acc.id)}
                        aria-label={`Select account ${acc.name}`}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>

                    {/* Account Identity */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 hover:text-brand-700 transition-colors">
                        {acc.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {acc.email} · <span className="text-slate-500 font-sans">{acc.company}</span>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-4">
                      {renderPlanBadge(acc.plan)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {renderStatusBadge(acc.status)}
                    </td>

                    {/* Country */}
                    <td className="py-3 px-4 font-mono font-medium text-slate-600">
                      {acc.country}
                    </td>

                    {/* Minutes (Drifts smoothly on poll without jumping) */}
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      {formatNumber(acc.current_month_minutes)}
                    </td>

                    {/* Spend Cents formatted as USD */}
                    <td className="py-3 px-4 text-right font-semibold text-slate-900">
                      {formatCost(acc.cost_cents)}
                    </td>

                    {/* Joined Date */}
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {acc.signup_date}
                    </td>

                    {/* Configure Settings Trigger */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onOpenSettings(acc)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-900 hover:text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 active:scale-95"
                      >
                        Settings
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3.5 md:p-4 bg-slate-50/75 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>Show:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <span className="hidden sm:inline text-slate-400">·</span>
          <span>
            Showing <strong className="text-slate-800">{accounts.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> -{' '}
            <strong className="text-slate-800">{Math.min(currentPage * pageSize, total)}</strong> of{' '}
            <strong className="text-slate-800">{formatNumber(total)}</strong> accounts
          </span>
        </div>

        {/* Page Nav Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Previous
          </button>

          <span className="px-3 py-1.5 font-medium text-slate-800">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

