import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { ApiLocale, UserProfile } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class AccountUiService {
  public readonly version = '1.1.0';
  private readonly api = inject(ApiClient);

  async profile(): Promise<UserProfile> {
    return this.toProfile(this.envelopeData(await this.api.get<unknown>('/users/me')));
  }

  async updateProfile(body: { name?: string; locale?: ApiLocale; marketing_opt_in?: boolean }): Promise<UserProfile> {
    return this.toProfile(this.envelopeData(await this.api.patch<unknown>('/users/me', body)));
  }

  changePassword(body: { current_password: string; new_password: string }, stepUpToken?: string): Promise<void> {
    return this.api.post<void>('/users/me/password', body, { stepUpToken });
  }

  requestDeletion(stepUpToken?: string): Promise<void> {
    return this.api.post<void>('/users/me/delete-request', {}, { stepUpToken });
  }

  private toProfile(value: unknown): UserProfile {
    const response = this.record(value);
    const user = this.record(response['user'] ?? response);
    const userId = String(user['user_id'] ?? user['id'] ?? '');
    return {
      ...(user as Partial<UserProfile>),
      user_id: userId,
      email: String(user['email'] ?? ''),
      name: String(user['name'] ?? user['email'] ?? ''),
      locale: user['locale'] === 'en' ? 'en' : 'th',
      email_verified: Boolean(user['email_verified'] ?? user['status'] === 'ACTIVE'),
      mfa_enabled: Boolean(user['mfa_enabled']),
      marketing_opt_in: Boolean(user['marketing_opt_in']),
      created_at: String(user['created_at'] ?? ''),
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
