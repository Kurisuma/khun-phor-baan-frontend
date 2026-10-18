# SeoService

Version: 1.1.0

Owns page metadata, canonical links, hreflang alternates, nonce-bearing JSON-LD, and frontend access to backend SEO data endpoints.

Uses `SeoUrlBuilder` so canonical, Open Graph, Twitter, and JSON-LD-adjacent
URLs share one public site origin. Local development media URLs are normalized
before being emitted in SEO image tags.
