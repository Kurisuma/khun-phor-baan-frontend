import type { ApiProblem } from '../contracts/api-contract';

let activeBaseCurrency = 'THB';
let activeDisplayCurrency = 'THB';

export interface FxRateItem {
  currency: string;
  mid_rate: number;
  customer_rate: number;
  fee_percent: number;
  volatility_tier: string;
  volatility_buffer_percent: number;
  source: string;
  is_stale: boolean;
  updated_at: string;
}

export interface SupportedCurrencyItem {
  code: string;
  label: string;
  symbol: string;
  flag: string;
}

export const SUPPORTED_DISPLAY_CURRENCIES: SupportedCurrencyItem[] = [
  { code: 'THB', label: 'Thai Baht (THB)', symbol: '฿', flag: '🇹🇭' },
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€', flag: '🇪🇺' },
  { code: 'JPY', label: 'Japanese Yen (JPY)', symbol: '¥', flag: '🇯🇵' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£', flag: '🇬🇧' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)', symbol: 'S$', flag: '🇸🇬' },
  { code: 'CNY', label: 'Chinese Yuan (CNY)', symbol: '¥', flag: '🇨🇳' },
  { code: 'MYR', label: 'Malaysian Ringgit (MYR)', symbol: 'RM', flag: '🇲🇾' },
  { code: 'KRW', label: 'South Korean Won (KRW)', symbol: '₩', flag: '🇰🇷' },
  { code: 'VND', label: 'Vietnamese Dong (VND)', symbol: '₫', flag: '🇻🇳' },
];

let cachedRates: Record<string, FxRateItem> = {
  USD: { currency: 'USD', mid_rate: 1 / 36.80, customer_rate: (1 / 36.80) * 1.0275, fee_percent: 2.0, volatility_tier: 'TIER_1_LOW', volatility_buffer_percent: 0.75, source: 'BOT', is_stale: false, updated_at: '' },
  EUR: { currency: 'EUR', mid_rate: 1 / 40.10, customer_rate: (1 / 40.10) * 1.0275, fee_percent: 2.0, volatility_tier: 'TIER_1_LOW', volatility_buffer_percent: 0.75, source: 'BOT', is_stale: false, updated_at: '' },
  JPY: { currency: 'JPY', mid_rate: 1 / 0.245, customer_rate: (1 / 0.245) * 1.0275, fee_percent: 2.0, volatility_tier: 'TIER_1_LOW', volatility_buffer_percent: 0.75, source: 'BOT', is_stale: false, updated_at: '' },
  GBP: { currency: 'GBP', mid_rate: 1 / 46.50, customer_rate: (1 / 46.50) * 1.0275, fee_percent: 2.0, volatility_tier: 'TIER_1_LOW', volatility_buffer_percent: 0.75, source: 'BOT', is_stale: false, updated_at: '' },
  SGD: { currency: 'SGD', mid_rate: 1 / 27.80, customer_rate: (1 / 27.80) * 1.0275, fee_percent: 2.0, volatility_tier: 'TIER_1_LOW', volatility_buffer_percent: 0.75, source: 'BOT', is_stale: false, updated_at: '' },
  CNY: { currency: 'CNY', mid_rate: 1 / 5.10, customer_rate: (1 / 5.10) * 1.040, fee_percent: 2.0, volatility_tier: 'TIER_2_MODERATE', volatility_buffer_percent: 2.0, source: 'BOT', is_stale: false, updated_at: '' },
  MYR: { currency: 'MYR', mid_rate: 1 / 8.20, customer_rate: (1 / 8.20) * 1.040, fee_percent: 2.0, volatility_tier: 'TIER_2_MODERATE', volatility_buffer_percent: 2.0, source: 'BOT', is_stale: false, updated_at: '' },
  KRW: { currency: 'KRW', mid_rate: 1 / 0.0275, customer_rate: (1 / 0.0275) * 1.040, fee_percent: 2.0, volatility_tier: 'TIER_2_MODERATE', volatility_buffer_percent: 2.0, source: 'BOT', is_stale: false, updated_at: '' },
  VND: { currency: 'VND', mid_rate: 1 / 0.00145, customer_rate: (1 / 0.00145) * 1.040, fee_percent: 2.0, volatility_tier: 'TIER_2_MODERATE', volatility_buffer_percent: 2.0, source: 'BOT', is_stale: false, updated_at: '' },
};

export function setGlobalBaseCurrency(currency: string | null | undefined): void {
  if (currency && typeof currency === 'string' && currency.trim()) {
    activeBaseCurrency = currency.trim().toUpperCase();
  }
}

export function getGlobalBaseCurrency(): string {
  return activeBaseCurrency;
}

export function setGlobalDisplayCurrency(currency: string | null | undefined): void {
  if (currency && typeof currency === 'string' && currency.trim()) {
    activeDisplayCurrency = currency.trim().toUpperCase();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kpb_display_currency', activeDisplayCurrency);
      } catch (_) {}
    }
  }
}

export function getGlobalDisplayCurrency(): string {
  if (typeof localStorage !== 'undefined' && activeDisplayCurrency === 'THB') {
    try {
      const saved = localStorage.getItem('kpb_display_currency');
      if (saved && SUPPORTED_DISPLAY_CURRENCIES.some(c => c.code === saved)) {
        activeDisplayCurrency = saved;
      }
    } catch (_) {}
  }
  return activeDisplayCurrency;
}

export function detectCurrencyFromLocale(locale: string | null | undefined): string {
  if (!locale) return 'THB';
  const l = locale.toLowerCase().trim();
  if (l.startsWith('th')) return 'THB';
  if (l.startsWith('ja')) return 'JPY';
  if (l.startsWith('vi')) return 'VND';
  if (l.startsWith('zh')) return 'CNY';
  if (l.startsWith('ko')) return 'KRW';
  if (l.startsWith('ms') || l.startsWith('my')) return 'MYR';
  if (l.startsWith('en')) return 'USD';
  return 'THB';
}

let cachedMinFeeMicrocredits = 2_000_000; // Default 2.00 THB (2,000,000 microcredits)

export function setGlobalMinFeeMicrocredits(microcredits: number): void {
  if (typeof microcredits === 'number' && microcredits >= 0) {
    cachedMinFeeMicrocredits = microcredits;
  }
}

export function getGlobalMinFeeMicrocredits(): number {
  return cachedMinFeeMicrocredits;
}

export function cacheFxRates(rates: FxRateItem[], minFeeMicrocredits?: number): void {
  if (Array.isArray(rates)) {
    for (const r of rates) {
      if (r && r.currency) {
        cachedRates[r.currency.toUpperCase()] = r;
      }
    }
  }
  if (typeof minFeeMicrocredits === 'number' && minFeeMicrocredits >= 0) {
    cachedMinFeeMicrocredits = minFeeMicrocredits;
  }
}

export function roundCharm(amount: number, currency: string): number {
  const cur = currency.toUpperCase();
  if (cur === 'JPY') {
    return Math.round(amount / 10) * 10;
  }
  if (cur === 'KRW') {
    return Math.round(amount / 100) * 100;
  }
  if (cur === 'VND') {
    return Math.round(amount / 1000) * 1000;
  }
  if (['USD', 'EUR', 'GBP', 'SGD', 'AUD'].includes(cur)) {
    const intPart = Math.floor(amount);
    const frac = amount - intPart;
    if (frac < 0.01) return intPart;
    if (frac <= 0.50) return intPart + 0.95;
    return intPart + 0.99;
  }
  return Math.round(amount * 100) / 100;
}

export function convertThbSatangs(cents: number, targetCurrency: string): number {
  if (!cents || cents <= 0) return 0;
  const cur = targetCurrency.toUpperCase();
  if (cur === 'THB') return cents / 100;

  const item = cachedRates[cur];
  const midRate = item ? item.mid_rate : 0.02717;
  const feePercent = item ? item.fee_percent : 2.0;
  const bufferRate = item ? (item.volatility_buffer_percent / 100) : 0.0075;

  const pBase = cents / 100;
  const feeVar = pBase * (feePercent / 100);
  const feeMin = cachedMinFeeMicrocredits / 1_000_000;
  const feeActual = Math.max(feeVar, feeMin);

  const effectiveFeeRate = feeActual / pBase;
  const effectiveCustomerRate = midRate * (1 + effectiveFeeRate + bufferRate);

  const rawTarget = pBase * effectiveCustomerRate;
  return roundCharm(rawTarget, cur);
}

export interface DualMoneyResult {
  baseFormatted: string;
  displayFormatted: string;
  isDual: boolean;
  targetCurrency: string;
}

export function formatDualMoney(cents: number | undefined, targetCurrency?: string): DualMoneyResult {
  const target = (targetCurrency || getGlobalDisplayCurrency()).toUpperCase();
  const baseFormatted = formatMoney(cents, 'THB', 'th-TH');

  if (target === 'THB' || !cents) {
    return {
      baseFormatted,
      displayFormatted: baseFormatted,
      isDual: false,
      targetCurrency: 'THB',
    };
  }

  const convertedAmount = convertThbSatangs(cents, target);
  let locale = 'en-US';
  if (target === 'JPY') locale = 'ja-JP';
  else if (target === 'EUR') locale = 'de-DE';
  else if (target === 'GBP') locale = 'en-GB';
  else if (target === 'KRW') locale = 'ko-KR';
  else if (target === 'VND') locale = 'vi-VN';
  else if (target === 'CNY') locale = 'zh-CN';

  const displayFormatted = new Intl.NumberFormat(locale, { style: 'currency', currency: target }).format(convertedAmount);

  return {
    baseFormatted,
    displayFormatted,
    isDual: true,
    targetCurrency: target,
  };
}

export function formatDualMoneyString(cents: number | undefined, targetCurrency?: string): string {
  const dual = formatDualMoney(cents, targetCurrency);
  if (!dual.isDual) return dual.baseFormatted;
  return `${dual.baseFormatted} (~${dual.displayFormatted})`;
}

export function formatMoney(cents: number | undefined, currency?: string, locale = 'th-TH'): string {
  const resolved = (currency && typeof currency === 'string' && currency.trim() && currency !== '-')
    ? currency.trim().toUpperCase()
    : activeBaseCurrency;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: resolved }).format((cents ?? 0) / 100);
}

export function apiErrorMessage(error: unknown): string {
  const problem = error as Partial<ApiProblem>;
  const requestId = problem.request_id ? ` (${problem.request_id})` : '';
  return `${problem.detail ?? problem.title ?? problem.code ?? 'Request failed'}${requestId}`;
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('JSON body must be an object');
  }
  return parsed as Record<string, unknown>;
}
