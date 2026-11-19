import { useState, useEffect, useCallback, useRef } from 'react';
import { Account, AccountsFilterParams, SummaryResponse } from './types';
import { getAccounts, getSummary } from './api/client';
import { UsageChart } from './components/UsageChart';
import { FilterBar } from './components/FilterBar';
import { AccountsTable } from './components/AccountsTable';
import { SettingsDrawer } from './components/SettingsDrawer';

export function App() {
  // -------------------------------------------------------------
  // STATE MANAGEMENT
  // URL & Client State Separation (Deliverable Requirement)
  // -------------------------------------------------------------

  // Filters State
  const [filters, setFilters] = useState<AccountsFilterParams>({
    page: 1,
    page_size: 50,
    search: '',
    status: '',
    country: '',
    plan: '',
    sort_by: 'signup_date',
    sort_dir: 'desc',
    date_from: '',
    date_to: ''
  });

  // Table Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // Summary Chart Data State (Handles Deliberate 500 failure isolated)
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // STABLE SELECTION STATE ACROSS PAGES (Spec Requirement)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Background Auto-Refresh / Drift State (Spec Requirement: No UI jumping)
  const [isSyncing, setIsSyncing] = useState(false);

  // Settings Drawer State
  const [drawerAccount, setDrawerAccount] = useState<Account | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // -------------------------------------------------------------
  // DATA FETCHING
  // -------------------------------------------------------------

  // Fetch Accounts (Quiet background updates preserve selection & avoid jumping)
  const fetchAccountsData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingAccounts(true);
    else setIsSyncing(true);

    try {
      setAccountsError(null);
      const res = await getAccounts(filters);
      setAccounts(res.data);
      setTotalAccounts(res.total);
    } catch (err: any) {
      if (!isBackground) {
        setAccountsError(err.message || 'Failed to load accounts');
      }
    } finally {
      setLoadingAccounts(false);
      setIsSyncing(false);
    }
  }, [filters]);

  // Fetch Summary for the chart
  const fetchSummaryData = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await getSummary(filters.date_from, filters.date_to);
      setSummaryData(res);
    } catch (err: any) {
      // Deliberate 500 error handled here without breaking table
      setSummaryError(err.message || 'Summary temporarily unavailable');
    } finally {
      setLoadingSummary(false);
    }
  }, [filters.date_from, filters.date_to]);

  // Initial load & when filters change
  useEffect(() => {
    fetchAccountsData(false);
  }, [fetchAccountsData]);

  // Load summary chart when date filters change
  useEffect(() => {
    fetchSummaryData();
  }, [fetchSummaryData]);

  // Periodic Auto-Refresh for Live Data Drift (every 25 seconds)
  // Spec: "Data refreshes periodically. The UI must not jump or lose the user's selection during a refresh."
  const fetchAccountsRef = useRef(fetchAccountsData);
  fetchAccountsRef.current = fetchAccountsData;

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccountsRef.current(true); // background refresh = true
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------
  // FILTER & SELECTION HANDLERS
  // -------------------------------------------------------------

  const handleFilterChange = (newFilters: Partial<AccountsFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      page: 1,
      page_size: 50,
      search: '',
      status: '',
      country: '',
      plan: '',
      sort_by: 'signup_date',
      sort_dir: 'desc',
      date_from: '',
      date_to: ''
    });
  };

  // Toggle single row checkbox
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle all rows on the current page
  const handleToggleSelectAll = () => {
    const allSelectedOnPage = accounts.every((acc) => selectedIds.has(acc.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        accounts.forEach((acc) => next.delete(acc.id));
      } else {
        accounts.forEach((acc) => next.add(acc.id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Sorting Handler
  const handleSortChange = (column: string) => {
    setFilters((prev) => {
      if (prev.sort_by === column) {
        return {
          ...prev,
          sort_dir: prev.sort_dir === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        ...prev,
        sort_by: column,
        sort_dir: 'asc'
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-medium flex items-center gap-2 border border-slate-700 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Bar with Breathing Space */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold text-base shadow-sm">
              C
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">
                  Callzo Admin Console
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                  Live Usage
                </span>
              </div>
              <p className="text-xs text-slate-400">Telephony Metering & Accounts Management</p>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => {
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - 30);
                handleFilterChange({
                  date_from: past.toISOString().split('T')[0],
                  date_to: today.toISOString().split('T')[0],
                  page: 1
                });
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => handleFilterChange({ date_from: '', date_to: '', page: 1 })}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-medium"
            >
              All Time
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        
        {/* Section 1: Interactive Summary Chart (with isolated 500 error & retry) */}
        <section aria-label="Usage Analytics Trend">
          <UsageChart
            data={summaryData}
            loading={loadingSummary}
            error={summaryError}
            onRetry={fetchSummaryData}
          />
        </section>

        {/* Section 2: Filters Bar */}
        <section aria-label="Search and Multi-Filters">
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            selectedCount={selectedIds.size}
            onClearSelection={handleClearSelection}
            isSyncing={isSyncing}
          />
        </section>

        {/* Section 3: Server-side Data Table with Stable Selection */}
        <section aria-label="Accounts Data Table">
          <AccountsTable
            accounts={accounts}
            total={totalAccounts}
            loading={loadingAccounts}
            error={accountsError}
            filters={filters}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onSortChange={handleSortChange}
            onPageChange={(page) => handleFilterChange({ page })}
            onPageSizeChange={(page_size) => handleFilterChange({ page_size, page: 1 })}
            onOpenSettings={(acc) => {
              setDrawerAccount(acc);
              setIsDrawerOpen(true);
            }}
            onRetry={() => fetchAccountsData(false)}
          />
        </section>

      </main>

      {/* 4-Step Settings Drawer (Wizard with Autosave, Rollback & Trap 2 Solution) */}
      <SettingsDrawer
        account={drawerAccount}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={() => {
          showToast(`Settings for ${drawerAccount?.name || 'account'} successfully updated!`);
          fetchAccountsData(true);
        }}
      />
    </div>
  );
}

export default App;

