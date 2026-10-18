import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TrueMoneyAdminUiService {
  public readonly version = '1.0.0';
  public readonly gatewayCode = 'TRUEMONEY';

  isAvailable(): boolean {
    return false;
  }
}
