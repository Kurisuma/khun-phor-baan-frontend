import { ApplicationConfig, CSP_NONCE, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { I18nLoader } from './modules/i18n-loader/I18nLoader';
import { KPB_CSP_NONCE } from './contracts/runtime-tokens';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    {
      provide: CSP_NONCE,
      useExisting: KPB_CSP_NONCE,
    },
    {
      provide: LOCALE_ID,
      useFactory: (i18n: I18nLoader) => i18n.angularLocale(),
      deps: [I18nLoader],
    },
  ],
};
