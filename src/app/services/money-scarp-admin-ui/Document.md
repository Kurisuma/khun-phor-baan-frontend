# MoneyScarpAdminUiService

Version: 1.0.0

Owns the admin-facing Money Scarp deposit gateway workspace. The service wraps the generic `/admin/payment-methods` API and constrains active CRUD operations to bank-transfer destination accounts for the Money Scarp gateway.

PayPal and TrueMoney use separate gateway services so each provider can grow independently without coupling provider-specific form logic, validation hints, or API behavior into the admin page.
