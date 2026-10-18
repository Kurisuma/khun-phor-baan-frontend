import { NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Order, OrderLine, PageInfo, PaymentBill } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-orders-page',
  imports: [NgClass, NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading orders-heading">
      <p class="eyebrow">{{ i18n.t('orders.title') }}</p>
      <h1>{{ i18n.t('orders.title') }}</h1>
      <p class="muted">{{ i18n.t('orders.lead') }}</p>
    </section>

    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <section class="metric-grid order-summary" *ngIf="orders().length > 0">
      <article class="metric-tile">
        <strong>{{ orders().length }}</strong>
        <span>{{ i18n.t('orders.totalOrders') }}</span>
        <small>{{ i18n.t('orders.totalOrdersHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ activeOrderCount() }}</strong>
        <span>{{ i18n.t('orders.needsAttention') }}</span>
        <small>{{ i18n.t('orders.needsAttentionHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ deliveredLineCount() }}</strong>
        <span>{{ i18n.t('orders.deliveredLines') }}</span>
        <small>{{ i18n.t('orders.deliveredLinesHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ format(totalSpent(), preferredCurrency()) }}</strong>
        <span>{{ i18n.t('orders.totalValue') }}</span>
        <small>{{ i18n.t('orders.totalValueHint') }}</small>
      </article>
    </section>

    <section class="panel orders-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ i18n.t('orders.recentOrders') }}</h2>
          <p class="muted">{{ loading() ? i18n.t('orders.loadingDetails') : orderListSummary() }}</p>
        </div>
        <div class="inline-actions">
          <button class="btn btn-secondary" type="button" (click)="load()" [disabled]="loading()">{{ i18n.t('common.refresh') }}</button>
          <a class="btn btn-primary" [routerLink]="i18n.localePath('catalog')">{{ i18n.t('common.shopAgain') }}</a>
        </div>
      </div>

      <div class="order-card-list" *ngIf="orders().length > 0; else emptyOrders">
        <article class="order-card" *ngFor="let order of orders()">
          <div class="order-card-header">
            <div>
              <span class="status-badge" [ngClass]="statusClass(order.status)">{{ statusLabel(order.status) }}</span>
              <h3>{{ displayOrderId(order) }}</h3>
              <p class="muted">{{ dateLabel(order.created_at) }}</p>
            </div>
            <strong class="order-total">{{ format(order.total_cents, order.currency) }}</strong>
          </div>

          <div class="order-meta-grid">
            <div>
              <span>{{ i18n.t('common.items') }}</span>
              <strong>{{ itemCount(order) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.payment') }}</span>
              <strong>{{ paymentSummary(order) }}</strong>
              <small class="payment-countdown" *ngIf="paymentCountdown(order) as countdown">{{ countdown }}</small>
            </div>
            <div>
              <span>{{ i18n.t('common.delivery') }}</span>
              <strong>{{ deliverySummary(order) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.updated') }}</span>
              <strong>{{ dateLabel(order.updated_at || order.created_at) }}</strong>
            </div>
          </div>

          <div class="order-line-preview" *ngIf="order.lines.length > 0">
            <div *ngFor="let line of previewLines(order)">
              <span>
                <strong>{{ line.product_name }}</strong>
                <small>{{ lineDescriptor(line) }}</small>
              </span>
              <strong>{{ format(line.subtotal_cents, line.currency) }}</strong>
            </div>
            <p class="muted" *ngIf="order.lines.length > 2">{{ i18n.t('orders.moreLines', { count: order.lines.length - 2 }) }}</p>
          </div>

          <div class="inline-actions order-actions">
            <a class="btn btn-primary" [routerLink]="i18n.localePath('orders/' + order.order_id)">{{ i18n.t('common.viewDetails') }}</a>
            <button class="btn btn-secondary" type="button" *ngIf="canOpenPaymentBill(order)" (click)="openPaymentBill(order.order_id)">{{ openPaymentBillLabel(order) }}</button>
            <a class="btn btn-secondary" *ngIf="canPay(order)" [routerLink]="i18n.localePath('orders/' + order.order_id + '/payment')">{{ i18n.t('orders.payNow') }}</a>
            <button class="btn btn-secondary" type="button" *ngIf="canCancel(order)" (click)="cancel(order.order_id)">{{ i18n.t('orders.cancelOrder') }}</button>
            <a class="btn btn-secondary" *ngIf="firstProductPath(order) as productPath" [routerLink]="productPath">{{ i18n.t('common.buyAgain') }}</a>
          </div>
        </article>
      </div>

      <ng-template #emptyOrders>
        <div class="empty-state">
          <h2>{{ loading() ? i18n.t('orders.loadingOrders') : i18n.t('orders.noOrdersYet') }}</h2>
          <p class="muted">{{ loading() ? i18n.t('orders.checkingHistory') : i18n.t('orders.emptyHint') }}</p>
          <a class="btn btn-primary" *ngIf="!loading()" [routerLink]="i18n.localePath('catalog')">{{ i18n.t('common.browseCatalog') }}</a>
        </div>
      </ng-template>

      <div class="panel-heading order-pagination" *ngIf="page()?.has_more">
        <p class="muted">{{ i18n.t('orders.moreAvailable') }}</p>
        <button class="btn btn-secondary" type="button" (click)="loadMore()" [disabled]="loading()">{{ i18n.t('orders.loadMore') }}</button>
      </div>
    </section>
  `,
})
export class OrdersPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.6.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly ordersApi = inject(OrderUiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly orders = signal<Order[]>([]);
  protected readonly paymentBills = signal<Record<string, PaymentBill | null>>({});
  protected readonly page = signal<PageInfo | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly loading = signal(false);
  protected readonly now = signal(Date.now());
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('orders.title'), description: this.i18n.t('orders.description'), path: `/${this.i18n.currentLocale()}/orders`, noindex: true });
    this.startCountdown();
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  protected async load(): Promise<void> {
    await this.loadPage();
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.page()?.next_cursor ?? undefined;
    if (!cursor) return;
    await this.loadPage(cursor);
  }

  protected async cancel(orderId: string): Promise<void> {
    this.error.set('');
    this.message.set('');
    try {
      await this.ordersApi.cancel(orderId);
      this.message.set(this.i18n.t('orders.orderCancelled'));
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async openPaymentBill(orderId: string): Promise<void> {
    this.error.set('');
    this.message.set('');
    try {
      const bill = await this.ordersApi.createPaymentBill(orderId);
      this.paymentBills.update((current) => ({ ...current, [orderId]: bill }));
      this.message.set(this.i18n.t('orders.paymentBillOpened'));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected activeOrderCount(): number {
    return this.orders().filter((order) => ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'PROCESSING'].includes(order.status)).length;
  }

  protected deliveredLineCount(): number {
    return this.orders().flatMap((order) => order.lines).filter((line) => line.delivery_status === 'DELIVERED').length;
  }

  protected totalSpent(): number {
    return this.orders().reduce((sum, order) => sum + order.total_cents, 0);
  }

  protected preferredCurrency(): string {
    return this.orders()[0]?.currency ?? 'THB';
  }

  protected orderListSummary(): string {
    const count = this.orders().length;
    if (!count) return this.i18n.t('orders.historyEmpty');
    return this.i18n.t('orders.listSummary', { count });
  }

  protected displayOrderId(order: Order): string {
    return order.code ? `#${order.code}` : this.i18n.t('orders.orderId', { id: order.order_id });
  }

  protected statusLabel(status: string): string {
    return this.i18n.t(`status.${status}`);
  }

  protected statusClass(status: Order['status']): string {
    return `status-${status.toLowerCase().replace(/_/g, '-')}`;
  }

  protected dateLabel(value?: string): string {
    if (!value) return this.i18n.t('common.notAvailable');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(this.i18n.angularLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  protected itemCount(order: Order): number {
    const count = order.lines.reduce((sum, line) => sum + line.qty, 0);
    return count || order.lines.length;
  }

  protected paymentSummary(order: Order): string {
    const bill = this.paymentBillFor(order);
    if (bill?.status === 'METHOD_REQUIRED') return this.i18n.t('payment.methodRequired');
    if (bill?.status === 'OPEN') return this.i18n.t('checkout.depositStatus', { status: this.statusLabel(bill.status) });
    if (bill && ['EXPIRED', 'CANCELLED', 'FAILED'].includes(bill.status)) return this.statusLabel(bill.status);
    if (order.status === 'PENDING_PAYMENT') return this.i18n.t('orders.pendingPayment');
    if (['PAID', 'PROCESSING', 'FULFILLED'].includes(order.status)) return this.i18n.t('orders.paid');
    return this.statusLabel(order.status);
  }

  protected paymentCountdown(order: Order): string {
    const bill = this.paymentBillFor(order);
    if (bill?.status !== 'OPEN' || !bill.expires_at) return '';
    return this.countdownLabel(bill.expires_at);
  }

  protected deliverySummary(order: Order): string {
    if (!order.lines.length) return order.status === 'FULFILLED' ? this.i18n.t('orders.fulfilled') : this.i18n.t('orders.preparing');
    const delivered = order.lines.filter((line) => line.delivery_status === 'DELIVERED').length;
    if (delivered === order.lines.length) return this.i18n.t('orders.delivered');
    if (delivered > 0) return this.i18n.t('orders.deliveredCount', { delivered, total: order.lines.length });
    return order.status === 'FULFILLED' ? this.i18n.t('orders.pendingDelivery') : this.i18n.t('orders.notReady');
  }

  protected previewLines(order: Order): OrderLine[] {
    return order.lines.slice(0, 2);
  }

  protected lineDescriptor(line: OrderLine): string {
    const sku = line.sku_name || line.sku_code;
    const parts = [this.i18n.t('orders.qty', { count: line.qty }), sku, line.delivery_status ? this.statusLabel(line.delivery_status) : line.kind].filter(Boolean);
    return parts.join(' / ');
  }

  protected firstProductPath(order: Order): string | null {
    const slug = order.lines.find((line) => line.product_slug)?.product_slug;
    return slug ? this.i18n.localePath(`products/${slug}`) : null;
  }

  protected canCancel(order: Order): boolean {
    return order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT';
  }

  protected canPay(order: Order): boolean {
    const bill = this.paymentBillFor(order);
    return order.status === 'PENDING_PAYMENT' && Boolean(bill && (bill.status === 'METHOD_REQUIRED' || bill.status === 'OPEN'));
  }

  protected canOpenPaymentBill(order: Order): boolean {
    if (order.status !== 'PENDING_PAYMENT') return false;
    const bill = this.paymentBillFor(order);
    if (!bill) return true;
    return bill.status === 'EXPIRED' || bill.status === 'CANCELLED' || bill.status === 'FAILED';
  }

  protected openPaymentBillLabel(order: Order): string {
    return this.paymentBillFor(order) ? this.i18n.t('orders.openNewPaymentBill') : this.i18n.t('orders.openPaymentBill');
  }

  protected paymentBillFor(order: Order): PaymentBill | null {
    return this.paymentBills()[order.order_id] ?? null;
  }

  protected format(cents: number, currency: string): string {
    return formatMoney(cents, currency, this.i18n.angularLocale());
  }

  private startCountdown(): void {
    if (!isPlatformBrowser(this.platformId) || this.countdownTimer) return;
    this.countdownTimer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private countdownLabel(value: string): string {
    const expiresAt = new Date(value).getTime();
    if (Number.isNaN(expiresAt)) return '';
    const remainingMs = expiresAt - this.now();
    if (remainingMs <= 0) return this.i18n.t('orders.paymentExpired');
    return this.i18n.t('orders.paymentExpiresIn', { time: this.formatDuration(remainingMs) });
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  private async loadPage(cursor?: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.ordersApi.list(cursor, 12);
      const enriched = await this.enrichOrders(result.data);
      const bills = await this.loadPaymentBills(enriched);
      this.orders.set(cursor ? [...this.orders(), ...enriched] : enriched);
      this.paymentBills.update((current) => cursor ? { ...current, ...bills } : bills);
      this.page.set(result.page);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async enrichOrders(orders: Order[]): Promise<Order[]> {
    return Promise.all(orders.map(async (order) => {
      try {
        return await this.ordersApi.detail(order.order_id);
      } catch {
        return order;
      }
    }));
  }

  private async loadPaymentBills(orders: Order[]): Promise<Record<string, PaymentBill | null>> {
    const entries = await Promise.all(orders.map(async (order): Promise<[string, PaymentBill | null]> => {
      if (order.status !== 'PENDING_PAYMENT') return [order.order_id, null];
      try {
        return [order.order_id, await this.ordersApi.currentPaymentBill(order.order_id)];
      } catch {
        return [order.order_id, null];
      }
    }));
    return Object.fromEntries(entries);
  }
}
