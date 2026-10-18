import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PaypalAdminUiService {
  public readonly version = '1.0.0';
  public readonly gatewayCode = 'PAYPAL';

  isAvailable(): boolean {
    return false;
  }
}
