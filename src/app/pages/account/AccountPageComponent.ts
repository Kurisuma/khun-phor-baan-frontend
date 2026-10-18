import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import QRCode from 'qrcode';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { AccountUiService } from '../../services/account-ui/AccountUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { UserProfile } from '../../contracts/api-contract';
import { apiErrorMessage } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-account-page',
  imports: [NgIf, ReactiveFormsModule],
  template: `
    <section class="page-heading"><p class="eyebrow">{{ i18n.t('account.title') }}</p><h1>{{ i18n.t('nav.account') }}</h1></section>
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <section class="content-grid">
      <article class="panel">
        <h2>{{ i18n.t('account.profile') }}</h2>
        <form class="stack" [formGroup]="profileForm" (ngSubmit)="saveProfile()">
          <label><span>{{ i18n.t('account.name') }}</span><input formControlName="name"></label>
          <label><span>{{ i18n.t('account.locale') }}</span><select formControlName="locale"><option value="th">TH</option><option value="en">EN</option></select></label>
          <label class="check-row"><input type="checkbox" formControlName="marketing_opt_in"> {{ i18n.t('account.marketingOptIn') }}</label>
          <button class="btn btn-primary" type="submit">{{ i18n.t('common.save') }}</button>
        </form>
      </article>

      <article class="panel">
        <h2>{{ i18n.t('account.security') }}</h2>
        <form class="stack" [formGroup]="passwordForm" (ngSubmit)="changePassword()">
          <input formControlName="current_password" type="password" autocomplete="current-password" [placeholder]="i18n.t('account.currentPassword')">
          <input formControlName="new_password" type="password" autocomplete="new-password" [placeholder]="i18n.t('account.newPassword')">
          <button class="btn btn-secondary" type="submit">{{ i18n.t('account.changePassword') }}</button>
        </form>
        <button class="btn btn-secondary" type="button" (click)="setupMfa()">{{ i18n.t('account.setupMfa') }}</button>
        <div class="qr-panel" *ngIf="mfaQr()"><img [src]="mfaQr()" alt="MFA QR Code"></div>
        <button class="btn btn-secondary" type="button" *ngIf="mfaManualEntryKey()" (click)="copyMfaSecret()">{{ i18n.t('common.copy') }}</button>
        <form class="stack" [formGroup]="mfaVerifyForm" (ngSubmit)="verifyMfa()">
          <input formControlName="code" inputmode="numeric" autocomplete="one-time-code" [placeholder]="i18n.t('account.mfaCode')">
          <button class="btn btn-secondary" type="submit">{{ i18n.t('account.verifyMfa') }}</button>
        </form>
      </article>

      <article class="panel danger-panel">
        <h2>{{ i18n.t('account.sessionRetention') }}</h2>
        <button class="btn btn-secondary" type="button" (click)="logout()">{{ i18n.t('auth.logout') }}</button>
        <button class="btn btn-danger" type="button" (click)="deleteRequest()">{{ i18n.t('account.requestDeletion') }}</button>
      </article>
    </section>
  `,
})
export class AccountPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.1.2';
  protected readonly i18n = inject(I18nLoader);
  private readonly auth = inject(AuthUiService);
  private readonly account = inject(AccountUiService);
  private readonly seo = inject(SeoService);
  private readonly fb = inject(FormBuilder);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly mfaQr = signal('');
  protected readonly mfaManualEntryKey = signal('');
  protected readonly profileForm = this.fb.group({ name: [''], locale: ['th'], marketing_opt_in: [false] });
  protected readonly passwordForm = this.fb.group({ current_password: ['', Validators.required], new_password: ['', Validators.required] });
  protected readonly mfaVerifyForm = this.fb.group({ code: ['', Validators.required] });

  async ngOnInit(): Promise<void> {
    this.seo.setPage({ title: this.i18n.t('account.title'), description: this.i18n.t('account.description'), path: `/${this.i18n.currentLocale()}/account`, noindex: true });
    try {
      const profile = await this.account.profile();
      this.profile.set(profile);
      this.profileForm.patchValue({ name: profile.name, locale: profile.locale, marketing_opt_in: profile.marketing_opt_in });
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  ngOnDestroy(): void {
    this.clearSensitiveForms();
  }

  protected async saveProfile(): Promise<void> {
    try {
      await this.account.updateProfile(this.profileForm.getRawValue() as { name?: string; locale?: 'th' | 'en'; marketing_opt_in?: boolean });
      this.message.set(this.i18n.t('account.profileSaved'));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async changePassword(): Promise<void> {
    try {
      const step = await this.auth.stepUp(this.passwordForm.getRawValue().current_password ?? '');
      await this.account.changePassword(this.passwordForm.getRawValue() as { current_password: string; new_password: string }, step.step_up_token);
      this.clearSensitiveForms();
      this.message.set(this.i18n.t('account.passwordUpdated'));
    } catch (error) {
      this.clearSensitiveForms();
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async setupMfa(): Promise<void> {
    const result = await this.auth.mfaSetup();
    this.mfaManualEntryKey.set(result.manual_entry_key ?? '');
    const url = result.otpauth_url ?? result.qr_code_svg ?? '';
    if (url.startsWith('data:image')) {
      this.mfaQr.set(url);
    } else {
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 200 });
      this.mfaQr.set(dataUrl);
    }
  }

  protected async verifyMfa(): Promise<void> {
    await this.auth.mfaVerify(this.mfaVerifyForm.getRawValue().code ?? '');
    this.message.set(this.i18n.t('account.mfaVerified'));
  }

  protected async copyMfaSecret(): Promise<void> {
    const value = this.mfaManualEntryKey();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.message.set(this.i18n.t('account.mfaSecretCopied'));
    } catch {
      this.error.set(this.i18n.t('account.mfaSecretCopyFailed'));
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }

  protected async deleteRequest(): Promise<void> {
    try {
      const step = await this.auth.stepUp(this.passwordForm.getRawValue().current_password ?? '');
      await this.account.requestDeletion(step.step_up_token);
      this.clearSensitiveForms();
      this.message.set(this.i18n.t('account.deletionAccepted'));
    } catch (error) {
      this.clearSensitiveForms();
      this.error.set(apiErrorMessage(error));
    }
  }

  private clearSensitiveForms(): void {
    this.passwordForm.reset({ current_password: '', new_password: '' });
    this.mfaVerifyForm.reset({ code: '' });
  }
}
