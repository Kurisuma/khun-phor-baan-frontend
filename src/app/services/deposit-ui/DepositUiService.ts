import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { BankAccount, DepositStatus } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class DepositUiService {
  public readonly version = '1.3.0';
  private readonly api = inject(ApiClient);

  async status(deposit_id: string): Promise<DepositStatus> {
    return this.toDepositStatus(this.envelopeData(await this.api.get<unknown>(`/deposits/${encodeURIComponent(deposit_id)}`)));
  }

  manualClaim(deposit_id: string, body: { transferred_at: string; last4_account?: string; screenshot_media_id?: string }): Promise<void> {
    return this.api.post(`/deposits/${encodeURIComponent(deposit_id)}/manual-claim`, {
      transferred_at: body.transferred_at,
      last4_account: body.last4_account,
      screenshot_media_id: body.screenshot_media_id ? this.numericId(body.screenshot_media_id) : undefined,
    });
  }

  async activeAccount(): Promise<BankAccount> {
    const account = this.record(this.envelopeData(await this.api.get<unknown>('/deposits/account')));
    return {
      bank_name: String(account['bank_name'] ?? account['provider'] ?? 'Bank transfer'),
      account_number: String(account['account_number'] ?? account['account_reference'] ?? ''),
      account_name: String(account['account_name'] ?? account['provider'] ?? 'KhunPhorBaan'),
      bank_code: typeof account['bank_code'] === 'string' ? account['bank_code'] : undefined,
    };
  }

  private toDepositStatus(value: unknown): DepositStatus {
    const response = this.record(value);
    const deposit = this.record(response['deposit'] ?? response);
    const total = Number(deposit['total_amount_cents'] ?? deposit['unique_amount_cents'] ?? deposit['amount_cents'] ?? deposit['total_cents'] ?? 0);
    const scrap = Number(deposit['scrap_cents'] ?? 0);
    const bankAccount = this.record(deposit['bank_account'] ?? response['bank_account']);
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
