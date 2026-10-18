# AuthUiService

Version: 1.1.0

Owns auth workflows: register, verify email, login, MFA challenge completion, refresh, logout, password forgot/reset, MFA setup/verify, step-up, and `/auth/me` hydration. It never reads or stores JWTs; session and role state comes from `/auth/me` or login responses.
