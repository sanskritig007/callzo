import {
  Account,
  AccountsFilterParams,
  AccountsResponse,
  SettingsDraft,
  SummaryResponse
} from '../types';

/**
 * Custom Error class that retains HTTP status code and server validation payloads.
 * Essential for handling the Mock API's deliberate 500 error on /summary
 * and deliberate 422 error on /settings/step/2.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public step?: number,
    public fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Configurable Mock API Base URL (defaults to localhost:8001 for host browser)
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8001';

/**
 * Health probe
 */
export async function getHealth(): Promise<{ status: string; accounts: number }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new ApiError(res.status, 'Mock API health check failed');
  }
  return res.json();
}

/**
 * Fetch accounts with server-side pagination, search, sorting, and multi-filters
 */
export async function getAccounts(params: AccountsFilterParams): Promise<AccountsResponse> {
  const query = new URLSearchParams();

  query.set('page', String(params.page || 1));
  query.set('page_size', String(params.page_size || 50));

  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.status) query.set('status', params.status);
  if (params.country) query.set('country', params.country);
  if (params.plan) query.set('plan', params.plan);
  if (params.date_from) query.set('date_from', params.date_from);
  if (params.date_to) query.set('date_to', params.date_to);
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.sort_dir) query.set('sort_dir', params.sort_dir);

  const res = await fetch(`${API_BASE}/accounts?${query.toString()}`);
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to fetch accounts (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch a single account by ID
 */
export async function getAccountById(id: number): Promise<Account> {
  const res = await fetch(`${API_BASE}/accounts/${id}`);
  if (!res.ok) {
    throw new ApiError(res.status, `Account #${id} not found`);
  }
  return res.json();
}

/**
 * Fetch aggregated usage for the summary chart.
 * Spec Trap 1: Deliberately fails with HTTP 500 roughly 1 in 5 calls.
 * Throws a typed ApiError so the UI can render an inline retry box without crashing.
 */
export async function getSummary(dateFrom?: string, dateTo?: string): Promise<SummaryResponse> {
  const query = new URLSearchParams();
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);

  const qs = query.toString();
  const url = `${API_BASE}/accounts/summary${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);
  if (!res.ok) {
    // Deliberate 500 handling
    throw new ApiError(
      res.status,
      res.status === 500
        ? 'Usage summary temporarily unavailable (Server 500 error)'
        : `Failed to fetch summary (HTTP ${res.status})`
    );
  }
  return res.json();
}

/**
 * Retrieve saved draft settings for an account (repopulates form on load)
 */
export async function getSettings(accountId: number): Promise<SettingsDraft> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/settings`);
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to load settings for account #${accountId}`);
  }
  return res.json();
}

/**
 * Autosave a specific step's data.
 * Spec Trap 2: After Step 4 is filled, Step 2 will reject billing_country with 422.
 * This function parses the validation details and throws an ApiError with step & fieldErrors.
 */
export async function saveSettingsStep(
  accountId: number,
  step: number,
  data: Record<string, any>
): Promise<{ step: number; saved: boolean; data: any }> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/settings/step/${step}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 422 && json.detail) {
      // Deliberate Step 2 validation trap
      const targetStep = json.detail.step || step;
      const errors = json.detail.errors || {};
      throw new ApiError(
        422,
        `Validation failed on Step ${targetStep}`,
        targetStep,
        errors
      );
    }
    throw new ApiError(res.status, json.message || `Failed to save step ${step}`);
  }

  return json;
}

/**
 * Finalize settings submission. Requires all 4 steps to be saved.
 */
export async function submitSettings(accountId: number): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/settings/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.detail || json.message || 'All 4 steps must be saved before submitting'
    );
  }

  return json;
}

