import { inject, Injectable } from '@angular/core';
import { SeoUrlBuilder } from '../seo-url/SeoUrlBuilder';
import type { Product, ProductSku, SeoSitemapEntry } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class JsonLdBuilder {
  public readonly version = '1.2.0';
  private readonly urls = inject(SeoUrlBuilder);

  organization(): unknown {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'KhunPhorBaan',
      url: this.urls.siteUrl(),
    };
  }

  website(locale: string): unknown {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'KhunPhorBaan',
      inLanguage: locale,
      url: this.urls.absolutePath(`/${locale}`),
      potentialAction: {
        '@type': 'SearchAction',
        target: `${this.urls.absolutePath(`/${locale}/catalog`)}?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    };
  }

  product(product: Product, canonical: string, selectedSku?: ProductSku | null): unknown {
    const media = this.urls.publicAssetUrl(product.media?.[0]?.url);
    const activeSkus = (product.skus ?? []).filter((sku) => sku.status === 'ACTIVE');
    const offerSkus = selectedSku ? [selectedSku] : activeSkus;
    const offers = offerSkus.length
      ? offerSkus.map((sku) => ({
        '@type': 'Offer',
        sku: sku.sku_code,
        name: sku.name,
        url: this.skuUrl(canonical, sku, Boolean(selectedSku)),
        price: (sku.price_cents / 100).toFixed(2),
        priceCurrency: sku.currency,
        availability: this.skuAvailable(sku)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      }))
      : {
        '@type': 'Offer',
        price: (product.price_cents / 100).toFixed(2),
        priceCurrency: product.currency,
        availability: product.inventory_summary?.in_stock === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      };
    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: selectedSku ? this.selectedSkuName(product, selectedSku) : product.name,
      description: selectedSku?.description ?? selectedSku?.summary ?? product.description,
      url: canonical,
      sku: selectedSku?.sku_code ?? product.slug,
      offers,
    };
    if (media) schema['image'] = media;
    if (product.average_rating && product.review_count) {
      schema['aggregateRating'] = {
        '@type': 'AggregateRating',
        ratingValue: product.average_rating.toFixed(1),
        reviewCount: product.review_count,
      };
    }
    return schema;
  }

  private skuAvailable(sku: NonNullable<Product['skus']>[number]): boolean {
    if (sku.fulfillment_type === 'SHARED') return sku.slots_available === undefined || sku.slots_available === null || sku.slots_available > 0;
    return sku.stock_available === undefined || sku.stock_available === null || sku.stock_available > 0;
  }

  private skuUrl(canonical: string, sku: ProductSku, alreadySelected: boolean): string {
    const skuSlug = sku.sku_slug ?? sku.sku_code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return alreadySelected ? canonical : `${canonical.replace(/\/$/, '')}/${skuSlug}`;
  }

  private selectedSkuName(product: Product, sku: ProductSku): string {
    return product.name.trim().toLowerCase() === sku.name.trim().toLowerCase()
      ? product.name
      : `${product.name} - ${sku.name}`;
  }

  breadcrumb(items: Array<{ name: string; url: string }>): unknown {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    };
  }

  sitemapJson(entries: SeoSitemapEntry[]): unknown {
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: entry.loc,
      })),
    };
  }
}
