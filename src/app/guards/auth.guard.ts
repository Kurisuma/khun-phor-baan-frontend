import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthUiService } from '../services/auth-ui/AuthUiService';
import { I18nLoader } from '../modules/i18n-loader/I18nLoader';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthUiService);
  const router = inject(Router);
  const i18n = inject(I18nLoader);
  await auth.hydrate();
  if (auth.authenticated()) return true;

  const rawUrl: string = state.url ?? '/';
  const isRelative = rawUrl.startsWith('/') && !rawUrl.startsWith('//') && !rawUrl.includes('://');
  const safeUrl = isRelative ? rawUrl : '/';

  return router.createUrlTree([i18n.localePath('login')], { queryParams: { returnTo: safeUrl } });
};
