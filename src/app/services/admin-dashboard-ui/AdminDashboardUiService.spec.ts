import { AdminDashboardMetric, AdminDashboardSnapshot, AdminDashboardUiService } from './AdminDashboardUiService';

describe('AdminDashboardUiService', () => {
  const service = new AdminDashboardUiService();

  it('builds the fallback dashboard from loaded admin rows without treating it as authoritative backend math', () => {
    const dashboard = service.build({
      products: [
        { id: 'p1', status: 'ACTIVE', name_th: 'สินค้า', name_en: 'Product', description_th: 'รายละเอียด', description_en: 'Details', media: [{ id: 'm1' }], skus: [{ id: 's1' }] },
        { id: 'p2', status: 'ACTIVE', name_th: '', name_en: 'No copy', description_th: '', description_en: 'Details', media: [], skus: [] },
      ],
      inventory: [
        { sku_id: 's1', on_hand: 0, reserved: 0, low_stock_threshold: 2 },
        { sku_id: 's2', on_hand: 3, reserved: 1, low_stock_threshold: 2 },
      ],
      orders: [
        { id: 'o1', status: 'PENDING_PAYMENT', total_cents: 1000 },
        { id: 'o2', status: 'PAID', total_cents: 2000 },
        { id: 'o3', status: 'FULFILLED', total_cents: 3000 },
        { id: 'o4', status: 'REFUNDED', total_cents: 500 },
      ],
      deposits: [
        { id: 'd1', status: 'PENDING', unique_amount_cents: 1200 },
        { id: 'd2', status: 'MANUAL_REVIEW', amount_cents: 1300 },
        { id: 'd3', status: 'MATCHED', amount_cents: 900 },
      ],
      subscriptions: [],
      sharedAccountPools: [
        { sku_id: 'shared-1', pool_status: 'ACTIVE', account_status: 'ACTIVE', slots_total: 4, slots_used: 4, slots_available: 0, credential_status: 'MISSING' },
        { sku_id: 'shared-2', pool_status: 'ACTIVE', account_status: 'ACTIVE', slots_total: 5, slots_used: 2, slots_available: 3, credential_status: 'ENCRYPTED' },
      ],
      users: [{ id: 'u1', status: 'LOCKED' }],
      reviews: [{ id: 'r1', status: 'PENDING' }],
      media: [{ id: 'm1' }, { id: 'm2' }],
      auditLog: [{ id: 'a1', action: 'admin.users.update_roles' }],
    });

    expect(metric(dashboard, 'gross-sales').value).toBe(6500);
    expect(metric(dashboard, 'net-revenue').value).toBe(4500);
    expect(metric(dashboard, 'open-bills').value).toBe(2500);
    expect(metric(dashboard, 'conversion').value).toBe(0.5);
    expect(metric(dashboard, 'conversion').tone).toBe('warn');
    expect(metric(dashboard, 'critical-alerts').value).toBe(6);

    expect(department(dashboard, 'inventory')).toEqual(jasmine.objectContaining({
      status: 'red',
      primaryValue: 2,
      actionCount: 2,
      tab: 'inventory',
    }));
    expect(department(dashboard, 'catalog')).toEqual(jasmine.objectContaining({
      status: 'yellow',
      primaryValue: 1,
    }));
    expect(actionCount(dashboard, 'stock-risk')).toBe(2);
    expect(actionCount(dashboard, 'security-events')).toBe(1);
    expect(seriesPoint(dashboard, 'inventory-risk', 'dashboardAvailableUnits')).toBe(2);
    expect(seriesPoint(dashboard, 'subscription-capacity', 'dashboardSellableSlots')).toBe(3);
  });

  it('maps backend snapshots without recomputing authoritative dashboard values', () => {
    const dashboard = service.fromBackendSnapshot({
      executive: {
        gross_order_value_cents: 900000,
        net_revenue_cents: 700000,
        open_bill_value_cents: 120000,
        orders_created: 11,
        paid_orders: 9,
        fulfilled_orders: 6,
        refunded_orders: 1,
        payment_conversion_rate: 0.82,
        critical_alerts: 3,
      },
      departments: [
        {
          id: 'deposit',
          status: 'red',
          primary_metric: { code: 'PENDING_DEPOSITS', value: 4 },
          action_count: 4,
          tab: 'payments',
        },
        {
          id: 'subscription',
          status: 'yellow',
          primary_metric: { code: 'SELLABLE_SLOTS', value: 7 },
          action_count: 2,
          tab: 'subscriptions',
        },
      ],
      actions: [
        { department: 'bill', severity: 'warning', code: 'OPEN_BILLS', count: 5, tab: 'payments' },
        { department: 'media', severity: 'warning', code: 'UNUSED_MEDIA', count: 0, tab: 'media' },
        { department: 'orders', severity: 'critical', code: 'PAID_UNFULFILLED', count: 2, tab: 'orders' },
      ],
      series: {
        inventory_risk: [
          { code: 'OUT_OF_STOCK', count: 3 },
          { code: 'LOW_STOCK', count: 2 },
          { code: 'RESERVED_UNITS', count: 5 },
          { code: 'AVAILABLE_UNITS', count: 20 },
        ],
        capacity_utilization: [
          { code: 'TOTAL_SLOTS', count: 12 },
          { code: 'USED_SLOTS', count: 5 },
          { code: 'SELLABLE_SLOTS', count: 7 },
        ],
      },
    });

    expect(dashboard).not.toBeNull();
    expect(metric(dashboard!, 'net-revenue').value).toBe(700000);
    expect(metric(dashboard!, 'conversion')).toEqual(jasmine.objectContaining({ value: 0.82, tone: 'good' }));
    expect(department(dashboard!, 'deposit')).toEqual(jasmine.objectContaining({
      status: 'red',
      primaryKey: 'dashboardPendingDeposits',
      primaryValue: 4,
      detailKey: 'dashboardDeptDepositDetail',
      tab: 'payments',
    }));
    expect(actionCount(dashboard!, 'paid-unfulfilled')).toBe(2);
    expect(actionCount(dashboard!, 'open-bills')).toBe(5);
    expect(dashboard!.actions.some((action) => action.id === 'unused-media')).toBeFalse();
    expect(seriesPoint(dashboard!, 'inventory-risk', 'dashboardOutOfStock')).toBe(3);
    expect(seriesPoint(dashboard!, 'subscription-capacity', 'dashboardCredentialRisks')).toBe(2);
  });

  it('returns null for missing backend snapshots so the Admin page can fall back safely', () => {
    expect(service.fromBackendSnapshot(null)).toBeNull();
    expect(service.fromBackendSnapshot({ departments: [] })).toBeNull();
  });
});

function metric(dashboard: AdminDashboardSnapshot, id: string): AdminDashboardMetric {
  const found = dashboard.executive.find((item) => item.id === id);
  expect(found).toBeTruthy();
  return found!;
}

function department(dashboard: AdminDashboardSnapshot, id: string) {
  const found = dashboard.departments.find((item) => item.id === id);
  expect(found).toBeTruthy();
  return found!;
}

function actionCount(dashboard: AdminDashboardSnapshot, id: string): number {
  const found = dashboard.actions.find((item) => item.id === id);
  expect(found).toBeTruthy();
  return found!.count;
}

function seriesPoint(dashboard: AdminDashboardSnapshot, seriesId: string, labelKey: string): number {
  const series = dashboard.series.find((item) => item.id === seriesId);
  expect(series).toBeTruthy();
  const point = series!.points.find((item) => item.labelKey === labelKey);
  expect(point).toBeTruthy();
  return point!.value;
}
