# OrderUiService

Version: 2.0.0

Owns customer order list/detail, pending-order cancel, payment-bill shell
opening/current-bill reads, and digital download URL retrieval.

Maps optional product, SKU, fulfillment, and payment bill metadata so customer
order screens can render useful summaries without duplicating API-normalization
logic. Provider attempt creation belongs to `PaymentUiService`.
