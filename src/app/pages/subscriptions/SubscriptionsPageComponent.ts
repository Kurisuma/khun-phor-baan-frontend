import { KeyValuePipe, NgFor, NgIf, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { SubscriptionUiService } from '../../services/subscription-ui/SubscriptionUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import type { SubscriptionSlot, VaultCredentials } from '../../contracts/api-contract';
import { apiErrorMessage } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-subscriptions-page',
  imports: [KeyValuePipe, NgFor, NgIf, ReactiveFormsModule],
  template: `
    <section class="page-heading subscriptions-heading">
      <p class="eyebrow">{{ i18n.t('subscriptions.eyebrow') }}</p>
      <h1>{{ i18n.t('subscriptions.title') }}</h1>
    </section>
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>

    <section class="subscription-summary" *ngIf="slots().length">
      <div>
        <strong>{{ activeCount() }}</strong>
        <span>{{ i18n.t('subscriptions.activeSlots') }}</span>
      </div>
      <div>
        <strong>{{ revealableCount() }}</strong>
        <span>{{ i18n.t('subscriptions.vaultReady') }}</span>
      </div>
      <div>
        <strong>{{ renewalSoonCount() }}</strong>
        <span>{{ i18n.t('subscriptions.endingSoon') }}</span>
      </div>
    </section>

    <section class="subscription-layout">
      <article class="panel subscription-list-panel">
        <div class="panel-heading">
          <h2>{{ i18n.t('subscriptions.yourSlots') }}</h2>
          <span class="pill">{{ slots().length }}</span>
        </div>
        <div class="list" *ngIf="slots().length; else noSlots">
          <button
            class="subscription-row as-button"
            *ngFor="let slot of slots()"
            type="button"
            [class.is-selected]="selected()?.slot_id === slot.slot_id"
            (click)="select(slot.slot_id)"
          >
            <span class="subscription-row-main">
              <strong>{{ slot.product_name }}</strong>
              <span>{{ slotStatusText(slot) }} - {{ daysText(slot) }}</span>
            </span>
            <span class="subscription-row-meta">
              <span class="pill" [class.pill-muted]="slot.status !== 'ACTIVE'">{{ slot.status }}</span>
              <small>{{ i18n.t('subscriptions.slot', { id: slot.slot_id }) }}</small>
            </span>
          </button>
        </div>
        <ng-template #noSlots>
          <div class="empty-state">
            <strong>{{ i18n.t('subscriptions.noSlotsTitle') }}</strong>
            <span>{{ i18n.t('subscriptions.noSlotsHint') }}</span>
          </div>
        </ng-template>
      </article>

      <article class="panel subscription-detail-panel" *ngIf="selected() as slot; else chooseSlot">
        <div class="subscription-title">
          <div>
            <p class="eyebrow">{{ i18n.t('subscriptions.slot', { id: slot.slot_id }) }}</p>
            <h2>{{ slot.product_name }}</h2>
          </div>
          <span class="pill" [class.pill-muted]="slot.status !== 'ACTIVE'">{{ slot.status }}</span>
        </div>

        <div class="subscription-meta-grid">
          <div>
            <span>{{ i18n.t('subscriptions.accessEnds') }}</span>
            <strong>{{ formatDate(slot.expires_at) }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('subscriptions.remaining') }}</span>
            <strong>{{ daysText(slot) }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('subscriptions.vault') }}</span>
            <strong>{{ slot.vault_reveal_available ? i18n.t('subscriptions.ready') : i18n.t('subscriptions.unavailable') }}</strong>
          </div>
          <div>
            <span>{{ i18n.t('subscriptions.product') }}</span>
            <strong>{{ slot.product_slug || slot.product_id }}</strong>
          </div>
        </div>

        <form class="subscription-reveal-form" [formGroup]="revealForm" (ngSubmit)="reveal(slot.slot_id)">
          <div class="form-grid">
            <label>
              <span>{{ i18n.t('subscriptions.password') }}</span>
              <input formControlName="password" type="password" autocomplete="current-password">
            </label>
            <label>
              <span>{{ i18n.t('subscriptions.reason') }}</span>
              <input formControlName="reason" autocomplete="off">
            </label>
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="!slot.vault_reveal_available || revealBusy()">
            {{ revealBusy() ? i18n.t('subscriptions.revealing') : i18n.t('subscriptions.revealCredential') }}
          </button>
        </form>

        <div class="credential-box subscription-secret" *ngIf="credentials() as secret">
          <div class="panel-heading">
            <h3>{{ i18n.t('subscriptions.credential') }}</h3>
            <button class="btn btn-secondary" type="button" (click)="copyCredential(secret)">{{ i18n.t('common.copy') }}</button>
          </div>
          <p class="alert alert-warning">{{ i18n.t('subscriptions.visibleWarning') }}</p>
          <dl>
            <ng-container *ngFor="let item of secret.credentials | keyvalue">
              <dt>{{ credentialLabel(item.key) }}</dt>
              <dd>{{ item.value }}</dd>
            </ng-container>
          </dl>
          <small>{{ i18n.t('subscriptions.revealedAt', { date: formatDateTime(secret.revealed_at) }) }}</small>
        </div>
      </article>
      <ng-template #chooseSlot>
        <article class="panel subscription-detail-panel empty-state">
          <strong>{{ i18n.t('subscriptions.selectSlot') }}</strong>
          <span>{{ i18n.t('subscriptions.selectSlotHint') }}</span>
        </article>
      </ng-template>
    </section>
  `,
})
export class SubscriptionsPageComponent implements OnInit, OnDestroy {
  public readonly version = '1.2.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly auth = inject(AuthUiService);
  private readonly subscriptions = inject(SubscriptionUiService);
  private readonly seo = inject(SeoService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly slots = signal<SubscriptionSlot[]>([]);
  protected readonly selected = signal<SubscriptionSlot | null>(null);
  protected readonly credentials = signal<VaultCredentials | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly revealBusy = signal(false);
  protected readonly revealForm = this.fb.group({ password: ['', Validators.required], reason: ['user_requested', Validators.required] });
  private credentialsTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly boundClear = (): void => { this.credentials.set(null); };

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      globalThis.addEventListener('beforeunload', this.boundClear);
    }
    this.seo.setPage({ title: this.i18n.t('subscriptions.title'), description: this.i18n.t('subscriptions.description'), path: `/${this.i18n.currentLocale()}/subscriptions`, noindex: true });
    try {
      const slots = (await this.subscriptions.list()).data;
      this.slots.set(slots);
      const first = slots[0];
      if (first) await this.select(first.slot_id);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  ngOnDestroy(): void {
    this.credentials.set(null);
    this.revealForm.patchValue({ password: '' });
    if (this.credentialsTimer) clearTimeout(this.credentialsTimer);
    if (isPlatformBrowser(this.platformId)) {
      globalThis.removeEventListener('beforeunload', this.boundClear);
    }
  }

  protected async select(slotId: string): Promise<void> {
    this.error.set('');
    this.message.set('');
    this.credentials.set(null);
    try {
      this.selected.set(await this.subscriptions.detail(slotId));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async reveal(slotId: string): Promise<void> {
    if (this.revealBusy()) return;
    this.error.set('');
    this.message.set('');
    this.revealBusy.set(true);
    try {
      const raw = this.revealForm.getRawValue();
      const step = await this.auth.stepUp(raw.password ?? '');
      this.credentials.set(await this.subscriptions.reveal(slotId, step.step_up_token, raw.reason ?? 'user_requested'));
      this.message.set(this.i18n.t('subscriptions.credentialRevealed'));
      this.revealForm.patchValue({ password: '' });
      if (this.credentialsTimer) clearTimeout(this.credentialsTimer);
      this.credentialsTimer = setTimeout(() => {
        this.credentials.set(null);
        this.message.set('');
      }, 60_000);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.revealBusy.set(false);
    }
  }

  protected activeCount(): number {
    return this.slots().filter((slot) => slot.status === 'ACTIVE').length;
  }

  protected revealableCount(): number {
    return this.slots().filter((slot) => slot.vault_reveal_available).length;
  }

  protected renewalSoonCount(): number {
    return this.slots().filter((slot) => slot.status === 'ACTIVE' && slot.days_remaining <= 7).length;
  }

  protected slotStatusText(slot: SubscriptionSlot): string {
    if (slot.status === 'EXPIRED') return this.i18n.t('subscriptions.expired');
    if (slot.status === 'SUSPENDED') return this.i18n.t('subscriptions.suspended');
    return this.i18n.t('subscriptions.activeAccess');
  }

  protected daysText(slot: SubscriptionSlot): string {
    if (slot.status === 'EXPIRED') return this.i18n.t('subscriptions.expired');
    const days = Math.max(0, Math.floor(slot.days_remaining));
    return days === 1 ? this.i18n.t('subscriptions.dayLeft') : this.i18n.t('subscriptions.daysLeft', { count: days });
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return this.i18n.t('common.notSet');
    return new Intl.DateTimeFormat(this.localeTag(), { dateStyle: 'medium' }).format(date);
  }

  protected formatDateTime(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(this.localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  protected credentialLabel(key: string): string {
    if (key === 'plaintext') return this.i18n.t('orders.accountAccess');
    return key.replace(/_/g, ' ');
  }

  protected async copyCredential(secret: VaultCredentials): Promise<void> {
    const value = Object.values(secret.credentials).join('\n');
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.message.set(this.i18n.t('subscriptions.credentialCopied'));
    } catch {
      this.error.set(this.i18n.t('subscriptions.copyFailed'));
    }
  }

  private localeTag(): string {
    return this.i18n.currentLocale() === 'th' ? 'th-TH' : 'en-US';
  }
}
