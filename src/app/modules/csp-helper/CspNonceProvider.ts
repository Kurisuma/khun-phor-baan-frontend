import { inject, Injectable } from '@angular/core';
import { KPB_CSP_NONCE } from '../../contracts/runtime-tokens';

@Injectable({ providedIn: 'root' })
export class CspNonceProvider {
  public readonly version = '1.0.0';
  private readonly nonce = inject(KPB_CSP_NONCE);

  getNonce(): string {
    return this.nonce;
  }
}
