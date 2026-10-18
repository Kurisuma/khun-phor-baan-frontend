import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../modules/http-client/ApiClient';
import type { HealthStatus } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class HealthUiService {
  public readonly version = '1.0.0';
  private readonly api = inject(ApiClient);

  health(): Promise<HealthStatus> {
    return this.api.getRoot('/health');
  }

  ready(): Promise<HealthStatus> {
    return this.api.getRoot('/ready');
  }
}
