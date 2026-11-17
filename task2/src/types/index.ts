// Account entity returned by GET /accounts
export interface Account {
  id: number;
  name: string;
  email: string;
  company: string;
  country: string;
  plan: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'trial' | 'suspended';
  signup_date: string;
  current_month_minutes: number;
  current_month_sms: number;
  cost_cents: number;
  last_active: string;
}

// Paginated API response from GET /accounts
export interface AccountsResponse {
  data: Account[];
  total: number;
  page: number;
  page_size: number;
}

// Daily metrics series item for GET /accounts/summary
export interface ChartSeriesItem {
  date: string;
  minutes: number;
  sms: number;
  cost_cents: number;
  signups: number;
}

// Response from GET /accounts/summary
export interface SummaryResponse {
  series: ChartSeriesItem[];
  total_accounts: number;
}

// Query parameters for filtering and sorting the accounts table
export interface AccountsFilterParams {
  page: number;
  page_size: number;
  search?: string;
  status?: string;
  country?: string;
  plan?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

// Form Step 1: Basic Identity
export interface Step1Data {
  name: string;
  email: string;
}

// Form Step 2: Plan & Billing
export interface Step2Data {
  plan: 'basic' | 'pro' | 'enterprise';
  billing_country: 'US' | 'IN' | 'GB' | 'CA' | 'AU' | '';
}

// Form Step 3: Threshold Caps
export interface Step3Data {
  minutes_cap?: number | '';
  sms_cap?: number | '';
}

// Form Step 4: Webhook Integration
export interface Step4Data {
  webhook_url?: string;
}

// Saved Settings structure returned by GET /accounts/{id}/settings
export interface SettingsDraft {
  "1"?: Step1Data;
  "2"?: Step2Data;
  "3"?: Step3Data;
  "4"?: Step4Data;
}

// Server-side validation error structure
export interface StepValidationError {
  step: number;
  errors: Record<string, string>;
}

