import { inject, Injectable, signal } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { ApiProblem, Cart, CartItem } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class CartUiService {
  public readonly version = '1.4.0';
  private readonly api = inject(ApiClient);
  public readonly cart = signal<Cart | null>(null);

  async load(): Promise<Cart> {
    const normalized = this.normalizeCart(await this.api.get<unknown>('/cart'));
    this.cart.set(normalized);
    return normalized;
  }

  async addItem(product_id: string, qty: number, skuId?: string): Promise<Cart> {
    return this.mutateCart(() => this.api.post('/cart/items', {
      product_id: this.numericId(product_id),
      qty,
      ...(skuId ? { sku_id: this.numericId(skuId) } : {}),
    }));
  }

  async updateItem(item_id: string, qty: number): Promise<Cart> {
    return this.mutateCart(() => this.api.patch(`/cart/items/${encodeURIComponent(item_id)}`, { qty }));
  }

  async removeItem(item_id: string): Promise<Cart> {
    return this.mutateCart(() => this.api.delete(`/cart/items/${encodeURIComponent(item_id)}`));
  }

  async merge(): Promise<Cart> {
    return this.updateCart(await this.api.post('/cart/merge'));
  }

  async clear(): Promise<void> {
    try {
      await this.api.delete<void>('/cart');
    } catch (error) {
      if (!this.isCsrfProblem(error)) throw error;
      await this.load();
      await this.api.delete<void>('/cart');
    }
    this.cart.set(null);
  }

  resetLocal(): void {
    const previous = this.cart();
    this.cart.set({
      cart_id: previous?.cart_id ?? '',
      items: [],
      total_cents: 0,
      currency: previous?.currency ?? 'THB',
      item_count: 0,
      updated_at: new Date().toISOString(),
    });
  }

  private updateCart(response: unknown): Cart {
    const cart = this.normalizeCart(response);
    this.cart.set(cart);
    return cart;
  }

  private async mutateCart(request: () => Promise<unknown>): Promise<Cart> {
    if (!this.cart()) await this.load().catch(() => undefined);
    try {
      return this.updateCart(await request());
    } catch (error) {
      if (!this.isCsrfProblem(error)) throw error;
      await this.load();
      return this.updateCart(await request());
    }
  }

  private normalizeCart(value: unknown): Cart {
    const payload = this.record(this.envelopeData(value));
    const previous = this.cart();
    if ('cart_item' in payload && !('cart' in payload)) {
      const item = this.normalizeItem(payload['cart_item']);
      const cartId = String(payload['cart_id'] ?? previous?.cart_id ?? '');
      const previousItems = previous?.cart_id === cartId ? previous.items : [];
      const items = [
        ...previousItems.filter((candidate) => candidate.item_id !== item.item_id),
        item,
      ].filter((candidate) => candidate.qty > 0);
      return {
        cart_id: cartId,
        items,
        total_cents: previous?.cart_id === cartId ? previous.total_cents : 0,
        currency: previous?.currency ?? item.currency,
        item_count: items.reduce((total, candidate) => total + candidate.qty, 0),
        updated_at: previous?.updated_at,
      };
    }

    const cart = this.record(payload['cart'] ?? payload);
    const cartId = String(cart['cart_id'] ?? cart['id'] ?? '');
    const hasExplicitItems = 'items' in cart || 'lines' in cart;
    const rawItems = this.arrayValue(cart['items'] ?? cart['lines']);
    const items = hasExplicitItems
      ? rawItems.map((item) => this.normalizeItem(item))
      : previous?.cart_id === cartId
        ? previous.items
        : [];
    const itemCount = Number(cart['item_count'] ?? items.reduce((total, item) => total + item.qty, 0));
    return {
      ...(cart as Partial<Cart>),
      cart_id: cartId,
      items,
      total_cents: Number(cart['total_cents'] ?? 0),
      currency: String(cart['currency'] ?? 'THB'),
      item_count: Number.isFinite(itemCount) ? itemCount : items.length,
      updated_at: typeof cart['updated_at'] === 'string' ? cart['updated_at'] : undefined,
    };
  }

  private normalizeItem(value: unknown): CartItem {
    const item = this.record(value);
    const product = this.record(item['product']);
    return {
      ...(item as Partial<CartItem>),
      item_id: String(item['item_id'] ?? item['id'] ?? item['line_id'] ?? ''),
      product_id: String(item['product_id'] ?? product['product_id'] ?? product['id'] ?? ''),
      product_name: String(item['product_name'] ?? product['name'] ?? item['name'] ?? 'Product'),
      product_slug: typeof item['product_slug'] === 'string' ? item['product_slug'] : typeof product['slug'] === 'string' ? product['slug'] : undefined,
      product_image_url: typeof item['product_image_url'] === 'string' ? item['product_image_url'] : undefined,
      sku: item['sku'] === undefined || item['sku'] === null ? undefined : String(item['sku']),
      sku_id: item['sku_id'] === undefined || item['sku_id'] === null ? undefined : String(item['sku_id']),
      sku_code: typeof item['sku_code'] === 'string' ? item['sku_code'] : undefined,
      sku_name: typeof item['sku_name'] === 'string' ? item['sku_name'] : undefined,
      fulfillment_type: this.fulfillmentType(item['fulfillment_type']),
      qty: Number(item['qty'] ?? item['quantity'] ?? 0),
      unit_price_cents: Number(item['unit_price_cents'] ?? item['price_cents'] ?? 0),
      subtotal_cents: Number(item['subtotal_cents'] ?? item['total_cents'] ?? 0),
      currency: String(item['currency'] ?? 'THB'),
    };
  }

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private isCsrfProblem(error: unknown): error is ApiProblem {
    const problem = this.record(error);
    return Number(problem['status']) === 403 && problem['code'] === 'csrf_failed';
  }

  private arrayValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private numericId(value: string): number | string {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : value;
  }

  private fulfillmentType(value: unknown): CartItem['fulfillment_type'] {
    return value === 'PHYSICAL' || value === 'DIGITAL' || value === 'SHARED' ? value : undefined;
  }
}
