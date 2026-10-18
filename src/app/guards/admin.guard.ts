import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthUiService } from '../services/auth-ui/AuthUiService';
import { I18nLoader } from '../modules/i18n-loader/I18nLoader';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthUiService);
  const router = inject(Router);
  const i18n = inject(I18nLoader);
  await auth.hydrate();
  return auth.isAdmin() ? true : router.createUrlTree([i18n.localePath('login')], { queryParams: { admin: 'required' } });
};
