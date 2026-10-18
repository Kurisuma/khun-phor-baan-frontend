import { NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Order, OrderLine, PaymentBill, PaymentProviderCode } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

interface BillRow {
  order: Order;
  bill: PaymentBill | null;
}

@Component({
  standalone: true,
  selector: 'kpb-bills-page',
  imports: [NgClass, NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading bills-heading">
      <p class="eyebrow">{{ i18n.t('bills.eyebrow') }}</p>
      <h1>{{ i18n.t('bills.title') }}</h1>
      <p class="muted">{{ i18n.t('bills.lead') }}</p>
    </section>

    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <section class="metric-grid bill-summary" *ngIf="rows().length > 0">
      <article class="metric-tile">
        <strong>{{ openCount() }}</strong>
        <span>{{ i18n.t('bills.open') }}</span>
        <small>{{ i18n.t('bills.openHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ methodRequiredCount() }}</strong>
        <span>{{ i18n.t('bills.methodRequired') }}</span>
        <small>{{ i18n.t('bills.methodRequiredHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ expiredCount() }}</strong>
        <span>{{ i18n.t('bills.expired') }}</span>
        <small>{{ i18n.t('bills.expiredHint') }}</small>
      </article>
      <article class="metric-tile">
        <strong>{{ needsBillCount() }}</strong>
        <span>{{ i18n.t('bills.needsBill') }}</span>
        <small>{{ i18n.t('bills.needsBillHint') }}</small>
      </article>
    </section>

    <section class="panel bill-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ i18n.t('bills.history') }}</h2>
          <p class="muted">{{ loading() ? i18n.t('bills.loading') : billListSummary() }}</p>
        </div>
        <div class="inline-actions">
          <button class="btn btn-secondary" type="button" (click)="load()" [disabled]="loading()">{{ i18n.t('common.refresh') }}</button>
          <a class="btn btn-primary" [routerLink]="i18n.localePath('orders')">{{ i18n.t('nav.orders') }}</a>
        </div>
      </div>

      <div class="bill-card-list" *ngIf="rows().length > 0; else emptyBills">
        <article class="bill-card" *ngFor="let row of rows(); trackBy: trackRow">
          <div class="bill-card-header">
            <div>
              <span class="status-badge" [ngClass]="billStatusClass(row)">{{ billStatusLabel(row) }}</span>
              <h3>{{ invoiceTitle(row) }}</h3>
              <p class="muted">{{ displayOrderId(row.order) }} · {{ dateLabel(invoiceDate(row)) }}</p>
            </div>
            <strong class="order-total">{{ format(billAmountCents(row), billCurrency(row)) }}</strong>
          </div>

          <div class="order-meta-grid">
            <div>
              <span>{{ i18n.t('bills.billId') }}</span>
              <strong>{{ row.bill?.bill_id || i18n.t('bills.noBill') }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.order') }}</span>
              <strong>{{ statusLabel(row.order.status) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.status') }}</span>
              <strong>{{ billStatusLabel(row) }}</strong>
              <small class="payment-countdown" *ngIf="paymentCountdown(row) as countdown">{{ countdown }}</small>
            </div>
            <div>
              <span>{{ i18n.t('payment.method') }}</span>
              <strong>{{ paymentProviderLabel(row.bill?.provider ?? null) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.expires') }}</span>
              <strong>{{ row.bill?.expires_at ? dateLabel(row.bill?.expires_at) : i18n.t('common.notAvailable') }}</strong>
            </div>
          </div>

          <div class="order-line-preview bill-invoice-lines" *ngIf="row.order.lines.length > 0">
            <div class="bill-invoice-line" *ngFor="let line of previewLines(row.order)">
              <span>
                <strong>{{ line.product_name }}</strong>
                <small>{{ lineDescriptor(line) }}</small>
              </span>
              <strong>{{ format(line.subtotal_cents, line.currency) }}</strong>
            </div>
            <p class="muted bill-invoice-note" *ngIf="moreLineCount(row.order) > 0">{{ i18n.t('bills.moreItems', { count: moreLineCount(row.order) }) }}</p>
          </div>

          <div class="order-total-breakdown bill-total-breakdown">
            <div><span>{{ i18n.t('common.subtotal') }}</span><strong>{{ format(row.order.subtotal_cents, row.order.currency) }}</strong></div>
            <div><span>{{ i18n.t('common.tax') }}</span><strong>{{ format(row.order.tax_cents, row.order.currency) }}</strong></div>
            <div><span>{{ i18n.t('bills.invoiceBase') }}</span><strong>{{ format(billBaseAmountCents(row), billCurrency(row)) }}</strong></div>
            <div><span>{{ i18n.t('bills.scrapAdjustment') }}</span><strong>{{ format(billScrapCents(row), billCurrency(row)) }}</strong></div>
            <div><span>{{ i18n.t('bills.invoiceTotal') }}</span><strong>{{ format(billAmountCents(row), billCurrency(row)) }}</strong></div>
          </div>

          <section class="payment-instructions" *ngIf="openBill(row) as activeBill">
            <p class="eyebrow">{{ i18n.t('checkout.depositStatus', { status: billStatusLabel(row) }) }}</p>
            <h3>{{ i18n.t('checkout.uniqueAmount') }}</h3>
            <p class="deposit-amount">{{ format(activeBill.unique_amount_cents, activeBill.currency) }}</p>
            <p>{{ i18n.t('checkout.baseTotal') }}: {{ format(activeBill.amount_cents, activeBill.currency) }} | {{ i18n.t('checkout.scrap') }}: {{ format(activeBill.scrap_cents, activeBill.currency) }}</p>
          </section>

          <div class="inline-actions order-actions">
            <a class="btn btn-secondary" [routerLink]="i18n.localePath('bills/' + row.order.order_id)">{{ i18n.t('common.viewDetails') }}</a>
            <button class="btn btn-primary" type="button" *ngIf="canManage(row)" [disabled]="openingOrderId() === row.order.order_id" (click)="manageBill(row)">{{ primaryActionLabel(row) }}</button>
          </div>
        </article>
      </div>

      <ng-template #emptyBills>
        <div class="empty-state">
          <h2>{{ loading() ? i18n.t('bills.loading') : i18n.t('bills.noBills') }}</h2>
          <p class="muted">{{ loading() ? i18n.t('orders.checkingHistory') : i18n.t('bills.emptyHint') }}</p>
          <a class="btn btn-primary" *ngIf="!loading()" [routerLink]="i18n.localePath('orders')">{{ i18n.t('nav.orders') }}</a>
        </div>
      </ng-template>
    </section>
  `,
})
export class BillsPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.2.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly ordersApi = inject(OrderUiService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly rows = signal<BillRow[]>([]);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly loading = signal(false);
  protected readonly openingOrderId = signal('');
  protected readonly now = signal(Date.now());
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('bills.title'), description: this.i18n.t('bills.description'), path: `/${this.i18n.currentLocale()}/bills`, noindex: true });
    this.startCountdown();
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.ordersApi.list(undefined, 50);
      const orders = await this.enrichOrders(page.data);
      const rows = await Promise.all(orders.map((order) => this.toBillRow(order)));
      this.rows.set(rows.filter((row) => row.bill || row.order.status === 'PENDING_PAYMENT'));
      this.message.set('');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async manageBill(row: BillRow): Promise<void> {
    if (!this.canManage(row)) return;
    const orderId = row.order.order_id;
    this.openingOrderId.set(orderId);
    this.error.set('');
    this.message.set('');
    try {
      if (!row.bill || this.canReopen(row.bill)) {
        const bill = await this.ordersApi.createPaymentBill(orderId);
        this.rows.update((rows) => rows.map((candidate) => candidate.order.order_id === orderId ? { ...candidate, bill } : candidate));
      }
      await this.router.navigateByUrl(this.paymentPath(row.order));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.openingOrderId.set('');
    }
  }

  protected openCount(): number {
    return this.rows().filter((row) => row.bill?.status === 'OPEN').length;
  }

  protected methodRequiredCount(): number {
    return this.rows().filter((row) => row.bill?.status === 'METHOD_REQUIRED').length;
  }

  protected expiredCount(): number {
    return this.rows().filter((row) => row.bill && this.canReopen(row.bill)).length;
  }

  protected needsBillCount(): number {
    return this.rows().filter((row) => row.order.status === 'PENDING_PAYMENT' && !row.bill).length;
  }

  protected billListSummary(): string {
    const count = this.rows().length;
    return count ? this.i18n.t('bills.summary', { count }) : this.i18n.t('bills.noBills');
  }

  protected displayOrderId(order: Order): string {
    return order.code ? `#${order.code}` : this.i18n.t('orders.orderId', { id: order.order_id });
  }

  protected invoiceTitle(row: BillRow): string {
    return row.bill?.bill_id ? this.i18n.t('bills.invoiceNumber', { id: row.bill.bill_id }) : this.i18n.t('bills.invoicePending');
  }

  protected invoiceDate(row: BillRow): string {
    return row.bill?.created_at || row.order.created_at;
  }

  protected statusLabel(status: string): string {
    return this.i18n.t(`status.${status}`);
  }

  protected billStatusLabel(row: BillRow): string {
    return row.bill ? this.i18n.t(`status.${row.bill.status}`) : this.i18n.t('bills.noBill');
  }

  protected billStatusClass(row: BillRow): string {
    const status = row.bill?.status ?? 'NOT_READY';
    return `status-${status.toLowerCase().replace(/_/g, '-')}`;
  }

  protected primaryActionLabel(row: BillRow): string {
    if (!row.bill) return this.i18n.t('orders.openPaymentBill');
    if (this.canReopen(row.bill)) return this.i18n.t('orders.openNewPaymentBill');
    return this.i18n.t('orders.payNow');
  }

  protected canManage(row: BillRow): boolean {
    if (row.order.status !== 'PENDING_PAYMENT') return false;
    if (!row.bill) return true;
    return row.bill.status === 'METHOD_REQUIRED' || row.bill.status === 'OPEN' || this.canReopen(row.bill);
  }

  protected paymentProviderLabel(provider: PaymentProviderCode | null): string {
    if (provider === 'SCRAP_BANK_TRANSFER') return this.i18n.t('payment.scrapBankTransfer');
    if (provider === 'PROMPTPAY') return this.i18n.t('payment.promptPay');
    if (provider === 'PAYPAL') return this.i18n.t('payment.paypal');
    if (provider === 'TRUEMONEY_WALLET') return this.i18n.t('payment.trueMoney');
    return this.i18n.t('payment.notSelected');
  }

  protected paymentCountdown(row: BillRow): string {
    if (row.bill?.status !== 'OPEN' || !row.bill.expires_at) return '';
    return this.countdownLabel(row.bill.expires_at);
  }

  protected openBill(row: BillRow): PaymentBill | null {
    return row.bill?.status === 'OPEN' ? row.bill : null;
  }

  protected billAmountCents(row: BillRow): number {
    return row.bill?.unique_amount_cents || row.bill?.amount_cents || row.order.total_cents;
  }

  protected billBaseAmountCents(row: BillRow): number {
    return row.bill?.amount_cents || row.order.total_cents;
  }

  protected billScrapCents(row: BillRow): number {
    return row.bill?.scrap_cents ?? 0;
  }

  protected billCurrency(row: BillRow): string {
    return row.bill?.currency || row.order.currency;
  }

  protected previewLines(order: Order): OrderLine[] {
    return order.lines.slice(0, 3);
  }

  protected moreLineCount(order: Order): number {
    return Math.max(0, order.lines.length - this.previewLines(order).length);
  }

  protected lineDescriptor(line: OrderLine): string {
    const sku = line.sku_code || line.sku_name || line.fulfillment_type || '';
    return [
      sku ? `${this.i18n.t('common.sku')} ${sku}` : '',
      this.i18n.t('orders.qty', { count: line.qty }),
      `${this.i18n.t('common.unitPrice')} ${this.format(line.unit_price_cents, line.currency)}`,
    ].filter(Boolean).join(' · ');
  }

  protected dateLabel(value?: string): string {
    if (!value) return this.i18n.t('common.notAvailable');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(this.i18n.angularLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  protected format(cents: number, currency: string): string {
    return formatMoney(cents, currency, this.i18n.angularLocale());
  }

  protected trackRow(_index: number, row: BillRow): string {
    return row.order.order_id;
  }

  private paymentPath(order: Order): string {
    return this.i18n.localePath(`orders/${order.order_id}/payment`);
  }

  private canReopen(bill: PaymentBill): boolean {
    return bill.status === 'EXPIRED' || bill.status === 'CANCELLED' || bill.status === 'FAILED';
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

  private async toBillRow(order: Order): Promise<BillRow> {
    try {
      return { order, bill: await this.ordersApi.currentPaymentBill(order.order_id) };
    } catch {
      return { order, bill: null };
    }
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
}
