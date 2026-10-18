import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { PaymentBill, PaymentInstructions, PaymentMethodOption, PaymentProviderCode } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class PaymentUiService {
  public readonly version = '1.1.0';
  private readonly api = inject(ApiClient);

  async listPaymentMethods(country?: string, currency?: string, amount_cents?: number): Promise<PaymentMethodOption[]> {
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (currency) params.set('currency', currency);
    if (amount_cents) params.set('amount_cents', String(amount_cents));
    const url = `/checkout/payment-methods${params.toString() ? '?' + params.toString() : ''}`;
    const raw = await this.api.get<unknown>(url);
    const data = this.envelopeData(raw);
    return Array.isArray(data) ? (data as PaymentMethodOption[]) : [];
  }

  async createAttempt(bill_id: string, provider: PaymentProviderCode, options: { bank_code?: string; country?: string } = {}): Promise<PaymentBill> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/payment-bills/${encodeURIComponent(bill_id)}/attempts`, { provider, ...options })));
    return this.toPaymentBill(response['bill'] ?? response);
  }

  private toPaymentBill(value: unknown): PaymentBill {
    const bill = this.record(value);
    const orderId = String(bill['order_id'] ?? bill['orderId'] ?? '');
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
      order_id: orderId,
      status: this.paymentBillStatus(bill['status']),
      amount_cents: amountCents,
      unique_amount_cents: uniqueAmountCents,
      scrap_cents: scrapCents,
      currency: String(bill['currency'] ?? 'THB'),
      expires_at: expiresAt,
      instructions: this.paymentInstructions(bill['instructions'], provider, amountCents, uniqueAmountCents, scrapCents, expiresAt, this.optionalString(bill['provider_ref'] ?? bill['providerRef'])),
    };
  }

  private paymentProvider(value: unknown): PaymentProviderCode | null {
    const text = String(value ?? '');
    if (
      text === 'SCRAP_BANK_TH' ||
      text === 'SCRAP_BANK_TRANSFER' ||
      text === 'CRYPTO' ||
      text === 'SHOPEEPAY_MY' ||
      text === 'OMAKASEPAY_IN' ||
      text === 'PROMPTPAY' ||
      text === 'PAYPAL' ||
      text === 'TRUEMONEY_WALLET'
    ) return text as PaymentProviderCode;
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

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private optionalString(value: unknown): string | undefined {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }
}
