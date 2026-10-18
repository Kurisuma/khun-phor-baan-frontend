import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { DigitalDeliveryGrant, DigitalDeliveryItem, Order, OrderLine, PageInfo, PagedResponse, PaymentBill, PaymentInstructions, PaymentProviderCode } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class OrderUiService {
  public readonly version = '2.1.1';
  private readonly api = inject(ApiClient);

  async list(cursor?: string, limit = 20): Promise<PagedResponse<Order>> {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    return this.toOrderPage(this.envelopeData(await this.api.get<unknown>(`/orders?${params.toString()}`)));
  }

  async detail(order_id: string): Promise<Order> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/orders/${encodeURIComponent(order_id)}`)));
    return this.toOrder(response['order'] ?? response);
  }

  cancel(order_id: string): Promise<void> {
    return this.api.post(`/orders/${encodeURIComponent(order_id)}/cancel`);
  }

  async createPaymentBill(order_id: string): Promise<PaymentBill> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/orders/${encodeURIComponent(order_id)}/payment-bills`, {})));
    return this.toPaymentBill(response['bill'] ?? response, order_id);
  }

  async currentPaymentBill(order_id: string): Promise<PaymentBill | null> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/orders/${encodeURIComponent(order_id)}/payment-bills/current`)));
    const bill = response['bill'];
    return bill ? this.toPaymentBill(bill, order_id) : null;
  }

  async download(order_id: string, line_id: string): Promise<DigitalDeliveryGrant> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/orders/${encodeURIComponent(order_id)}/download/${encodeURIComponent(line_id)}`)));
    return {
      line_id: String(response['line_id'] ?? line_id),
      delivery_type: this.deliveryType(response['delivery_type']),
      delivery_value: String(response['delivery_value'] ?? response['url'] ?? response['download_url'] ?? response['code'] ?? ''),
      url: this.optionalString(response['url']),
      download_url: this.optionalString(response['download_url']),
      code: this.optionalString(response['code']),
      expires_at: String(response['expires_at'] ?? ''),
      items: this.parseArray(response['items']).map((item) => this.toDigitalDeliveryItem(item)),
    };
  }

  private toOrderPage(value: unknown): PagedResponse<Order> {
    const response = this.record(value);
    const items = Array.isArray(value)
      ? value
      : Array.isArray(response['data'])
        ? response['data']
        : Array.isArray(response['orders'])
          ? response['orders']
          : [];
    return {
      data: items.map((order) => this.toOrder(order)),
      page: this.toPageInfo(response, items.length),
    };
  }

  private toOrder(value: unknown): Order {
    const order = this.record(value);
    const id = String(order['order_id'] ?? order['id'] ?? '');
    const lines = this.parseArray(order['lines']);
    // SA3-F017: explicit field mapping only — no spread of unvalidated backend fields
    return {
      order_id: id,
      code: this.optionalString(order['code']),
      status: this.orderStatus(order['status']),
      lines: lines.map((line) => this.toLine(line)),
      subtotal_cents: Number(order['subtotal_cents'] ?? 0),
      tax_cents: Number(order['tax_cents'] ?? 0),
      total_cents: Number(order['total_cents'] ?? order['total_amount_cents'] ?? 0),
      currency: String(order['currency'] ?? 'THB'),
      deposit_id: order['deposit_id'] === undefined || order['deposit_id'] === null ? undefined : String(order['deposit_id']),
      deposit_status: order['deposit_status'] as Order['deposit_status'],
      deposit_total_amount_cents: Number(order['deposit_total_amount_cents'] ?? 0),
      deposit_scrap_cents: Number(order['deposit_scrap_cents'] ?? 0),
      deposit_expires_at: this.optionalString(order['deposit_expires_at']),
      created_at: String(order['created_at'] ?? ''),
      updated_at: typeof order['updated_at'] === 'string' ? order['updated_at'] : undefined,
      fulfilled_at: typeof order['fulfilled_at'] === 'string' ? order['fulfilled_at'] : undefined,
    };
  }

  private toLine(value: unknown): OrderLine {
    const line = this.record(value);
    // SA3-F017: explicit field mapping only — no spread of unvalidated backend fields
    return {
      line_id: String(line['line_id'] ?? line['id'] ?? ''),
      product_id: String(line['product_id'] ?? ''),
      product_slug: this.optionalString(line['product_slug']),
      product_name: String(line['product_name'] ?? line['name'] ?? 'Product'),
      sku_id: this.optionalString(line['sku_id']),
      sku_code: this.optionalString(line['sku_code']),
      sku_name: this.optionalString(line['sku_name']),
      fulfillment_type: this.fulfillmentType(line['fulfillment_type']),
      qty: Number(line['qty'] ?? line['quantity'] ?? 0),
      unit_price_cents: Number(line['unit_price_cents'] ?? line['price_cents'] ?? 0),
      subtotal_cents: Number(line['subtotal_cents'] ?? line['total_cents'] ?? 0),
      currency: String(line['currency'] ?? 'THB'),
      kind: line['kind'] === 'PHYSICAL' || line['kind'] === 'SUBSCRIPTION' ? line['kind'] : 'DIGITAL',
      product_kind: line['product_kind'] === 'SHARED' ? 'SHARED' : line['product_kind'] === 'PRIVATE' ? 'PRIVATE' : undefined,
      subkind: this.optionalString(line['subkind']),
      delivery_status: this.deliveryStatus(line['delivery_status']),
      delivered_count: Number(line['delivered_count'] ?? 0),
    };
  }

  private toDigitalDeliveryItem(value: unknown): DigitalDeliveryItem {
    const item = this.record(value);
    return {
      entitlement_id: String(item['entitlement_id'] ?? ''),
      unit_index: Number(item['unit_index'] ?? 0),
      delivery_type: this.deliveryType(item['delivery_type']),
      value: String(item['value'] ?? ''),
      instructions_th: this.optionalString(item['instructions_th']),
      instructions_en: this.optionalString(item['instructions_en']),
      delivered_at: this.optionalString(item['delivered_at']),
    };
  }

  private toPaymentBill(value: unknown, orderId: string): PaymentBill {
    const bill = this.record(value);
    const provider = this.paymentProvider(bill['provider']);
    const amountCents = Number(bill['amount_cents'] ?? bill['amountCents'] ?? 0);
    const uniqueAmountCents = Number(bill['unique_amount_cents'] ?? bill['uniqueAmountCents'] ?? 0);
    const scrapCents = Number(bill['scrap_cents'] ?? bill['scrapCents'] ?? 0);
    const expiresAt = String(bill['expires_at'] ?? bill['expiresAt'] ?? '');
    return {
      provider,
      bill_id: String(bill['bill_id'] ?? bill['billId'] ?? ''),
      provider_ref: this.optionalString(bill['provider_ref'] ?? bill['providerRef']) ?? null,
      deposit_id: this.optionalString(bill['deposit_id'] ?? bill['depositId']) ?? null,
      order_id: String(bill['order_id'] ?? bill['orderId'] ?? orderId),
      status: this.paymentBillStatus(bill['status']),
      amount_cents: amountCents,
      unique_amount_cents: uniqueAmountCents,
      scrap_cents: scrapCents,
      currency: String(bill['currency'] ?? 'THB'),
      expires_at: expiresAt,
      created_at: this.optionalString(bill['created_at'] ?? bill['createdAt']),
      updated_at: this.optionalString(bill['updated_at'] ?? bill['updatedAt']),
      instructions: this.paymentInstructions(bill['instructions'], provider, amountCents, uniqueAmountCents, scrapCents, expiresAt, this.optionalString(bill['provider_ref'] ?? bill['providerRef'])),
    };
  }

  private toPageInfo(response: Record<string, unknown>, count: number): PageInfo {
    const page = this.record(response['page']);
    const limit = Number(page['limit'] ?? response['limit'] ?? count);
    const nextCursor = page['next_cursor'] ?? response['next_cursor'] ?? response['cursor'] ?? null;
    return {
      next_cursor: nextCursor === null || nextCursor === undefined ? null : String(nextCursor),
      has_more: Boolean(page['has_more'] ?? response['has_more'] ?? nextCursor),
      limit: Number.isFinite(limit) && limit > 0 ? limit : count,
    };
  }

  private orderStatus(value: unknown): Order['status'] {
    const text = String(value ?? 'PENDING_PAYMENT');
    return ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'REFUNDED'].includes(text)
      ? text as Order['status']
      : 'PENDING_PAYMENT';
  }

  private paymentProvider(value: unknown): PaymentProviderCode | null {
    const text = String(value ?? '');
    if (text === 'SCRAP_BANK_TRANSFER' || text === 'PROMPTPAY' || text === 'PAYPAL' || text === 'TRUEMONEY_WALLET') return text;
    return null;
  }

  private paymentBillStatus(value: unknown): PaymentBill['status'] {
    const text = String(value ?? 'METHOD_REQUIRED');
    return ['METHOD_REQUIRED', 'OPEN', 'SUCCEEDED', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(text) ? text as PaymentBill['status'] : 'METHOD_REQUIRED';
  }

  private paymentInstructions(
    value: unknown,
    provider: PaymentProviderCode | null,
    amountCents: number,
    uniqueAmountCents: number,
    scrapCents: number,
    expiresAt: string,
    providerRef?: string,
  ): PaymentInstructions | undefined {
    const instructions = this.record(value);
    if (!provider || !Object.keys(instructions).length) return undefined;
    const bankName = String(instructions['bank_name'] ?? instructions['provider'] ?? 'Bank transfer');
    const accountNumber = String(instructions['account_number'] ?? instructions['account_reference'] ?? '');
    const accountName = String(instructions['account_name'] ?? instructions['provider'] ?? 'KhunPhorBaan');
    if (provider === 'PROMPTPAY') {
      return {
        kind: 'promptpay',
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        promptpay_type: this.promptPayType(instructions['promptpay_type']),
        amount_cents: uniqueAmountCents || amountCents,
        ref: String(instructions['ref'] ?? providerRef ?? ''),
      };
    }
    if (provider === 'SCRAP_BANK_TRANSFER') {
      return {
        kind: 'scrap',
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        bank_code: this.optionalString(instructions['bank_code']),
        unique_amount_cents: uniqueAmountCents,
        scrap_cents: scrapCents,
        expiry_iso: expiresAt,
      };
    }
    return undefined;
  }

  private promptPayType(value: unknown): 'PHONE' | 'CITIZEN_ID' | 'TAX_ID' | undefined {
    const text = String(value ?? '');
    return text === 'PHONE' || text === 'CITIZEN_ID' || text === 'TAX_ID' ? text : undefined;
  }

  private deliveryStatus(value: unknown): OrderLine['delivery_status'] {
    const text = String(value ?? '');
    return ['DELIVERED', 'PENDING_DELIVERY', 'NOT_READY'].includes(text) ? text as OrderLine['delivery_status'] : undefined;
  }

  private deliveryType(value: unknown): DigitalDeliveryItem['delivery_type'] {
    const text = String(value ?? 'CODE');
    return text === 'ACTIVATION_LINK' || text === 'CDKEY' || text === 'CODE' ? text : 'CODE';
  }

  private fulfillmentType(value: unknown): OrderLine['fulfillment_type'] {
    const text = String(value ?? '');
    return text === 'PHYSICAL' || text === 'DIGITAL' || text === 'SHARED' ? text as OrderLine['fulfillment_type'] : undefined;
  }

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private parseArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private optionalString(value: unknown): string | undefined {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
}
