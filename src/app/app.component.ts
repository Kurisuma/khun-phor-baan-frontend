import { NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { RouterLink } from '@angular/router';
import { AuthUiService } from './services/auth-ui/AuthUiService';
import { CartUiService } from './services/cart-ui/CartUiService';
import { CatalogUiService } from './services/catalog-ui/CatalogUiService';
import { I18nLoader } from './modules/i18n-loader/I18nLoader';
import { ThemeService } from './modules/theme/ThemeService';
import {
  setGlobalBaseCurrency,
  setGlobalDisplayCurrency,
  getGlobalDisplayCurrency,
  detectCurrencyFromLocale,
  SUPPORTED_DISPLAY_CURRENCIES,
} from './pages/presentation';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  public readonly version = '1.6.0';
  protected readonly auth = inject(AuthUiService);
  protected readonly cart = inject(CartUiService);
  protected readonly catalog = inject(CatalogUiService);
  protected readonly i18n = inject(I18nLoader);
  protected readonly theme = inject(ThemeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  protected readonly meteors = Array.from({ length: 18 }, (_, index) => index);
  protected readonly cartCount = computed(() => this.cart.cart()?.item_count ?? 0);
  protected readonly shellWarning = signal('');
  protected readonly mobileNavOpen = signal(false);
  protected readonly supportedCurrencies = SUPPORTED_DISPLAY_CURRENCIES;
  protected readonly activeDisplayCurrency = signal(getGlobalDisplayCurrency());

  ngOnInit(): void {
    this.theme.init();
    this.i18n.resolveFromPath(globalThis.location?.pathname ?? '/th');

    if (typeof localStorage !== 'undefined' && !localStorage.getItem('kpb_display_currency')) {
      const autoCurr = detectCurrencyFromLocale(this.i18n.locale());
      setGlobalDisplayCurrency(autoCurr);
      this.activeDisplayCurrency.set(autoCurr);
    }

    void this.loadShellState();
    void this.catalog.getFxRates();
  }

  protected onCurrencyChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target?.value) {
      setGlobalDisplayCurrency(target.value);
      this.activeDisplayCurrency.set(target.value);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kpb:currency-changed', { detail: { currency: target.value } }));
      }
    }
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected themeLabel(): string {
    return this.theme.theme() === 'dark' ? this.i18n.t('shell.lightTheme') : this.i18n.t('shell.darkTheme');
  }

  protected toggleMobileNav(): void {
    this.mobileNavOpen.update((open) => !open);
  }

  protected closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    this.closeMobileNav();
    await this.router.navigateByUrl(this.i18n.localePath(''));
  }

  private async loadShellState(): Promise<void> {
    void this.catalog.config().then((cfg) => {
      if (cfg.baseCurrency) setGlobalBaseCurrency(cfg.baseCurrency);
    }).catch(() => {});

    const authResult = await this.auth.hydrate().then(() => true, () => false);
    if (!authResult) this.shellWarning.set(this.i18n.t('shell.sessionWarning'));
    if (!isPlatformBrowser(this.platformId)) return;

    await this.cart.load().catch(() => {
      this.shellWarning.set(this.i18n.t('shell.cartWarning'));
    });
  }
}
