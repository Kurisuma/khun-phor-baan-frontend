import { InjectionToken } from '@angular/core';

export const KPB_API_BASE_URL = new InjectionToken<string>('KPB_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

export const KPB_REQUEST_HEADERS = new InjectionToken<Record<string, string | string[] | undefined>>(
  'KPB_REQUEST_HEADERS',
  {
    providedIn: 'root',
    factory: () => ({}),
  },
);

export const KPB_CSP_NONCE = new InjectionToken<string>('KPB_CSP_NONCE', {
  providedIn: 'root',
  factory: () => {
    const doc = globalThis.document;
    return doc?.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? '';
  },
});

/**
 * SA3-F013: KPB_PUBLIC_SITE_URL must be provided via meta tag — no production
 * domain hardcoded as fallback. The meta tag is injected by the SSR server so
 * SSR always has the correct value. Client-side renders without the meta tag
 * will get an empty string, which the SSR renderer should handle gracefully.
 */
export const KPB_PUBLIC_SITE_URL = new InjectionToken<string>('KPB_PUBLIC_SITE_URL', {
  providedIn: 'root',
  factory: () => {
    const doc = globalThis.document;
    return doc?.querySelector<HTMLMetaElement>('meta[name="kpb-public-site-url"]')?.content ?? '';
  },
});
