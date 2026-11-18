import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { ChartSeriesItem, SummaryResponse } from '../types';

interface UsageChartProps {
  data: SummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

type MetricKey = 'minutes' | 'cost' | 'sms' | 'signups';

export const UsageChart: React.FC<UsageChartProps> = ({
  data,
  loading,
  error,
  onRetry
}) => {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('minutes');

  // Compute aggregate totals for the KPI cards
  const series = data?.series || [];
  const totalMinutes = series.reduce((acc, curr) => acc + curr.minutes, 0);
  const totalCostCents = series.reduce((acc, curr) => acc + curr.cost_cents, 0);
  const totalSms = series.reduce((acc, curr) => acc + curr.sms, 0);
  const totalSignups = series.reduce((acc, curr) => acc + curr.signups, 0);

  // Formatting helpers
  const formatCost = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(cents / 100);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Transform series for charting (convert cost_cents to dollars for cleaner Y-axis)
  const chartData = series.map((item: ChartSeriesItem) => ({
    ...item,
    cost: item.cost_cents / 100,
    formattedDate: formatDateLabel(item.date)
  }));

  // Metric-specific display configurations
  const metricConfigs = {
    minutes: {
      label: 'Call Minutes',
      color: '#16a34a', // Emerald 600
      fillGradient: 'url(#colorMinutes)',
      formatter: (val: number) => `${formatNumber(val)} mins`
    },
    cost: {
      label: 'Total Spend',
      color: '#2563eb', // Blue 600
      fillGradient: 'url(#colorCost)',
      formatter: (val: number) => `$${formatNumber(Math.round(val))}`
    },
    sms: {
      label: 'SMS Volume',
      color: '#8b5cf6', // Violet 600
      fillGradient: 'url(#colorSms)',
      formatter: (val: number) => `${formatNumber(val)} sms`
    },
    signups: {
      label: 'New Signups',
      color: '#f59e0b', // Amber 500
      fillGradient: 'url(#colorSignups)',
      formatter: (val: number) => `${formatNumber(val)} accounts`
    }
  };

  const currentConfig = metricConfigs[activeMetric];

  // -------------------------------------------------------------
  // STATE 1: LOADING SKELETON STATE
  // -------------------------------------------------------------
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 md:p-6 shadow-sm mb-6 animate-pulse">
        {/* Skeleton Header & Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-100 rounded-xl p-3.5 h-20"></div>
          ))}
        </div>
        {/* Skeleton Chart Box */}
        <div className="h-64 bg-slate-100 rounded-xl w-full"></div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: PARTIAL-FAILURE ERROR STATE (The Deliberate 500 Trap!)
  // -------------------------------------------------------------
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200/80 p-6 md:p-8 shadow-sm mb-6">
        <div className="flex flex-col items-center justify-center text-center py-6">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-4 ring-8 ring-rose-50/50">
            {/* Inline Warning SVG */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Usage Trend Unavailable
          </h3>
          <p className="text-sm text-slate-500 max-w-md mb-5 leading-relaxed">
            The analytics server returned a temporary error (500). Your accounts table and data operations remain completely functional.
          </p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 active:scale-95"
          >
            {/* Inline Reload SVG */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry Loading Chart
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3: EMPTY STATE
  // -------------------------------------------------------------
  if (series.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm mb-6 text-center">
        <p className="text-sm text-slate-500">No telemetry activity found for the selected date range.</p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 4: SUCCESS / LIVE INTERACTIVE CHART
  // -------------------------------------------------------------
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 md:p-6 shadow-sm mb-6 transition-all">
      {/* Top Section: KPI Cards with Breathing Room */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {/* KPI 1: Minutes */}
        <div
          onClick={() => setActiveMetric('minutes')}
          className={`cursor-pointer p-4 rounded-xl border transition-all text-left ${
            activeMetric === 'minutes'
              ? 'border-emerald-500/50 bg-emerald-50/30 ring-1 ring-emerald-500/20'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
            <span>Call Minutes</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
            {formatNumber(totalMinutes)}
          </div>
        </div>

        {/* KPI 2: Spend */}
        <div
          onClick={() => setActiveMetric('cost')}
          className={`cursor-pointer p-4 rounded-xl border transition-all text-left ${
            activeMetric === 'cost'
              ? 'border-blue-500/50 bg-blue-50/30 ring-1 ring-blue-500/20'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
            <span>Total Spend</span>
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <div className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
            {formatCost(totalCostCents)}
          </div>
        </div>

        {/* KPI 3: SMS */}
        <div
          onClick={() => setActiveMetric('sms')}
          className={`cursor-pointer p-4 rounded-xl border transition-all text-left ${
            activeMetric === 'sms'
              ? 'border-violet-500/50 bg-violet-50/30 ring-1 ring-violet-500/20'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
            <span>SMS Dispatched</span>
            <span className="w-2 h-2 rounded-full bg-violet-500"></span>
          </div>
          <div className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
            {formatNumber(totalSms)}
          </div>
        </div>

        {/* KPI 4: Signups */}
        <div
          onClick={() => setActiveMetric('signups')}
          className={`cursor-pointer p-4 rounded-xl border transition-all text-left ${
            activeMetric === 'signups'
              ? 'border-amber-500/50 bg-amber-50/30 ring-1 ring-amber-500/20'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
            <span>New Accounts</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
            {formatNumber(totalSignups)}
          </div>
        </div>
      </div>

      {/* Metric Selector Tabs for Mobile / Accessibility */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {(['minutes', 'cost', 'sms', 'signups'] as MetricKey[]).map((metric) => (
            <button
              key={metric}
              onClick={() => setActiveMetric(metric)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                activeMetric === metric
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {metric === 'cost' ? 'Spend ($)' : metric}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
          <span>{series.length} Day Window</span>
        </div>
      </div>

      {/* Responsive Recharts Area Container */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorSms" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

            <XAxis
              dataKey="formattedDate"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
            />

            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => {
                if (val >= 1000) return `${Math.round(val / 1000)}k`;
                return val;
              }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-800 space-y-1">
                      <div className="text-slate-400 font-medium pb-1 border-b border-slate-800">
                        {item.date}
                      </div>
                      <div className="text-emerald-400 font-medium">
                        Minutes: {formatNumber(item.minutes)}
                      </div>
                      <div className="text-blue-400 font-medium">
                        Spend: {formatCost(item.cost_cents)}
                      </div>
                      <div className="text-violet-400 font-medium">
                        SMS: {formatNumber(item.sms)}
                      </div>
                      <div className="text-amber-400 font-medium">
                        Signups: {formatNumber(item.signups)}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Area
              type="monotone"
              dataKey={activeMetric}
              stroke={currentConfig.color}
              strokeWidth={2.5}
              fillOpacity={1}
              fill={currentConfig.fillGradient}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

