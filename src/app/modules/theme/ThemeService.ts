import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  public readonly version = '1.0.1';
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly currentTheme = signal<ThemeMode>('dark');
  private readonly storageKey = 'kpb_theme';
  public readonly theme = this.currentTheme.asReadonly();

  init(): void {
    this.setTheme(this.resolveInitialTheme(), false);
  }

  toggle(): void {
    this.setTheme(this.currentTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: ThemeMode, persist = true): void {
    this.currentTheme.set(theme);
    this.applyTheme(theme);
    if (!persist || !isPlatformBrowser(this.platformId)) return;
    globalThis.localStorage?.setItem(this.storageKey, theme);
  }

  label(): string {
    return this.currentTheme() === 'dark' ? 'Light' : 'Dark';
  }

  private resolveInitialTheme(): ThemeMode {
    if (!isPlatformBrowser(this.platformId)) return 'dark';
    const stored = globalThis.localStorage?.getItem(this.storageKey);
    if (stored === 'light') {
      globalThis.localStorage?.setItem(this.storageKey, 'dark');
      return 'dark';
    }
    if (stored === 'dark') return 'dark';
    if (stored !== null && stored !== undefined) {
      globalThis.localStorage?.removeItem(this.storageKey);
    }
    return 'dark';
  }

  private applyTheme(theme: ThemeMode): void {
    const root = this.document.documentElement;
    if (!root) return;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  }
}
