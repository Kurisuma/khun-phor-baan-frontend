import { Injectable, signal } from '@angular/core';
import th from '../../../i18n/th.json';
import en from '../../../i18n/en.json';
import type { ApiLocale } from '../../contracts/api-contract';

interface MessageTree {
  [key: string]: string | MessageTree;
}

@Injectable({ providedIn: 'root' })
export class I18nLoader {
  public readonly version = '1.0.0';
  public readonly locale = signal<ApiLocale>('th');

  private readonly messages: Record<ApiLocale, MessageTree> = {
    th: th as MessageTree,
    en: en as MessageTree,
  };

  setLocale(locale: string | null | undefined): ApiLocale {
    const next: ApiLocale = locale === 'en' ? 'en' : 'th';
    this.locale.set(next);
    return next;
  }

  resolveFromPath(path: string): ApiLocale {
    const first = path.split('/').filter(Boolean)[0];
    return this.setLocale(first);
  }

  currentLocale(): ApiLocale {
    return this.locale();
  }

  angularLocale(): string {
    return this.currentLocale() === 'th' ? 'th-TH' : 'en-US';
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    const value = this.lookup(this.messages[this.currentLocale()], key)
      ?? this.lookup(this.messages.en, key)
      ?? key;
    return Object.entries(params).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      value,
    );
  }

  localePath(path: string): string {
    const clean = path.replace(/^\/+/, '');
    return `/${this.currentLocale()}${clean ? `/${clean}` : ''}`;
  }

  withLocale(locale: ApiLocale, currentPath = globalThis.location?.pathname ?? '/th'): string {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts[0] === 'th' || parts[0] === 'en') {
      parts[0] = locale;
    } else {
      parts.unshift(locale);
    }
    return `/${parts.join('/')}`;
  }

  private lookup(tree: MessageTree, key: string): string | null {
    let current: string | MessageTree | undefined = tree;
    for (const part of key.split('.')) {
      if (typeof current !== 'object') return null;
      current = current[part];
    }
    return typeof current === 'string' ? current : null;
  }
}
