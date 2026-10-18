import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogUiService } from '../../services/catalog-ui/CatalogUiService';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { ReviewUiService } from '../../services/review-ui/ReviewUiService';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { JsonLdBuilder } from '../../modules/jsonld/JsonLdBuilder';
import { SeoUrlBuilder } from '../../modules/seo-url/SeoUrlBuilder';
import type { Comment, Product, ProductMedia, ProductSku, Review } from '../../contracts/api-contract';
import { apiErrorMessage, formatMoney } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-product-page',
  imports: [NgClass, NgFor, NgIf, ReactiveFormsModule, RouterLink],
  template: `
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>

    <section class="product-detail product-detail-shell" *ngIf="product() as item">
      <div class="panel product-gallery product-gallery-panel">
        <nav class="product-breadcrumb" [attr.aria-label]="i18n.t('product.navigation')">
          <a [routerLink]="i18n.localePath('catalog')">{{ i18n.t('catalog.title') }}</a>
          <span>{{ item.name }}</span>
        </nav>
        <div class="product-media-stack">
          <div class="detail-media">
            <img *ngIf="selectedImage(item) as image" [src]="image.url" [alt]="item.name">
            <div class="detail-media-placeholder" *ngIf="!selectedImage(item)">
              <strong>{{ item.name }}</strong>
              <span>{{ i18n.t('product.noImage') }}</span>
            </div>
            <button class="gallery-zoom-btn" type="button" *ngIf="selectedImage(item)" (click)="openZoom(item)">{{ i18n.t('common.zoom') }}</button>
            <div class="gallery-controls" *ngIf="galleryImages(item).length > 1">
              <button class="gallery-btn" type="button" [attr.aria-label]="i18n.t('common.previousImage')" (click)="previousImage(item)">&lsaquo;</button>
              <button class="gallery-btn" type="button" [attr.aria-label]="i18n.t('common.nextImage')" (click)="nextImage(item)">&rsaquo;</button>
            </div>
          </div>
          <div class="gallery-thumbs" *ngIf="galleryImages(item).length > 1">
            <button
              *ngFor="let image of galleryImages(item); let index = index"
              class="gallery-thumb"
              type="button"
              [ngClass]="{ active: activeGalleryIndex() === index }"
              (click)="selectImage(index)"
            >
              <img [src]="image.url" [alt]="i18n.t('product.imageAlt', { name: item.name, index: index + 1 })">
            </button>
          </div>
          <div class="product-media-note">
            <span>{{ i18n.t('product.gallery') }}</span>
            <strong>{{ i18n.t('product.imageCount', { count: galleryImages(item).length || 1 }) }}</strong>
          </div>
        </div>
        <section class="embedded-purchase-section">
          <div class="product-title-block">
            <div class="product-badges">
              <span class="status-badge">{{ selectedSku() ? fulfillmentLabel(selectedSku()!) : item.kind }}</span>
            </div>
            <h1>{{ item.name }}</h1>
            <p class="rating-summary detail-rating" [class.empty]="!item.review_count">
              <span class="rating-star">&#9733;</span>
              <span>{{ ratingText(item) }}</span>
            </p>
            <p class="muted">{{ selectedDescription(item) }}</p>
          </div>

          <div class="purchase-summary">
            <div>
              <span>{{ i18n.t('common.price') }}</span>
              <strong>{{ selectedSku() ? moneySku(selectedSku()!) : money(item) }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('product.fulfillment') }}</span>
              <strong>{{ selectedSku() ? fulfillmentLabel(selectedSku()!) : item.kind }}</strong>
            </div>
            <div>
              <span>{{ i18n.t('product.availability') }}</span>
              <strong>{{ selectedSku() ? availabilityText(selectedSku()!) : i18n.t('catalog.chooseSku') }}</strong>
            </div>
          </div>

          <div class="product-section-heading" *ngIf="sellableSkus(item).length">
            <div>
              <h2>{{ i18n.t('product.chooseVariant') }}</h2>
              <p class="muted">{{ i18n.t('product.optionsAvailable', { count: sellableSkus(item).length }) }}</p>
            </div>
          </div>
          <div class="sku-picker product-sku-picker" *ngIf="sellableSkus(item).length">
            <a
              *ngFor="let sku of sellableSkus(item)"
              class="sku-option"
              [routerLink]="skuPath(item, sku)"
              [ngClass]="{ active: selectedSkuId() === sku.sku_id }"
              (click)="selectSku(sku, item)"
            >
              <strong>{{ sku.name }}</strong>
              <span>{{ moneySku(sku) }}</span>
              <small>{{ sku.sku_code }}</small>
            </a>
          </div>

          <div class="embedded-product-details">
            <h2>{{ i18n.t('product.details') }}</h2>
            <p class="muted">{{ item.description }}</p>
            <ng-container *ngIf="selectedSku() as sku">
              <div class="sku-detail-block product-sku-details" *ngIf="hasSkuDetails(sku)">
                <p *ngFor="let detail of skuDetailRows(sku)">
                  <strong>{{ detail.label }}</strong>
                  <span>{{ detail.value }}</span>
                </p>
              </div>
            </ng-container>
          </div>

          <div class="purchase-actions">
            <div class="quantity-stepper" [attr.aria-label]="i18n.t('common.quantity')">
              <button type="button" (click)="decreaseQuantity()">-</button>
              <input type="number" min="1" [max]="maxQuantity()" [value]="quantity()" (input)="setQuantity($event)">
              <button type="button" (click)="increaseQuantity()">+</button>
            </div>
            <button class="btn btn-primary" type="button" [disabled]="!canAdd(item)" (click)="add(item)">{{ i18n.t('catalog.addToCart') }}</button>
            <a class="btn btn-secondary" [routerLink]="i18n.localePath('cart')">{{ i18n.t('product.viewCart') }}</a>
          </div>

          <p class="alert alert-success product-add-message" *ngIf="addMessage()">{{ addMessage() }}</p>
        </section>
      </div>
    </section>

    <section class="content-grid product-review-grid" *ngIf="product() as item">
      <article class="panel product-review-panel">
        <section class="product-social-section">
          <div class="panel-heading">
            <div>
              <h2>{{ i18n.t('product.reviewsTitle') }}</h2>
              <p class="muted">{{ i18n.t('product.visibleReviews', { count: reviews().length }) }}</p>
            </div>
          </div>
          <form class="stack" *ngIf="auth.authenticated(); else reviewLogin" [formGroup]="reviewForm" (ngSubmit)="createReview(item.product_id)">
            <input formControlName="title" [placeholder]="i18n.t('product.reviewTitle')">
            <select formControlName="rating"><option *ngFor="let rating of ratings" [value]="rating">{{ rating }}</option></select>
            <textarea formControlName="body" rows="3" [placeholder]="i18n.t('product.reviewBody')"></textarea>
            <button class="btn btn-secondary" type="submit">{{ i18n.t('product.submitReview') }}</button>
          </form>
          <ng-template #reviewLogin>
            <p class="muted">{{ i18n.t('product.reviewLogin') }}</p>
            <a class="btn btn-secondary" [routerLink]="i18n.localePath('login')" [queryParams]="{ returnTo: '/' + i18n.currentLocale() + '/catalog/' + item.slug }">{{ i18n.t('auth.login') }}</a>
          </ng-template>
          <div class="empty-state product-empty-state" *ngIf="reviews().length === 0">
            <strong>{{ i18n.t('product.approvedReviewsEmpty') }}</strong>
            <span class="muted">{{ i18n.t('product.approvedReviewsHint') }}</span>
          </div>
          <div class="list" *ngIf="reviews().length > 0">
            <div class="list-row" *ngFor="let review of reviews()">
              <strong>{{ review.title }}</strong>
              <span>{{ i18n.t('product.reviewBy', { rating: review.rating, name: review.user_name }) }}</span>
              <p>{{ review.body }}</p>
            </div>
          </div>
        </section>

        <section class="product-social-section product-comment-section">
          <div class="panel-heading">
            <div>
              <h2>{{ i18n.t('product.commentsTitle') }}</h2>
              <p class="muted">{{ i18n.t('product.commentCount', { count: comments().length }) }}</p>
            </div>
          </div>
          <form class="stack" *ngIf="auth.authenticated(); else commentLogin" [formGroup]="commentForm" (ngSubmit)="createComment(item.product_id)">
            <textarea formControlName="body" rows="3" [placeholder]="i18n.t('product.commentPlaceholder')"></textarea>
            <button class="btn btn-secondary" type="submit">{{ i18n.t('product.addComment') }}</button>
          </form>
          <ng-template #commentLogin>
            <p class="muted">{{ i18n.t('product.commentLogin') }}</p>
          </ng-template>
          <div class="empty-state product-empty-state" *ngIf="comments().length === 0">
            <strong>{{ i18n.t('product.commentsEmpty') }}</strong>
            <span class="muted">{{ i18n.t('product.commentsHint') }}</span>
          </div>
          <div class="list" *ngIf="comments().length > 0">
            <div class="list-row" *ngFor="let comment of comments()">
              <strong>{{ comment.user_name }}</strong>
              <p>{{ comment.body }}</p>
            </div>
          </div>
        </section>
      </article>
    </section>

    <div class="image-modal" *ngIf="zoomedImage() as image" (click)="closeZoom()">
      <div class="image-modal-frame" (click)="$event.stopPropagation()">
        <button class="image-modal-close" type="button" [attr.aria-label]="i18n.t('common.close')" (click)="closeZoom()">{{ i18n.t('common.close') }}</button>
        <img [src]="image.url" [alt]="product()?.name || i18n.t('product.imagePreviewAlt')">
        <div class="gallery-controls modal-controls" *ngIf="product() as item">
          <button class="gallery-btn" type="button" *ngIf="galleryImages(item).length > 1" [attr.aria-label]="i18n.t('common.previousImage')" (click)="previousZoomImage(item)">&lsaquo;</button>
          <button class="gallery-btn" type="button" *ngIf="galleryImages(item).length > 1" [attr.aria-label]="i18n.t('common.nextImage')" (click)="nextZoomImage(item)">&rsaquo;</button>
        </div>
      </div>
    </div>
  `,
})
export class ProductPageComponent implements OnInit {
  public readonly version = '1.8.0';
  protected readonly i18n = inject(I18nLoader);
  protected readonly auth = inject(AuthUiService);
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogUiService);
  private readonly cart = inject(CartUiService);
  private readonly reviewsApi = inject(ReviewUiService);
  private readonly seo = inject(SeoService);
  private readonly jsonLd = inject(JsonLdBuilder);
  private readonly urls = inject(SeoUrlBuilder);
  private readonly fb = inject(FormBuilder);
  protected readonly product = signal<Product | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly comments = signal<Comment[]>([]);
  protected readonly error = signal('');
  protected readonly activeGalleryIndex = signal(0);
  protected readonly zoomedImage = signal<ProductMedia | null>(null);
  protected readonly selectedSkuId = signal('');
  protected readonly quantity = signal(1);
  protected readonly addMessage = signal('');
  protected readonly ratings = [1, 2, 3, 4, 5];
  protected readonly reviewForm = this.fb.group({ title: ['', Validators.required], rating: [5, Validators.required], body: ['', Validators.required] });
  protected readonly commentForm = this.fb.group({ body: ['', Validators.required] });

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    try {
      const product = await this.catalog.product(slug);
      const routeSkuSlug = this.route.snapshot.paramMap.get('skuSlug') ?? '';
      this.product.set(product);
      const routeSku = this.skuFromSlug(product, routeSkuSlug);
      const initialSku = routeSku ?? this.defaultSku(product);
      this.selectedSkuId.set(initialSku?.sku_id ?? '');
      this.activeGalleryIndex.set(0);
      this.setProductSeo(product, routeSku);
      await this.loadSocial(product.product_id);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async add(product: Product): Promise<void> {
    const sku = this.selectedSku() ?? this.defaultSku(product);
    if (!sku) return;
    try {
      await this.cart.addItem(product.product_id, this.quantity(), sku.sku_id);
      this.addMessage.set(this.i18n.t('product.addedToCart', { count: this.quantity() }));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async createReview(productId: string): Promise<void> {
    if (this.reviewForm.invalid) return;
    const value = this.reviewForm.getRawValue();
    await this.reviewsApi.createReview(productId, { rating: Number(value.rating), title: value.title ?? '', body: value.body ?? '' });
    await this.loadSocial(productId);
  }

  protected async createComment(productId: string): Promise<void> {
    if (this.commentForm.invalid) return;
    await this.reviewsApi.createComment(productId, { body: this.commentForm.getRawValue().body ?? '' });
    await this.loadSocial(productId);
  }

  protected money(product: Product): string {
    return formatMoney(product.price_cents, product.currency, this.i18n.angularLocale());
  }

  protected moneySku(sku: ProductSku): string {
    return formatMoney(sku.price_cents, sku.currency, this.i18n.angularLocale());
  }

  protected sellableSkus(product: Product): ProductSku[] {
    return (product.skus ?? []).filter((sku) => sku.status === 'ACTIVE');
  }

  protected selectedSku(): ProductSku | null {
    const product = this.product();
    if (!product) return null;
    return this.sellableSkus(product).find((sku) => sku.sku_id === this.selectedSkuId()) ?? null;
  }

  protected selectSku(sku: ProductSku, product?: Product): void {
    this.selectedSkuId.set(sku.sku_id);
    this.quantity.set(this.clampQuantity(this.quantity(), sku));
    this.addMessage.set('');
    const item = product ?? this.product();
    if (!item) return;
    this.setProductSeo(item, sku);
  }

  protected canAdd(product: Product): boolean {
    const sku = this.selectedSku() ?? this.defaultSku(product);
    return Boolean(sku && this.skuAvailable(sku));
  }

  protected availabilityText(sku: ProductSku): string {
    if (sku.fulfillment_type === 'SHARED') {
      if (sku.slots_available === undefined || sku.slots_available === null) return this.i18n.t('product.sharedAccess');
      return sku.slots_available > 0 ? this.i18n.t('product.slots', { count: sku.slots_available }) : this.i18n.t('product.noSlots');
    }
    if (sku.stock_available === undefined || sku.stock_available === null) return sku.fulfillment_type.toLowerCase();
    return sku.stock_available > 0 ? this.i18n.t('product.available', { count: sku.stock_available }) : this.i18n.t('product.outOfStock');
  }

  protected hasSkuDetails(sku: ProductSku): boolean {
    return Boolean(sku.summary || sku.description || sku.usage || sku.warranty);
  }

  protected skuDetailRows(sku: ProductSku): Array<{ label: string; value: string }> {
    return [
      { label: this.i18n.t('product.summary'), value: sku.summary ?? '' },
      { label: this.i18n.t('product.description'), value: sku.description ?? '' },
      { label: this.i18n.t('product.usage'), value: sku.usage ?? '' },
      { label: this.i18n.t('product.warranty'), value: sku.warranty ?? '' },
    ].filter((row) => row.value);
  }

  protected skuPath(product: Product, sku: ProductSku): string {
    return this.i18n.localePath(`catalog/${product.slug}/${sku.sku_slug ?? this.slugFromSkuCode(sku.sku_code)}`);
  }

  protected ratingText(product: Product): string {
    if (!product.review_count || product.average_rating === undefined) return this.i18n.t('product.noApprovedReviews');
    const label = product.review_count === 1 ? this.i18n.t('catalog.review') : this.i18n.t('catalog.reviews');
    return this.i18n.t('product.ratingAverage', { rating: product.average_rating.toFixed(1), count: product.review_count, label });
  }

  protected selectedDescription(product: Product): string {
    const sku = this.selectedSku();
    return sku?.summary ?? sku?.description ?? product.description;
  }

  protected fulfillmentLabel(sku: ProductSku): string {
    if (sku.fulfillment_type === 'SHARED') return this.i18n.t('product.sharedSubscription');
    if (sku.fulfillment_type === 'DIGITAL') return this.i18n.t('product.digitalDelivery');
    return this.i18n.t('product.physicalDelivery');
  }

  protected skuStatusClass(sku: ProductSku): string {
    return this.skuAvailable(sku) ? 'status-delivered' : 'status-not-ready';
  }

  protected maxQuantity(): number {
    const sku = this.selectedSku();
    if (!sku) return 1;
    if (sku.fulfillment_type === 'SHARED') return Math.max(1, sku.slots_available ?? 10);
    return Math.max(1, sku.stock_available ?? 10);
  }

  protected decreaseQuantity(): void {
    this.quantity.set(this.clampQuantity(this.quantity() - 1));
  }

  protected increaseQuantity(): void {
    this.quantity.set(this.clampQuantity(this.quantity() + 1));
  }

  protected setQuantity(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.quantity.set(this.clampQuantity(Number(input.value)));
  }

  private defaultSku(product: Product): ProductSku | null {
    return this.sellableSkus(product).find((sku) => this.skuAvailable(sku)) ?? this.sellableSkus(product)[0] ?? null;
  }

  private skuFromSlug(product: Product, skuSlug: string): ProductSku | null {
    if (!skuSlug) return null;
    const normalized = this.slugFromSkuCode(skuSlug);
    return this.sellableSkus(product).find((sku) => (sku.sku_slug ?? this.slugFromSkuCode(sku.sku_code)) === normalized) ?? null;
  }

  private setProductSeo(product: Product, sku: ProductSku | null): void {
    const path = sku ? this.skuPath(product, sku) : `/${this.i18n.currentLocale()}/catalog/${product.slug}`;
    const title = sku ? this.selectedSkuTitle(product, sku) : product.seo?.title ?? product.name;
    const description = sku?.description ?? sku?.summary ?? product.seo?.description ?? product.description;
    this.seo.setPage({
      title,
      description,
      path,
      image: product.media?.[0]?.url,
      jsonLd: [this.jsonLd.product(product, this.urls.absolutePath(path), sku)],
    });
  }

  private selectedSkuTitle(product: Product, sku: ProductSku): string {
    return product.name.trim().toLowerCase() === sku.name.trim().toLowerCase()
      ? product.name
      : `${product.name} - ${sku.name}`;
  }

  private slugFromSkuCode(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sku';
  }

  private skuAvailable(sku: ProductSku): boolean {
    if (sku.fulfillment_type === 'SHARED') return sku.slots_available === undefined || sku.slots_available === null || sku.slots_available > 0;
    return sku.stock_available === undefined || sku.stock_available === null || sku.stock_available > 0;
  }

  private clampQuantity(value: number, sku = this.selectedSku() ?? undefined): number {
    const parsed = Number.isFinite(value) ? Math.floor(value) : 1;
    const max = sku
      ? sku.fulfillment_type === 'SHARED'
        ? Math.max(1, sku.slots_available ?? 10)
        : Math.max(1, sku.stock_available ?? 10)
      : 1;
    return Math.min(Math.max(parsed, 1), max);
  }

  protected galleryImages(product: Product): ProductMedia[] {
    const images = (product.media ?? []).filter((image) => Boolean(image.url));
    const productImages = images.filter((image) => image.purpose === 'product_image');
    return productImages.length ? productImages : images;
  }

  protected selectedImage(product: Product): ProductMedia | null {
    const images = this.galleryImages(product);
    if (!images.length) return null;
    return images[Math.min(this.activeGalleryIndex(), images.length - 1)] ?? images[0];
  }

  protected selectImage(index: number): void {
    this.activeGalleryIndex.set(index);
  }

  protected openZoom(product: Product): void {
    this.zoomedImage.set(this.selectedImage(product));
  }

  protected closeZoom(): void {
    this.zoomedImage.set(null);
  }

  protected previousImage(product: Product): void {
    const count = this.galleryImages(product).length;
    if (count <= 1) return;
    this.activeGalleryIndex.set((this.activeGalleryIndex() + count - 1) % count);
  }

  protected nextImage(product: Product): void {
    const count = this.galleryImages(product).length;
    if (count <= 1) return;
    this.activeGalleryIndex.set((this.activeGalleryIndex() + 1) % count);
  }

  protected previousZoomImage(product: Product): void {
    this.previousImage(product);
    this.zoomedImage.set(this.selectedImage(product));
  }

  protected nextZoomImage(product: Product): void {
    this.nextImage(product);
    this.zoomedImage.set(this.selectedImage(product));
  }

  private async loadSocial(productId: string): Promise<void> {
    const [reviews, comments] = await Promise.allSettled([
      this.reviewsApi.reviews(productId),
      this.reviewsApi.comments(productId),
    ]);
    if (reviews.status === 'fulfilled') this.reviews.set(reviews.value.data);
    if (comments.status === 'fulfilled') this.comments.set(comments.value.data);
  }
}
