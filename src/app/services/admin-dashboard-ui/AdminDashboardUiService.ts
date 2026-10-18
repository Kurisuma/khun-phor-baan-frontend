import { Injectable } from '@angular/core';

export type AdminDashboardRow = Record<string, unknown>;
export type AdminDashboardTone = 'good' | 'warn' | 'danger' | 'neutral';
export type AdminDashboardStatus = 'green' | 'yellow' | 'red';
export type AdminDashboardMetricKind = 'money' | 'number' | 'percent';
export type AdminDashboardTab =
  'catalog'
  | 'inventory'
  | 'orders'
  | 'payments'
  | 'subscriptions'
  | 'privilege'
  | 'reviews'
  | 'media'
  | 'audit';

export interface AdminDashboardInput {
  products: AdminDashboardRow[];
  inventory: AdminDashboardRow[];
  orders: AdminDashboardRow[];
  deposits: AdminDashboardRow[];
  subscriptions: AdminDashboardRow[];
  sharedAccountPools: AdminDashboardRow[];
  users: AdminDashboardRow[];
  reviews: AdminDashboardRow[];
  media: AdminDashboardRow[];
  auditLog: AdminDashboardRow[];
}

export interface AdminDashboardMetric {
  id: string;
  labelKey: string;
  detailKey: string;
  kind: AdminDashboardMetricKind;
  value: number;
  tone: AdminDashboardTone;
}

export interface AdminDashboardDepartment {
  id: string;
  labelKey: string;
  status: AdminDashboardStatus;
  primaryKey: string;
  primaryValue: number;
  detailKey: string;
  actionCount: number;
  tab: AdminDashboardTab;
}

export interface AdminDashboardAction {
  id: string;
  severity: Exclude<AdminDashboardTone, 'neutral'>;
  departmentKey: string;
  titleKey: string;
  count: number;
  detailKey: string;
  tab: AdminDashboardTab;
}

export interface AdminDashboardSeriesPoint {
  labelKey: string;
  value: number;
  tone: AdminDashboardTone;
}

export interface AdminDashboardSeries {
  id: string;
  titleKey: string;
  points: AdminDashboardSeriesPoint[];
}

export interface AdminDashboardSnapshot {
  executive: AdminDashboardMetric[];
  departments: AdminDashboardDepartment[];
  actions: AdminDashboardAction[];
  series: AdminDashboardSeries[];
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardUiService {
  public readonly version = '1.2.0';

  fromBackendSnapshot(value: unknown): AdminDashboardSnapshot | null {
    try {
      const snapshot = this.record(value);
      if (!this.isValidBackendSnapshot(snapshot)) return null;
      const executive = this.record(snapshot['executive']);
      if (!Object.keys(executive).length) return null;
      const departments = this.rows(snapshot, 'departments').map((row) => this.backendDepartment(row));
      const actions = this.rows(snapshot, 'actions').map((row) => this.backendAction(row)).filter((action) => action.count > 0);
      return {
        executive: [
          { id: 'gross-sales', labelKey: 'dashboardGrossSales', detailKey: 'dashboardGrossSalesDetail', kind: 'money', value: this.numberValue(executive['gross_order_value_cents']), tone: 'neutral' },
          { id: 'net-revenue', labelKey: 'dashboardNetRevenue', detailKey: 'dashboardNetRevenueDetail', kind: 'money', value: this.numberValue(executive['net_revenue_cents']), tone: this.numberValue(executive['net_revenue_cents']) > 0 ? 'good' : 'neutral' },
          { id: 'open-bills', labelKey: 'dashboardOpenBillValue', detailKey: 'dashboardOpenBillValueDetail', kind: 'money', value: this.numberValue(executive['open_bill_value_cents']), tone: this.numberValue(executive['open_bill_value_cents']) > 0 ? 'warn' : 'good' },
          { id: 'orders', labelKey: 'dashboardOrdersCreated', detailKey: 'dashboardOrdersCreatedDetail', kind: 'number', value: this.numberValue(executive['orders_created']), tone: 'neutral' },
          { id: 'conversion', labelKey: 'dashboardPaymentConversion', detailKey: 'dashboardPaymentConversionDetail', kind: 'percent', value: this.numberValue(executive['payment_conversion_rate']), tone: this.rateTone(this.numberValue(executive['payment_conversion_rate'])) },
          { id: 'critical-alerts', labelKey: 'dashboardCriticalAlerts', detailKey: 'dashboardCriticalAlertsDetail', kind: 'number', value: this.numberValue(executive['critical_alerts']), tone: this.numberValue(executive['critical_alerts']) > 0 ? 'danger' : 'good' },
        ],
        departments,
        actions: this.actions(actions),
        series: this.backendSeries(snapshot),
      };
    } catch (err) {
      console.warn('[security] admin dashboard snapshot parse failed:', err);
      return null;
    }
  }

  build(input: AdminDashboardInput): AdminDashboardSnapshot {
    const grossOrderValue = this.sumRows(input.orders, 'total_cents,amount_cents');
    const paidOrders = input.orders.filter((row) => this.isPaidOrder(row));
    const fulfilledOrders = input.orders.filter((row) => this.isFulfilled(row));
    const refundedOrders = input.orders.filter((row) => this.status(row, 'status,state') === 'REFUNDED');
    const paidRevenue = this.sumRows(paidOrders, 'total_cents,amount_cents');
    const refundValue = this.sumRows(refundedOrders, 'total_cents,amount_cents');
    const netRevenue = Math.max(0, paidRevenue - refundValue);
    const openDeposits = input.deposits.filter((row) => this.isOpenDeposit(row));
    const openBillValue = this.sumRows(openDeposits, 'unique_amount_cents,total_amount_cents,amount_cents');
    const conversionRate = this.rate(paidOrders.length, input.orders.length);

    const catalogRisks = this.catalogRiskCount(input.products);
    const outOfStock = input.inventory.filter((row) => this.availableUnits(row) <= 0).length;
    const lowStock = input.inventory.filter((row) => {
      const available = this.availableUnits(row);
      const threshold = this.number(row, 'low_stock_threshold');
      return available > 0 && threshold > 0 && available <= threshold;
    }).length;
    const paidUnfulfilled = paidOrders.filter((row) => !this.isFulfilled(row)).length;
    const pendingDeposits = openDeposits.length;
    const pendingReviews = input.reviews.filter((row) => this.isPending(row, 'status')).length;
    const lockedUsers = input.users.filter((row) => ['LOCKED', 'SUSPENDED'].includes(this.status(row, 'status'))).length;
    const subscriptionRisk = this.subscriptionRiskCount(input.sharedAccountPools);
    const securityEvents = input.auditLog.filter((row) => this.isSensitiveAudit(row)).length;
    const criticalAlerts = [
      outOfStock,
      paidUnfulfilled,
      pendingDeposits,
      subscriptionRisk,
      lockedUsers,
      securityEvents,
    ].filter((count) => count > 0).length;

    const actions = this.actions([
      { id: 'paid-unfulfilled', count: paidUnfulfilled, severity: 'danger', departmentKey: 'dashboardDeptOrders', titleKey: 'dashboardActionPaidUnfulfilled', detailKey: 'dashboardActionPaidUnfulfilledDetail', tab: 'orders' },
      { id: 'pending-deposits', count: pendingDeposits, severity: pendingDeposits > 3 ? 'danger' : 'warn', departmentKey: 'dashboardDeptDeposit', titleKey: 'dashboardActionPendingDeposits', detailKey: 'dashboardActionPendingDepositsDetail', tab: 'payments' },
      { id: 'stock-risk', count: outOfStock + lowStock, severity: outOfStock > 0 ? 'danger' : 'warn', departmentKey: 'dashboardDeptInventory', titleKey: 'dashboardActionStockRisk', detailKey: 'dashboardActionStockRiskDetail', tab: 'inventory' },
      { id: 'subscription-risk', count: subscriptionRisk, severity: 'warn', departmentKey: 'dashboardDeptSubscription', titleKey: 'dashboardActionSubscriptionRisk', detailKey: 'dashboardActionSubscriptionRiskDetail', tab: 'subscriptions' },
      { id: 'catalog-risk', count: catalogRisks, severity: 'warn', departmentKey: 'dashboardDeptCatalog', titleKey: 'dashboardActionCatalogRisk', detailKey: 'dashboardActionCatalogRiskDetail', tab: 'catalog' },
      { id: 'review-queue', count: pendingReviews, severity: 'warn', departmentKey: 'dashboardDeptModeration', titleKey: 'dashboardActionReviewQueue', detailKey: 'dashboardActionReviewQueueDetail', tab: 'reviews' },
      { id: 'security-events', count: securityEvents, severity: 'danger', departmentKey: 'dashboardDeptSecurity', titleKey: 'dashboardActionSecurityEvents', detailKey: 'dashboardActionSecurityEventsDetail', tab: 'audit' },
    ]);

    return {
      executive: [
        { id: 'gross-sales', labelKey: 'dashboardGrossSales', detailKey: 'dashboardGrossSalesDetail', kind: 'money', value: grossOrderValue, tone: 'neutral' },
        { id: 'net-revenue', labelKey: 'dashboardNetRevenue', detailKey: 'dashboardNetRevenueDetail', kind: 'money', value: netRevenue, tone: netRevenue > 0 ? 'good' : 'neutral' },
        { id: 'open-bills', labelKey: 'dashboardOpenBillValue', detailKey: 'dashboardOpenBillValueDetail', kind: 'money', value: openBillValue, tone: openBillValue > 0 ? 'warn' : 'good' },
        { id: 'orders', labelKey: 'dashboardOrdersCreated', detailKey: 'dashboardOrdersCreatedDetail', kind: 'number', value: input.orders.length, tone: 'neutral' },
        { id: 'conversion', labelKey: 'dashboardPaymentConversion', detailKey: 'dashboardPaymentConversionDetail', kind: 'percent', value: conversionRate, tone: conversionRate >= 0.8 ? 'good' : conversionRate >= 0.5 ? 'warn' : 'danger' },
        { id: 'critical-alerts', labelKey: 'dashboardCriticalAlerts', detailKey: 'dashboardCriticalAlertsDetail', kind: 'number', value: criticalAlerts, tone: criticalAlerts > 0 ? 'danger' : 'good' },
      ],
      departments: [
        { id: 'orders', labelKey: 'dashboardDeptOrders', status: this.statusFromCount(paidUnfulfilled, 0, 3), primaryKey: 'dashboardPaidUnfulfilled', primaryValue: paidUnfulfilled, detailKey: 'dashboardDeptOrdersDetail', actionCount: paidUnfulfilled + refundedOrders.length, tab: 'orders' },
        { id: 'bill', labelKey: 'dashboardDeptBill', status: this.statusFromCount(pendingDeposits, 0, 3), primaryKey: 'dashboardOpenBills', primaryValue: pendingDeposits, detailKey: 'dashboardDeptBillDetail', actionCount: pendingDeposits, tab: 'payments' },
        { id: 'payment', labelKey: 'dashboardDeptPayment', status: conversionRate >= 0.8 ? 'green' : conversionRate >= 0.5 ? 'yellow' : 'red', primaryKey: 'dashboardConversionPercent', primaryValue: Math.round(conversionRate * 1000) / 10, detailKey: 'dashboardDeptPaymentDetail', actionCount: pendingDeposits, tab: 'payments' },
        { id: 'catalog', labelKey: 'dashboardDeptCatalog', status: this.statusFromCount(catalogRisks, 0, 5), primaryKey: 'dashboardCatalogRisks', primaryValue: catalogRisks, detailKey: 'dashboardDeptCatalogDetail', actionCount: catalogRisks, tab: 'catalog' },
        { id: 'inventory', labelKey: 'dashboardDeptInventory', status: outOfStock > 0 ? 'red' : lowStock > 0 ? 'yellow' : 'green', primaryKey: 'dashboardStockRisks', primaryValue: outOfStock + lowStock, detailKey: 'dashboardDeptInventoryDetail', actionCount: outOfStock + lowStock, tab: 'inventory' },
        { id: 'subscription', labelKey: 'dashboardDeptSubscription', status: this.statusFromCount(subscriptionRisk, 0, 3), primaryKey: 'dashboardSubscriptionRisks', primaryValue: subscriptionRisk, detailKey: 'dashboardDeptSubscriptionDetail', actionCount: subscriptionRisk, tab: 'subscriptions' },
        { id: 'customer', labelKey: 'dashboardDeptCustomer', status: this.statusFromCount(lockedUsers, 0, 3), primaryKey: 'dashboardLockedAccounts', primaryValue: lockedUsers, detailKey: 'dashboardDeptCustomerDetail', actionCount: lockedUsers, tab: 'privilege' },
        { id: 'moderation', labelKey: 'dashboardDeptModeration', status: this.statusFromCount(pendingReviews, 0, 5), primaryKey: 'dashboardPendingReviews', primaryValue: pendingReviews, detailKey: 'dashboardDeptModerationDetail', actionCount: pendingReviews, tab: 'reviews' },
        { id: 'media', labelKey: 'dashboardDeptMedia', status: this.statusFromCount(this.productsWithoutMedia(input.products), 0, 5), primaryKey: 'dashboardMediaRows', primaryValue: input.media.length, detailKey: 'dashboardDeptMediaDetail', actionCount: this.productsWithoutMedia(input.products), tab: 'media' },
        { id: 'security', labelKey: 'dashboardDeptSecurity', status: this.statusFromCount(securityEvents, 0, 2), primaryKey: 'dashboardSensitiveEvents', primaryValue: securityEvents, detailKey: 'dashboardDeptSecurityDetail', actionCount: securityEvents, tab: 'audit' },
      ],
      actions,
      series: [
        {
          id: 'order-funnel',
          titleKey: 'dashboardOrderFunnel',
          points: [
            { labelKey: 'dashboardOrdersCreated', value: input.orders.length, tone: 'neutral' },
            { labelKey: 'dashboardPaidOrders', value: paidOrders.length, tone: 'good' },
            { labelKey: 'dashboardFulfilledOrders', value: fulfilledOrders.length, tone: 'good' },
            { labelKey: 'dashboardRefundedOrders', value: refundedOrders.length, tone: 'warn' },
          ],
        },
        {
          id: 'inventory-risk',
          titleKey: 'dashboardInventoryRisk',
          points: [
            { labelKey: 'dashboardOutOfStock', value: outOfStock, tone: outOfStock > 0 ? 'danger' : 'good' },
            { labelKey: 'dashboardLowStock', value: lowStock, tone: lowStock > 0 ? 'warn' : 'good' },
            { labelKey: 'dashboardReservedUnits', value: this.sumRows(input.inventory, 'reserved,reserved_qty'), tone: 'neutral' },
            { labelKey: 'dashboardAvailableUnits', value: input.inventory.reduce((total, row) => total + this.availableUnits(row), 0), tone: 'good' },
          ],
        },
        {
          id: 'subscription-capacity',
          titleKey: 'dashboardSubscriptionCapacity',
          points: [
            { labelKey: 'dashboardTotalSlots', value: this.sumRows(input.sharedAccountPools, 'slots_total,capacity'), tone: 'neutral' },
            { labelKey: 'dashboardUsedSlots', value: this.sumRows(input.sharedAccountPools, 'slots_used'), tone: 'warn' },
            { labelKey: 'dashboardSellableSlots', value: this.sellableSlots(input.sharedAccountPools), tone: 'good' },
            { labelKey: 'dashboardCredentialRisks', value: this.credentialRiskCount(input.sharedAccountPools), tone: 'danger' },
          ],
        },
      ],
    };
  }

  private actions(actions: AdminDashboardAction[]): AdminDashboardAction[] {
    const severityOrder: Record<AdminDashboardAction['severity'], number> = { danger: 0, warn: 1, good: 2 };
    return actions
      .filter((action) => action.count > 0)
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count)
      .slice(0, 10);
  }

  private backendDepartment(row: AdminDashboardRow): AdminDashboardDepartment {
    const id = this.cell(row, 'id') || 'security';
    const metric = this.record(row['primary_metric']);
    return {
      id,
      labelKey: this.departmentLabelKey(id),
      status: this.backendStatus(this.cell(row, 'status')),
      primaryKey: this.primaryMetricKey(this.cell(metric, 'code')),
      primaryValue: this.numberValue(metric['value']),
      detailKey: this.departmentDetailKey(id),
      actionCount: this.number(row, 'action_count'),
      tab: this.backendTab(this.cell(row, 'tab')),
    };
  }

  private backendAction(row: AdminDashboardRow): AdminDashboardAction {
    const code = this.cell(row, 'code');
    return {
      id: (code || 'dashboard-action').toLowerCase().replace(/_/g, '-').slice(0, 64),
      severity: this.backendSeverity(this.cell(row, 'severity')),
      departmentKey: this.departmentLabelKey(this.cell(row, 'department')),
      titleKey: this.actionTitleKey(code),
      count: this.number(row, 'count'),
      detailKey: this.actionDetailKey(code),
      tab: this.backendTab(this.cell(row, 'tab')),
    };
  }

  private backendSeries(snapshot: AdminDashboardRow): AdminDashboardSeries[] {
    const executive = this.record(snapshot['executive']);
    const series = this.record(snapshot['series']);
    const inventory = this.codeCountMap(this.rows(series, 'inventory_risk'));
    const capacity = this.codeCountMap(this.rows(series, 'capacity_utilization'));
    return [
      {
        id: 'order-funnel',
        titleKey: 'dashboardOrderFunnel',
        points: [
          { labelKey: 'dashboardOrdersCreated', value: this.numberValue(executive['orders_created']), tone: 'neutral' },
          { labelKey: 'dashboardPaidOrders', value: this.numberValue(executive['paid_orders']), tone: 'good' },
          { labelKey: 'dashboardFulfilledOrders', value: this.numberValue(executive['fulfilled_orders']), tone: 'good' },
          { labelKey: 'dashboardRefundedOrders', value: this.numberValue(executive['refunded_orders']), tone: 'warn' },
        ],
      },
      {
        id: 'inventory-risk',
        titleKey: 'dashboardInventoryRisk',
        points: [
          { labelKey: 'dashboardOutOfStock', value: inventory.get('OUT_OF_STOCK') ?? 0, tone: (inventory.get('OUT_OF_STOCK') ?? 0) > 0 ? 'danger' : 'good' },
          { labelKey: 'dashboardLowStock', value: inventory.get('LOW_STOCK') ?? 0, tone: (inventory.get('LOW_STOCK') ?? 0) > 0 ? 'warn' : 'good' },
          { labelKey: 'dashboardReservedUnits', value: inventory.get('RESERVED_UNITS') ?? 0, tone: 'neutral' },
          { labelKey: 'dashboardAvailableUnits', value: inventory.get('AVAILABLE_UNITS') ?? 0, tone: 'good' },
        ],
      },
      {
        id: 'subscription-capacity',
        titleKey: 'dashboardSubscriptionCapacity',
        points: [
          { labelKey: 'dashboardTotalSlots', value: capacity.get('TOTAL_SLOTS') ?? 0, tone: 'neutral' },
          { labelKey: 'dashboardUsedSlots', value: capacity.get('USED_SLOTS') ?? 0, tone: 'warn' },
          { labelKey: 'dashboardSellableSlots', value: capacity.get('SELLABLE_SLOTS') ?? 0, tone: 'good' },
          { labelKey: 'dashboardCredentialRisks', value: this.departmentActionCount(snapshot, 'subscription'), tone: 'danger' },
        ],
      },
    ];
  }

  private codeCountMap(rows: AdminDashboardRow[]): Map<string, number> {
    return new Map(rows.map((row) => [this.cell(row, 'code'), this.number(row, 'count')]));
  }

  private departmentActionCount(snapshot: AdminDashboardRow, id: string): number {
    const department = this.rows(snapshot, 'departments').find((row) => this.cell(row, 'id') === id);
    return department ? this.number(department, 'action_count') : 0;
  }

  private departmentLabelKey(id: string): string {
    const map: Record<string, string> = {
      cart: 'dashboardDeptCart',
      orders: 'dashboardDeptOrders',
      bill: 'dashboardDeptBill',
      payment: 'dashboardDeptPayment',
      deposit: 'dashboardDeptDeposit',
      catalog: 'dashboardDeptCatalog',
      inventory: 'dashboardDeptInventory',
      subscription: 'dashboardDeptSubscription',
      customer: 'dashboardDeptCustomer',
      moderation: 'dashboardDeptModeration',
      reviews: 'dashboardDeptModeration',
      media: 'dashboardDeptMedia',
      security: 'dashboardDeptSecurity',
    };
    return map[id] ?? 'dashboardDeptSecurity';
  }

  private departmentDetailKey(id: string): string {
    const map: Record<string, string> = {
      cart: 'dashboardDeptCartDetail',
      orders: 'dashboardDeptOrdersDetail',
      bill: 'dashboardDeptBillDetail',
      payment: 'dashboardDeptPaymentDetail',
      deposit: 'dashboardDeptDepositDetail',
      catalog: 'dashboardDeptCatalogDetail',
      inventory: 'dashboardDeptInventoryDetail',
      subscription: 'dashboardDeptSubscriptionDetail',
      customer: 'dashboardDeptCustomerDetail',
      moderation: 'dashboardDeptModerationDetail',
      media: 'dashboardDeptMediaDetail',
      security: 'dashboardDeptSecurityDetail',
    };
    return map[id] ?? 'dashboardDeptSecurityDetail';
  }

  private primaryMetricKey(code: string): string {
    const map: Record<string, string> = {
      ACTIVE_CARTS: 'dashboardActiveCarts',
      PAID_UNFULFILLED: 'dashboardPaidUnfulfilled',
      OPEN_BILLS: 'dashboardOpenBills',
      PAYMENT_CONVERSION_RATE: 'dashboardConversionPercent',
      PENDING_DEPOSITS: 'dashboardPendingDeposits',
      CATALOG_READINESS_RISKS: 'dashboardCatalogRisks',
      STOCK_RISKS: 'dashboardStockRisks',
      SELLABLE_SLOTS: 'dashboardSellableSlotsCount',
      NEW_CUSTOMERS: 'dashboardNewCustomers',
      PENDING_REVIEWS: 'dashboardPendingReviews',
      MEDIA_ROWS: 'dashboardMediaRows',
      SENSITIVE_AUDIT_EVENTS: 'dashboardSensitiveEvents',
    };
    return map[code] ?? 'dashboardSensitiveEvents';
  }

  private actionTitleKey(code: string): string {
    const map: Record<string, string> = {
      PAID_UNFULFILLED: 'dashboardActionPaidUnfulfilled',
      PENDING_DEPOSIT_SLA: 'dashboardActionPendingDeposits',
      OUT_OF_STOCK: 'dashboardActionStockRisk',
      SUBSCRIPTION_CAPACITY_RISK: 'dashboardActionSubscriptionRisk',
      OPEN_BILLS: 'dashboardActionPendingDeposits',
      CATALOG_READINESS_RISKS: 'dashboardActionCatalogRisk',
      PENDING_REVIEWS: 'dashboardActionReviewQueue',
      UNUSED_MEDIA: 'dashboardActionUnusedMedia',
      SENSITIVE_AUDIT_EVENTS: 'dashboardActionSecurityEvents',
    };
    return map[code] ?? 'dashboardActionSecurityEvents';
  }

  private actionDetailKey(code: string): string {
    const map: Record<string, string> = {
      PAID_UNFULFILLED: 'dashboardActionPaidUnfulfilledDetail',
      PENDING_DEPOSIT_SLA: 'dashboardActionPendingDepositsDetail',
      OUT_OF_STOCK: 'dashboardActionStockRiskDetail',
      SUBSCRIPTION_CAPACITY_RISK: 'dashboardActionSubscriptionRiskDetail',
      OPEN_BILLS: 'dashboardActionPendingDepositsDetail',
      CATALOG_READINESS_RISKS: 'dashboardActionCatalogRiskDetail',
      PENDING_REVIEWS: 'dashboardActionReviewQueueDetail',
      UNUSED_MEDIA: 'dashboardActionUnusedMediaDetail',
      SENSITIVE_AUDIT_EVENTS: 'dashboardActionSecurityEventsDetail',
    };
    return map[code] ?? 'dashboardActionSecurityEventsDetail';
  }

  private backendStatus(value: string): AdminDashboardStatus {
    const status = value.toLowerCase();
    return status === 'red' || status === 'yellow' || status === 'green' ? status : 'green';
  }

  private backendSeverity(value: string): Exclude<AdminDashboardTone, 'neutral'> {
    const severity = value.toLowerCase();
    if (severity === 'critical' || severity === 'danger') return 'danger';
    if (severity === 'warning' || severity === 'warn') return 'warn';
    return 'good';
  }

  private backendTab(value: string): AdminDashboardTab {
    const tabs: AdminDashboardTab[] = ['catalog', 'inventory', 'orders', 'payments', 'subscriptions', 'privilege', 'reviews', 'media', 'audit'];
    return tabs.includes(value as AdminDashboardTab) ? value as AdminDashboardTab : 'audit';
  }

  private rateTone(value: number): AdminDashboardTone {
    return value >= 0.8 ? 'good' : value >= 0.5 ? 'warn' : 'danger';
  }

  private statusFromCount(count: number, yellowThreshold: number, redThreshold: number): AdminDashboardStatus {
    if (count > redThreshold) return 'red';
    if (count > yellowThreshold) return 'yellow';
    return 'green';
  }

  private catalogRiskCount(products: AdminDashboardRow[]): number {
    return products.filter((row) => {
      const status = this.status(row, 'status,kind');
      if (status && !['ACTIVE', 'PRIVATE', 'SHARED'].includes(status)) return false;
      return this.productsWithoutSku([row]) > 0 || this.productsWithoutMedia([row]) > 0 || this.productsWithoutCopy([row]) > 0;
    }).length;
  }

  private productsWithoutSku(products: AdminDashboardRow[]): number {
    return products.filter((row) => this.rows(row, 'skus,sellable_skus,sku_items').length === 0 && !this.cell(row, 'sku_id,sku_code')).length;
  }

  private productsWithoutMedia(products: AdminDashboardRow[]): number {
    return products.filter((row) => this.rows(row, 'media,media_items,images').length === 0 && !this.cell(row, 'media_ids,media_id,image_url,public_url')).length;
  }

  private productsWithoutCopy(products: AdminDashboardRow[]): number {
    return products.filter((row) => !this.cell(row, 'name_th,name') || !this.cell(row, 'name_en,name') || !this.cell(row, 'description_th,description') || !this.cell(row, 'description_en,description')).length;
  }

  private subscriptionRiskCount(rows: AdminDashboardRow[]): number {
    return this.zeroCapacityPoolCount(rows) + this.credentialRiskCount(rows) + this.expiringAccountCount(rows);
  }

  private zeroCapacityPoolCount(rows: AdminDashboardRow[]): number {
    const bySku = new Map<string, number>();
    rows.forEach((row) => {
      const skuId = this.cell(row, 'sku_id,id');
      if (!skuId || this.status(row, 'pool_status,status') !== 'ACTIVE') return;
      bySku.set(skuId, (bySku.get(skuId) ?? 0) + this.number(row, 'slots_available'));
    });
    return Array.from(bySku.values()).filter((available) => available <= 0).length;
  }

  private credentialRiskCount(rows: AdminDashboardRow[]): number {
    return rows.filter((row) => {
      const status = this.status(row, 'credential_status');
      return status === 'MISSING' || status === 'UNKNOWN' || status === 'EXPIRED';
    }).length;
  }

  private expiringAccountCount(rows: AdminDashboardRow[]): number {
    return rows.filter((row) => this.isExpiringSoon(this.cell(row, 'expires_at'))).length;
  }

  private sellableSlots(rows: AdminDashboardRow[]): number {
    return this.sumRows(rows.filter((row) => this.status(row, 'pool_status,status') === 'ACTIVE' && this.status(row, 'account_status,status') === 'ACTIVE'), 'slots_available');
  }

  private isPaidOrder(row: AdminDashboardRow): boolean {
    return ['PAID', 'PROCESSING', 'FULFILLED', 'DELIVERED', 'SUCCEEDED'].includes(this.status(row, 'status,state'));
  }

  private isFulfilled(row: AdminDashboardRow): boolean {
    return ['FULFILLED', 'DELIVERED'].includes(this.status(row, 'status,state'));
  }

  private isOpenDeposit(row: AdminDashboardRow): boolean {
    return ['PENDING', 'OPEN', 'METHOD_REQUIRED', 'MANUAL_REVIEW'].includes(this.status(row, 'status,deposit_status'));
  }

  private isPending(row: AdminDashboardRow, keys: string): boolean {
    return ['PENDING', 'OPEN', 'MANUAL_REVIEW'].includes(this.status(row, keys));
  }

  private isSensitiveAudit(row: AdminDashboardRow): boolean {
    const action = this.cell(row, 'action').toLowerCase();
    return ['role', 'lock', 'credential', 'kek', 'refund'].some((keyword) => action.includes(keyword));
  }

  private isExpiringSoon(value: string): boolean {
    if (!value || value === '-') return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return date.getTime() >= Date.now() && date.getTime() - Date.now() <= sevenDaysMs;
  }

  private rate(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0;
  }

  private sumRows(rows: AdminDashboardRow[], keys: string): number {
    return rows.reduce((total, row) => total + this.number(row, keys), 0);
  }

  private availableUnits(row: AdminDashboardRow): number {
    const available = this.firstValue(row, 'available,stock_available');
    if (available !== undefined) return this.numberValue(available);
    return this.number(row, 'on_hand,qty') - this.number(row, 'reserved,reserved_qty');
  }

  private status(row: AdminDashboardRow, keys: string): string {
    return this.cell(row, keys).trim().toUpperCase();
  }

  private number(row: AdminDashboardRow, keys: string): number {
    return this.numberValue(this.firstValue(row, keys));
  }

  private numberValue(value: unknown): number {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private cell(row: AdminDashboardRow, keys: string): string {
    const value = this.firstValue(row, keys);
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private rows(row: AdminDashboardRow, keys: string): AdminDashboardRow[] {
    const value = this.firstValue(row, keys);
    return Array.isArray(value) ? value.filter((item): item is AdminDashboardRow => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
  }

  private record(value: unknown): AdminDashboardRow {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as AdminDashboardRow : {};
  }

  private isValidBackendSnapshot(snapshot: AdminDashboardRow): boolean {
    const executive = this.record(snapshot['executive']);
    const requiredExecutive = [
      'gross_order_value_cents',
      'net_revenue_cents',
      'open_bill_value_cents',
      'orders_created',
      'payment_conversion_rate',
      'critical_alerts',
    ];
    if (!requiredExecutive.every((key) => this.isNumericLike(executive[key]))) return false;
    if (!Array.isArray(snapshot['departments'])) return false;
    if (!Array.isArray(snapshot['actions'])) return false;
    const series = this.record(snapshot['series']);
    return Array.isArray(series['inventory_risk']) && Array.isArray(series['capacity_utilization']);
  }

  private isNumericLike(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    return Number.isFinite(typeof value === 'number' ? value : Number(value));
  }

  private firstValue(row: AdminDashboardRow, keys: string): unknown {
    for (const key of keys.split(',').map((part) => part.trim())) {
      if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return undefined;
  }
}
