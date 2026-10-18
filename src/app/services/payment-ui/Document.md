# payment ui service

## Class
- `PaymentUiService` — version `1.0.0`
- Dependency: `ApiClient`

## Public methods

### `createAttempt(bill_id, provider)`

Calls `POST /payment-bills/:bill_id/attempts` after the customer selects a
payment method. Returns the updated `PaymentBill` with provider-specific fields
such as `deposit_id`, unique scrap amount, expiry, and instructions.
