import { NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogUiService } from '../../services/catalog-ui/CatalogUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Category, Product } from '../../contracts/api-contract';
import { formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-home-page',
  imports: [NgFor, NgIf, RouterLink],
  template: `
    <section class="hero-panel">
      <p class="eyebrow">{{ i18n.t('home.eyebrow') }}</p>
      <h1>{{ i18n.t('home.title') }}</h1>
      <p class="hero-lead">{{ i18n.t('home.lead') }}</p>
      <a class="btn btn-primary" [routerLink]="i18n.localePath('catalog')">{{ i18n.t('home.catalogCta') }}</a>
    </section>

    <section class="content-grid">
      <article class="panel">
        <div class="panel-heading">
          <h2>{{ i18n.t('home.panelTitle') }}</h2>
          <span class="pill">{{ i18n.t('home.seoBadge') }}</span>
        </div>
        <div class="tile-grid" *ngIf="categories().length; else emptyCategories">
          <a class="tile" *ngFor="let category of categories()" [routerLink]="i18n.localePath('catalog')" [queryParams]="{ category: category.slug }">
            <img class="category-tile-media" [src]="categoryImage(category)" [alt]="category.name">
            <span>{{ category.name }}</span>
            <small>{{ i18n.t('common.productsCount', { count: category.product_count ?? 0 }) }}</small>
          </a>
        </div>
        <ng-template #emptyCategories><p class="muted">{{ i18n.t('common.empty') }}</p></ng-template>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <h2>{{ i18n.t('home.featured') }}</h2>
          <a [routerLink]="i18n.localePath('catalog')">{{ i18n.t('common.viewAll') }}</a>
        </div>
        <div class="product-grid">
          <a class="product-card" *ngFor="let product of products()" [routerLink]="i18n.localePath('catalog/' + product.slug)">
            <div class="product-media"><img *ngIf="product.media?.[0]?.url" [src]="product.media?.[0]?.url" [alt]="product.name"></div>
            <strong>{{ product.name }}</strong>
            <span>{{ money(product) }}</span>
          </a>
        </div>
      </article>
    </section>
  `,
})
export class HomePageComponent implements OnInit {
  public readonly version = '1.1.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly catalog = inject(CatalogUiService);
  private readonly seo = inject(SeoService);
  protected readonly categories = signal<Category[]>([]);
  protected readonly products = signal<Product[]>([]);

  async ngOnInit(): Promise<void> {
    this.seo.setPage({
      title: this.i18n.t('home.title'),
      description: this.i18n.t('home.lead'),
      path: `/${this.i18n.currentLocale()}`,
    });
    const [categories, products] = await Promise.allSettled([
      this.catalog.categories(),
      this.catalog.products({ limit: 6 }),
    ]);
    if (categories.status === 'fulfilled') this.categories.set(categories.value);
    if (products.status === 'fulfilled') this.products.set(products.value.data);
  }

  protected money(product: Product): string {
    return formatMoney(product.price_cents, product.currency, this.i18n.angularLocale());
  }

  protected categoryImage(category: Category): string {
    if (category.image_url) return category.image_url;
    const slug = (category.slug || category.name || '').toLowerCase();
    return slug.includes('shared') || slug.includes('sub')
      ? '/images/category-shared.webp'
      : '/images/category-private.webp';
  }
}
