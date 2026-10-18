import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { I18nLoader } from '../i18n-loader/I18nLoader';
import { KPB_API_BASE_URL, KPB_REQUEST_HEADERS } from '../../contracts/runtime-tokens';
import type { ApiEnvelope, ApiProblem } from '../../contracts/api-contract';

export interface ApiRequestOptions {
  idempotencyKey?: string;
  stepUpToken?: string;
  skipRefresh?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [200, 500, 1000];

@Injectable({ providedIn: 'root' })
export class ApiClient {
  public readonly version = '1.0.2';

  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nLoader);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly baseUrl = inject(KPB_API_BASE_URL);
  private readonly requestHeaders = inject(KPB_REQUEST_HEADERS);
  private refreshPromise: Promise<void> | null = null;

  async request<T>(method: string, path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> {
    const upper = method.toUpperCase();
    const idempotencyKey = upper === 'GET' ? undefined : options.idempotencyKey ?? this.uuidV7();
    const response = await this.sendWithPolicy<T>(upper, path, body, options, idempotencyKey, 0);
    return response.body as T;
  }

  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async getRoot<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await this.sendRoot<T>('GET', path, options);
    return response.body as T;
  }

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  put<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  unwrap<T>(value: ApiEnvelope<T> | T): T {
    if (this.isEnvelope<T>(value)) return value.data;
    return value;
  }

  private async sendWithPolicy<T>(
    method: string,
    path: string,
    body: unknown,
    options: ApiRequestOptions,
    idempotencyKey: string | undefined,
    attempt: number,
  ): Promise<HttpResponse<T>> {
    try {
      return await this.send<T>(method, path, body, options, idempotencyKey);
    } catch (error) {
      const problem = this.normalizeError(error, path);

      if (problem.status === 401 && problem.code === 'auth_required' && !options.skipRefresh) {
        await this.refreshOnce();
        return this.sendWithPolicy<T>(method, path, body, { ...options, skipRefresh: true }, idempotencyKey, attempt);
      }

      if (RETRYABLE_STATUSES.has(problem.status) && this.isRetryAllowed(method, idempotencyKey) && attempt < RETRY_DELAYS_MS.length) {
        await this.delay(RETRY_DELAYS_MS[attempt]);
        return this.sendWithPolicy<T>(method, path, body, options, idempotencyKey, attempt + 1);
      }

      throw problem;
    }
  }

  private send<T>(
    method: string,
    path: string,
    body: unknown,
    options: ApiRequestOptions,
    idempotencyKey: string | undefined,
  ): Promise<HttpResponse<T>> {
    const headers = this.buildHeaders(method, options, idempotencyKey);
    return firstValueFrom(
      this.http.request<T>(method, this.urlFor(path), {
        body,
        headers,
        observe: 'response',
        responseType: 'json',
        withCredentials: true,
      }),
    );
  }

  private sendRoot<T>(method: string, path: string, options: ApiRequestOptions): Promise<HttpResponse<T>> {
    this.assertRelativeRootPath(path);
    const headers = new HttpHeaders({
      Accept: 'application/json',
      'Accept-Language': this.i18n.currentLocale(),
      ...options.headers,
    });
    const origin = this.ssrOrigin(path);
    const resolvedPath = origin ? `${origin}${path}` : path;
    return firstValueFrom(
      this.http.request<T>(method, resolvedPath, {
        headers,
        observe: 'response',
        responseType: 'json',
        withCredentials: true,
      }),
    ).catch((error) => {
      throw this.normalizeError(error, path);
    });
  }

  private buildHeaders(method: string, options: ApiRequestOptions, idempotencyKey: string | undefined): HttpHeaders {
    let headers = new HttpHeaders({
      Accept: 'application/json',
      'Accept-Language': this.i18n.currentLocale(),
      ...options.headers,
    });

    if (bodyMethod(method)) {
      headers = headers.set('Content-Type', 'application/json; charset=utf-8');
    }

    if (MUTATING_METHODS.has(method)) {
      const csrf = this.csrfToken();
      if (csrf) headers = headers.set('X-CSRF-Token', csrf);
    }

    if (idempotencyKey) {
      headers = headers.set('Idempotency-Key', idempotencyKey);
    }

    if (options.stepUpToken) {
      headers = headers.set('X-Step-Up-Token', options.stepUpToken);
    }

    const csrfForSsr = this.csrfToken();
    if (isPlatformServer(this.platformId) && csrfForSsr) {
      headers = headers.set('Cookie', `kpb_csrf=${encodeURIComponent(csrfForSsr)}`);
      headers = headers.set('X-CSRF-Token', csrfForSsr);
    }

    return headers;
  }

  private async refreshOnce(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.send<void>('POST', '/auth/refresh', undefined, { skipRefresh: true }, undefined)
        .then(() => undefined)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  private normalizeError(error: unknown, path: string): ApiProblem {
    if (this.isApiProblemLike(error)) {
      return {
        type: String(error.type ?? 'about:blank'),
        title: String(error.title ?? 'Request failed'),
        status: Number(error.status),
        code: String(error.code),
        detail: error.detail,
        instance: String(error.instance ?? path),
        request_id: String(error.request_id ?? ''),
        errors: error.errors,
        retry_after_ms: error.retry_after_ms,
      };
    }
    if (error instanceof HttpErrorResponse) {
      const retryAfter = Number(error.headers?.get('Retry-After'));
      const payload = typeof error.error === 'object' && error.error !== null
        ? error.error as Partial<ApiProblem>
        : {};
      return {
        type: String(payload.type ?? 'about:blank'),
        title: String(payload.title ?? error.statusText ?? 'Request failed'),
        status: Number(payload.status ?? error.status ?? 0),
        code: String(payload.code ?? (error.status === 0 ? 'network_error' : 'unknown_error')),
        detail: payload.detail,
        instance: String(payload.instance ?? path),
        request_id: String(payload.request_id ?? error.headers?.get('X-Request-Id') ?? ''),
        errors: payload.errors,
        retry_after_ms: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
      };
    }
    return {
      type: 'about:blank',
      title: 'Network error',
      status: 0,
      code: 'network_error',
      detail: 'Unable to reach the API.',
      instance: path,
      request_id: '',
    };
  }

  private ssrOrigin(path: string): string | null {
    if (!isPlatformServer(this.platformId)) {
      return null;
    }
    const origin = (globalThis as Record<string, unknown>)['process'] as { env?: Record<string, unknown> } | undefined;
    const originVal = origin?.env?.['KPB_API_ORIGIN'] ?? 'http://127.0.0.1:8088';
    const originStr = String(originVal);
    const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(originStr);
    if (!isLoopback && !/^https:\/\//.test(originStr)) {
      throw this.configurationError('KPB_API_ORIGIN must use HTTPS in production', path);
    }
    return originStr;
  }

  private urlFor(path: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
      throw this.apiProblem('invalid_url', 'Invalid URL', 400, 'Credentialed API calls require relative paths', path);
    }
    if (this.baseUrl.startsWith('/')) {
      const origin = this.ssrOrigin(path);
      if (origin) {
        return `${origin}${this.baseUrl}${path}`;
      }
    }
    return `${this.baseUrl}${path}`;
  }

  private csrfToken(): string {
    const cookieHeader = isPlatformBrowser(this.platformId)
      ? globalThis.document?.cookie ?? ''
      : this.headerValue('cookie') ?? '';
    return this.cookieValue(cookieHeader, 'kpb_csrf');
  }

  private headerValue(name: string): string | undefined {
    const raw = this.requestHeaders[name] ?? this.requestHeaders[name.toLowerCase()];
    return Array.isArray(raw) ? raw.join('; ') : raw;
  }

  private cookieValue(cookieHeader: string, name: string): string {
    const part = cookieHeader.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
    return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
  }

  private isRetryAllowed(method: string, idempotencyKey: string | undefined): boolean {
    return method === 'GET' || method === 'HEAD' || Boolean(idempotencyKey);
  }

  private isEnvelope<T>(value: ApiEnvelope<T> | T): value is ApiEnvelope<T> {
    return typeof value === 'object' && value !== null && 'data' in value;
  }

  private assertRelativeRootPath(path: string): void {
    const text = String(path ?? '');
    if (!text.startsWith('/') || text.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(text)) {
      throw this.apiProblem('invalid_url', 'Invalid URL', 400, 'sendRoot() accepts relative same-origin paths only', path);
    }
  }

  private configurationError(message: string, path: string): ApiProblem {
    return this.apiProblem('configuration_error', 'Server Configuration Error', 500, message, path);
  }

  private apiProblem(code: string, title: string, status: number, detail: string, path: string): ApiProblem {
    return {
      type: 'about:blank',
      title,
      status,
      code,
      detail,
      instance: path,
      request_id: '',
    };
  }

  private isApiProblemLike(error: unknown): error is Partial<ApiProblem> & { code: string; status: number } {
    if (typeof error !== 'object' || error === null) return false;
    const value = error as Record<string, unknown>;
    return typeof value['code'] === 'string' && typeof value['status'] === 'number';
  }

  private uuidV7(): string {
    const bytes = new Uint8Array(16);
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.getRandomValues) {
      throw new Error('crypto.getRandomValues is required — cannot generate idempotency key safely');
    }
    cryptoApi.getRandomValues(bytes);

    let timestamp = Date.now();
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = timestamp & 0xff;
      timestamp = Math.floor(timestamp / 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function bodyMethod(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT';
}
