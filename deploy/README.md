# Deployment notes

The dashboard builds to static assets in `dist/`. Serve them behind HTTPS with the
application shell as the fallback for browser deep links.

## Production (Docker)

Production runs the dashboard as a container in the delivery compose stack, next to
the API, on the shared server. The stack, `deploy.sh`, the host Caddy blocks, the
bootstrap order, monitoring, rollback and backup runbook are owned by deliveryBooking —
see [deliveryBooking/deploy/README.md](https://github.com/mackawara/deliveryBooking/blob/main/deploy/README.md).
Publish both initial images, run its `Deploy API` workflow once, then this one.

- Dashboard origin: `https://delivery.ventawifi.com`. The browser keeps
  `VITE_API_BASE_URL=/api/v1`; host Caddy sends `/api/*`, `/media/*`, `/health` and
  `/readyz` to the API on the same origin, so session cookies, CSRF and signed photo
  links stay same-origin. The external API hostname is `https://delivery-api.ventawifi.com`.
- The image (`Dockerfile`) serves `dist/` with its own Caddy ([`Caddyfile`](Caddyfile)). That
  file is the **container's** internal static server and must never replace the host
  Caddyfile.

### Pipeline

```
PR checks → merge to main → required checks for that SHA → semantic version
→ build arm64 image on GitHub, smoke-test it → publish to Docker Hub
→ Git tag + release notes → server lock, pull the digest → replace the dashboard
→ container readiness → HTTPS smoke checks → record the pair → remove old local images
```

Everything is built and tested on GitHub runners, never on the server.

**Checks.** `CI` runs typecheck, ESLint, Prettier, **React Doctor** (pinned 0.9.18),
Vitest with LCOV coverage, the Vite build and a bundle check, Playwright (against the
mock API), and — on pull requests — the arm64 production image run locally. A single
`CI gate` job summarises them; require **`CI gate`** and the two CodeQL checks
(`Analyze (javascript-typescript)`, `Analyze (actions)`; this repository is public)
in branch protection. The release workflow additionally waits for CodeQL **on the same
commit** (`require-checks.sh`); a result from another commit never counts. Pull-request
titles must be Conventional Commits (squash-merged), because they decide the version.

**Coverage.** LCOV is uploaded to Codacy under the PR head commit (not the synthetic
merge commit); fork PRs get no token. Changed-line coverage is reported on every PR and
enforced at 80% once `ENFORCE_CHANGED_LINE_COVERAGE=true` is set after the baseline is
checked. A change with no executable `src/` lines (documentation only) passes. Codacy
is configured on the Codacy side to block new high-severity and security issues; add its
status name to `REQUIRED_STATUS_CHECKS` to make releases wait for it.

**React Doctor.** `yarn doctor` is a full advisory scan; `yarn doctor:check` blocks on
errors. Both run the pinned CLI directly (not the Action) through `scripts/doctor.mjs`
with score, telemetry and the supply-chain service off, and fail if the scanner cannot
run or reads no React project. Warnings stay visible and are not gated. The report is
uploaded as a CI artifact. `yarn verify` runs typecheck, lint, format, `doctor:check`,
tests and the build. Node must be at least 22.13 (`engines`); CI and the Docker build
use Node 22.

**Releases.** semantic-release on `main` (first release 1.0.0; the API versions
independently). `fix`/`perf` patch, `feat` minor, breaking major, `build`/`(deps)`
patch (runtime changes), docs/ci/chore none. Tags and GitHub Release notes are the
history; no version commit is pushed to protected `main`. Images are published as
`<sha>` (every commit) and `<X.Y.Z>` (releases), both immutable; a docs-only commit
keeps the previous SemVer in its metadata but gets its own image. Reruns reuse an
existing image after verifying its revision label and never move a tag. Deployment uses
the image **digest**.

**Deployment outcome.** Every downstream job has an explicit status condition,
including publication and release creation. Docs-only commits still publish and
deploy their commit image while skipping Git tag/release creation. Failed or
cancelled required checks block publication and activation. The final **Deployment
outcome** job requires a successful deployment, a successful guard explicitly
reporting a superseded revision, or a successful manual rollback. Unexpected skips
or missing outputs fail the workflow with an actionable summary. The condition and
outcome matrix runs in `tests/deployWorkflow.test.ts`.

**Build identity.** `APP_VERSION`, `APP_REVISION` and `APP_BUILD_TIME` are Docker build
arguments, stamped into the UI (sidebar footer), `version.json` (served with
`Cache-Control: no-store`) and OCI labels.

**Public build configuration** (GitHub repository _variables_; build-time, so changing
one needs a new commit and image — published tags are never rebuilt):

| Kind     | Name                                                                                          | Value                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| variable | `VITE_API_BASE_URL`                                                                           | keep `/api/v1`                                                                                                                                               |
| variable | `VITE_GOOGLE_MAPS_API_KEY`                                                                    | browser Maps key, see below                                                                                                                                  |
| variable | `VITE_ENABLE_FOOD_SETTLEMENTS`                                                                | defaults to `false`; enable only with the matching deployed API and agreed financial policy; see [settlement rollout](../docs/food-settlements-dashboard.md) |
| variable | `VITE_APP_LABEL`, `VITE_DEFAULT_THEME`, `VITE_DEFAULT_PHONE_COUNTRY`, `VITE_DEFAULT_TIMEZONE` | optional                                                                                                                                                     |
| variable | `PUBLIC_BASE_URL`                                                                             | `https://delivery.ventawifi.com` (smoke checks)                                                                                                              |
| variable | `DEPLOY_PATH`                                                                                 | optional, default `/home/ubuntu/repos/delivery`                                                                                                              |
| variable | `REQUIRED_STATUS_CHECKS`                                                                      | optional extra required checks, e.g. the Codacy status                                                                                                       |
| variable | `ENFORCE_CHANGED_LINE_COVERAGE`                                                               | `true` once the baseline is validated                                                                                                                        |
| secret   | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`                                                       | Docker Hub (write scope; release job only)                                                                                                                   |
| secret   | `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`                                                     | deploy access                                                                                                                                                |
| secret   | `SSH_KNOWN_HOSTS`                                                                             | pinned host key — **required**; deployments refuse without it                                                                                                |
| secret   | `CODACY_PROJECT_TOKEN`                                                                        | coverage upload; not exposed to fork PRs                                                                                                                     |

No server or provider secret is ever passed to the frontend build; `scripts/check-dist.mjs`
(run in CI and inside the Dockerfile) fails the build if the bundle names one, carries the
MSW mock worker or runtime, or disagrees with the version being built.

### Google Maps

The Zones **Add/Edit** boundary editor lazy-loads Maps (street and satellite views, with
neighbouring zones). Nothing else loads it. The key is a _browser_ key and is therefore
visible in the bundle: in Google Cloud restrict it to **HTTP referrers**
`https://delivery.ventawifi.com/*` and to the **Maps JavaScript API** only,
with billing quotas set. If the key is missing or Maps fails to load, the editor offers
retry and the advanced GeoJSON fallback; zones still save ordinary GeoJSON to the API.

### Activation, acceptance and rollback

Before activation or manual rollback, `check-deploy-bundle.sh` checks the delivery
ownership marker and invokes the installed `bash deploy.sh compatibility` read-only
probe. It requires JSON identifying `interface: "delivery-deploy"`,
`interface_version: 1`, `bundle_schema: 1`, and commands `activate`, `accept`,
`rollback`, `rollback-to`, `record`, `status`. A legacy script that cannot answer,
malformed output, missing commands or a schema/interface mismatch fails preflight
before any activation or settings/container changes. JSON is checked on the runner;
the VM needs no additional parser. `tests/deployPreflight.test.ts` covers compatible,
legacy, incompatible and foreign-stack installations and preserves API settings.

If preflight reports an outdated bundle (or an old run says
`unknown service 'activate'`), recover in this order:

1. Merge and deploy the corrected **deliveryBooking Deploy API** workflow/shared
   bundle from [deliveryBooking #22](https://github.com/mackawara/deliveryBooking/issues/22).
   Run it on the corrected main revision; rerunning the old SHA uses the old workflow.
   Require publication, deployment, readiness, HTTPS smoke checks, acceptance and
   **Deployment outcome** to succeed. A successful CI-only run is insufficient.
2. In the server's `DEPLOY_PATH`, confirm `bash deploy.sh compatibility` reports
   the interface/schema/commands above.
3. Run the corrected **Deploy Dashboard** workflow on main. Require the preflight,
   readiness, HTTPS smoke checks, acceptance and **Deployment outcome** to pass;
   confirm the current API digest and settings remain unchanged.

Do not install or overwrite the API-owned shared bundle from this repository and
do not fall back to the legacy positional or mutable/tag-based deployment interface.

The dashboard workflow runs the server's installed `deploy.sh` (owned by deliveryBooking):
it takes the shared lock, checks disk, pulls the digest first, snapshots, replaces **only
the dashboard** (the API digest and configuration are preserved), and waits for container
health. The workflow then runs `smoke.sh` over public HTTPS and only on success calls
`accept`, which records the version pair and removes obsolete local delivery images.
Either gate failing runs `rollback`, restoring the previous dashboard from the image that
is still local. The dashboard declares the compose-bundle schema it expects and is refused
if the API has activated an incompatible bundle. A newer push supersedes a run that is
still queued; an active deployment is never cancelled.

**Later rollback** (after cleanup has removed the old local image): Actions → _Deploy
Dashboard_ → Run workflow → `rollback_to` = a run id from `deploy.sh status` on the
server. The recorded digest is pulled again from Docker Hub.

### Verifying the production image

Automated checks are safe and never mutate data or contact providers:

- **Container smoke test** (`.github/scripts/container-smoke.sh`, on every PR and before
  every publish): app shell and security headers; entry points `no-store`; hashed assets
  `immutable`; deep links serve the shell; a missing asset or file is a real 404; backend
  paths reaching this server return a JSON 502 instead of the shell; `/version.json` is
  uncached and matches the build; the MSW worker is not served.
- **HTTPS smoke test** (`.github/scripts/smoke.sh`, after every deployment): the running
  `version.json` equals the deployed version/revision, deep links work, missing assets
  404, the dashboard origin reaches a **ready** API (`/readyz`), and unknown `/api/...`
  paths return API JSON rather than the SPA page. A failure triggers rollback before old
  images become eligible for cleanup.

**Operator acceptance** (once at first launch, real WhatsApp and providers — _not_ run by
CI): sign in with a real OTP; session refresh; an authorised mutation succeeds and an
invalid CSRF token is rejected; logout; draw and edit a zone boundary with Google Maps
(and with Maps blocked, the GeoJSON fallback); a signed parcel photo displays, and a
tampered and an expired link are refused; confirm grocery, Venta WiFi and the other
sites on the shared Caddy still respond. The checklist is in the deliveryBooking runbook.

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
