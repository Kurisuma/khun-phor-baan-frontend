# JsonLdBuilder

Version: 1.2.0

Builds schema.org JSON-LD objects for Organization, WebSite/SearchAction, Product, BreadcrumbList, and sitemap item lists. Pages pass output to `SeoService` for nonce-bearing SSR emission.

Product JSON-LD accepts an optional selected SKU. When present, the schema name,
description, top-level `sku`, and Offer URL/price/availability describe that
SKU URL rather than the product-level offer list.

Image URLs are normalized through `SeoUrlBuilder.publicAssetUrl()` before they
are emitted. When the selected SKU name matches the product name, the Product
schema name avoids duplicate `Product - Product` wording.
