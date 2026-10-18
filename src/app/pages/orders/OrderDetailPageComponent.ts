import { NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { DigitalDeliveryGrant, DigitalDeliveryItem, Order, OrderLine, PaymentBill, PaymentProviderCode, PromptPayInstructions, ScrapBankTransferInstructions } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-order-detail-page',
  imports: [NgClass, NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading order-detail-heading">
      <p class="eyebrow">{{ i18n.t('common.order') }}</p>
      <h1>{{ order() ? displayOrderId(order()!) : i18n.t('orders.detailTitle') }}</h1>
      <p class="muted">{{ i18n.t('orders.detailLead') }}</p>
      <div class="inline-actions order-actions">
        <a class="btn btn-secondary" [routerLink]="i18n.localePath('orders')">{{ i18n.t('common.backToOrders') }}</a>
        <ng-container *ngIf="order() as headingOrder">
          <button
            class="btn btn-primary"
            type="button"
            *ngIf="canOpenPaymentBill(headingOrder)"
            [disabled]="creatingPaymentBill()"
            (click)="openPaymentBill(headingOrder.order_id)"
          >{{ openPaymentBillLabel() }}</button>
          <a
            class="btn btn-primary"
            *ngIf="canPayNow(headingOrder)"
            [routerLink]="paymentPagePath(headingOrder.order_id)"
          >{{ i18n.t('orders.payNow') }}</a>
        </ng-container>
      </div>
    </section>

    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <ng-container *ngIf="order() as item; else loadingOrder">
      <section class="order-detail-grid">
        <article class="panel order-overview-card">
          <div class="panel-heading">
            <div>
              <span class="status-badge" [ngClass]="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
              <h2>{{ format(item.total_cents, item.currency) }}</h2>
              <p class="muted">{{ i18n.t('orders.itemOrdered', { count: itemCount(item), date: dateLabel(item.created_at) }) }}</p>
            </div>
            <button class="btn btn-secondary" type="button" *ngIf="canCancel(item)" (click)="cancel(item.order_id)">{{ i18n.t('orders.cancelOrder') }}</button>
          </div>

          <div class="order-meta-grid">
            <div>
              <span>{{ i18n.t('orders.orderCode') }}</span>
              <strong>{{ item.code || item.order_id }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.payment') }}</span>
              <strong>{{ paymentSummary(item) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.delivery') }}</span>
              <strong>{{ deliverySummary(item) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.updated') }}</span>
              <strong>{{ dateLabel(item.updated_at || item.created_at) }}</strong>
            </div>
          </div>

          <div class="order-total-breakdown">
            <div><span>{{ i18n.t('common.subtotal') }}</span><strong>{{ format(item.subtotal_cents, item.currency) }}</strong></div>
            <div><span>{{ i18n.t('common.tax') }}</span><strong>{{ format(item.tax_cents, item.currency) }}</strong></div>
            <div><span>{{ i18n.t('common.total') }}</span><strong>{{ format(item.total_cents, item.currency) }}</strong></div>
          </div>
        </article>

        <article class="panel payment-card">
          <h2>{{ i18n.t('common.payment') }}</h2>
          <ng-container *ngIf="paymentBill() as bill; else paymentFallback">
            <div class="order-meta-grid">
              <div>
                <span>{{ i18n.t('common.status') }}</span>
                <strong>{{ paymentBillStatusLabel(bill.status) }}</strong>
              </div>
              <div>
                <span>{{ i18n.t('common.total') }}</span>
                <strong>{{ format(bill.amount_cents, bill.currency) }}</strong>
              </div>
              <div>
                <span>{{ i18n.t('payment.method') }}</span>
                <strong>{{ paymentProviderLabel(bill.provider) }}</strong>
              </div>
              <div>
                <span>{{ i18n.t('common.expires') }}</span>
                <strong>{{ bill.expires_at ? dateLabel(bill.expires_at) : i18n.t('common.notAvailable') }}</strong>
                <small class="payment-countdown" *ngIf="paymentBillCountdown(bill) as countdown">{{ countdown }}</small>
              </div>
            </div>
            <section class="empty-state" *ngIf="bill.status === 'METHOD_REQUIRED'">
              <strong>{{ i18n.t('payment.methodRequired') }}</strong>
              <span>{{ displayOrderId(item) }}</span>
            </section>
            <section class="payment-instructions" *ngIf="bill.status === 'OPEN'">
              <p class="eyebrow">{{ i18n.t('checkout.depositStatus', { status: paymentBillStatusLabel(bill.status) }) }}</p>
              <h3>{{ i18n.t('checkout.uniqueAmount') }}</h3>
              <p class="deposit-amount">{{ format(bill.unique_amount_cents, bill.currency) }}</p>
              <p>{{ i18n.t('checkout.baseTotal') }}: {{ format(bill.amount_cents, bill.currency) }} | {{ i18n.t('checkout.scrap') }}: {{ format(bill.scrap_cents, bill.currency) }}</p>
              <p>{{ paymentBillBankName(bill) }} / {{ paymentBillAccountName(bill) }} / {{ paymentBillAccountNumber(bill) }}</p>
              <p>{{ i18n.t('common.expiresAt') }} {{ dateLabel(bill.expires_at) }}</p>
              <p class="payment-countdown" *ngIf="paymentBillCountdown(bill) as countdown">{{ countdown }}</p>
            </section>
            <div class="inline-actions order-actions">
              <a class="btn btn-primary payment-action" *ngIf="canPayBill(bill)" [routerLink]="paymentPagePath(item.order_id)">{{ i18n.t('orders.payNow') }}</a>
              <button
                class="btn btn-primary payment-action"
                type="button"
                *ngIf="canOpenPaymentBill(item)"
                [disabled]="creatingPaymentBill()"
                (click)="openPaymentBill(item.order_id)"
              >{{ openPaymentBillLabel() }}</button>
            </div>
          </ng-container>
          <ng-template #paymentFallback>
            <p class="muted">{{ paymentSummary(item) }}</p>
            <button
              class="btn btn-primary payment-action"
              type="button"
              *ngIf="canOpenPaymentBill(item)"
              [disabled]="creatingPaymentBill()"
              (click)="openPaymentBill(item.order_id)"
            >{{ i18n.t('orders.openPaymentBill') }}</button>
          </ng-template>
        </article>
      </section>

      <section class="panel order-lines-panel">
        <div class="panel-heading">
          <div>
            <h2>{{ i18n.t('orders.orderItems') }}</h2>
            <p class="muted">{{ i18n.t('orders.orderItemsHint') }}</p>
          </div>
          <a class="btn btn-secondary" [routerLink]="i18n.localePath('catalog')">{{ i18n.t('common.continueShopping') }}</a>
        </div>

        <div class="order-line-detail" *ngFor="let line of item.lines">
          <div class="order-line-main">
            <div>
              <span class="status-badge" [ngClass]="lineStatusClass(line)">{{ line.delivery_status ? statusLabel(line.delivery_status) : line.kind }}</span>
              <h3>{{ line.product_name }}</h3>
              <p class="muted">{{ lineDescriptor(line) }}</p>
            </div>
            <strong>{{ format(line.subtotal_cents, line.currency) }}</strong>
          </div>

          <div class="order-meta-grid">
            <div>
              <span>{{ i18n.t('common.sku') }}</span>
              <strong>{{ line.sku_name || line.sku_code || i18n.t('common.default') }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.quantity') }}</span>
              <strong>{{ line.qty }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.unitPrice') }}</span>
              <strong>{{ format(line.unit_price_cents, line.currency) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('orders.delivered') }}</span>
              <strong>{{ deliveredLabel(line) }}</strong>
            </div>
          </div>

          <div class="inline-actions order-actions">
            <button
              class="btn btn-primary"
              *ngIf="line.kind === 'DIGITAL'"
              type="button"
              [disabled]="!canReveal(item, line)"
              (click)="download(item.order_id, line.line_id)"
            >{{ i18n.t('orders.revealDelivery') }}</button>
            <a class="btn btn-secondary" *ngIf="lineProductPath(line) as productPath" [routerLink]="productPath">{{ i18n.t('common.viewProduct') }}</a>
          </div>

          <div class="credential-box" *ngIf="grantFor(line.line_id) as grant">
            <div class="panel-heading">
              <h3>{{ i18n.t('orders.deliveryGrant') }}</h3>
              <p class="muted" *ngIf="grant.expires_at">{{ i18n.t('common.expires') }} {{ dateLabel(grant.expires_at) }}</p>
            </div>
            <div class="list-row" *ngFor="let delivery of grant.items">
              <span>
                <strong>{{ deliveryLabel(delivery) }}</strong>
                <small *ngIf="instruction(delivery)">{{ instruction(delivery) }}</small>
              </span>
              <a *ngIf="delivery.delivery_type === 'ACTIVATION_LINK'" [href]="delivery.value" target="_blank" rel="noopener">{{ delivery.value }}</a>
              <code *ngIf="delivery.delivery_type !== 'ACTIVATION_LINK'">{{ delivery.value }}</code>
            </div>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #loadingOrder>
      <section class="panel empty-state">
        <h2>{{ i18n.t('orders.loadingOrder') }}</h2>
        <p class="muted">{{ i18n.t('orders.loadingOrderHint') }}</p>
      </section>
    </ng-template>
  `,
})
export class OrderDetailPageComponent implements OnInit, OnDestroy {
  public readonly version = '2.2.1';
  protected readonly i18n = inject(I18nLoader);
  private readonly route = inject(ActivatedRoute);
  private readonly ordersApi = inject(OrderUiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly order = signal<Order | null>(null);
  protected readonly paymentBill = signal<PaymentBill | null>(null);
  protected readonly digitalDelivery = signal<Record<string, DigitalDeliveryGrant>>({});
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly creatingPaymentBill = signal(false);
  protected readonly now = signal(Date.now());
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('orders.detailTitle'), description: this.i18n.t('orders.description'), path: `/${this.i18n.currentLocale()}/orders`, noindex: true });
    this.startCountdown();
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  protected async cancel(orderId: string): Promise<void> {
    try {
      this.error.set('');
      this.message.set('');
      await this.ordersApi.cancel(orderId);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async openPaymentBill(orderId: string): Promise<void> {
    this.creatingPaymentBill.set(true);
    this.error.set('');
    this.message.set('');
    try {
      this.paymentBill.set(await this.ordersApi.createPaymentBill(orderId));
      this.message.set(this.i18n.t('orders.paymentBillOpened'));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.creatingPaymentBill.set(false);
    }
  }

  protected async download(orderId: string, lineId: string): Promise<void> {
    try {
      const result = await this.ordersApi.download(orderId, lineId);
      this.digitalDelivery.update((current) => ({ ...current, [lineId]: result }));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected format(cents: number, currency: string): string {
    return formatMoney(cents, currency, this.i18n.angularLocale());
  }

  protected displayOrderId(order: Order): string {
    return order.code ? `#${order.code}` : this.i18n.t('orders.orderId', { id: order.order_id });
  }

  protected statusLabel(value: string): string {
    return this.i18n.t(`status.${value}`);
  }

  protected paymentBillStatusLabel(value: PaymentBill['status']): string {
    return this.i18n.t(`status.${value}`);
  }

  protected paymentBillCountdown(bill: PaymentBill): string {
    if (bill.status !== 'OPEN' || !bill.expires_at) return '';
    return this.countdownLabel(bill.expires_at);
  }

  protected statusClass(status: Order['status']): string {
    return `status-${status.toLowerCase().replace(/_/g, '-')}`;
  }

  protected lineStatusClass(line: OrderLine): string {
    const status = line.delivery_status?.toLowerCase().replace(/_/g, '-') ?? line.kind.toLowerCase();
    return `status-${status}`;
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
    const bill = this.paymentBill();
    if (bill?.status === 'METHOD_REQUIRED') return this.i18n.t('payment.methodRequired');
    if (bill?.status === 'OPEN') return this.i18n.t('checkout.depositStatus', { status: this.paymentBillStatusLabel(bill.status) });
    if (bill && ['EXPIRED', 'CANCELLED', 'FAILED'].includes(bill.status)) return this.paymentBillStatusLabel(bill.status);
    if (order.status === 'PENDING_PAYMENT') return this.i18n.t('orders.pendingPayment');
    if (['PAID', 'PROCESSING', 'FULFILLED'].includes(order.status)) return this.i18n.t('orders.paid');
    return this.statusLabel(order.status);
  }

  protected deliverySummary(order: Order): string {
    if (!order.lines.length) return order.status === 'FULFILLED' ? this.i18n.t('orders.fulfilled') : this.i18n.t('orders.preparing');
    const delivered = order.lines.filter((line) => line.delivery_status === 'DELIVERED').length;
    if (delivered === order.lines.length) return this.i18n.t('orders.delivered');
    if (delivered > 0) return this.i18n.t('orders.deliveredCount', { delivered, total: order.lines.length });
    return order.status === 'FULFILLED' ? this.i18n.t('orders.pendingDelivery') : this.i18n.t('orders.notReady');
  }

  protected lineDescriptor(line: OrderLine): string {
    const sku = line.sku_name || line.sku_code;
    const parts = [line.kind, line.product_kind, line.subkind, sku ? `SKU ${sku}` : ''].filter(Boolean);
    return parts.join(' / ');
  }

  protected deliveredLabel(line: OrderLine): string {
    if (!line.delivery_status) return this.i18n.t('orders.notReady');
    if (line.delivered_count) return `${line.delivered_count}/${line.qty}`;
    return this.statusLabel(line.delivery_status);
  }

  protected canCancel(order: Order): boolean {
    return order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT';
  }

  protected canOpenPaymentBill(order: Order): boolean {
    if (order.status !== 'PENDING_PAYMENT') return false;
    const bill = this.paymentBill();
    if (!bill) return true;
    return bill.status === 'EXPIRED' || bill.status === 'CANCELLED' || bill.status === 'FAILED';
  }

  protected canPayNow(order: Order): boolean {
    if (order.status !== 'PENDING_PAYMENT') return false;
    const bill = this.paymentBill();
    return Boolean(bill && this.canPayBill(bill));
  }

  protected canPayBill(bill: PaymentBill): boolean {
    return bill.status === 'METHOD_REQUIRED' || bill.status === 'OPEN';
  }

  protected openPaymentBillLabel(): string {
    return this.paymentBill() ? this.i18n.t('orders.openNewPaymentBill') : this.i18n.t('orders.openPaymentBill');
  }

  protected paymentPagePath(orderId: string): string {
    return this.i18n.localePath(`orders/${orderId}/payment`);
  }

  protected paymentProviderLabel(provider: PaymentProviderCode | null): string {
    if (provider === 'SCRAP_BANK_TRANSFER') return this.i18n.t('payment.scrapBankTransfer');
    if (provider === 'PROMPTPAY') return this.i18n.t('payment.promptPay');
    if (provider === 'PAYPAL') return this.i18n.t('payment.paypal');
    if (provider === 'TRUEMONEY_WALLET') return this.i18n.t('payment.trueMoney');
    return this.i18n.t('payment.notSelected');
  }

  protected paymentBillBankName(bill: PaymentBill): string {
    const instructions = this.safeInstructions(bill);
    return instructions?.bank_name ?? 'Bank transfer';
  }

  protected paymentBillAccountName(bill: PaymentBill): string {
    const instructions = this.safeInstructions(bill);
    return instructions?.account_name ?? 'KhunPhorBaan';
  }

  protected paymentBillAccountNumber(bill: PaymentBill): string {
    const instructions = this.safeInstructions(bill);
    return instructions?.account_number ?? '';
  }

  protected canReveal(order: Order, line: OrderLine): boolean {
    return order.status === 'FULFILLED' && line.delivery_status === 'DELIVERED';
  }

  protected lineProductPath(line: OrderLine): string | null {
    return line.product_slug ? this.i18n.localePath(`products/${line.product_slug}`) : null;
  }

  protected grantFor(lineId: string): DigitalDeliveryGrant | null {
    return this.digitalDelivery()[lineId] ?? null;
  }

  protected deliveryLabel(item: DigitalDeliveryItem): string {
    return `${item.delivery_type} #${item.unit_index || 1}`;
  }

  protected instruction(item: DigitalDeliveryItem): string {
    return this.i18n.currentLocale() === 'th' ? item.instructions_th ?? item.instructions_en ?? '' : item.instructions_en ?? item.instructions_th ?? '';
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const order = await this.ordersApi.detail(id);
      this.order.set(order);
      this.paymentBill.set(null);
      this.digitalDelivery.set({});
      if (order.status === 'PENDING_PAYMENT') {
        try {
          this.paymentBill.set(await this.ordersApi.currentPaymentBill(order.order_id));
        } catch {
          this.paymentBill.set(null);
        }
      }
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  private safeInstructions(bill: PaymentBill): PromptPayInstructions | ScrapBankTransferInstructions | undefined {
    if (this.promptPayInstructions(bill.instructions)) return bill.instructions;
    if (this.scrapInstructions(bill.instructions)) return bill.instructions;
    return undefined;
  }

  private promptPayInstructions(value: unknown): value is PromptPayInstructions {
    return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'promptpay';
  }

  private scrapInstructions(value: unknown): value is ScrapBankTransferInstructions {
    return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'scrap';
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
