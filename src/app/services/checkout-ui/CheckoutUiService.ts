import { inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { CheckoutPreview, DepositStatus, OrderCreated, ShippingAddress } from '../../contracts/api-contract';

export interface SseEvent {
  type: 'deposit.matched' | 'order.deposit_matched' | 'deposit.expired' | 'order.deposit_expired' | 'order.fulfilled' | 'error' | 'connection.failed';
  data?: unknown;
}

@Injectable({ providedIn: 'root' })
export class CheckoutUiService {
  public readonly version = '2.2.1';
  private static readonly MAX_RECONNECT = 10;
  private readonly api = inject(ApiClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);

  async preview(cart_id: string, locale: string, shipping_address?: ShippingAddress, display_currency?: string, fx_quote_token?: string): Promise<CheckoutPreview> {
    return this.toPreview(this.envelopeData(await this.api.post<unknown>('/checkout/preview', {
      cart_id: this.numericId(cart_id),
      locale,
      ...(shipping_address ? { shipping_address } : {}),
      ...(display_currency ? { display_currency } : {}),
      ...(fx_quote_token ? { fx_quote_token } : {}),
    })));
  }

  async createOrder(cart_id: string, shipping_address?: ShippingAddress, display_currency?: string, fx_quote_token?: string): Promise<OrderCreated> {
    return this.toOrderCreated(this.envelopeData(await this.api.post<unknown>('/checkout/orders', {
      cart_id: this.numericId(cart_id),
      ...(shipping_address ? { shipping_address } : {}),
      ...(display_currency ? { display_currency } : {}),
      ...(fx_quote_token ? { fx_quote_token } : {}),
    })));
  }

  async deposit(order_id: string): Promise<DepositStatus> {
    return this.toDepositStatus(this.envelopeData(await this.api.get<unknown>(`/checkout/orders/${encodeURIComponent(order_id)}/deposit`)));
  }

  connectOrderEvents(order_id: string, onEvent: (event: SseEvent) => void): () => void {
    if (!isPlatformBrowser(this.platformId)) return () => undefined;

    let closed = false;
    let source: EventSource | null = null;
    let reconnect = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (closed) return;
      source = new EventSource(`/api/v1/checkout/orders/${encodeURIComponent(order_id)}/events`, { withCredentials: true });
      const forward = (type: SseEvent['type']) => (message: MessageEvent) => {
        reconnect = 0;
        this.zone.run(() => onEvent({ type, data: this.parseEvent(message.data) }));
      };
      source.addEventListener('deposit.matched', forward('deposit.matched'));
      source.addEventListener('order.deposit_matched', forward('order.deposit_matched'));
      source.addEventListener('deposit.expired', forward('deposit.expired'));
      source.addEventListener('order.deposit_expired', forward('order.deposit_expired'));
      source.addEventListener('order.fulfilled', forward('order.fulfilled'));
      source.onerror = () => {
        source?.close();
        source = null;
        this.zone.run(() => onEvent({ type: 'error' }));
        reconnect += 1;
        console.warn('[checkout-ui] order SSE reconnect failed', {
          component: 'checkout-ui',
          method: 'connectOrderEvents',
          order_id,
          reconnect,
        });
        if (reconnect > CheckoutUiService.MAX_RECONNECT) {
          closed = true;
          this.zone.run(() => onEvent({
            type: 'connection.failed',
            data: { message: 'Unable to connect to order updates. Please refresh the page.' },
          }));
          return;
        }
        const baseDelay = Math.min(30000, 1000 * 2 ** reconnect);
        const jitter = 0.5 + Math.random() * 0.5;
        const delay = Math.floor(baseDelay * jitter);
        timer = setTimeout(connect, delay);
      };
    };

    const visibility = () => {
      if (globalThis.document.visibilityState === 'visible' && !source && !closed) connect();
    };
    globalThis.document.addEventListener('visibilitychange', visibility);
    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      globalThis.document.removeEventListener('visibilitychange', visibility);
    };
  }

  private parseEvent(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private toPreview(value: unknown): CheckoutPreview {
    const preview = this.record(value);
    const total = Number(preview['total_cents'] ?? preview['total_amount_cents'] ?? 0);
    return {
      cart_id: String(preview['cart_id'] ?? ''),
      items: Array.isArray(preview['items']) ? preview['items'] as CheckoutPreview['items'] : [],
      subtotal_cents: Number(preview['subtotal_cents'] ?? total),
      tax_cents: Number(preview['tax_cents'] ?? 0),
      total_cents: total,
      currency: String(preview['currency'] ?? 'THB'),
      display_currency: preview['display_currency'] ? String(preview['display_currency']) : undefined,
      display_subtotal: preview['display_subtotal'] !== undefined ? Number(preview['display_subtotal']) : undefined,
      display_total: preview['display_total'] !== undefined ? Number(preview['display_total']) : undefined,
      locked_fx_rate: preview['locked_fx_rate'] !== undefined ? Number(preview['locked_fx_rate']) : undefined,
      fx_fee_percent: preview['fx_fee_percent'] !== undefined ? Number(preview['fx_fee_percent']) : undefined,
      fx_quote_token: preview['fx_quote_token'] ? String(preview['fx_quote_token']) : undefined,
      fx_quote_expires_at: preview['fx_quote_expires_at'] !== undefined ? Number(preview['fx_quote_expires_at']) : undefined,
    };
  }

  private toOrderCreated(value: unknown): OrderCreated {
    const order = this.record(value);
    const total = Number(order['total_amount_cents'] ?? order['total_cents'] ?? 0);
    return {
      order_id: String(order['order_id'] ?? order['id'] ?? ''),
      state: this.orderStatus(order['state'] ?? order['status']),
      total_amount_cents: total,
      currency: String(order['currency'] ?? 'THB'),
      display_currency: order['display_currency'] ? String(order['display_currency']) : undefined,
      display_total: order['display_total'] !== undefined ? Number(order['display_total']) : undefined,
      locked_fx_rate: order['locked_fx_rate'] !== undefined ? Number(order['locked_fx_rate']) : undefined,
      fx_fee_percent: order['fx_fee_percent'] !== undefined ? Number(order['fx_fee_percent']) : undefined,
    };
  }

  private orderStatus(value: unknown): OrderCreated['state'] {
    const text = String(value ?? 'PENDING_PAYMENT');
    return ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'REFUNDED'].includes(text)
      ? text as OrderCreated['state']
      : 'PENDING_PAYMENT';
  }

  private toDepositStatus(value: unknown): DepositStatus {
    const response = this.record(value);
    const deposit = this.record(response['deposit'] ?? response);
    const bankAccount = this.record(deposit['bank_account']);
    const total = Number(deposit['total_amount_cents'] ?? deposit['unique_amount_cents'] ?? deposit['amount_cents'] ?? deposit['total_cents'] ?? 0);
    const scrap = Number(deposit['scrap_cents'] ?? 0);
    return {
      deposit_id: String(deposit['deposit_id'] ?? deposit['id'] ?? ''),
      order_id: String(deposit['order_id'] ?? ''),
      status: this.depositStatus(deposit['status']),
      total_amount_cents: Number(deposit['base_amount_cents'] ?? Math.max(0, total - scrap)),
      unique_amount_cents: Number(deposit['unique_amount_cents'] ?? total),
      scrap_cents: scrap,
      bank_account: {
        bank_name: String(bankAccount['bank_name'] ?? bankAccount['provider'] ?? 'Bank transfer'),
        account_number: String(bankAccount['account_number'] ?? bankAccount['account_reference'] ?? ''),
        account_name: String(bankAccount['account_name'] ?? bankAccount['provider'] ?? 'KhunPhorBaan'),
        bank_code: typeof bankAccount['bank_code'] === 'string' ? bankAccount['bank_code'] : undefined,
      },
      expires_at: String(deposit['expires_at'] ?? ''),
      currency: String(deposit['currency'] ?? 'THB'),
      display_currency: deposit['display_currency'] ? String(deposit['display_currency']) : undefined,
      display_total: deposit['display_total'] !== undefined ? Number(deposit['display_total']) : undefined,
      locked_fx_rate: deposit['locked_fx_rate'] !== undefined ? Number(deposit['locked_fx_rate']) : undefined,
      fx_fee_percent: deposit['fx_fee_percent'] !== undefined ? Number(deposit['fx_fee_percent']) : undefined,
    };
  }

  private depositStatus(value: unknown): DepositStatus['status'] {
    const text = String(value ?? 'PENDING');
    return ['PENDING', 'MATCHED', 'EXPIRED', 'CANCELLED', 'MANUAL_REVIEW'].includes(text) ? text as DepositStatus['status'] : 'PENDING';
  }

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private numericId(value: string): number | string {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : value;
  }

}
