# Deployment notes

The dashboard builds to static assets in `dist/`. Serve them behind HTTPS with the
application shell as the fallback for browser deep links.

## Same-origin baseline (recommended)

`nginx.conf.example` shows the baseline from specification section 10: the frontend
origin also serves `/api/v1` through a reverse proxy. Nothing cross-site is involved, so
the `Secure; HttpOnly; SameSite=Lax` session cookie works without extra configuration.

Set `VITE_API_BASE_URL=/api/v1` (the default) for this layout.

## Approved same-site cross-origin deployment

If the API lives on a different host under the same site, the backend must send
credentialed CORS for the exact frontend origin:

- `Access-Control-Allow-Origin: https://dashboard.example.com` (never `*`)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Idempotency-Key`
- `Access-Control-Expose-Headers: X-Correlation-Id, Retry-After`
- Server-side Origin checks on every state-changing request

Unrelated cross-site domains need a separate cookie and deployment design; they must not
be assumed to work with `SameSite=Lax`.

## Configuration

Only the public values in `.env.example` belong in a build. WhatsApp credentials,
session and OTP secrets and authentication-template settings stay on the server.

## Caching

- Hashed files under `/assets/` are immutable.
- `index.html` is `no-store` so a deploy is picked up immediately.
- Private API responses are `no-store`, and no service worker caches them. There is no
  offline command queue for dispatch or money operations.
