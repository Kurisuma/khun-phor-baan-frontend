# SeoUrlBuilder

Version: 1.0.0

Builds public SEO URLs from the configured public site origin.

## Public methods

| Method | Purpose |
|---|---|
| `siteUrl()` | Returns the normalized public site origin without a trailing slash. |
| `absolutePath(path)` | Converts an app route path into an absolute public URL. |
| `absoluteUrl(value)` | Converts relative or absolute input into an absolute URL against the public site origin. |
| `publicAssetUrl(value)` | Converts local development asset/API URLs such as `127.0.0.1` into public same-origin URLs while leaving real CDN/public URLs unchanged. |

## Notes

`KPB_PUBLIC_SITE_URL` is the source of truth. SSR provides it from
`PUBLIC_SITE_URL`, `SITE_URL`, `KPB_SITE_URL`, or the default production host.
The browser fallback reads `<meta name="kpb-public-site-url">`.
