import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { ApiEnvelope, AuthMe, LoginResult, MfaSetupResult, StepUpResult, UserMe, UserRole } from '../../contracts/api-contract';

export interface MfaRequiredResult {
  user_id: string | number;
  mfa_required: true;
}

@Injectable({ providedIn: 'root' })
export class AuthUiService {
  public readonly version = '1.1.1';

  private readonly api = inject(ApiClient);
  private readonly userSignal = signal<UserMe | null>(null);
  // Client-side role checks are for UX only. Backend RBAC remains authoritative.
  // If /auth/me is compromised, roles can be spoofed in this in-memory signal.
  private readonly rolesSignal = signal<UserRole[]>([]);
  private readonly initializedSignal = signal(false);

  public readonly user = this.userSignal.asReadonly();
  public readonly roles = this.rolesSignal.asReadonly();
  public readonly initialized = this.initializedSignal.asReadonly();
  public readonly authenticated = computed(() => this.userSignal() !== null);

  async hydrate(force = false): Promise<void> {
    if (this.initializedSignal() && !force) return;
    try {
      const me = this.api.unwrap(await this.api.get<ApiEnvelope<AuthMe> | AuthMe>('/auth/me'));
      this.setAuth(me.user, me.roles);
    } catch {
      this.setAuth(null, []);
    } finally {
      this.initializedSignal.set(true);
    }
  }

  async register(body: { email: string; password: string; name: string; locale?: string }): Promise<{ user_id: string }> {
    return this.api.unwrap(await this.api.post<ApiEnvelope<{ user_id: string }> | { user_id: string }>('/auth/register', body));
  }

  verifyEmail(token: string): Promise<void> {
    return this.api.post<void>('/auth/verify-email', { token });
  }

  async login(email: string, password: string): Promise<LoginResult | MfaRequiredResult> {
    const result = this.api.unwrap(await this.api.post<ApiEnvelope<LoginResult | MfaRequiredResult> | LoginResult | MfaRequiredResult>('/auth/login', {
      email,
      password,
    }));
    if (!result.mfa_required) this.setAuth(result.user, result.roles);
    return result;
  }

  async loginMfa(code: string): Promise<LoginResult> {
    const result = this.api.unwrap(await this.api.post<ApiEnvelope<LoginResult> | LoginResult>('/auth/login/mfa', { code }));
    this.setAuth(result.user, result.roles);
    return result;
  }

  refresh(): Promise<void> {
    return this.api.post<void>('/auth/refresh', undefined, { skipRefresh: true });
  }

  async logout(): Promise<void> {
    await this.api.post<void>('/auth/logout');
    this.setAuth(null, []);
  }

  passwordForgot(email: string): Promise<void> {
    return this.api.post<void>('/auth/password/forgot', { email });
  }

  passwordReset(token: string, new_password: string): Promise<void> {
    return this.api.post<void>('/auth/password/reset', { token, new_password });
  }

  async mfaSetup(): Promise<MfaSetupResult> {
    const response = this.api.unwrap(await this.api.post<ApiEnvelope<{ provisioning_uri?: string } & { otpauth_url?: string; qr_code_svg?: string; secret?: string }> | ({ provisioning_uri?: string; secret?: string } & { otpauth_url?: string; qr_code_svg?: string })>('/auth/mfa/setup', {}));
    const { secret: _secret, ...safe } = response as { otpauth_url?: string; qr_code_svg?: string; provisioning_uri?: string; secret?: string };
    void _secret;
    const otpauthUrl = safe.otpauth_url ?? safe.provisioning_uri ?? '';
    return {
      otpauth_url: otpauthUrl,
      qr_code_svg: safe.qr_code_svg,
      manual_entry_key: this.totpSecretFromUrl(otpauthUrl),
    };
  }

  mfaVerify(code: string): Promise<void> {
    return this.api.post<void>('/auth/mfa/verify', { code });
  }

  async stepUp(current_password: string): Promise<StepUpResult> {
    return this.api.unwrap(await this.api.post<ApiEnvelope<StepUpResult> | StepUpResult>('/auth/step-up', { current_password }));
  }

  isAdmin(): boolean {
    const roles = this.rolesSignal();
    return roles.includes('admin') || roles.includes('root');
  }

  private setAuth(user: UserMe | null, roles: UserRole[]): void {
    this.userSignal.set(user);
    this.rolesSignal.set(roles);
  }

  private totpSecretFromUrl(value: string): string | undefined {
    try {
      const url = new URL(value);
      const secret = url.searchParams.get('secret')?.trim();
      return secret || undefined;
    } catch {
      return undefined;
    }
  }
}
