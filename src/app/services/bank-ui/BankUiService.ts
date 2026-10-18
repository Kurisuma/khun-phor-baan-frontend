import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { AvailableBank } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class BankUiService {
  public readonly version = '1.0.0';
  private readonly api = inject(ApiClient);
  private banksPromise: Promise<AvailableBank[]> | null = null;

  listAvailableBanks(forceRefresh = false): Promise<AvailableBank[]> {
    if (!this.banksPromise || forceRefresh) {
      this.banksPromise = this.fetchAvailableBanks();
    }
    return this.banksPromise;
  }

  private async fetchAvailableBanks(): Promise<AvailableBank[]> {
    const response = this.record(this.envelopeData(await this.api.get<unknown>('/deposits/banks')));
    const banks = Array.isArray(response['banks']) ? response['banks'] : [];
    return banks.map((item) => this.toBank(item)).filter((bank) => bank.code && bank.name);
  }

  private toBank(value: unknown): AvailableBank {
    const bank = this.record(value);
    return {
      code: String(bank['code'] ?? '').toLocaleUpperCase('en-US'),
      name: String(bank['name'] ?? ''),
      display_label: String(bank['display_label'] ?? bank['name'] ?? ''),
      priority: Number(bank['priority'] ?? 0),
    };
  }

  private envelopeData(value: unknown): unknown {
    const response = this.record(value);
    return 'data' in response && ('code' in response || 'request_id' in response) ? response['data'] : value;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }
}
