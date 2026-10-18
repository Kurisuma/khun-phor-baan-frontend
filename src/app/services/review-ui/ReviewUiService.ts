import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { Comment, PageInfo, PagedResponse, Review } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class ReviewUiService {
  public readonly version = '1.1.0';
  private readonly api = inject(ApiClient);

  async reviews(product_id: string, cursor?: string): Promise<PagedResponse<Review>> {
    const response = this.envelopeData(await this.api.get<unknown>(`/products/${encodeURIComponent(product_id)}/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`));
    return this.toPage<Review>(response, 'reviews');
  }

  async createReview(product_id: string, body: { rating: number; title: string; body: string }): Promise<Review> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/products/${encodeURIComponent(product_id)}/reviews`, body)));
    return (response['review'] ?? response) as Review;
  }

  async comments(product_id: string, cursor?: string): Promise<PagedResponse<Comment>> {
    const response = this.envelopeData(await this.api.get<unknown>(`/products/${encodeURIComponent(product_id)}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`));
    return this.toPage<Comment>(response, 'comments');
  }

  async createComment(product_id: string, body: { body: string; parent_comment_id?: string }): Promise<Comment> {
    const response = this.record(this.envelopeData(await this.api.post<unknown>(`/products/${encodeURIComponent(product_id)}/comments`, body)));
    return (response['comment'] ?? response) as Comment;
  }

  deleteReview(review_id: string): Promise<void> {
    return this.api.delete(`/reviews/${encodeURIComponent(review_id)}`);
  }

  private toPage<T>(value: unknown, key: string): PagedResponse<T> {
    const response = this.record(value);
    const items = Array.isArray(value)
      ? value
      : Array.isArray(response['data'])
        ? response['data']
        : Array.isArray(response[key])
          ? response[key] as unknown[]
          : [];
    return {
      data: items as T[],
      page: this.toPageInfo(response, items.length),
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
}
