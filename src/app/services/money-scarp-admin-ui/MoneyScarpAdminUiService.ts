import { inject, Injectable } from '@angular/core';
import { AdminUiService } from '../admin-ui/AdminUiService';
import type { AdminListOptions } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class MoneyScarpAdminUiService {
  public readonly version = '1.0.0';
  private readonly admin = inject(AdminUiService);

  listBankAccounts(opts: AdminListOptions = {}): Promise<unknown> {
    return this.admin.listPaymentMethods({ ...opts, gateway: 'MONEY_SCARP' });
  }

  createBankAccount(body: Record<string, unknown>): Promise<unknown> {
    return this.admin.createPaymentMethod(this.withGateway(body));
  }

  updateBankAccount(id: string, body: Record<string, unknown>): Promise<unknown> {
    return this.admin.updatePaymentMethod(id, this.withGateway(body));
  }

  toggleBankAccount(id: string, body: { is_active: boolean }): Promise<unknown> {
    return this.admin.togglePaymentMethod(id, body);
  }

  deleteBankAccount(id: string): Promise<void> {
    return this.admin.deletePaymentMethod(id);
  }

  private withGateway(body: Record<string, unknown>): Record<string, unknown> {
    return { ...body, gateway: 'MONEY_SCARP' };
  }
}
