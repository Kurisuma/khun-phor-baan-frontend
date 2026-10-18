import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { ApiEnvelope, MediaUploadIntent } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class MediaUiService {
  public readonly version = '1.2.0';
  private readonly api = inject(ApiClient);

  async createUpload(body: { filename: string; mime: string; byte_size: number; purpose: string }): Promise<MediaUploadIntent> {
    return this.api.unwrap(await this.api.post<ApiEnvelope<MediaUploadIntent> | MediaUploadIntent>('/media/uploads', body));
  }

  async completeUpload(media_id: string, body: { sha256?: string; payload_hash?: string; byte_size?: number; upload_token: string }): Promise<void> {
    await this.api.post(`/media/uploads/${encodeURIComponent(media_id)}/complete`, body);
  }

  async resolve(media_id: string): Promise<{ url: string; expires_at?: string }> {
    const response = this.api.unwrap(await this.api.get<ApiEnvelope<unknown> | unknown>(`/media/${encodeURIComponent(media_id)}`));
    const media = this.record(this.record(response)['media'] ?? response);
    return {
      url: String(media['public_url'] ?? media['url'] ?? ''),
      expires_at: media['expires_at'] === undefined ? undefined : String(media['expires_at']),
    };
  }

  async uploadFile(file: File, purpose = 'product_image'): Promise<{ media_id: string; url: string }> {
    const intent = await this.createUpload({
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      byte_size: file.size,
      purpose,
    });
    const mediaId = String(intent.media_id);
    const bytes = await file.arrayBuffer();
    const response = await fetch(this.uploadUrl(intent.presigned_put_url), {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: bytes,
      credentials: this.isApiUploadUrl(intent.presigned_put_url) ? 'include' : 'omit',
    });
    if (!response.ok) throw new Error(`Upload failed with HTTP ${response.status}.`);

    const sha256 = await this.sha256(bytes);
    await this.completeUpload(mediaId, { sha256, upload_token: intent.upload_token });
    const resolved = await this.resolve(mediaId);
    return { media_id: mediaId, url: resolved.url };
  }

  private async sha256(bytes: ArrayBuffer): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private static readonly ALLOWED_STORAGE_HOSTS = new Set([
    's3.amazonaws.com',
    'minio.internal.khunphorbaan.com',
  ]);

  private uploadUrl(value: string): string {
    try {
      const parsed = new URL(value);
      if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) && parsed.pathname.startsWith('/api/')) {
        return value;
      }
      if (!MediaUiService.ALLOWED_STORAGE_HOSTS.has(parsed.hostname)) {
        throw new Error(`Presigned upload URL hostname "${parsed.hostname}" is not in storage allowlist`);
      }
      return value;
    } catch (err) {
      throw new Error('Invalid presigned upload URL');
    }
  }

  private isApiUploadUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) && parsed.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  }
}
