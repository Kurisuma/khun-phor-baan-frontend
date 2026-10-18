import { NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Cart, CartItem } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney, formatDualMoney, formatDualMoneyString, type DualMoneyResult } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-cart-page',
  imports: [NgFor, NgIf, RouterLink],
  template: `
    <section class="page-heading"><p class="eyebrow">{{ i18n.t('cart.title') }}</p><h1>{{ i18n.t('nav.cart') }}</h1></section>
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <section class="panel" *ngIf="cart() as c">
      <div class="list">
        <div class="list-row cart-row" *ngFor="let item of c.items">
          <div class="cart-item-media">
            <img *ngIf="item.product_image_url" [src]="item.product_image_url" [alt]="item.product_name">
          </div>
          <div class="cart-item-copy">
            <strong>{{ item.product_name }}</strong>
            <span class="cart-sku" *ngIf="skuLabel(item)">{{ skuLabel(item) }}</span>
            <span>{{ item.qty }} x {{ formatDualString(item.unit_price_cents) }}</span>
          </div>
          <div class="inline-actions">
            <button class="icon-btn" type="button" (click)="qty(item.item_id, item.qty - 1)">-</button>
            <button class="icon-btn" type="button" (click)="qty(item.item_id, item.qty + 1)">+</button>
            <button class="btn btn-danger" type="button" (click)="remove(item.item_id)">{{ i18n.t('common.remove') }}</button>
          </div>
        </div>
      </div>
      <div class="total-row" style="align-items: flex-start; justify-content: space-between;">
        <div>
          <strong>{{ i18n.t('common.total') }}</strong>
          <div *ngIf="formatDual(c.total_cents).isDual" class="dual-currency-notice">
            <small>⚠️ {{ i18n.locale() === 'th' ? 'ยอดชำระจริงเป็นเงินบาท (THB) เสมอ • สกุลเงินต่างประเทศเป็นราคาอ้างอิง' : 'All orders are charged and settled in THB. Foreign currency is an approximate reference.' }}</small>
          </div>
        </div>
        <div style="text-align: right">
          <strong style="font-size: 1.25rem">{{ formatDual(c.total_cents).baseFormatted }}</strong>
          <div *ngIf="formatDual(c.total_cents).isDual" style="margin-top: 0.25rem">
            <span class="dual-currency-badge">~ {{ formatDual(c.total_cents).displayFormatted }}</span>
          </div>
        </div>
      </div>
      <div class="inline-actions" style="margin-top: 1rem">
        <button class="btn btn-secondary" type="button" (click)="clear()">{{ i18n.t('common.clear') }}</button>
        <a class="btn btn-primary" [routerLink]="i18n.localePath('checkout')">{{ i18n.t('common.checkout') }}</a>
      </div>
    </section>
  `,
})
export class CartPageComponent implements OnInit {
  public readonly version = '1.1.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly cartService = inject(CartUiService);
  private readonly seo = inject(SeoService);
  protected readonly cart = signal<Cart | null>(null);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('cart.title'), description: this.i18n.t('cart.description'), path: `/${this.i18n.currentLocale()}/cart`, noindex: true });
    await this.load();
  }

  protected async qty(itemId: string, qty: number): Promise<void> {
    this.cart.set(await this.cartService.updateItem(itemId, Math.max(0, qty)));
  }

  protected async remove(itemId: string): Promise<void> {
    this.cart.set(await this.cartService.removeItem(itemId));
  }

  protected async clear(): Promise<void> {
    await this.cartService.clear();
    await this.load();
  }

  protected format(cents: number, currency: string): string {
    return formatMoney(cents, currency, this.i18n.angularLocale());
  }

  protected formatDual(cents: number): DualMoneyResult {
    return formatDualMoney(cents);
  }

  protected formatDualString(cents: number): string {
    return formatDualMoneyString(cents);
  }

  protected skuLabel(item: CartItem): string {
    const name = item.sku_name?.trim();
    const code = item.sku_code?.trim();
    if (name && code) return `${name} / ${code}`;
    return name || code || '';
  }

  private async load(): Promise<void> {
    try {
      this.cart.set(await this.cartService.load());
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }
}
