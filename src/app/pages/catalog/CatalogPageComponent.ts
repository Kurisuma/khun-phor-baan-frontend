import { NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CatalogUiService } from '../../services/catalog-ui/CatalogUiService';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { Category, Product, ProductKind } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-catalog-page',
  imports: [NgFor, NgIf, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-heading">
      <p class="eyebrow">{{ i18n.t('catalog.title') }}</p>
      <h1>{{ i18n.t('catalog.title') }}</h1>
    </section>

    <section class="panel">
      <form class="filter-bar" [formGroup]="filters" (ngSubmit)="load()">
        <label>
          <span>{{ i18n.t('catalog.search') }}</span>
          <input formControlName="q" type="search" autocomplete="off">
        </label>
        <label>
          <span>{{ i18n.t('common.category') }}</span>
          <select formControlName="category">
            <option value="">{{ i18n.t('common.allCategories') }}</option>
            <option *ngFor="let category of categories()" [value]="category.slug">{{ category.name }}</option>
          </select>
        </label>
        <label>
          <span>{{ i18n.t('catalog.kind') }}</span>
          <select formControlName="kind">
            <option value="">{{ i18n.t('catalog.allKinds') }}</option>
            <option value="PRIVATE">{{ i18n.t('catalog.private') }}</option>
            <option value="SHARED">{{ i18n.t('catalog.shared') }}</option>
          </select>
        </label>
        <button class="btn btn-primary" type="submit">{{ i18n.t('common.submit') }}</button>
      </form>
    </section>

    <section class="panel category-banner" *ngIf="selectedCategory() as category">
      <img [src]="categoryBannerImage(category)" [alt]="category.name">
      <div>
        <p class="eyebrow">{{ i18n.t('common.category') }}</p>
        <h2>{{ category.name }}</h2>
        <p *ngIf="category.description">{{ category.description }}</p>
        <span class="pill">{{ i18n.t('common.productsCount', { count: category.product_count ?? visibleProducts().length }) }}</span>
      </div>
    </section>

    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <section class="product-grid">
      <article class="product-card" *ngFor="let product of visibleProducts()">
        <a [routerLink]="i18n.localePath('catalog/' + product.slug)">
          <div class="product-media"><img *ngIf="product.media?.[0]?.url" [src]="product.media?.[0]?.url" [alt]="product.name"></div>
          <strong>{{ product.name }}</strong>
        </a>
        <a *ngIf="product.category" class="pill" [routerLink]="i18n.localePath('catalog')" [queryParams]="{ category: product.category.slug }">{{ product.category.name }}</a>
        <p class="rating-summary" [class.empty]="!product.review_count">
          <span class="rating-star">&#9733;</span>
          <span>{{ ratingText(product) }}</span>
        </p>
        <span>{{ money(product) }}</span>
        <button class="btn btn-secondary" type="button" [disabled]="!sellableSkus(product).length" (click)="add(product)">{{ addLabel(product) }}</button>
      </article>
    </section>
  `,
})
export class CatalogPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.5.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly catalog = inject(CatalogUiService);
  private readonly cart = inject(CartUiService);
  private readonly seo = inject(SeoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly categories = signal<Category[]>([]);
  protected readonly products = signal<Product[]>([]);
  private readonly activeFilters = signal({ q: '', category: '', kind: '' });
  protected readonly visibleProducts = computed(() => {
    const value = this.activeFilters();
    const category = String(value.category ?? '');
    const kind = String(value.kind ?? '');
    return this.products().filter((product) => {
      const categoryMatches = !category || product.category?.slug === category || (category === 'uncategorized' && !product.category);
      const kindMatches = !kind || product.kind === kind;
      return categoryMatches && kindMatches;
    });
  });
  protected readonly error = signal('');
  protected readonly filters = this.fb.group({
    q: [''],
    category: [''],
    kind: [''],
  });
  private readonly querySubscription = new Subscription();
  private loadSequence = 0;

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('catalog.title'), description: this.i18n.t('catalog.description'), path: `/${this.i18n.currentLocale()}/catalog` });
    const initialParams = this.route.snapshot.queryParamMap;
    this.filters.patchValue({
      q: initialParams.get('q') ?? '',
      category: initialParams.get('category') ?? '',
      kind: initialParams.get('kind') ?? '',
    }, { emitEvent: false });
    this.activeFilters.set(this.normalizedFilters());
    await Promise.all([
      this.loadCategories(),
      this.loadProducts(),
    ]);
    let isInitial = true;
    this.querySubscription.add(this.route.queryParamMap.subscribe((params) => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      this.filters.patchValue({
        q: params.get('q') ?? '',
        category: params.get('category') ?? '',
        kind: params.get('kind') ?? '',
      }, { emitEvent: false });
      this.activeFilters.set(this.normalizedFilters());
      void this.loadProducts();
    }));
    this.querySubscription.add(this.filters.controls.category.valueChanges.subscribe(() => void this.load()));
    this.querySubscription.add(this.filters.controls.kind.valueChanges.subscribe(() => void this.load()));
  }

  ngOnDestroy(): void {
    this.querySubscription.unsubscribe();
  }

  protected async load(): Promise<void> {
    const value = this.filters.getRawValue();
    await this.router.navigate([], {
      queryParams: {
        q: value.q || null,
        category: value.category || null,
        kind: value.kind || null,
      },
      queryParamsHandling: 'merge',
    });
  }

  private async loadProducts(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.error.set('');
    const value = this.normalizedFilters();
    const kind = value.kind === 'PRIVATE' || value.kind === 'SHARED' ? value.kind as ProductKind : undefined;
    try {
      const result = value.q
        ? await this.catalog.search({ q: value.q, category: value.category || undefined, kind, limit: 24 })
        : await this.catalog.products({ category: value.category || undefined, kind, limit: 24 });
      if (sequence !== this.loadSequence) return;
      this.products.set(result.data);
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      this.error.set(apiErrorMessage(error));
    }
  }

  private normalizedFilters(): { q: string; category: string; kind: string } {
    const value = this.filters.getRawValue();
    return {
      q: value.q ?? '',
      category: value.category ?? '',
      kind: value.kind ?? '',
    };
  }

  protected async add(product: Product): Promise<void> {
    const skus = this.sellableSkus(product);
    if (skus.length !== 1) {
      await this.router.navigateByUrl(this.i18n.localePath('catalog/' + product.slug));
      return;
    }
    try {
      await this.cart.addItem(product.product_id, 1, skus[0].sku_id);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected addLabel(product: Product): string {
    return this.sellableSkus(product).length === 1 ? this.i18n.t('catalog.addToCart') : this.i18n.t('catalog.chooseSku');
  }

  protected sellableSkus(product: Product) {
    return (product.skus ?? []).filter((item) => item.status === 'ACTIVE');
  }

  protected money(product: Product): string {
    return formatMoney(product.price_cents, product.currency, this.i18n.angularLocale());
  }

  protected selectedCategory(): Category | undefined {
    const slug = String(this.filters.getRawValue().category ?? '');
    return slug ? this.categories().find((category) => category.slug === slug) : undefined;
  }

  protected ratingText(product: Product): string {
    if (!product.review_count || product.average_rating === undefined) return this.i18n.t('catalog.noReviews');
    const label = product.review_count === 1 ? this.i18n.t('catalog.review') : this.i18n.t('catalog.reviews');
    return this.i18n.t('catalog.ratingSummary', { rating: product.average_rating.toFixed(1), count: product.review_count, label });
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.catalog.categories());
    } catch {
      this.categories.set([]);
    }
  }

  protected categoryBannerImage(category: Category): string {
    if (category.image_url) return category.image_url;
    const slug = (category.slug || category.name || '').toLowerCase();
    return slug.includes('shared') || slug.includes('sub')
      ? '/images/category-shared.webp'
      : '/images/category-private.webp';
  }
}
