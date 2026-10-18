# AdminDashboardUiService

Version: 1.1.1

Builds the Admin Overview business dashboard from currently loaded Admin rows.
This service exists because the dashboard composes more than three functional
departments: Catalog, Inventory, Orders, Bill/Payment/Deposit, Subscription,
Customer/Privilege, Reviews, Media, and Audit/Security.

The service started as a Phase 1 UI composition layer. It formats no secrets and
does not become the source of financial truth. It can calculate provisional
operational cards from the list data already available to the Admin page so the
frontend keeps a fallback while the backend snapshot is unavailable.

Authoritative business math should move to the backend dashboard snapshot
contract described in `ADMIN-DASHBOARD-BUSINESS-STATUS-BREAKDOWN.md`, backed by
stored procedures or aggregate fact tables. When that endpoint exists, this
service should adapt the snapshot DTO for display instead of summing capped list
results.

`fromBackendSnapshot(value)` adapts the Phase 2 backend snapshot DTO into the
display model used by the Admin Overview. It keeps i18n label selection on the
frontend while preserving backend-owned numbers, statuses, actions, and series.

Fallback inventory series uses computed available units (`on_hand - reserved`)
when explicit `available`/`stock_available` fields are absent, matching the
inventory health-card formula.
