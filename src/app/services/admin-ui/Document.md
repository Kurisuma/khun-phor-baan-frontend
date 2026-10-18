# AdminUiService

Version: 1.8.0

Owns all `/admin/*` API groups behind route guards. Backend RBAC remains authoritative; responses are unwrapped at the service boundary, and step-up tokens are passed only for sensitive operations.

`getDashboardSnapshot()` reads `/admin/dashboard?from&to&granularity` for the
Phase 2 business-status snapshot. Backend stored procedures own financial,
rate, SLA, and risk math; the frontend formats and visualizes the returned
snapshot and keeps provisional loaded-row aggregation as a fallback only.

Catalog create/update forms do not send system-owned URL slugs. The backend derives slugs from localized names and returns canonical values for display.

Category management uses `/admin/categories` for standalone category records.
Categories own localized copy, status, and one independent image media link;
the admin product form binds a product to one category or leaves it
uncategorized.

Inventory owns private fulfillment setup. `upsertPrivateSku()`,
`addDigitalUnits()`, and `generatePhysicalUnits()` call the `/admin/inventory/*`
routes so private physical/digital items are created and modified in Inventory.
Catalog binds existing Inventory SKUs to public product slugs instead of editing
private product type directly.

`listDigitalPoolUnits()` reads `/admin/inventory/digital-units` for the selected
digital SKU. It shows pool/unit status and trace metadata only; encrypted
digital values stay sealed server-side.

SKU item detail/media uses `upsertSkuDetail()` on `/admin/skus/:id/detail`.
The admin page reuses the same SKU detail/media editor for private Inventory
SKUs and shared Subscription SKUs, including multi-file media upload. Bound SKU
media is shown in Catalog and can be merged into product galleries through
`mergeSkuMediaToProduct()`.

Subscription SKU setup uses `upsertSharedSubscriptionSku()` against `/admin/shared-skus`. This keeps operational `SHARED` SKU and pool creation inside the Subscription admin workflow. The admin page edits selected pools from the Shared SKU workspace, uses billing cadence values `1M` through `24M`, and can auto-generate SKU codes from brand plus pool/suffix and cadence using the `SH_SUB_(BRAND)_*` prefix. Catalog product `Sellable SKUs` binds an existing pool to a product/slug storefront.

Private Inventory SKU setup accepts brand, optional suffix, and digital SKU kind. Leaving SKU code blank lets the backend generate `PV_PHY_(BRAND)_*`, `PV_CDK_(BRAND)_*`, or `PV_AVL_(BRAND)_*`; the admin form shows the same generated preview for operator clarity.

The Subscription admin tab includes operator guidance for the intended flow:
create pool, add account inventory, seal provider credentials, bind in Catalog,
then monitor delivered slots. Field help reinforces the ownership boundary:
Product owns storefront slug/SEO/media/copy, while Subscription pool/account
inventory owns capacity and credential state.

Credential rotation uses the normal backend seal path. Admins enter provider
login/secret/notes plus an audit reason; the backend generates ciphertext,
nonce, wrapped DEK, and KEK metadata via the Subscription Vault service.

Payment deposit administration is split by gateway module. `AdminUiService`
keeps the generic `/admin/payment-methods` transport methods, while
`MoneyScarpAdminUiService`, `PaypalAdminUiService`, and
`TrueMoneyAdminUiService` own provider-specific admin workflows. Money Scarp is
currently functional for bank-transfer destination-account CRUD. PayPal and
TrueMoney are scaffolded behind their own services until backend provider
configuration endpoints exist.
