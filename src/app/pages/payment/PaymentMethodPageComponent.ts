import { NgClass, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import QRCode from 'qrcode';
import { DepositUiService } from '../../services/deposit-ui/DepositUiService';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { PaymentUiService } from '../../services/payment-ui/PaymentUiService';
import { BankSelectorComponent } from '../../components/bank-selector/BankSelectorComponent';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { buildPromptPayPayload } from '../../modules/promptpay-qr/PromptPayPayload';
import type { Order, PaymentBill, PaymentMethodOption, PaymentProviderCode, PromptPayInstructions, ScrapBankTransferInstructions } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-payment-method-page',
  imports: [NgClass, NgFor, NgIf, ReactiveFormsModule, RouterLink, BankSelectorComponent],
  template: `
    <section class="page-heading order-detail-heading">
      <p class="eyebrow">{{ i18n.t('common.payment') }}</p>
      <h1>{{ i18n.t('payment.title') }}</h1>
      <p class="muted">{{ i18n.t('payment.lead') }}</p>
      <div class="inline-actions order-actions" *ngIf="order() as item">
        <a class="btn btn-secondary" [routerLink]="i18n.localePath('orders/' + item.order_id)">{{ i18n.t('payment.backToOrder') }}</a>
        <a class="btn btn-secondary" [routerLink]="i18n.localePath('bills/' + item.order_id)">{{ i18n.t('payment.viewInvoice') }}</a>
      </div>
    </section>

    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <section class="content-grid payment-method-layout" *ngIf="order() as item; else loadingPayment">
      <article class="panel">
        <h2>{{ i18n.t('payment.selectMethod') }}</h2>
        <div class="payment-method-list">
          <ng-container *ngIf="availableMethods().length > 0; else fallbackMethodList">
            <button
              *ngFor="let m of availableMethods()"
              class="payment-method-button"
              type="button"
              [ngClass]="{ 'is-selected': bill()?.provider === m.provider_code || (m.provider_code === 'SCRAP_BANK_TH' && (bill()?.provider === 'SCRAP_BANK_TRANSFER' || bill()?.provider === 'PROMPTPAY')) }"
              [disabled]="creatingAttempt() || !canSelectMethod() || !m.is_eligible"
              (click)="selectDynamicProvider(m.provider_code)"
            >
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span [style.background-color]="m.brand_color_hex || '#2563eb'" style="width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
                <strong>{{ i18n.currentLocale() === 'th' ? m.display_name_th : m.display_name_en }}</strong>
              </div>
              <small>{{ i18n.currentLocale() === 'th' ? m.description_th : m.description_en }}</small>
            </button>
          </ng-container>

          <ng-template #fallbackMethodList>
            <button
              class="payment-method-button"
              type="button"
              [ngClass]="{ 'is-selected': bill()?.provider === 'SCRAP_BANK_TRANSFER' || bill()?.provider === 'SCRAP_BANK_TH' }"
              [disabled]="creatingAttempt() || !canSelectMethod()"
              (click)="selectProvider('SCRAP_BANK_TH')"
            >
              <strong>{{ i18n.t('payment.scrapBankTransfer') }}</strong>
              <small>{{ i18n.t('payment.scrapBankTransferHint') }}</small>
            </button>
            <button
              class="payment-method-button"
              type="button"
              [ngClass]="{ 'is-selected': bill()?.provider === 'CRYPTO' }"
              [disabled]="creatingAttempt() || !canSelectMethod()"
              (click)="selectProvider('CRYPTO')"
            >
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="width: 10px; height: 10px; border-radius: 50%; display: inline-block; background-color: #10b981;"></span>
                <strong>Crypto Gateway (USDT/USDC/ETH)</strong>
              </div>
              <small>Instant multi-chain crypto settlement</small>
            </button>
          </ng-template>
        </div>
        <form class="bank-selection-panel" [formGroup]="bankSelectionForm" *ngIf="showBankSelection()" (ngSubmit)="confirmBankTransfer()">
          <kpb-bank-selector formControlName="bank_code"></kpb-bank-selector>
          <p class="alert alert-error" *ngIf="bankSelectionForm.controls.bank_code.touched && bankSelectionForm.controls.bank_code.invalid">{{ i18n.t('payment.bankRequired') }}</p>
          <button class="btn btn-primary" type="submit" [disabled]="bankSelectionForm.invalid || creatingAttempt()">{{ i18n.t('payment.generatePaymentDetails') }}</button>
        </form>
      </article>

      <article class="panel payment-card">
        <h2>{{ i18n.t('payment.paymentInformation') }}</h2>
        <ng-container *ngIf="bill() as activeBill; else noBill">
          <div class="order-meta-grid">
            <div>
              <span>{{ i18n.t('common.status') }}</span>
              <strong>{{ statusLabel(activeBill.status) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.total') }}</span>
              <strong>{{ format(activeBill.amount_cents, activeBill.currency) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('payment.method') }}</span>
              <strong>{{ paymentProviderLabel(activeBill.provider) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('common.expires') }}</span>
              <strong>{{ activeBill.expires_at ? dateLabel(activeBill.expires_at) : i18n.t('common.notAvailable') }}</strong>
              <small class="payment-countdown" *ngIf="paymentCountdown(activeBill) as countdown">{{ countdown }}</small>
            </div>
          </div>

          <!-- Crypto Payment Instructions -->
          <section class="payment-instructions crypto-instructions" *ngIf="activeBill.status === 'OPEN' && activeBill.provider === 'CRYPTO'" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 1.25rem; margin-top: 1rem;">
            <p class="eyebrow" style="color: #059669; font-weight: 700;">Crypto Sovereign Settlement (Instant)</p>
            <h3 style="color: #065f46; margin: 0.25rem 0 0.5rem 0;">Deposit to Address</h3>
            <p class="deposit-amount" style="color: #059669; font-size: 1.5rem; font-weight: 800;">{{ format(activeBill.amount_cents, activeBill.currency) }}</p>
            <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1rem;">Zero Satang Alteration (Scrap: 0 THB) | Global Settlement Invariant</p>

            <div *ngIf="cryptoAssets(activeBill) as assets" style="display: flex; flex-direction: column; gap: 1rem;">
              <div *ngFor="let asset of assets" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.85rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <strong style="color: #1e3a8a; font-size: 1rem;">{{ asset.asset }} ({{ asset.network }})</strong>
                  <span style="background: #dcfce7; color: #15803d; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.85rem;">{{ asset.amount_formatted }}</span>
                </div>
                <div style="font-size: 0.85rem; color: #374151; word-break: break-all; margin-bottom: 0.5rem;">
                  <span>Deposit Address: </span>
                  <code style="background: #f8fafc; padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid #e2e8f0; user-select: all; font-family: monospace;">{{ asset.address }}</code>
                </div>
                <div *ngIf="cryptoQrUrl(asset) as qr" style="text-align: center; margin: 0.5rem 0;">
                  <img [src]="qr" [alt]="asset.asset + ' QR'" style="max-width: 160px; border-radius: 6px; border: 1px solid #e2e8f0;">
                </div>
              </div>
            </div>

            <p style="margin-top: 1rem; font-size: 0.85rem; color: #64748b;">{{ i18n.t('common.expiresAt') }} {{ dateLabel(activeBill.expires_at) }}</p>
            <p class="payment-countdown" *ngIf="paymentCountdown(activeBill) as countdown">{{ countdown }}</p>
          </section>

          <!-- Bank & PromptPay Payment Instructions -->
          <section class="payment-instructions" *ngIf="activeBill.status === 'OPEN' && activeBill.provider !== 'CRYPTO'">
            <p class="eyebrow">{{ i18n.t('checkout.depositStatus', { status: statusLabel(activeBill.status) }) }}</p>
            <h3>{{ i18n.t('checkout.uniqueAmount') }}</h3>
            <p class="deposit-amount">{{ format(activeBill.unique_amount_cents, activeBill.currency) }}</p>
            <p>{{ i18n.t('checkout.baseTotal') }}: {{ format(activeBill.amount_cents, activeBill.currency) }} | {{ i18n.t('checkout.scrap') }}: {{ format(activeBill.scrap_cents, activeBill.currency) }}</p>
            <p>{{ bankName(activeBill) }} / {{ accountName(activeBill) }} / {{ accountNumber(activeBill) }}</p>
            <div class="promptpay-qr-card" *ngIf="promptPayQrUrl(activeBill) as qrUrl">
              <img [src]="qrUrl" [alt]="i18n.t('payment.promptPayQrAlt')">
              <small>{{ localPaymentQrHint(activeBill) }}</small>
              <code *ngIf="promptPayPayload(activeBill) as payload">{{ payload }}</code>
            </div>
            <p>{{ i18n.t('common.expiresAt') }} {{ dateLabel(activeBill.expires_at) }}</p>
            <p class="payment-countdown" *ngIf="paymentCountdown(activeBill) as countdown">{{ countdown }}</p>
          </section>

          <section class="empty-state" *ngIf="activeBill.status === 'METHOD_REQUIRED'">
            <strong>{{ i18n.t('payment.methodRequired') }}</strong>
            <span>{{ displayOrderId(item) }}</span>
          </section>

          <section class="empty-state" *ngIf="activeBill.status === 'EXPIRED' || activeBill.status === 'CANCELLED' || activeBill.status === 'FAILED'">
            <strong>{{ statusLabel(activeBill.status) }}</strong>
            <a class="btn btn-primary" [routerLink]="i18n.localePath('orders/' + item.order_id)">{{ i18n.t('orders.openNewPaymentBill') }}</a>
          </section>
        </ng-container>
        <ng-template #noBill>
          <div class="empty-state">
            <strong>{{ i18n.t('payment.noBill') }}</strong>
            <a class="btn btn-primary" [routerLink]="i18n.localePath('orders/' + item.order_id)">{{ i18n.t('orders.openPaymentBill') }}</a>
          </div>
        </ng-template>
      </article>
    </section>

    <section class="panel" *ngIf="bill() as activeBill">
      <ng-container *ngIf="activeBill.status === 'OPEN' && activeBill.deposit_id">
        <h2>{{ i18n.t('checkout.manualClaim') }}</h2>
        <form class="stack" [formGroup]="claimForm" (ngSubmit)="manualClaim(activeBill)">
          <input formControlName="transferred_at" type="datetime-local">
          <input formControlName="last4_account" maxlength="4" [placeholder]="i18n.t('checkout.last4Account')">
          <input formControlName="screenshot_media_id" [placeholder]="i18n.t('checkout.optionalScreenshotMediaId')">
          <button class="btn btn-secondary" type="submit" [disabled]="claimForm.invalid">{{ i18n.t('common.submit') }}</button>
        </form>
      </ng-container>
    </section>

    <ng-template #loadingPayment>
      <section class="panel empty-state">
        <h2>{{ i18n.t('payment.loading') }}</h2>
        <p class="muted">{{ i18n.t('orders.loadingOrderHint') }}</p>
      </section>
    </ng-template>
  `,
})
export class PaymentMethodPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.2.1';
  protected readonly i18n = inject(I18nLoader);
  private readonly route = inject(ActivatedRoute);
  private readonly ordersApi = inject(OrderUiService);
  private readonly paymentApi = inject(PaymentUiService);
  private readonly depositsApi = inject(DepositUiService);
  private readonly seo = inject(SeoService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly order = signal<Order | null>(null);
  protected readonly bill = signal<PaymentBill | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly creatingAttempt = signal(false);
  protected readonly showBankSelection = signal(false);
  protected readonly localPromptPayQrUrl = signal('');
  protected readonly localPromptPayPayload = signal('');
  protected readonly availableMethods = signal<PaymentMethodOption[]>([]);
  protected readonly cryptoQrUrls = signal<Record<string, string>>({});
  protected readonly now = signal(Date.now());
  protected readonly bankSelectionForm = this.fb.group({
    bank_code: ['', Validators.required],
  });
  protected readonly claimForm = this.fb.group({
    transferred_at: ['', Validators.required],
    last4_account: [''],
    screenshot_media_id: [''],
  });
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.seo.setPage({ title: this.i18n.t('payment.title'), description: this.i18n.t('payment.description'), path: `/${this.i18n.currentLocale()}/orders/${id}/payment`, noindex: true });
    this.startCountdown();
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  protected async selectProvider(provider: PaymentProviderCode): Promise<void> {
    const activeBill = this.bill();
    if (!activeBill || activeBill.status !== 'METHOD_REQUIRED') return;
    if (provider === 'SCRAP_BANK_TRANSFER' || provider === 'SCRAP_BANK_TH') {
      this.showBankSelection.set(true);
      this.message.set(this.i18n.t('payment.selectBankHint'));
      return;
    }
    await this.createAttempt(provider);
  }

  protected async selectDynamicProvider(providerCode: string): Promise<void> {
    if (providerCode === 'SCRAP_BANK_TH' || providerCode === 'SCRAP_BANK_TRANSFER') {
      this.showBankSelection.set(true);
      this.message.set(this.i18n.t('payment.selectBankHint'));
      return;
    }
    await this.createAttempt(providerCode as PaymentProviderCode);
  }

  protected async confirmBankTransfer(): Promise<void> {
    if (this.bankSelectionForm.invalid) {
      this.bankSelectionForm.markAllAsTouched();
      this.error.set(this.i18n.t('payment.bankRequired'));
      return;
    }
    await this.createAttempt('SCRAP_BANK_TH', this.bankSelectionForm.getRawValue().bank_code ?? '');
  }

  private async createAttempt(provider: PaymentProviderCode, bankCode = ''): Promise<void> {
    const activeBill = this.bill();
    if (!activeBill || activeBill.status !== 'METHOD_REQUIRED') return;
    this.creatingAttempt.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const bill = await this.paymentApi.createAttempt(activeBill.bill_id, provider, bankCode ? { bank_code: bankCode } : {});
      this.bill.set(bill);
      await this.updateLocalPaymentQr(bill);
      this.showBankSelection.set(false);
      this.message.set(this.i18n.t('payment.paymentReady'));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.creatingAttempt.set(false);
    }
  }

  protected async manualClaim(activeBill: PaymentBill): Promise<void> {
    if (!activeBill.deposit_id) return;
    const value = this.claimForm.getRawValue();
    try {
      await this.depositsApi.manualClaim(activeBill.deposit_id, {
        transferred_at: value.transferred_at ?? '',
        last4_account: value.last4_account || undefined,
        screenshot_media_id: value.screenshot_media_id || undefined,
      });
      this.message.set(this.i18n.t('checkout.manualClaimAccepted'));
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected canSelectMethod(): boolean {
    return this.bill()?.status === 'METHOD_REQUIRED';
  }

  protected displayOrderId(order: Order): string {
    return order.code ? `#${order.code}` : this.i18n.t('orders.orderId', { id: order.order_id });
  }

  protected statusLabel(value: string): string {
    return this.i18n.t(`status.${value}`);
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

  protected cryptoAssets(activeBill: PaymentBill): Array<{
    asset: string;
    network: string;
    address: string;
    amount_formatted: string;
    qr_payload?: string;
  }> | null {
    if (activeBill.provider !== 'CRYPTO') return null;
    const inst = typeof activeBill.instructions === 'object' && activeBill.instructions !== null ? (activeBill.instructions as unknown as Record<string, unknown>) : {};
    const assets = inst['supported_assets'];
    return Array.isArray(assets) ? assets as any : null;
  }

  protected cryptoQrUrl(asset: { asset: string; network: string; address: string; qr_payload?: string }): string | null {
    const key = `${asset.asset}:${asset.network}`;
    return this.cryptoQrUrls()[key] ?? null;
  }

  protected paymentCountdown(activeBill: PaymentBill): string {
    if (activeBill.status !== 'OPEN' || !activeBill.expires_at) return '';
    return this.countdownLabel(activeBill.expires_at);
  }

  protected bankName(activeBill: PaymentBill): string {
    const instructions = this.safeInstructions(activeBill);
    return instructions?.bank_name ?? 'Bank transfer';
  }

  protected accountName(activeBill: PaymentBill): string {
    const instructions = this.safeInstructions(activeBill);
    return instructions?.account_name ?? 'KhunPhorBaan';
  }

  protected accountNumber(activeBill: PaymentBill): string {
    const instructions = this.safeInstructions(activeBill);
    return instructions?.account_number ?? '';
  }

  protected promptPayQrUrl(activeBill: PaymentBill): string {
    void activeBill;
    return this.localPromptPayQrUrl();
  }

  protected promptPayPayload(activeBill: PaymentBill): string {
    void activeBill;
    return this.localPromptPayPayload();
  }

  protected localPaymentQrHint(activeBill: PaymentBill): string {
    return activeBill.provider === 'SCRAP_BANK_TRANSFER' ? this.i18n.t('payment.bankQrHint') : this.i18n.t('payment.promptPayQrHint');
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

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const order = await this.ordersApi.detail(id);
      this.order.set(order);
      const isThai = order.currency === 'THB';
      try {
        const methods = await this.paymentApi.listPaymentMethods(
          isThai ? 'TH' : 'US',
          order.currency,
          order.total_cents
        );
        this.availableMethods.set(methods);
      } catch {
        this.availableMethods.set([]);
      }
      const bill = order.status === 'PENDING_PAYMENT' ? await this.ordersApi.currentPaymentBill(order.order_id) : null;
      this.bill.set(bill);
      await this.updateLocalPaymentQr(bill);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
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

  private async updateLocalPaymentQr(activeBill: PaymentBill | null): Promise<void> {
    this.localPromptPayQrUrl.set('');
    this.localPromptPayPayload.set('');
    this.cryptoQrUrls.set({});
    if (!activeBill || activeBill.status !== 'OPEN') return;

    if (activeBill.provider === 'CRYPTO') {
      const inst = typeof activeBill.instructions === 'object' && activeBill.instructions !== null ? (activeBill.instructions as unknown as Record<string, unknown>) : {};
      const assets = inst['supported_assets'];
      if (Array.isArray(assets)) {
        const qrMap: Record<string, string> = {};
        for (const item of assets) {
          const assetObj = item as Record<string, unknown>;
          const payload = String(assetObj['qr_payload'] ?? assetObj['address'] ?? '');
          const asset = String(assetObj['asset'] ?? '');
          const network = String(assetObj['network'] ?? '');
          if (payload && asset && network) {
            const key = `${asset}:${network}`;
            try {
              qrMap[key] = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 200 });
            } catch {
              // Ignore QR encoding errors
            }
          }
        }
        this.cryptoQrUrls.set(qrMap);
      }
      return;
    }

    if (activeBill.provider === 'PROMPTPAY' && this.promptPayInstructions(activeBill.instructions)) {
      const instructions = activeBill.instructions;
      const accountNumber = instructions.account_number;
      const promptpayType = instructions.promptpay_type ?? 'PHONE';
      if (!accountNumber) return;
      const payload = buildPromptPayPayload({
        targetType: promptpayType,
        targetId: accountNumber,
        amountCents: activeBill.unique_amount_cents,
      });
      this.localPromptPayPayload.set(payload);
      this.localPromptPayQrUrl.set(await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 260 }));
    }
  }

  private safeInstructions(activeBill: PaymentBill): PromptPayInstructions | ScrapBankTransferInstructions | undefined {
    if (this.promptPayInstructions(activeBill.instructions)) return activeBill.instructions;
    if (this.scrapInstructions(activeBill.instructions)) return activeBill.instructions;
    return undefined;
  }

  private promptPayInstructions(value: unknown): value is PromptPayInstructions {
    return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'promptpay';
  }

  private scrapInstructions(value: unknown): value is ScrapBankTransferInstructions {
    return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'scrap';
  }
}
