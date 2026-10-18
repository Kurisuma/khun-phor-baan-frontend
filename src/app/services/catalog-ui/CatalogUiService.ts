import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { CatalogFilters, Category, PageInfo, PagedResponse, Product, ProductSku } from '../../contracts/api-contract';
import { cacheFxRates, type FxRateItem } from '../../pages/presentation';

@Injectable({ providedIn: 'root' })
export class CatalogUiService {
  public readonly version = '1.4.2';
  private readonly api = inject(ApiClient);

  async categories(): Promise<Category[]> {
    const response = this.envelopeData(await this.api.get<unknown>('/catalog/categories'));
    const categories = Array.isArray(response)
      ? response
      : this.record(response)['categories'];
    return Array.isArray(categories) ? categories.map((category) => this.toCategory(category)) : [];
  }

  async category(slug: string): Promise<{ category: Category; children: Category[]; products: PagedResponse<Product> }> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/catalog/categories/${encodeURIComponent(slug)}`)));
    const children = response['children'];
    return {
      category: this.toCategory(response['category']),
      children: Array.isArray(children) ? children.map((category) => this.toCategory(category)) : [],
      products: this.toProductPage(response['products'] ?? response),
    };
  }

  async products(filters: CatalogFilters = {}): Promise<PagedResponse<Product>> {
    return this.toProductPage(this.envelopeData(await this.api.get<unknown>(`/catalog/products${this.query(filters)}`)));
  }

  async product(slug: string): Promise<Product> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>(`/catalog/products/${encodeURIComponent(slug)}`)));
    return this.toProduct(response['product'] ?? response);
  }

  async search(filters: CatalogFilters = {}): Promise<PagedResponse<Product>> {
    return this.toProductPage(this.envelopeData(await this.api.get<unknown>(`/catalog/search${this.query(filters)}`)));
  }

  async config(): Promise<{ baseCurrency: string; defaultLocale: string; siteName: string }> {
    const raw = this.envelopeData(await this.api.get<unknown>('/config'));
    const rec = this.record(raw);
    const appConfig = this.record(rec['appConfig'] ?? rec['app_config'] ?? rec);
    return {
      baseCurrency: String(appConfig['baseCurrency'] ?? appConfig['base_currency'] ?? 'THB'),
      defaultLocale: String(appConfig['defaultLocale'] ?? appConfig['default_locale'] ?? 'th'),
      siteName: String(appConfig['siteName'] ?? appConfig['site_name'] ?? 'Khun Phor Baan'),
    };
  }

  async getFxRates(): Promise<{ base_currency: string; fee_percent: number; rates: FxRateItem[] }> {
    try {
      const raw = this.envelopeData(await this.api.get<unknown>('/fx/rates'));
      const rec = this.record(raw);
      const ratesRaw = rec['rates'];
      const rates: FxRateItem[] = Array.isArray(ratesRaw) ? (ratesRaw as FxRateItem[]) : [];
      cacheFxRates(rates);
      return {
        base_currency: String(rec['base_currency'] ?? 'THB'),
        fee_percent: Number(rec['fee_percent'] ?? 2.0),
        rates,
      };
    } catch (_) {
      return {
        base_currency: 'THB',
        fee_percent: 2.0,
        rates: [],
      };
    }
  }

  private query(filters: CatalogFilters): string {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  private toProductPage(value: unknown): PagedResponse<Product> {
    let unwrapped = value;
    if (unwrapped && typeof unwrapped === 'object' && 'data' in unwrapped && !Array.isArray(unwrapped)) {
      const rec = unwrapped as Record<string, unknown>;
      if ('data' in rec && rec['data'] && typeof rec['data'] === 'object' && !Array.isArray(rec['data']) && ('data' in (rec['data'] as object) || 'products' in (rec['data'] as object))) {
        unwrapped = rec['data'];
      }
    }
    const response = this.record(unwrapped);
    const items = Array.isArray(unwrapped)
      ? unwrapped
      : Array.isArray(response['data'])
        ? response['data']
        : Array.isArray(response['products'])
          ? response['products']
          : [];
    return {
      data: items.map((product) => this.toProduct(product)),
      page: this.toPageInfo(response, items.length),
    };
  }

  private toProduct(value: unknown): Product {
    const product = this.record(value);
    const productId = String(product['product_id'] ?? product['id'] ?? product['slug'] ?? '');
    const skus = this.toSkus(product['skus']);
    const activeSku = skus.find((sku) => sku.status === 'ACTIVE') ?? skus[0];
    const categoryId = this.optionalText(product['category_id']);
    const categorySlug = this.optionalText(product['category_slug']);
    return {
      ...(product as Partial<Product>),
      product_id: productId,
      slug: String(product['slug'] ?? productId),
      name: String(product['name'] ?? product['name_th'] ?? product['name_en'] ?? 'Untitled product'),
      description: String(product['description'] ?? product['description_th'] ?? product['description_en'] ?? ''),
      price_cents: Number(activeSku?.price_cents ?? product['price_cents'] ?? 0),
      currency: String(activeSku?.currency ?? product['currency'] ?? 'THB'),
      kind: product['kind'] === 'SHARED' ? 'SHARED' : 'PRIVATE',
      skus,
      media: this.toMedia(product['media']),
      category: categoryId || categorySlug ? this.toCategory({
        id: categoryId ?? categorySlug,
        category_id: categoryId,
        slug: categorySlug ?? 'uncategorized',
        name: product['category_name'],
        name_th: product['category_name_th'],
        name_en: product['category_name_en'],
        description: product['category_description'],
        description_th: product['category_description_th'],
        description_en: product['category_description_en'],
        image_url: product['category_image_url'],
      }) : undefined,
      average_rating: this.optionalNumber(product['average_rating']),
      review_count: Number(product['review_count'] ?? 0),
    };
  }

  private toCategory(value: unknown): Category {
    const category = this.record(value);
    const id = String(category['id'] ?? category['category_id'] ?? category['slug'] ?? '');
    const children = category['children'];
    const imageMediaId = this.optionalText(category['image_media_id']);
    const mediaId = this.optionalText(category['media_id']);
    return {
      ...(category as Partial<Category>),
      id,
      slug: String(category['slug'] ?? id),
      name: String(category['name'] ?? category['name_th'] ?? category['name_en'] ?? 'Untitled category'),
      description: this.optionalText(category['description']) ?? this.optionalText(category['description_th']) ?? this.optionalText(category['description_en']) ?? '',
      description_th: this.optionalText(category['description_th']),
      description_en: this.optionalText(category['description_en']),
      image_url: this.normalizeMediaUrl(this.optionalText(category['image_url']) ?? this.optionalText(category['public_url'])) ?? this.mediaFileUrl(imageMediaId ?? mediaId),
      image_media_id: imageMediaId,
      media_id: mediaId,
      product_count: this.optionalNumber(category['product_count']),
      status: this.categoryStatus(category['status']),
      is_virtual: this.booleanFlag(category['is_virtual']),
      children: Array.isArray(children) ? children.map((child) => this.toCategory(child)) : [],
    };
  }

  private toMedia(value: unknown): Product['media'] {
    const media = typeof value === 'string' ? this.parseJson(value) : value;
    if (!Array.isArray(media)) return [];
    return media
      .map((item) => this.record(item))
      .map((item, index) => {
        const mediaId = String(item['media_id'] ?? item['id'] ?? '').trim();
        return {
          media_id: mediaId,
          url: this.normalizeMediaUrl(this.optionalText(item['url']) ?? this.optionalText(item['public_url'])) ?? this.mediaFileUrl(mediaId) ?? '',
          mime: String(item['mime'] ?? ''),
          purpose: String(item['purpose'] ?? item['kind'] ?? 'product_image'),
          sort_order: Number(item['sort_order'] ?? index),
        };
      })
      .filter((item) => item.url);
  }

  private toSkus(value: unknown): ProductSku[] {
    const skus = typeof value === 'string' ? this.parseJson(value) : value;
    if (!Array.isArray(skus)) return [];
    return skus
      .map((item) => this.record(item))
      .filter((item) => item['sku_id'] || item['id'])
      .map((item) => {
        const skuId = String(item['sku_id'] ?? item['id'] ?? '');
        const fulfillmentType = String(item['fulfillment_type'] ?? 'PHYSICAL').toUpperCase();
        const status = String(item['status'] ?? 'ACTIVE').toUpperCase();
        return {
          ...(item as Partial<ProductSku>),
          sku_id: skuId,
          id: skuId,
          sku_code: String(item['sku_code'] ?? item['code'] ?? skuId),
          sku_slug: this.optionalText(item['sku_slug']) ?? this.slugFromSkuCode(String(item['sku_code'] ?? item['code'] ?? skuId)),
          name: String(item['name'] ?? item['name_th'] ?? item['name_en'] ?? item['sku_code'] ?? skuId),
          summary: this.optionalText(item['summary']),
          summary_th: this.optionalText(item['summary_th']),
          summary_en: this.optionalText(item['summary_en']),
          description: this.optionalText(item['description']),
          description_th: this.optionalText(item['description_th']),
          description_en: this.optionalText(item['description_en']),
          usage: this.optionalText(item['usage']),
          usage_th: this.optionalText(item['usage_th']),
          usage_en: this.optionalText(item['usage_en']),
          warranty: this.optionalText(item['warranty']),
          warranty_th: this.optionalText(item['warranty_th']),
          warranty_en: this.optionalText(item['warranty_en']),
          price_cents: Number(item['price_cents'] ?? 0),
          currency: String(item['currency'] ?? 'THB'),
          fulfillment_type: fulfillmentType === 'SHARED' || fulfillmentType === 'DIGITAL' ? fulfillmentType : 'PHYSICAL',
          status: status === 'DRAFT' || status === 'ARCHIVED' ? status : 'ACTIVE',
          stock_available: this.optionalNumber(item['stock_available']),
          slots_available: this.optionalNumber(item['slots_available']),
        };
      });
  }

  private toPageInfo(response: Record<string, unknown>, count: number): PageInfo {
    const page = this.record(response['page']);
    const query = this.record(response['query']);
    const limit = Number(page['limit'] ?? response['limit'] ?? query['limit'] ?? count);
    const nextCursor = page['next_cursor'] ?? response['next_cursor'] ?? response['cursor'] ?? null;
    return {
      next_cursor: nextCursor === null || nextCursor === undefined ? null : String(nextCursor),
      has_more: Boolean(page['has_more'] ?? response['has_more'] ?? nextCursor),
      limit: Number.isFinite(limit) && limit > 0 ? limit : count,
    };
  }

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response ? response['data'] : value;
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      console.warn('[catalog-ui] JSON parse failed, returning empty array', {
        component: 'catalog-ui',
        method: 'parseJson',
        raw: value.slice(0, 100),
      });
      return [];
    }
  }

  private optionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private optionalText(value: unknown): string | undefined {
    const text = String(value ?? '').trim();
    return text && text !== 'null' ? text : undefined;
  }

  private normalizeMediaUrl(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (!/^https?:\/\//.test(value)) return value;
    try {
      const url = new URL(value);
      const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
      return isLoopback && url.pathname.startsWith('/api/v1/media/files/')
        ? `${url.pathname}${url.search}${url.hash}`
        : value;
    } catch {
      return value;
    }
  }

  private mediaFileUrl(mediaId: string | undefined): string | undefined {
    const id = this.optionalText(mediaId);
    return id ? `/api/v1/media/files/${encodeURIComponent(id)}` : undefined;
  }

  private categoryStatus(value: unknown): Category['status'] | undefined {
    const status = String(value ?? '').toUpperCase();
    return status === 'DRAFT' || status === 'ACTIVE' || status === 'ARCHIVED' ? status : undefined;
  }

  private booleanFlag(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());
  }

  private slugFromSkuCode(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sku';
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }
}
