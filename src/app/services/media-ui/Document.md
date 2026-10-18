# MediaUiService

Version: 1.1.0

Owns upload intent creation, upload completion, and media URL resolution.

## Public methods

- `createUpload(body)` requests an upload intent from `/media/uploads`.
- `completeUpload(media_id, body)` confirms an uploaded object with `sha256` or `payload_hash`.
- `resolve(media_id)` returns the public media URL.
- `uploadFile(file, purpose)` performs the full browser flow for admin/product image uploads: intent, PUT bytes, SHA-256 completion, and URL resolution. Admin product forms may call it repeatedly before saving one ordered `media_ids` list.
