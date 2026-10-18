# CheckoutUiService

Version: 2.2.0

Owns checkout preview and order creation.

Checkout order creation posts cart/shipping data only and maps the order id,
state, total, and currency. Payment bill opening and provider-specific deposit
instructions are handled by `OrderUiService` and `PaymentUiService` after the
customer opens a bill and selects a method.
