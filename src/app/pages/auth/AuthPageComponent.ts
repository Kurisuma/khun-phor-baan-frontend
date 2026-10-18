import { NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { CartUiService } from '../../services/cart-ui/CartUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { FormValidators } from '../../modules/form-validator/FormValidators';
import { apiErrorMessage } from '../presentation';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

@Component({
  standalone: true,
  selector: 'kpb-auth-page',
  imports: [NgIf, NgSwitch, NgSwitchCase, ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-wrap">
      <article class="panel auth-panel">
        <p class="eyebrow">{{ i18n.t('auth.identity') }}</p>
        <h1>{{ title() }}</h1>
        <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
        <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <ng-container [ngSwitch]="mode()">
            <label *ngSwitchCase="'register'"><span>{{ i18n.t('auth.name') }}</span><input formControlName="name" autocomplete="name"></label>
            <label *ngSwitchCase="'verify'"><span>{{ i18n.t('auth.token') }}</span><input formControlName="token" autocomplete="one-time-code"></label>
            <label *ngSwitchCase="'reset'"><span>{{ i18n.t('auth.token') }}</span><input formControlName="token" autocomplete="one-time-code"></label>
          </ng-container>

          <label *ngIf="mode() !== 'verify' && mode() !== 'reset'"><span>{{ i18n.t('auth.email') }}</span><input formControlName="email" type="email" autocomplete="email"></label>
          <label *ngIf="mode() === 'login' || mode() === 'register'"><span>{{ i18n.t('auth.password') }}</span><input formControlName="password" type="password" [autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"></label>
          <label *ngIf="mode() === 'reset'"><span>{{ i18n.t('auth.password') }}</span><input formControlName="password" type="password" autocomplete="new-password"></label>
          <label *ngIf="mode() === 'login' && pendingMfa()"><span>{{ i18n.t('auth.mfa') }}</span><input formControlName="mfa" inputmode="numeric" autocomplete="one-time-code"></label>

          <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ busy() ? i18n.t('common.loading') : i18n.t('common.submit') }}</button>
        </form>

        <div class="inline-links">
          <a [routerLink]="i18n.localePath('login')">{{ i18n.t('auth.login') }}</a>
          <a [routerLink]="i18n.localePath('register')">{{ i18n.t('auth.register') }}</a>
          <a [routerLink]="i18n.localePath('forgot-password')">{{ i18n.t('auth.forgot') }}</a>
        </div>
      </article>
    </section>
  `,
})
export class AuthPageComponent implements OnInit {
  public readonly version = '1.1.1';
  protected readonly i18n = inject(I18nLoader);
  private readonly auth = inject(AuthUiService);
  private readonly cart = inject(CartUiService);
  private readonly seo = inject(SeoService);
  private readonly validators = inject(FormValidators);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly mode = signal<AuthMode>('login');
  protected readonly pendingMfa = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly form = this.fb.group({
    email: ['', this.validators.email],
    password: ['', this.validators.password],
    name: [''],
    token: [''],
    mfa: [''],
  });

  async ngOnInit(): Promise<void> {
    const mode = this.route.snapshot.data['mode'] as AuthMode | undefined;
    this.mode.set(mode ?? 'login');
    this.form.patchValue({ token: this.route.snapshot.queryParamMap.get('token') ?? '' });
    this.seo.setPage({
      title: this.title(),
      description: this.i18n.t('auth.seoDescription'),
      path: `/${this.i18n.currentLocale()}/${this.mode()}`,
      noindex: true,
    });
    await this.auth.hydrate();
    if (this.auth.authenticated() && (this.mode() === 'login' || this.mode() === 'register')) {
      await this.navigateAfterAuth();
    }
  }

  protected title(): string {
    return this.i18n.t(`auth.${this.mode()}`);
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    this.message.set('');
    this.busy.set(true);
    const value = this.form.getRawValue();
    try {
      switch (this.mode()) {
        case 'register':
          await this.auth.register({ email: value.email ?? '', password: value.password ?? '', name: value.name ?? '', locale: this.i18n.currentLocale() });
          this.message.set(this.i18n.t('auth.registered'));
          break;
        case 'verify':
          await this.auth.verifyEmail(value.token ?? '');
          this.message.set(this.i18n.t('auth.verified'));
          break;
        case 'forgot':
          await this.auth.passwordForgot(value.email ?? '');
          this.message.set(this.i18n.t('auth.forgotAccepted'));
          break;
        case 'reset':
          await this.auth.passwordReset(value.token ?? '', value.password ?? '');
          this.message.set(this.i18n.t('auth.resetComplete'));
          break;
        default:
          if (this.pendingMfa()) {
            await this.auth.loginMfa(value.mfa ?? '');
            await this.afterAuthenticated();
            return;
          }
          const result = await this.auth.login(value.email ?? '', value.password ?? '');
          if (result.mfa_required) {
            this.pendingMfa.set(true);
            this.message.set(this.i18n.t('auth.mfaRequired'));
            return;
          }
          await this.afterAuthenticated();
      }
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async afterAuthenticated(): Promise<void> {
    await this.cart.merge().catch(() => undefined);
    await this.navigateAfterAuth();
  }

  private navigateAfterAuth(): Promise<boolean> {
    return this.router.navigateByUrl(this.safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo')));
  }

  private safeReturnTo(value: string | null): string {
    const fallback = this.i18n.localePath('account');
    if (!value) return fallback;
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('://') ? value : fallback;
  }
}
