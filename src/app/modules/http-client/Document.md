# ApiClient

Version: 1.0.0

Owns all browser/SSR HTTP mechanics for `/api/v1`: credentials, CSRF echo, `Accept-Language`, idempotency keys, RFC 7807 normalization, single-flight refresh, request-id preservation, and bounded retry for retryable/idempotent failures.
