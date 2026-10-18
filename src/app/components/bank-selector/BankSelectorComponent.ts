import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { BankUiService } from '../../services/bank-ui/BankUiService';
import type { AvailableBank } from '../../contracts/api-contract';
import { apiErrorMessage } from '../../pages/presentation';

@Component({
  standalone: true,
  selector: 'kpb-bank-selector',
  imports: [NgFor, NgIf, ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BankSelectorComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bank-selector">
      <label>
        <span>{{ i18n.t('payment.selectBank') }}</span>
        <select
          [value]="value()"
          [disabled]="disabled() || loading() || banks().length === 0"
          required
          (blur)="onTouched()"
          (change)="onSelectionChange($event)"
        >
          <option value="">{{ placeholderLabel() }}</option>
          <option *ngFor="let bank of banks(); trackBy: trackByBankCode" [value]="bank.code">
            {{ bank.display_label || bank.name }}
          </option>
        </select>
      </label>
      <p class="muted" *ngIf="loading()">{{ i18n.t('payment.loadingBanks') }}</p>
      <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
      <button class="btn btn-secondary" type="button" *ngIf="error()" [disabled]="loading()" (click)="reload()">{{ i18n.t('common.retry') }}</button>
    </div>
  `,
})
export class BankSelectorComponent implements OnInit, ControlValueAccessor {
  public readonly version = '1.0.0';
  protected readonly i18n = inject(I18nLoader);
  private readonly bankApi = inject(BankUiService);
  protected readonly banks = signal<AvailableBank[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly disabled = signal(false);
  protected readonly value = signal('');
  private changeFn: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  ngOnInit(): void {
    void this.loadBanks(false);
  }

  writeValue(value: string | null): void {
    this.value.set(String(value ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onSelectionChange(event: Event): void {
    const selected = event.target instanceof HTMLSelectElement ? event.target.value : '';
    this.value.set(selected);
    this.changeFn(selected);
  }

  protected reload(): void {
    void this.loadBanks(true);
  }

  protected placeholderLabel(): string {
    if (this.loading()) return this.i18n.t('payment.loadingBanks');
    if (!this.loading() && this.banks().length === 0) return this.i18n.t('payment.noBanksAvailable');
    return this.i18n.t('payment.chooseBank');
  }

  protected trackByBankCode(_index: number, bank: AvailableBank): string {
    return bank.code;
  }

  private async loadBanks(forceRefresh: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.banks.set(await this.bankApi.listAvailableBanks(forceRefresh));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.banks.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
