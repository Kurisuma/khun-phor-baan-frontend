# CatalogUiService

Version: 1.4.2

Owns category tree/detail, product list/detail, and search endpoints. Public catalog pages consume this service for SSR-safe data loading.

Category rows normalize localized `name`/`description`, `image_url`, status,
product count, and the virtual `uncategorized` marker. Product rows normalize
category binding fields into `product.category` when the backend includes a
real category slug/id.

Product detail SKU options normalize customer-facing SKU detail fields:
`summary`, `description`, `usage`, and `warranty` plus their `th`/`en`
variants. Product detail uses these fields when a customer selects a SKU.

SKU options also normalize `sku_slug`. Customer product pages use it for
`/:locale/catalog/:product_slug/:sku_slug` URLs, selected-SKU canonical tags,
and SKU-specific JSON-LD offers.

Local loopback media URLs from development backend data are normalized to
same-origin `/api/v1/media/files/:id` paths before templates bind them to
`img[src]`. This keeps catalog images compatible with the frontend CSP
(`img-src 'self' data: https:`) and the Angular dev proxy without allowing
plain `http:` image origins. HTTPS/CDN media URLs are preserved unchanged.
When a product/category media object has only `media_id` or `id`, the service
derives `/api/v1/media/files/:media_id` so frontend views can show media from
object identifiers without requiring a separate plain URL field.
