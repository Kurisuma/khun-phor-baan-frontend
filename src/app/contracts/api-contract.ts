export type ApiLocale = 'th' | 'en';
export type UserRole = 'customer' | 'support' | 'admin' | 'root';
export type ProductKind = 'PRIVATE' | 'SHARED';
export type OrderStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'PROCESSING' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
export type DepositStatusValue = 'PENDING' | 'MATCHED' | 'EXPIRED' | 'CANCELLED' | 'MANUAL_REVIEW';
export type PaymentProviderCode =
  | 'SCRAP_BANK_TH'
  | 'SCRAP_BANK_TRANSFER'
  | 'CRYPTO'
  | 'SHOPEEPAY_MY'
  | 'OMAKASEPAY_IN'
  | 'PROMPTPAY'
  | 'PAYPAL'
  | 'TRUEMONEY_WALLET';
export type PaymentBillStatus = 'METHOD_REQUIRED' | 'OPEN' | 'SUCCEEDED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';

export interface PaymentMethodOption {
  provider_code: string;
  display_name_th: string;
  display_name_en: string;
  description_th: string;
  description_en: string;
  method_type: string;
  group_name_th: string;
  group_name_en: string;
  brand_color_hex: string;
  icon_svg?: string | null;
  is_eligible: boolean;
  priority: number;
  supported_countries: string[];
  supported_currencies: string[];
}

export interface SystemBootInfo {
  boot_time: string;
  boot_timestamp_unix_ms: number;
  uptime_seconds: number;
  uptime_formatted: string;
  environment: string;
  kernel: string;
  os: string;
  arch: string;
  engine: string;
  engine_version: string;
  runtime: string;
  orm_storage_engine: string;
  mac_sealing: string;
  security_pipeline: string;
  singleton_id: string;
  total_modules: number;
  healthy_modules: number;
  degraded_modules: number;
  circuit_open_modules: number;
  status: 'OPERATIONAL' | 'DEGRADED';
}

export interface PaymentModuleHealthSnapshot {
  is_healthy: boolean;
  latency_rtt_ms: number;
  circuit_state: string;
  message: string;
}

export interface ModuleCapabilities {
  supports_dynamic_qr?: boolean;
  supports_webhook_reconciliation?: boolean;
  supports_refunds?: boolean;
  requires_unique_decimal_shift?: boolean;
  requires_hardware_enclave?: boolean;
  supports_polling?: boolean;
}

export interface PaymentModuleDbConfig {
  id: number;
  provider_code: string;
  country_code: string;
  currency_code: string;
  min_amount_microcredits: number;
  max_amount_microcredits: number;
  fee_basis_points: number;
  fee_bps?: number;
  fixed_fee_microcredits?: number;
  is_enabled: boolean;
  config_json?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentModuleRegisterInfo {
  module_id: string;
  provider_code: string;
  module_name: string;
  module_version: string;
  vendor_name: string;
  description_en: string;
  description_th: string;
  method_type: string;
  group_name_en: string;
  group_name_th: string;
  jurisdiction_rule: string;
  supported_countries: string[];
  supported_currencies: string[];
  capabilities: ModuleCapabilities;
  priority: number;
  health: PaymentModuleHealthSnapshot;
  active_configs: PaymentModuleDbConfig[];
}

export interface PaymentModulesApiResponse {
  boot_info: SystemBootInfo;
  modules: PaymentModuleRegisterInfo[];
  total_modules?: number;
}

export interface AssignPaymentModuleCountryRequest {
  provider_code: string;
  country_code: string;
  currency_code: string;
  min_amount_microcredits?: number;
  max_amount_microcredits?: number;
  fee_bps?: number;
  fixed_fee_microcredits?: number;
  is_enabled?: boolean;
}

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance: string;
  request_id: string;
  errors?: Array<{ field: string; code: string; message: string }>;
  retry_after_ms?: number;
}

export interface ApiEnvelope<T> {
  code?: string;
  data: T;
}

export interface PageInfo {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}

export interface PagedResponse<T> {
  data: T[];
  page: PageInfo;
}

export interface UserMe {
  user_id: string;
  email: string;
  name: string;
  locale: ApiLocale;
  email_verified: boolean;
  mfa_enabled: boolean;
  marketing_opt_in: boolean;
  created_at: string;
}

export interface AuthMe {
  user: UserMe;
  roles: UserRole[];
}

export interface LoginResult extends AuthMe {
  mfa_required?: boolean;
}

export interface StepUpResult {
  step_up_token: string;
  expires_at: string;
}

export interface MfaSetupResult {
  otpauth_url: string;
  qr_code_svg?: string;
  manual_entry_key?: string;
}

export interface UserProfile extends UserMe {}

export interface Category {
  id: string;
  slug: string;
  name: string;
  name_th?: string;
  name_en?: string;
  description?: string;
  description_th?: string;
  description_en?: string;
  image_url?: string;
  image_media_id?: string;
  media_id?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  is_virtual?: boolean;
  children?: Category[];
  product_count?: number;
}

export interface ProductMedia {
  media_id: string;
  url: string;
  mime: string;
  purpose: string;
  sort_order: number;
}

export interface ProductSku {
  sku_id: string;
  id?: string;
  sku_code: string;
  sku_slug?: string;
  name: string;
  name_th?: string;
  name_en?: string;
  summary?: string;
  summary_th?: string;
  summary_en?: string;
  description?: string;
  description_th?: string;
  description_en?: string;
  usage?: string;
  usage_th?: string;
  usage_en?: string;
  warranty?: string;
  warranty_th?: string;
  warranty_en?: string;
  price_cents: number;
  currency: string;
  fulfillment_type: 'PHYSICAL' | 'DIGITAL' | 'SHARED';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  stock_available?: number | null;
  slots_available?: number | null;
  metadata?: unknown;
}

export interface Product {
  product_id: string;
  slug: string;
  name: string;
  name_th?: string;
  name_en?: string;
  description: string;
  description_th?: string;
  description_en?: string;
  price_cents: number;
  currency: string;
  kind: ProductKind;
  subkind?: string;
  digital_delivery_type?: 'ACTIVATION_LINK' | 'CDKEY' | 'CODE';
  digital_activation_url_template?: string;
  digital_code_prefix?: string;
  digital_instructions_th?: string;
  digital_instructions_en?: string;
  category?: Category;
  skus?: ProductSku[];
  media?: ProductMedia[];
  inventory_summary?: { in_stock: boolean; slots_available?: number; stock_available?: number };
  seo?: {
    title?: string;
    description?: string;
    og?: Record<string, string>;
    twitter?: Record<string, string>;
    json_ld?: unknown[];
  };
  average_rating?: number;
  review_count?: number;
  created_at?: string;
}

export interface CatalogFilters {
  q?: string;
  category?: string;
  kind?: ProductKind;
  subkind?: string;
  min_price?: number;
  max_price?: number;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface CartItem {
  item_id: string;
  product_id: string;
  product_name: string;
  product_slug?: string;
  product_image_url?: string;
  sku?: string;
  sku_id?: string;
  sku_code?: string;
  sku_name?: string;
  fulfillment_type?: 'PHYSICAL' | 'DIGITAL' | 'SHARED';
  qty: number;
  unit_price_cents: number;
  subtotal_cents: number;
  currency: string;
}

export interface Cart {
  cart_id: string;
  items: CartItem[];
  total_cents: number;
  currency: string;
  item_count: number;
  updated_at?: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

export interface CheckoutPreview {
  cart_id: string;
  items: CartItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  display_currency?: string;
  display_subtotal?: number;
  display_total?: number;
  locked_fx_rate?: number;
  fx_fee_percent?: number;
  fx_quote_token?: string;
  fx_quote_expires_at?: number;
}

export interface BankAccount {
  bank_name: string;
  account_number: string;
  account_name: string;
  bank_code?: string;
}

export interface AvailableBank {
  code: string;
  name: string;
  display_label: string;
  priority: number;
}

export type DestinationAccountType = 'BANK_TRANSFER' | 'PROMPTPAY';
export type PromptPayType = 'PHONE' | 'CITIZEN_ID' | 'TAX_ID';

export interface DestinationAccount {
  id: string;
  account_type: DestinationAccountType;
  bank_code?: string;
  bank_name?: string;
  account_number: string;
  account_name: string;
  promptpay_type?: PromptPayType;
  display_label?: string;
  is_active: boolean;
  priority: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface OrderCreated {
  order_id: string;
  state: OrderStatus;
  total_amount_cents: number;
  currency: string;
  display_currency?: string;
  display_total?: number;
  locked_fx_rate?: number;
  fx_fee_percent?: number;
}

export interface DepositStatus {
  deposit_id: string;
  order_id: string;
  status: DepositStatusValue;
  total_amount_cents: number;
  unique_amount_cents: number;
  scrap_cents: number;
  bank_account: BankAccount;
  expires_at: string;
  currency: string;
  display_currency?: string;
  display_total?: number;
  locked_fx_rate?: number;
  fx_fee_percent?: number;
}

export interface PromptPayInstructions {
  kind: 'promptpay';
  bank_name: string;
  account_number: string;
  account_name: string;
  promptpay_type?: 'PHONE' | 'CITIZEN_ID' | 'TAX_ID';
  amount_cents: number;
  ref: string;
}

export interface ScrapBankTransferInstructions {
  kind: 'scrap';
  bank_name: string;
  account_number: string;
  account_name: string;
  bank_code?: string;
  unique_amount_cents: number;
  scrap_cents: number;
  expiry_iso: string;
}

export type PaymentInstructions = PromptPayInstructions | ScrapBankTransferInstructions;

export interface PaymentBill {
  provider: PaymentProviderCode | null;
  bill_id: string;
  provider_ref?: string | null;
  deposit_id?: string | null;
  order_id: string;
  status: PaymentBillStatus;
  amount_cents: number;
  unique_amount_cents: number;
  scrap_cents: number;
  currency: string;
  expires_at: string;
  created_at?: string;
  updated_at?: string;
  instructions?: PaymentInstructions;
}

export interface OrderLine {
  line_id: string;
  product_id: string;
  product_slug?: string;
  product_name: string;
  sku_id?: string;
  sku_code?: string;
  sku_name?: string;
  fulfillment_type?: 'PHYSICAL' | 'DIGITAL' | 'SHARED';
  qty: number;
  unit_price_cents: number;
  subtotal_cents: number;
  currency: string;
  kind: 'DIGITAL' | 'PHYSICAL' | 'SUBSCRIPTION';
  product_kind?: ProductKind;
  subkind?: string;
  delivery_status?: 'DELIVERED' | 'PENDING_DELIVERY' | 'NOT_READY';
  delivered_count?: number;
}

export interface DigitalDeliveryItem {
  entitlement_id: string;
  unit_index: number;
  delivery_type: 'ACTIVATION_LINK' | 'CDKEY' | 'CODE';
  value: string;
  instructions_th?: string;
  instructions_en?: string;
  delivered_at?: string;
}

export interface DigitalDeliveryGrant {
  line_id: string;
  delivery_type: 'ACTIVATION_LINK' | 'CDKEY' | 'CODE';
  delivery_value: string;
  url?: string;
  download_url?: string;
  code?: string;
  expires_at: string;
  items: DigitalDeliveryItem[];
}

export interface Order {
  order_id: string;
  code?: string;
  status: OrderStatus;
  lines: OrderLine[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  deposit_id?: string;
  deposit_status?: DepositStatusValue;
  deposit_total_amount_cents?: number;
  deposit_scrap_cents?: number;
  deposit_expires_at?: string;
  created_at: string;
  updated_at?: string;
  fulfilled_at?: string;
}

export interface SubscriptionSlot {
  slot_id: string;
  product_id: string;
  product_name: string;
  product_slug?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  days_remaining: number;
  expires_at: string;
  vault_reveal_available: boolean;
  created_at: string;
}

export interface VaultCredentials {
  credentials: Record<string, string>;
  revealed_at: string;
}

export interface Review {
  review_id: string;
  product_id: string;
  user_id?: string;
  user_name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

export interface Comment {
  comment_id: string;
  product_id: string;
  user_id?: string;
  user_name: string;
  body: string;
  parent_comment_id?: string;
  replies?: Comment[];
  created_at: string;
}

export interface MediaUploadIntent {
  media_id: string;
  presigned_put_url: string;
  storage_key: string;
  expires_at: string;
  upload_token: string;
}

export interface SeoSitemapEntry {
  loc: string;
  canonical?: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  alternates?: Array<{ locale?: ApiLocale; hreflang?: ApiLocale | 'x-default'; href: string }>;
}

export interface AdminListOptions {
  locale?: ApiLocale;
  q?: string;
  search?: string;
  status?: string;
  sku_id?: string | number;
  pool_id?: string | number;
  gateway?: string;
  since?: string;
  cursor?: string;
  limit?: number;
}

export interface AdminDashboardOptions {
  from?: string;
  to?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface HealthStatus {
  status?: string;
  code?: string;
  [key: string]: unknown;
}
