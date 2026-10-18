import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ProductPageComponent } from './ProductPageComponent';
import { CatalogUiService } from '../../services/catalog-ui/CatalogUiService';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { ReviewUiService } from '../../services/review-ui/ReviewUiService';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { JsonLdBuilder } from '../../modules/jsonld/JsonLdBuilder';
import { SeoUrlBuilder } from '../../modules/seo-url/SeoUrlBuilder';
import type { Product, ProductSku } from '../../contracts/api-contract';

describe('ProductPageComponent', () => {
  let catalog: jasmine.SpyObj<CatalogUiService>;
  let cart: jasmine.SpyObj<CartUiService>;
  let reviews: jasmine.SpyObj<ReviewUiService>;
  let seo: jasmine.SpyObj<SeoService>;
  let jsonLd: jasmine.SpyObj<JsonLdBuilder>;
  let route: { snapshot: { paramMap: { get: jasmine.Spy } } };

  beforeEach(() => {
    catalog = jasmine.createSpyObj<CatalogUiService>('CatalogUiService', ['product']);
    cart = jasmine.createSpyObj<CartUiService>('CartUiService', ['addItem']);
    reviews = jasmine.createSpyObj<ReviewUiService>('ReviewUiService', ['reviews', 'comments', 'createReview', 'createComment']);
    seo = jasmine.createSpyObj<SeoService>('SeoService', ['setPage']);
    jsonLd = jasmine.createSpyObj<JsonLdBuilder>('JsonLdBuilder', ['product']);
    route = { snapshot: { paramMap: { get: jasmine.createSpy('get') } } };

    const i18n = {
      currentLocale: () => 'en',
      angularLocale: () => 'en-US',
      localePath: (path: string) => `/en/${path.replace(/^\/+/, '')}`,
      t: (key: string, params: Record<string, string | number> = {}) => `${key}${Object.keys(params).length ? JSON.stringify(params) : ''}`,
    };
    const urls = { absolutePath: (path: string) => `https://shop.test${path.startsWith('/') ? path : `/${path}`}` };

    TestBed.configureTestingModule({
      imports: [ProductPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        { provide: CatalogUiService, useValue: catalog },
        { provide: CartUiService, useValue: cart },
        { provide: ReviewUiService, useValue: reviews },
        { provide: AuthUiService, useValue: { authenticated: () => true } },
        { provide: SeoService, useValue: seo },
        { provide: I18nLoader, useValue: i18n },
        { provide: JsonLdBuilder, useValue: jsonLd },
        { provide: SeoUrlBuilder, useValue: urls },
      ],
    });
  });

  it('initializes from the product slug, selects the route SKU, loads social data, and writes SKU SEO', async () => {
    const product = productFixture();
    route.snapshot.paramMap.get.and.callFake((key: string) => key === 'slug' ? 'ceramic-set' : 'digital-code');
    catalog.product.and.resolveTo(product);
    reviews.reviews.and.resolveTo({ data: [{ review_id: 'r1', product_id: 'p1', user_name: 'Nok', rating: 5, title: 'Good', body: 'Nice', created_at: 'now' }], page: page() });
    reviews.comments.and.resolveTo({ data: [{ comment_id: 'c1', product_id: 'p1', user_name: 'Lek', body: 'Question', created_at: 'now' }], page: page() });
    jsonLd.product.and.returnValue({ '@type': 'Product' });
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;

    await component.ngOnInit();

    expect(catalog.product).toHaveBeenCalledOnceWith('ceramic-set');
    expect(component.product()).toBe(product);
    expect(component.selectedSkuId()).toBe('sku-digital');
    expect(component.reviews().length).toBe(1);
    expect(component.comments().length).toBe(1);
    expect(seo.setPage).toHaveBeenCalledWith(jasmine.objectContaining({
      title: 'Ceramic Set - Digital code',
      description: 'Redeem code',
      path: '/en/catalog/ceramic-set/digital-code',
    }));
  });

  it('defaults to the first available active SKU and ignores archived SKUs', () => {
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;
    component.product.set(productFixture());
    component.selectedSkuId.set('sku-physical');

    expect(component.sellableSkus(component.product()).map((sku: ProductSku) => sku.sku_id)).toEqual(['sku-physical', 'sku-digital', 'sku-shared']);
    expect(component.canAdd(component.product())).toBeTrue();
    expect(component.selectedDescription(component.product())).toBe('Bulk stock');
  });

  it('covers availability labels and add-to-cart gating for physical, digital, and shared SKU scenarios', () => {
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;
    const product = productFixture();
    component.product.set(product);

    component.selectSku(product.skus![1], product);
    expect(component.availabilityText(product.skus![1])).toContain('available');
    expect(component.canAdd(product)).toBeTrue();

    component.selectSku(product.skus![2], product);
    expect(component.availabilityText(product.skus![2])).toContain('outOfStock');
    expect(component.canAdd(product)).toBeFalse();

    component.selectSku(product.skus![3], product);
    expect(component.availabilityText(product.skus![3])).toContain('slots');
    expect(component.canAdd(product)).toBeTrue();

    const unknownCapacity = { ...product.skus![3], slots_available: null };
    expect(component.availabilityText(unknownCapacity)).toBe('product.sharedAccess');
  });

  it('clamps quantity against selected stock or slot capacity and clears the add message on SKU switch', () => {
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;
    const product = productFixture();
    component.product.set(product);
    component.selectSku(product.skus![1], product);

    component.quantity.set(99);
    component.increaseQuantity();
    expect(component.quantity()).toBe(4);

    component.decreaseQuantity();
    expect(component.quantity()).toBe(3);

    component.addMessage.set('added');
    component.selectSku(product.skus![3], product);
    expect(component.quantity()).toBe(2);
    expect(component.addMessage()).toBe('');
  });

  it('uses product images first, wraps gallery navigation, and synchronizes zoom image navigation', () => {
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;
    const product = productFixture();

    expect(component.galleryImages(product).map((image: { media_id: string }) => image.media_id)).toEqual(['m-product-1', 'm-product-2']);
    expect(component.selectedImage(product).media_id).toBe('m-product-1');

    component.previousImage(product);
    expect(component.selectedImage(product).media_id).toBe('m-product-2');

    component.openZoom(product);
    expect(component.zoomedImage().media_id).toBe('m-product-2');

    component.nextZoomImage(product);
    expect(component.zoomedImage().media_id).toBe('m-product-1');

    component.closeZoom();
    expect(component.zoomedImage()).toBeNull();
  });

  it('adds the selected SKU and quantity to the cart and surfaces API failures', async () => {
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;
    const product = productFixture();
    component.product.set(product);
    component.selectSku(product.skus![1], product);
    component.quantity.set(3);
    cart.addItem.and.resolveTo(undefined as never);

    await component.add(product);

    expect(cart.addItem).toHaveBeenCalledOnceWith('p1', 3, 'sku-physical');
    expect(component.addMessage()).toContain('product.addedToCart');

    cart.addItem.and.rejectWith({ detail: 'cart failed' });
    await component.add(product);
    expect(component.error()).toContain('cart failed');
  });

  it('does not fail product rendering when either reviews or comments cannot load', async () => {
    const product = productFixture();
    route.snapshot.paramMap.get.and.callFake((key: string) => key === 'slug' ? 'ceramic-set' : '');
    catalog.product.and.resolveTo(product);
    reviews.reviews.and.rejectWith(new Error('review service down'));
    reviews.comments.and.resolveTo({ data: [{ comment_id: 'c1', product_id: 'p1', user_name: 'Lek', body: 'Question', created_at: 'now' }], page: page() });
    jsonLd.product.and.returnValue({ '@type': 'Product' });
    const component = TestBed.createComponent(ProductPageComponent).componentInstance as any;

    await component.ngOnInit();

    expect(component.product()).toBe(product);
    expect(component.reviews()).toEqual([]);
    expect(component.comments().length).toBe(1);
    expect(component.error()).toBe('');
  });
});

function productFixture(): Product {
  return {
    product_id: 'p1',
    slug: 'ceramic-set',
    name: 'Ceramic Set',
    description: 'Product description',
    price_cents: 120000,
    currency: 'THB',
    kind: 'PRIVATE',
    review_count: 2,
    average_rating: 4.5,
    media: [
      { media_id: 'm-doc', url: '/manual.pdf', mime: 'application/pdf', purpose: 'manual', sort_order: 0 },
      { media_id: 'm-product-1', url: '/one.jpg', mime: 'image/jpeg', purpose: 'product_image', sort_order: 1 },
      { media_id: 'm-product-2', url: '/two.jpg', mime: 'image/jpeg', purpose: 'product_image', sort_order: 2 },
    ],
    skus: [
      sku('sku-archived', 'PV_OLD', 'Old', 'PHYSICAL', 'ARCHIVED', 10, undefined, 'Archived'),
      sku('sku-physical', 'PV_PHY_CERAMIC', 'Box set', 'PHYSICAL', 'ACTIVE', 4, undefined, 'Bulk stock'),
      sku('sku-digital', 'PV_CDK_CODE', 'Digital code', 'DIGITAL', 'ACTIVE', 0, undefined, 'Redeem code'),
      sku('sku-shared', 'SH_SUB_STREAM_1M', 'Shared plan', 'SHARED', 'ACTIVE', undefined, 2, 'Two slots'),
    ],
  };
}

function sku(
  skuId: string,
  skuCode: string,
  name: string,
  fulfillmentType: ProductSku['fulfillment_type'],
  status: ProductSku['status'],
  stockAvailable?: number,
  slotsAvailable?: number,
  summary?: string,
): ProductSku {
  return {
    sku_id: skuId,
    sku_code: skuCode,
    sku_slug: skuId === 'sku-digital' ? 'digital-code' : undefined,
    name,
    summary,
    description: summary,
    price_cents: 99000,
    currency: 'THB',
    fulfillment_type: fulfillmentType,
    status,
    stock_available: stockAvailable,
    slots_available: slotsAvailable,
  };
}

function page() {
  return { next_cursor: null, has_more: false, limit: 10 };
}
