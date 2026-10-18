import { TestBed } from '@angular/core/testing';
import { ApiClient } from '../../modules/http-client/ApiClient';
import { CatalogUiService } from './CatalogUiService';

describe('CatalogUiService', () => {
  let api: jasmine.SpyObj<ApiClient>;
  let service: CatalogUiService;

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiClient>('ApiClient', ['get']);
    TestBed.configureTestingModule({
      providers: [
        CatalogUiService,
        { provide: ApiClient, useValue: api },
      ],
    });
    service = TestBed.inject(CatalogUiService);
  });

  it('normalizes loopback product media URLs to same-origin API paths for CSP-safe rendering', async () => {
    api.get.and.resolveTo({
      code: 'PRODUCTS_LIST',
      request_id: 'req-1',
      data: {
        products: [
          {
            id: 1,
            slug: 'steam-wallet',
            name: 'Steam Wallet',
            media: [
              {
                media_id: 7,
                url: 'http://127.0.0.1:8088/api/v1/media/files/7?size=card',
                mime: 'image/svg+xml',
                purpose: 'product_image',
              },
              {
                media_id: 8,
                public_url: 'https://cdn.example.test/api/v1/media/files/8',
                mime: 'image/webp',
                purpose: 'product_image',
              },
            ],
          },
        ],
      },
    });

    const result = await service.products({ limit: 1 });

    expect(result.data[0].media?.[0]?.url).toBe('/api/v1/media/files/7?size=card');
    expect(result.data[0].media?.[1]?.url).toBe('https://cdn.example.test/api/v1/media/files/8');
  });

  it('derives product media URLs from media object ids when URL fields are absent', async () => {
    api.get.and.resolveTo({
      code: 'PRODUCTS_LIST',
      request_id: 'req-media-id',
      data: {
        products: [
          {
            id: 2,
            slug: 'media-id-only',
            name: 'Media ID only',
            media: [
              { media_id: 46, mime: 'image/svg+xml', purpose: 'product_image' },
              { id: '47', mime: 'image/webp', purpose: 'product_image' },
            ],
          },
        ],
      },
    });

    const result = await service.products({ limit: 1 });

    expect(result.data[0].media?.map((item) => item.url)).toEqual([
      '/api/v1/media/files/46',
      '/api/v1/media/files/47',
    ]);
  });

  it('normalizes loopback category image URLs while preserving external HTTPS URLs', async () => {
    api.get.and.resolveTo({
      code: 'CATEGORIES_LIST',
      request_id: 'req-2',
      data: {
        categories: [
          {
            id: 1,
            slug: 'game-cards',
            name: 'Game cards',
            image_url: 'http://localhost:8088/api/v1/media/files/11#preview',
          },
          {
            id: 2,
            slug: 'hardware',
            name: 'Hardware',
            public_url: 'https://cdn.example.test/categories/hardware.webp',
          },
        ],
      },
    });

    const categories = await service.categories();

    expect(categories[0].image_url).toBe('/api/v1/media/files/11#preview');
    expect(categories[1].image_url).toBe('https://cdn.example.test/categories/hardware.webp');
  });

  it('derives category image URLs from image media ids when URL fields are absent', async () => {
    api.get.and.resolveTo({
      code: 'CATEGORIES_LIST',
      request_id: 'req-category-id',
      data: {
        categories: [
          {
            id: 3,
            slug: 'subscription',
            name: 'Subscription',
            image_media_id: 99,
          },
        ],
      },
    });

    const categories = await service.categories();

    expect(categories[0].image_url).toBe('/api/v1/media/files/99');
  });
});
