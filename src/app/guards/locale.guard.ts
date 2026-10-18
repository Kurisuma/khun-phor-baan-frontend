import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { I18nLoader } from '../modules/i18n-loader/I18nLoader';

const ALLOWED_LOCALE_PARAM = new Set(['th', 'en']);

export const localeGuard: CanActivateFn = (route, state) => {
  const i18n = inject(I18nLoader);
  const router = inject(Router);
  const locale = route.paramMap.get('locale');
  if (!ALLOWED_LOCALE_PARAM.has(locale ?? '')) {
    const safe = state.url.split('/').filter(Boolean).slice(1);
    const valid = safe.every((segment) => /^[a-zA-Z0-9_-]+$/.test(segment));
    const reconstructed = valid ? `/th/${safe.join('/')}` : '/th';
    return router.createUrlTree([reconstructed]);
  }
  i18n.setLocale(locale);
  return true;
};
