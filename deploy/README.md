# Deployment notes

The dashboard builds to static assets in `dist/`. Serve them behind HTTPS with the
application shell as the fallback for browser deep links.

## Production (Docker)

Production runs the dashboard as a container in the delivery compose stack, next to
the API, on the server that also hosts the grocery stack. The stack, `deploy.sh`, the
host Caddy block and the server setup are owned by deliveryBooking — see
[deliveryBooking/deploy/README.md](https://github.com/mackawara/deliveryBooking/blob/main/deploy/README.md).
Run its `Deploy API` workflow once before the first dashboard deploy.

`Deploy Dashboard` (`.github/workflows/deploy.yml`) runs on every push to `main`: CI
(typecheck, lint, tests, build, end-to-end) → arm64 image on Docker Hub, tagged with
the commit SHA and `latest` → SSH → `deploy.sh dashboard <image> <sha>`, a
health-gated restart with automatic rollback to the previous tag. To roll back by
hand, run the workflow with an earlier SHA as `tag`.

The image (`Dockerfile`) serves `dist/` with Caddy using [`Caddyfile`](Caddyfile):
the same headers and caching policy as `nginx.conf.example` below. Host Caddy
terminates TLS and sends `/api/*`, `/media/*`, `/health` and `/dashboard*` to the API,
everything else to this container, so the API stays same-origin.

GitHub configuration for this repository:

| Kind     | Name                         | Value                                                        |
| -------- | ---------------------------- | ------------------------------------------------------------ |
| secret   | `DOCKERHUB_USERNAME`         | Docker Hub username (same as the other repositories)         |
| secret   | `DOCKERHUB_TOKEN`            | Docker Hub access token, write scope                         |
| secret   | `SSH_PRIVATE_KEY`            | deploy key (PEM)                                             |
| secret   | `SSH_HOST`                   | server hostname/IP                                           |
| secret   | `SSH_USER`                   | deploy user                                                  |
| secret   | `SSH_KNOWN_HOSTS`            | pinned host key (recommended; see the deliveryBooking notes) |
| variable | `DEPLOY_PATH`                | optional, default `/home/ubuntu/repos/delivery`              |
| variable | `VITE_APP_LABEL`             | optional build-time value; see Configuration below           |
| variable | `VITE_DEFAULT_THEME`         | optional build-time value                                    |
| variable | `VITE_DEFAULT_PHONE_COUNTRY` | optional build-time value                                    |
| variable | `VITE_DEFAULT_TIMEZONE`      | optional build-time value                                    |

`VITE_*` values are inlined at build time: changing one needs a new build (push, or
re-run the workflow without a tag), not a restart. `VITE_API_BASE_URL` stays at its
`/api/v1` default for this layout.

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
