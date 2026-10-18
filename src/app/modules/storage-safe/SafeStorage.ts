import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const ALLOWED_KEYS = new Set([
  'user_locale',
  'catalog_view_mode',
  'admin_column_state',
  'recent_searches',
  'ui_theme',
] as const);

@Injectable({ providedIn: 'root' })
export class SafeStorage {
  public readonly version = '1.0.0';
  private readonly platformId = inject(PLATFORM_ID);

  setJson<T>(key: string, value: T): void {
    if (!(ALLOWED_KEYS as Set<string>).has(key)) {
      throw new Error(`SafeStorage: key "${key}" is not in allowlist`);
    }
    if (isPlatformBrowser(this.platformId)) {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    }
  }

  getJson<T>(key: string): T | null {
    if (!(ALLOWED_KEYS as Set<string>).has(key)) return null;
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = globalThis.localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch { return null; }
  }

  remove(key: string): void {
    if (!(ALLOWED_KEYS as Set<string>).has(key)) return;
    if (isPlatformBrowser(this.platformId)) {
      globalThis.localStorage.removeItem(key);
    }
  }
}
