import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { PageInfo, PagedResponse, SubscriptionSlot, VaultCredentials } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class SubscriptionUiService {
  public readonly version = '1.1.0';
  private readonly api = inject(ApiClient);

  async list(cursor?: string, limit = 20): Promise<PagedResponse<SubscriptionSlot>> {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    return this.toSlotPage(this.envelopeData(await this.api.get<unknown>(`/subscriptions?${params.toString()}`)));
  }

  async detail(slot_id: string): Promise<SubscriptionSlot> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/subscriptions/${encodeURIComponent(slot_id)}`)));
    return this.toSlot(response['slot'] ?? response);
  }

  async reveal(slot_id: string, step_up_token: string, reason: string): Promise<VaultCredentials> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/subscriptions/${encodeURIComponent(slot_id)}/reveal`, { reason }, { stepUpToken: step_up_token })));
    return {
      credentials: this.stringRecord(response['credentials']),
      revealed_at: String(response['revealed_at'] ?? ''),
    };
  }

  async renewNow(slot_id: string): Promise<{ deposit_id: string; order_id?: string }> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/subscriptions/${encodeURIComponent(slot_id)}/renew-now`)));
    return {
      deposit_id: String(response['deposit_id'] ?? ''),
      order_id: response['order_id'] === undefined || response['order_id'] === null ? undefined : String(response['order_id']),
    };
  }

  private toSlotPage(value: unknown): PagedResponse<SubscriptionSlot> {
    const response = this.record(value);
    const items = Array.isArray(value)
      ? value
      : Array.isArray(response['data'])
        ? response['data']
        : Array.isArray(response['slots'])
          ? response['slots']
          : [];
    return {
      data: items.map((slot) => this.toSlot(slot)),
      page: this.toPageInfo(response, items.length),
    };
  }

  private toSlot(value: unknown): SubscriptionSlot {
    const slot = this.record(value);
    const id = String(slot['slot_id'] ?? slot['id'] ?? '');
    return {
      ...(slot as Partial<SubscriptionSlot>),
      slot_id: id,
      product_id: String(slot['product_id'] ?? ''),
      product_name: String(slot['product_name'] ?? slot['name'] ?? 'Subscription'),
      product_slug: typeof slot['product_slug'] === 'string' ? slot['product_slug'] : undefined,
      status: slot['status'] === 'SUSPENDED' || slot['status'] === 'EXPIRED' ? slot['status'] : 'ACTIVE',
      days_remaining: Number(slot['days_remaining'] ?? 0),
      expires_at: String(slot['expires_at'] ?? ''),
      vault_reveal_available: Boolean(slot['vault_reveal_available']),
      created_at: String(slot['created_at'] ?? ''),
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

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }

  private stringRecord(value: unknown): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.record(value)).map(([key, item]) => [key, String(item ?? '')]),
    );
  }
}
