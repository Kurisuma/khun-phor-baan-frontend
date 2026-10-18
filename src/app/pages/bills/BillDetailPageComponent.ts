import { NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Order, OrderLine, PaymentBill, PaymentProviderCode } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-bill-detail-page',
  imports: [NgClass, NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading invoice-detail-heading">
      <p class="eyebrow">{{ i18n.t('bills.eyebrow') }}</p>
      <h1>{{ invoiceTitle() }}</h1>
      <p class="muted">{{ i18n.t('bills.detailLead') }}</p>
      <div class="inline-actions invoice-print-actions no-print">
        <a class="btn btn-secondary" [routerLink]="i18n.localePath('bills')">{{ i18n.t('bills.backToBills') }}</a>
        <a class="btn btn-secondary" *ngIf="order() as item" [routerLink]="orderPath(item.order_id)">{{ i18n.t('common.order') }}</a>
        <button class="btn btn-secondary" type="button" (click)="printInvoice()" [disabled]="!order()">{{ i18n.t('bills.printInvoice') }}</button>
        <button
          class="btn btn-primary"
          type="button"
          *ngIf="order() as item"
          [hidden]="!canManagePayment(item)"
          [disabled]="openingPayment()"
          (click)="managePayment(item)"
        >{{ paymentActionLabel(item) }}</button>
      </div>
    </section>

    <p class="alert alert-error no-print" *ngIf="error()">{{ error() }}</p>

    <ng-container *ngIf="order() as item; else loadingInvoice">
      <article class="invoice-document">
        <header class="invoice-header">
          <div class="invoice-brand-block">
            <p class="eyebrow">{{ i18n.t('bills.seller') }}</p>
            <h2>KhunPhorBaan</h2>
            <p class="muted">{{ i18n.t('bills.printReady') }}</p>
          </div>
          <div class="invoice-title-block">
            <p class="eyebrow">{{ i18n.t('checkout.invoice') }}</p>
            <h1>{{ invoiceTitle() }}</h1>
            <span class="status-badge" [ngClass]="billStatusClass()">{{ billStatusLabel() }}</span>
          </div>
        </header>

        <section class="invoice-parties">
          <div>
            <span>{{ i18n.t('bills.soldBy') }}</span>
            <strong>KhunPhorBaan</strong>
            <p>{{ i18n.t('bills.issuedBy') }}</p>
          </div>
          <div>
            <span>{{ i18n.t('bills.billTo') }}</span>
            <strong>{{ i18n.t('bills.customerAccount') }}</strong>
            <p>{{ displayOrderId(item) }}</p>
          </div>
        </section>

        <section class="invoice-facts">
          <div>
            <span>{{ i18n.t('bills.billId') }}</span>
            <strong>{{ invoiceNumber(item) }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('bills.orderReference') }}</span>
            <strong>{{ displayOrderId(item) }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('bills.invoiceDate') }}</span>
            <strong>{{ dateLabel(invoiceDate(item)) }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('bills.dueDate') }}</span>
            <strong>{{ dueDateLabel() }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('bills.invoiceStatus') }}</span>
            <strong>{{ billStatusLabel() }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('bills.paymentMethod') }}</span>
            <strong>{{ paymentProviderLabel(paymentBill()?.provider ?? null) }}</strong>
          </div>
        </section>

        <section class="invoice-line-section">
          <h2>{{ i18n.t('bills.lineItems') }}</h2>
          <div class="invoice-table">
            <div class="invoice-table-head">
              <span>{{ i18n.t('bills.itemDescription') }}</span>
              <span>{{ i18n.t('common.quantity') }}</span>
              <span>{{ i18n.t('common.unitPrice') }}</span>
              <span>{{ i18n.t('common.total') }}</span>
            </div>
            <div class="invoice-table-row" *ngFor="let line of item.lines">
              <span class="invoice-item-title">
                <strong>{{ line.product_name }}</strong>
                <small>{{ lineDescriptor(line) }}</small>
              </span>
              <span class="invoice-table-qty">
                <small>{{ i18n.t('common.quantity') }}</small>
                {{ line.qty }}
              </span>
              <span class="invoice-table-money">
                <small>{{ i18n.t('common.unitPrice') }}</small>
                {{ format(line.unit_price_cents, line.currency) }}
              </span>
              <span class="invoice-table-money">
                <small>{{ i18n.t('common.total') }}</small>
                {{ format(line.subtotal_cents, line.currency) }}
              </span>
            </div>
          </div>
        </section>

        <section class="invoice-summary-grid">
          <div class="invoice-payment-box">
            <p class="eyebrow">{{ i18n.t('payment.paymentInformation') }}</p>
            <ng-container *ngIf="paymentBill() as bill; else noPaymentBill">
              <h2>{{ paymentInstructionTitle(bill) }}</h2>
              <p class="deposit-amount" *ngIf="bill.status === 'OPEN'">{{ format(bill.unique_amount_cents, bill.currency) }}</p>
              <p>{{ paymentInstructionCopy(bill) }}</p>
              <dl class="invoice-bank-list" *ngIf="bill.status === 'OPEN'">
                <div><dt>{{ i18n.t('common.bank') }}</dt><dd>{{ paymentBillBankName(bill) }}</dd></div>
                <div><dt>{{ i18n.t('bills.bankAccount') }}</dt><dd>{{ paymentBillAccountName(bill) }} / {{ paymentBillAccountNumber(bill) }}</dd></div>
                <div><dt>{{ i18n.t('common.expiresAt') }}</dt><dd>{{ dateLabel(bill.expires_at) }}</dd></div>
              </dl>
            </ng-container>
            <ng-template #noPaymentBill>
              <h2>{{ i18n.t('bills.invoicePending') }}</h2>
              <p>{{ i18n.t('bills.noPaymentInstructions') }}</p>
            </ng-template>
          </div>

          <div class="invoice-totals">
            <div><span>{{ i18n.t('common.subtotal') }}</span><strong>{{ format(item.subtotal_cents, item.currency) }}</strong></div>
            <div *ngIf="billFxFeeCents() > 0" style="color: #0f766e;">
              <span>{{ i18n.t('bills.fxConversionFee') }} ({{ dualCurrencyInfo()?.fee ?? 2 }}%):</span>
              <strong>+{{ format(billFxFeeCents(), billCurrency(item)) }}</strong>
            </div>
            <div *ngIf="item.tax_cents > 0"><span>{{ i18n.t('common.tax') }}</span><strong>{{ format(item.tax_cents, item.currency) }}</strong></div>
            <div><span>{{ i18n.t('bills.invoiceBase') }}</span><strong>{{ format(billBaseAmountCents(item), billCurrency(item)) }}</strong></div>
            <div><span>{{ i18n.t('bills.scrapAdjustment') }}</span><strong>+{{ format(billScrapCents(), billCurrency(item)) }}</strong></div>
            <div class="invoice-total-due"><span>{{ i18n.t('bills.totalDue') }}</span><strong>{{ format(billAmountCents(item), billCurrency(item)) }}</strong></div>

            <div *ngIf="dualCurrencyInfo() as dual" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #cbd5e1;">
              <div style="display: flex; justify-content: space-between; align-items: center; color: #2563eb; font-weight: 600;">
                <span>{{ i18n.t('bills.totalDue') }} ({{ dual.currency }}):</span>
                <span>{{ dual.currency }} {{ dual.amount.toFixed(2) }}</span>
              </div>
              <small style="display: block; font-size: 0.75rem; color: #64748b; text-align: right; margin-top: 0.25rem;">
                Locked Rate: 1 THB = {{ dual.rate.toFixed(4) }} {{ dual.currency }} (incl. {{ dual.fee }}% fee)
              </small>
            </div>
          </div>
        </section>

        <section class="invoice-facts international-reference-facts" *ngIf="dualCurrencyInfo() as dual" style="margin-top: 1.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem;">
          <div>
            <span>Customer Display Currency</span>
            <strong>{{ dual.currency }}</strong>
          </div>
          <div>
            <span>Locked Foreign Total</span>
            <strong style="color: #2563eb;">{{ dual.currency }} {{ dual.amount.toFixed(2) }}</strong>
          </div>
          <div>
            <span>Guaranteed Exchange Rate</span>
            <strong>1 THB = {{ dual.rate.toFixed(4) }} {{ dual.currency }}</strong>
          </div>
          <div>
            <span>Statutory Settlement</span>
            <strong>THB (Thai Baht Satangs)</strong>
          </div>
        </section>

        <footer class="invoice-footer">
          <p>{{ i18n.t('bills.taxInvoiceNote') }}</p>
        </footer>
      </article>
    </ng-container>

    <ng-template #loadingInvoice>
      <section class="panel empty-state">
        <h2>{{ loading() ? i18n.t('bills.loadingDetail') : i18n.t('bills.invoicePending') }}</h2>
        <p class="muted">{{ loading() ? i18n.t('orders.checkingHistory') : error() }}</p>
      </section>
    </ng-template>
  `,
})
export class BillDetailPageComponent implements OnInit {
  public readonly version = '1.0.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ordersApi = inject(OrderUiService);
  private readonly seo = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly order = signal<Order | null>(null);
  protected readonly paymentBill = signal<PaymentBill | null>(null);
  protected readonly error = signal('');
  protected readonly loading = signal(false);
  protected readonly openingPayment = signal(false);

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('bills.detailTitle'), description: this.i18n.t('bills.description'), path: `/${this.i18n.currentLocale()}/bills`, noindex: true });
    await this.load();
  }

  protected printInvoice(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.print();
  }

  protected async managePayment(order: Order): Promise<void> {
    if (!this.canManagePayment(order)) return;
    this.openingPayment.set(true);
    this.error.set('');
    try {
      const bill = this.paymentBill();
      if (!bill || this.canReopen(bill)) {
        this.paymentBill.set(await this.ordersApi.createPaymentBill(order.order_id));
      }
      await this.router.navigateByUrl(this.paymentPagePath(order.order_id));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.openingPayment.set(false);
    }
  }

  protected invoiceTitle(): string {
    const order = this.order();
    const bill = this.paymentBill();
    if (bill?.bill_id) return this.i18n.t('bills.invoiceNumber', { id: bill.bill_id });
    return order ? this.i18n.t('bills.invoiceForOrder', { id: this.displayOrderId(order) }) : this.i18n.t('bills.detailTitle');
  }

  protected invoiceNumber(order: Order): string {
    return this.paymentBill()?.bill_id || order.order_id;
  }

  protected invoiceDate(order: Order): string {
    return this.paymentBill()?.created_at || order.created_at;
  }

  protected dueDateLabel(): string {
    const bill = this.paymentBill();
    if (!bill?.expires_at) return this.i18n.t('common.notAvailable');
    return this.dateLabel(bill.expires_at);
  }

  protected displayOrderId(order: Order): string {
    return order.code ? `#${order.code}` : this.i18n.t('orders.orderId', { id: order.order_id });
  }

  protected billStatusLabel(): string {
    const bill = this.paymentBill();
    return bill ? this.i18n.t(`status.${bill.status}`) : this.i18n.t('bills.noBill');
  }

  protected billStatusClass(): string {
    const status = this.paymentBill()?.status ?? 'NOT_READY';
    return `status-${status.toLowerCase().replace(/_/g, '-')}`;
  }

  protected lineDescriptor(line: OrderLine): string {
    const sku = line.sku_name || line.sku_code || line.sku_id || '';
    return [
      sku ? `${this.i18n.t('common.sku')} ${sku}` : '',
      line.fulfillment_type || line.kind,
      this.i18n.t('orders.qty', { count: line.qty }),
    ].filter(Boolean).join(' / ');
  }

  protected paymentActionLabel(order: Order): string {
    const bill = this.paymentBill();
    if (!bill) return this.i18n.t('orders.openPaymentBill');
    if (this.canReopen(bill)) return this.i18n.t('orders.openNewPaymentBill');
    return order.status === 'PENDING_PAYMENT' ? this.i18n.t('orders.payNow') : this.i18n.t('common.payment');
  }

  protected canManagePayment(order: Order): boolean {
    if (order.status !== 'PENDING_PAYMENT') return false;
    const bill = this.paymentBill();
    if (!bill) return true;
    return bill.status === 'METHOD_REQUIRED' || bill.status === 'OPEN' || this.canReopen(bill);
  }

  protected paymentInstructionTitle(bill: PaymentBill): string {
    if (bill.status === 'OPEN') return this.i18n.t('bills.exactTransferAmount');
    if (bill.status === 'METHOD_REQUIRED') return this.i18n.t('payment.methodRequired');
    return this.billStatusLabel();
  }

  protected paymentInstructionCopy(bill: PaymentBill): string {
    if (bill.status === 'OPEN') return this.i18n.t('bills.paymentDue', { date: this.dateLabel(bill.expires_at) });
    if (bill.status === 'METHOD_REQUIRED') return this.i18n.t('bills.chooseMethodToPay');
    return this.i18n.t('bills.paidHistory');
  }

  protected paymentProviderLabel(provider: PaymentProviderCode | null): string {
    if (provider === 'SCRAP_BANK_TH' || provider === 'SCRAP_BANK_TRANSFER') return this.i18n.t('payment.scrapBankTransfer');
    if (provider === 'CRYPTO') return 'Crypto Gateway (USDT/USDC/ETH)';
    if (provider === 'SHOPEEPAY_MY') return 'ShopeePay / DuitNow (Malaysia)';
    if (provider === 'OMAKASEPAY_IN') return 'OmakasePay / UPI (India)';
    if (provider === 'PROMPTPAY') return this.i18n.t('payment.promptPay');
    if (provider === 'PAYPAL') return this.i18n.t('payment.paypal');
    if (provider === 'TRUEMONEY_WALLET') return this.i18n.t('payment.trueMoney');
    return this.i18n.t('payment.notSelected');
  }

  protected paymentBillBankName(bill: PaymentBill): string {
    const instructions = this.record(bill.instructions);
    return String(instructions['bank_name'] ?? instructions['provider'] ?? 'Bank transfer');
  }

  protected paymentBillAccountName(bill: PaymentBill): string {
    const instructions = this.record(bill.instructions);
    return String(instructions['account_name'] ?? instructions['provider'] ?? 'KhunPhorBaan');
  }

  protected paymentBillAccountNumber(bill: PaymentBill): string {
    const instructions = this.record(bill.instructions);
    return String(instructions['account_number'] ?? instructions['account_reference'] ?? '');
  }

  protected billAmountCents(order: Order): number {
    const bill = this.paymentBill();
    return bill?.unique_amount_cents || bill?.amount_cents || order.total_cents;
  }

  protected billBaseAmountCents(order: Order): number {
    return this.paymentBill()?.amount_cents || order.total_cents;
  }

  protected billScrapCents(): number {
    return this.paymentBill()?.scrap_cents ?? 0;
  }

  protected billFxFeeCents(): number {
    const bill = this.paymentBill();
    if (!bill) return 0;
    const instructions = this.record(bill.instructions);
    if (instructions['fx_fee_cents'] !== undefined) {
      return Number(instructions['fx_fee_cents']);
    }
    const order = this.order();
    if (order && bill.amount_cents > order.subtotal_cents) {
      return bill.amount_cents - order.subtotal_cents;
    }
    return 0;
  }

  protected billCurrency(order: Order): string {
    return this.paymentBill()?.currency || order.currency;
  }

  protected orderPath(orderId: string): string {
    return this.i18n.localePath(`orders/${orderId}`);
  }

  protected paymentPagePath(orderId: string): string {
    return this.i18n.localePath(`orders/${orderId}/payment`);
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

  protected dualCurrencyInfo(): { currency: string; amount: number; rate: number; fee: number } | null {
    const bill = this.paymentBill();
    if (!bill) return null;
    const instructions = this.record(bill.instructions);
    const currency = String(instructions['display_currency'] ?? '');
    if (!currency || currency === 'THB') return null;
    const amount = Number(instructions['display_amount'] ?? instructions['display_total'] ?? 0);
    const rate = Number(instructions['locked_fx_rate'] ?? 0);
    const fee = Number(instructions['fx_fee_percent'] ?? 2.0);
    return { currency, amount, rate, fee };
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.error.set('');
    try {
      const order = await this.ordersApi.detail(id);
      this.order.set(order);
      try {
        this.paymentBill.set(await this.ordersApi.currentPaymentBill(order.order_id));
      } catch {
        this.paymentBill.set(null);
      }
      this.seo.setPage({ title: this.invoiceTitle(), description: this.i18n.t('bills.description'), path: `/${this.i18n.currentLocale()}/bills/${order.order_id}`, noindex: true });
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.order.set(null);
      this.paymentBill.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private canReopen(bill: PaymentBill): boolean {
    return bill.status === 'EXPIRED' || bill.status === 'CANCELLED' || bill.status === 'FAILED';
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

}
