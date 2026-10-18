# CartUiService

Version: 1.2.0

Owns anonymous/authenticated cart read, item add/update/remove, merge-on-login, and clear-cart flows.

## SKU contract
- `addItem(product_id, qty, skuId?)` sends `sku_id` to the backend. The backend
  still accepts legacy `sku`, but frontend code should use `sku_id`.
- Cart items normalize SKU identity fields returned by SQL:
  `sku_id`, `sku_code`, `sku_name`, and `fulfillment_type`.
