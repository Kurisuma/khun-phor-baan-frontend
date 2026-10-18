import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { AdminDashboardOptions, AdminListOptions, ApiEnvelope } from '../../contracts/api-contract';

type AdminPayload<T = unknown> = ApiEnvelope<T> | T;

/*
 * SA3-F002: Typed interfaces document the expected fields for each write operation.
 * Component callers pass Record<string, unknown> (from cleanObject) — type assertion
 * at call-site is intentional since Zod validates on the backend.
 */

/* ---------- Service (write methods accept Record<string, unknown> for compatibility) ---------- */
@Injectable({ providedIn: 'root' })
export class AdminUiService {
  public readonly version = '2.0.0';
  private readonly api = inject(ApiClient);

  getDashboardSnapshot(opts: AdminDashboardOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/dashboard${this.query(opts)}`)); }
  getSiteSettings(): Promise<unknown> { return this.read(this.api.get('/admin/site-settings')); }
  updateSiteSettings(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.put('/admin/site-settings', body)); }
  getFxRates(): Promise<unknown> { return this.read(this.api.get('/admin/fx/rates')); }
  refreshFxRates(): Promise<unknown> { return this.read(this.api.post('/admin/fx/refresh', {})); }

  listProducts(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/products${this.query(opts)}`)); }
  createProduct(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/products', body)); }
  updateProduct(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.patch(`/admin/products/${encodeURIComponent(id)}`, body)); }
  deleteProduct(id: string): Promise<void> { return this.api.delete(`/admin/products/${encodeURIComponent(id)}`); }

  listCategories(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/categories${this.query(opts)}`)); }
  createCategory(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/categories', body)); }
  updateCategory(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.patch(`/admin/categories/${encodeURIComponent(id)}`, body)); }
  deleteCategory(id: string): Promise<void> { return this.api.delete(`/admin/categories/${encodeURIComponent(id)}`); }

  listTags(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/tags${this.query(opts)}`)); }
  createTag(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/tags', body)); }
  updateTag(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.patch(`/admin/tags/${encodeURIComponent(id)}`, body)); }
  deleteTag(id: string): Promise<void> { return this.api.delete(`/admin/tags/${encodeURIComponent(id)}`); }

  listInventory(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/inventory${this.query(opts)}`)); }
  listDigitalPoolUnits(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/inventory/digital-units${this.query(opts)}`)); }
  searchSkus(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/skus${this.query(opts)}`)); }
  adjustInventory(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/inventory/adjust', body)); }
  upsertPrivateSku(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/inventory/skus', body)); }
  updatePrivateSku(id: string, body: Record<string, unknown>): Promise<unknown> {
    return this.read(this.api.patch(`/admin/inventory/skus/${encodeURIComponent(id)}`, body));
  }
  addDigitalUnits(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/inventory/digital-units', body)); }
  generatePhysicalUnits(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/inventory/physical-units', body)); }
  upsertSkuDetail(id: string, body: Record<string, unknown>): Promise<unknown> {
    return this.read(this.api.patch(`/admin/skus/${encodeURIComponent(id)}/detail`, body));
  }
  mergeSkuMediaToProduct(productId: string, body: Record<string, unknown>): Promise<unknown> {
    return this.read(this.api.post(`/admin/products/${encodeURIComponent(productId)}/merge-sku-media`, body));
  }

  listOrders(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/orders${this.query(opts)}`)); }
  refundOrder(id: string, body: Record<string, unknown>, stepUpToken: string): Promise<unknown> { return this.read(this.api.post(`/admin/orders/${encodeURIComponent(id)}/refund`, body, { stepUpToken })); }
  fulfillOrder(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post(`/admin/orders/${encodeURIComponent(id)}/fulfill`, body)); }

  listDeposits(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/deposits${this.query(opts)}`)); }
  matchDeposit(id: string, body: Record<string, unknown>, stepUpToken: string): Promise<unknown> { return this.read(this.api.post(`/admin/deposits/${encodeURIComponent(id)}/match-manually`, body, { stepUpToken })); }
  rejectDeposit(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post(`/admin/deposits/${encodeURIComponent(id)}/reject`, body)); }
  listWebhookEvents(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/webhook-events${this.query(opts)}`)); }
  getWebhookEvent(id: string): Promise<unknown> { return this.api.get(`/admin/webhook-events/${encodeURIComponent(id)}`); }
  listWebhookIpAllowlist(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/webhook-ip-allowlist${this.query(opts)}`)); }
  upsertWebhookIpAllowlist(body: Record<string, unknown>): Promise<unknown> {
    const id = (body as { id?: number }).id;
    return this.read(id ? this.api.put(`/admin/webhook-ip-allowlist/${encodeURIComponent(String(id))}`, body) : this.api.post('/admin/webhook-ip-allowlist', body));
  }
  deleteWebhookIpAllowlist(id: string): Promise<void> { return this.api.delete(`/admin/webhook-ip-allowlist/${encodeURIComponent(id)}`); }

  listSubscriptions(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/subscriptions${this.query(opts)}`)); }
  listSharedAccountPools(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/shared-accounts${this.query(opts)}`)); }
  upsertSharedSubscriptionSku(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/shared-skus', body)); }
  createSharedAccount(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/shared-accounts', body)); }
  updateSharedAccount(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.patch(`/admin/shared-accounts/${encodeURIComponent(id)}`, body)); }
  setSharedAccountCredentials(id: string, body: Record<string, unknown>, stepUpToken: string): Promise<unknown> {
    return this.read(this.api.post(`/admin/shared-accounts/${encodeURIComponent(id)}/credentials`, body, { stepUpToken }));
  }

  listUsers(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/users${this.query(opts)}`)); }
  changeUserRoles(id: string, body: { roles: string[] }, stepUpToken: string): Promise<unknown> { return this.read(this.api.patch(`/admin/users/${encodeURIComponent(id)}/roles`, body, { stepUpToken })); }
  lockUser(id: string, body: { reason: string; until?: string | null }): Promise<unknown> { return this.read(this.api.post(`/admin/users/${encodeURIComponent(id)}/lock`, body)); }

  listReviews(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/reviews${this.query(opts)}`)); }
  approveReview(id: string): Promise<unknown> { return this.read(this.api.post(`/admin/reviews/${encodeURIComponent(id)}/approve`)); }
  rejectReview(id: string, body: { reason: string }): Promise<unknown> { return this.read(this.api.post(`/admin/reviews/${encodeURIComponent(id)}/reject`, body)); }

  listMedia(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/media${this.query(opts)}`)); }
  deleteMedia(id: string): Promise<void> { return this.api.delete(`/admin/media/${encodeURIComponent(id)}`); }

  auditLog(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/audit-log${this.query(opts)}`)); }
  rotateKek(body: Record<string, unknown>, stepUpToken: string): Promise<unknown> { return this.read(this.api.post('/admin/kek/rotate', body, { stepUpToken })); }

  listPaymentMethods(opts: AdminListOptions = {}): Promise<unknown> { return this.read(this.api.get(`/admin/payment-methods${this.query(opts)}`)); }
  createPaymentMethod(body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.post('/admin/payment-methods', body)); }
  replacePaymentMethod(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.put(`/admin/payment-methods/${encodeURIComponent(id)}`, body)); }
  updatePaymentMethod(id: string, body: Record<string, unknown>): Promise<unknown> { return this.read(this.api.patch(`/admin/payment-methods/${encodeURIComponent(id)}`, body)); }
  togglePaymentMethod(id: string, body: { is_active: boolean }): Promise<unknown> { return this.read(this.api.post(`/admin/payment-methods/${encodeURIComponent(id)}/toggle`, body)); }
  deletePaymentMethod(id: string): Promise<void> { return this.api.delete(`/admin/payment-methods/${encodeURIComponent(id)}`); }

  webhookRoutesAreBackendOnly(): string[] {
    return ['/api/v1/webhooks/deposit/:bank'];
  }

  private async read<T>(promise: Promise<AdminPayload<T>>): Promise<T> {
    return this.api.unwrap(await promise);
  }

  private query(opts: AdminListOptions | AdminDashboardOptions): string {
    const params = new URLSearchParams();
    Object.entries(opts).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const text = params.toString();
    return text ? `?${text}` : '';
  }
}
