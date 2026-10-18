import { NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { CheckoutUiService } from '../../services/checkout-ui/CheckoutUiService';
import { OrderUiService } from '../../services/order-ui/OrderUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Cart, CartItem, CheckoutPreview, OrderCreated } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney, getGlobalDisplayCurrency, formatDualMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-checkout-page',
  imports: [NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading">
      <p class="eyebrow">{{ i18n.t('checkout.title') }}</p>
      <h1>{{ i18n.t('checkout.title') }}</h1>
    </section>
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>

    <section class="content-grid checkout-grid">
      <article class="panel checkout-invoice-panel" *ngIf="cartSnapshot() as c; else loadingCheckout">
        <div class="panel-heading">
          <div>
            <h2>{{ i18n.t('checkout.invoice') }}</h2>
            <p class="muted">{{ itemCountLabel(c) }}</p>
          </div>
          <a class="btn btn-secondary" [routerLink]="i18n.localePath('cart')">{{ i18n.t('nav.cart') }}</a>
        </div>

        <div class="checkout-invoice-meta">
          <div>
            <span>{{ i18n.t('common.items') }}</span>
            <strong>{{ c.item_count }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('common.subtotal') }}</span>
            <strong>{{ format(c.total_cents, c.currency) }}</strong>
          </div>
        </div>

        <div class="checkout-invoice-lines" *ngIf="c.items.length; else emptyCheckoutCart">
          <div class="checkout-invoice-head">
            <span>{{ i18n.t('common.items') }}</span>
            <span>{{ i18n.t('common.quantity') }}</span>
            <span>{{ i18n.t('common.unitPrice') }}</span>
            <span>{{ i18n.t('common.subtotal') }}</span>
          </div>
          <div class="checkout-invoice-line" *ngFor="let item of c.items; trackBy: trackItem">
            <div class="checkout-item-title">
              <strong>{{ item.product_name }}</strong>
              <small *ngIf="skuLabel(item)">{{ skuLabel(item) }}</small>
            </div>
            <div class="checkout-line-qty"><span>{{ i18n.t('common.quantity') }}</span><strong>{{ item.qty }}</strong></div>
            <div class="checkout-line-money">
              <span>{{ i18n.t('common.unitPrice') }}</span>
              <strong>{{ format(item.unit_price_cents, item.currency) }}</strong>
              <small class="dual-currency-badge" *ngIf="itemDualPrice(item.unit_price_cents) as dual">{{ dual }}</small>
            </div>
            <div class="checkout-line-money">
              <span>{{ i18n.t('common.subtotal') }}</span>
              <strong>{{ format(itemSubtotal(item), item.currency) }}</strong>
              <small class="dual-currency-badge" *ngIf="itemDualPrice(itemSubtotal(item)) as dual">{{ dual }}</small>
            </div>
          </div>
        </div>
        <ng-template #emptyCheckoutCart>
          <div class="empty-state">
            <strong>{{ i18n.t('common.empty') }}</strong>
            <a class="btn btn-primary" [routerLink]="i18n.localePath('catalog')">{{ i18n.t('common.browseCatalog') }}</a>
          </div>
        </ng-template>

        <div class="checkout-invoice-total">
          <span>{{ i18n.t('common.total') }}</span>
          <div>
            <strong>{{ format(invoiceTotalCents(c), invoiceCurrency(c)) }}</strong>
            <div class="dual-currency-badge" *ngIf="isDualCurrency()">
              <span>≈ {{ displayTotalLabel() }}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="panel checkout-action-panel">
        <h2>{{ i18n.t('checkout.preview') }}</h2>
        <div class="summary-row" *ngIf="cartSnapshot() as c">
          <span>{{ i18n.t('common.total') }}</span>
          <strong>{{ format(invoiceTotalCents(c), invoiceCurrency(c)) }}</strong>
        </div>

        <div class="dual-currency-notice" *ngIf="isDualCurrency()" style="margin: 1rem 0; padding: 1rem; border-radius: 8px; border: 1px solid #bfdbfe; background: #eff6ff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong style="color: #1e40af; font-size: 0.95rem;">{{ preview()?.display_currency }} Guaranteed Quote</strong>
            <span class="quote-timer" *ngIf="quoteTimeRemaining()" style="font-weight: 700; color: #b45309; font-size: 0.85rem;">⏱️ {{ quoteTimeRemaining() }}</span>
          </div>
          <div style="margin-bottom: 0.35rem;">
            <span style="font-size: 0.9rem; color: #475569;">Estimated Total: </span>
            <strong style="font-size: 1.15rem; color: #1e3a8a;">{{ displayTotalLabel() }}</strong>
          </div>
          <p style="font-size: 0.8rem; color: #64748b; margin: 0.25rem 0 0.5rem 0;">{{ displayRateLabel() }}</p>
          <div style="font-size: 0.8rem; color: #334155; background: rgba(255, 255, 255, 0.7); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #cbd5e1; line-height: 1.4;">
            ℹ️ <strong>Settlement Rule:</strong> Your payment will be captured and settled strictly in <strong>{{ format(invoiceTotalCents(cartSnapshot()!), 'THB') }}</strong> via Thai Bank Transfer or PromptPay. Foreign currency values are informational reference figures locked for 15 minutes.
          </div>
        </div>

        <ng-container *ngIf="order() as created; else checkoutActions">
          <div class="checkout-created-block">
            <h3>{{ i18n.t('checkout.orderCreated') }}</h3>
            <p class="muted">{{ i18n.t('checkout.orderCreatedHint') }}</p>
            <div class="order-meta-grid">
              <div>
                <span>{{ i18n.t('common.order') }}</span>
                <strong>{{ i18n.t('orders.orderId', { id: created.order_id }) }}</strong>
              </div>
              <div>
                <span>{{ i18n.t('common.total') }}</span>
                <strong>{{ format(created.total_amount_cents, created.currency) }}</strong>
                <small *ngIf="created.display_currency && created.display_currency !== 'THB'" style="display: block; color: #2563eb; font-weight: 600;">
                  ≈ {{ created.display_currency }} {{ created.display_total?.toFixed(2) }}
                </small>
              </div>
            </div>
            <div class="inline-actions order-actions">
              <a class="btn btn-primary" [routerLink]="i18n.localePath('orders/' + created.order_id)">{{ i18n.t('common.viewDetails') }}</a>
              <button class="btn btn-secondary" type="button" [disabled]="openingPayment()" (click)="payNow(created.order_id)">{{ i18n.t('orders.payNow') }}</button>
            </div>
          </div>
        </ng-container>
        <ng-template #checkoutActions>
          <div class="inline-actions">
            <button class="btn btn-secondary" type="button" (click)="loadPreview()">{{ i18n.t('checkout.preview') }}</button>
            <button class="btn btn-primary" type="button" (click)="placeOrder()" [disabled]="placingOrder() || !canPlaceOrder()">{{ i18n.t('checkout.placeOrder') }}</button>
          </div>
        </ng-template>
      </article>
    </section>

    <ng-template #loadingCheckout>
      <section class="panel empty-state">
        <h2>{{ i18n.t('common.loading') }}</h2>
      </section>
    </ng-template>
  `,
})
export class CheckoutPageComponent implements OnInit, OnDestroy {
  public readonly version = '2.4.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly cart = inject(CartUiService);
  private readonly checkout = inject(CheckoutUiService);
  private readonly orders = inject(OrderUiService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  protected readonly cartSnapshot = signal<Cart | null>(null);
  protected readonly preview = signal<CheckoutPreview | null>(null);
  protected readonly order = signal<OrderCreated | null>(null);
  protected readonly error = signal('');
  protected readonly placingOrder = signal(false);
  protected readonly openingPayment = signal(false);
  protected readonly checkoutSettled = signal(false);
  protected readonly quoteTimeRemaining = signal('');
  private quoteTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('checkout.title'), description: this.i18n.t('checkout.description'), path: `/${this.i18n.currentLocale()}/checkout`, noindex: true });
    await this.loadPreview();
  }

  ngOnDestroy(): void {
    if (this.quoteTimer) {
      clearInterval(this.quoteTimer);
      this.quoteTimer = null;
    }
  }

  protected async loadPreview(): Promise<void> {
    try {
      const cart = await this.cart.load();
      this.cartSnapshot.set(cart);
      const displayCurrency = getGlobalDisplayCurrency();
      const prev = await this.checkout.preview(cart.cart_id, this.i18n.currentLocale(), undefined, displayCurrency);
      this.preview.set(prev);
      this.startQuoteTimer(prev.fx_quote_expires_at);
      this.error.set('');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async placeOrder(): Promise<void> {
    this.placingOrder.set(true);
    this.error.set('');
    try {
      const cart = await this.cart.load();
      this.cartSnapshot.set(cart);
      const displayCurrency = getGlobalDisplayCurrency();
      const prev = await this.checkout.preview(cart.cart_id, this.i18n.currentLocale(), undefined, displayCurrency);
      this.preview.set(prev);
      const order = await this.checkout.createOrder(cart.cart_id, undefined, displayCurrency, prev.fx_quote_token);
      this.order.set(order);
      this.resetCartAfterCheckout();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.placingOrder.set(false);
    }
  }

  protected isDualCurrency(): boolean {
    const cur = this.preview()?.display_currency;
    return Boolean(cur && cur !== 'THB');
  }

  protected displayTotalLabel(): string {
    const p = this.preview();
    if (p?.display_total === undefined || !p.display_currency) return '';
    return `${p.display_currency} ${p.display_total.toFixed(2)}`;
  }

  protected displayRateLabel(): string {
    const p = this.preview();
    if (!p?.locked_fx_rate || !p.display_currency) return '';
    const fee = p.fx_fee_percent !== undefined ? p.fx_fee_percent : 2.0;
    return `Guaranteed rate: 1 THB = ${p.locked_fx_rate.toFixed(4)} ${p.display_currency} (includes ${fee}% conversion fee)`;
  }

  protected itemDualPrice(cents: number): string | null {
    const cur = getGlobalDisplayCurrency();
    if (!cur || cur === 'THB') return null;
    const dual = formatDualMoney(cents, cur);
    return dual.isDual ? `≈ ${dual.displayFormatted}` : null;
  }

  protected startQuoteTimer(expiresAt?: number): void {
    if (this.quoteTimer) {
      clearInterval(this.quoteTimer);
      this.quoteTimer = null;
    }
    if (!expiresAt) {
      this.quoteTimeRemaining.set('');
      return;
    }
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = expiresAt - now;
      if (remaining <= 0) {
        this.quoteTimeRemaining.set('Expired (refresh quote)');
        if (this.quoteTimer) {
          clearInterval(this.quoteTimer);
          this.quoteTimer = null;
        }
      } else {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        this.quoteTimeRemaining.set(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      }
    };
    update();
    this.quoteTimer = setInterval(update, 1000);
  }

  protected format(cents: number, currency: string): string {
    return formatMoney(cents, currency, this.i18n.angularLocale());
  }

  protected async payNow(orderId: string): Promise<void> {
    this.openingPayment.set(true);
    this.error.set('');
    try {
      await this.orders.createPaymentBill(orderId);
      await this.router.navigateByUrl(this.i18n.localePath(`orders/${orderId}/payment`));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.openingPayment.set(false);
    }
  }

  protected canPlaceOrder(): boolean {
    const cart = this.cartSnapshot();
    return !this.checkoutSettled() && Boolean(cart && cart.item_count > 0);
  }

  protected itemCountLabel(cart: Cart): string {
    return `${cart.item_count} ${this.i18n.t('common.items')}`;
  }

  protected skuLabel(item: CartItem): string {
    const name = item.sku_name?.trim();
    const code = item.sku_code?.trim();
    if (name && code) return `${name} / ${code}`;
    return name || code || '';
  }

  protected itemSubtotal(item: CartItem): number {
    return item.subtotal_cents || item.qty * item.unit_price_cents;
  }

  protected invoiceTotalCents(cart: Cart): number {
    return this.preview()?.total_cents ?? cart.total_cents;
  }

  protected invoiceCurrency(cart: Cart): string {
    return this.preview()?.currency ?? cart.currency;
  }

  protected trackItem(_index: number, item: CartItem): string {
    return item.item_id;
  }

  private resetCartAfterCheckout(): void {
    if (this.checkoutSettled()) return;
    this.checkoutSettled.set(true);
    this.cart.resetLocal();
  }
}
