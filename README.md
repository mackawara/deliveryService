# Delivery Dashboard

Staff operations, finance and administration dashboard for the Hwange delivery service.

This repository previously held an Express marketing site with a booking form and a
chatbot. It has been replaced, in full, by the frontend specified in
_Delivery Dashboard — Frontend Specification v1.1_: a React + TypeScript single-page
application that talks to the `deliveryBooking` backend's staff API.

- **UI:** React 19 with TypeScript, MUI components and a centralized theme layer
- **Data:** one Redux Toolkit Query API, split into feature endpoint modules
- **Auth:** WhatsApp OTP for pre-registered staff with server-managed cookie sessions
- **Package manager:** Yarn 4 (pinned in `packageManager`, `yarn.lock` committed)
- **Devices:** desktop and tablet, touch and keyboard
- **Money:** USD, stored and transmitted as integer cents

## Getting started

```bash
corepack enable          # Yarn 4 comes from the pinned packageManager field
yarn install
cp .env.example .env     # public configuration only
yarn dev
```

The dev server proxies `/api/v1` to `VITE_DEV_API_PROXY_TARGET` (default
`http://localhost:4400`), so the browser stays same-origin and the session cookie works.

### Running against the backend

Start the [`deliveryBooking`](https://github.com/mackawara/deliveryBooking) service on
the proxy port with a first administrator:

```bash
# in deliveryBooking
BOOTSTRAP_ADMIN_PHONE=0772000001 PORT=4400 yarn dev
```

Sign in here with that number. Without an approved WhatsApp authentication template
configured on the server, the code is written to the server log as
`auth.otp.development_code` (development only). The administrator adds everyone else in
**Settings → Access & staff**, and sets up the first town from **Towns → Add town**;
the backend's `docs/first-town-setup.md` lists the steps.

Zone boundaries can now be drawn and edited under **Zones → Add zone / Edit**.
The Google map shows the town service area and neighbouring active zones, with
street and satellite views. Codes are suggested from the area name; aliases,
priority and GeoJSON import remain under **Advanced settings**. Crossing boundaries
and new boundaries outside the town are refused. Intentional overlaps require
confirmation and different priorities; the lower number wins. Existing zone codes
and rate-card references are retained. Multipolygons and holes remain editable.

To enable the map:

1. Create a Google Cloud project with billing enabled and enable **Maps JavaScript API**.
2. Create a browser API key, restricted to the dashboard website URLs (and local
   development URLs when needed), and restrict its API access to **Maps JavaScript API**.
3. Set `VITE_GOOGLE_MAPS_API_KEY` in the frontend environment. Restart Vite locally
   or rebuild the frontend for deployment.
4. Configure Google quotas and billing alerts. The current Dynamic Maps allowance
   is 10,000 loads/month; usage above it is billed. Budget alerts do not themselves
   cap spending. See [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
   and [key setup](https://developers.google.com/maps/documentation/javascript/get-api-key).

Maps load only when an administrator opens the boundary editor; the zone list,
bookings and pricing do not load Google Maps. Each editor opening can count as a
map load. Boundaries are stored as ordinary GeoJSON in the delivery backend. No
Places, Geocoding or Routes API is needed for drawing. A missing key or map outage
leaves the Advanced GeoJSON editor available. The integration uses supported
editable polygons rather than Google's removed DrawingManager library.

Towns inherit policy and hours from backend constants via `GET /admin/town-defaults`.
**Towns → Edit** shows effective values; admins can customize them or choose
**Use standard policy** / **Use standard hours** and save. Only policy differences
are stored; blank policy fields reset to standard wording. Saving the standard
schedule sends `operatingHours: []` to restore inheritance. The booking switch
controls whether a town accepts bookings. Defaults must load before edits can save.

To use the agreed starter parcel catalog for an existing town, run these in the
backend repository, using the database configuration for that deployment:

```bash
yarn seed:parcel-presets --town hwange --dry-run
yarn seed:parcel-presets --town hwange --apply
```

Select **Hwange** on **Administration → Parcel presets** to see the seeded catalog
in its menu order. Suggested measurements, whole-shipment scope, required handling
and operator quotes are shown as stored; presets without suggested measurements
display **Not specified**. Legacy presets still show their fixed upper bounds.
Reload the dashboard after seeding from the command line to refresh cached data.

### Running without a backend

The documented contracts — including the endpoints listed as backend additions — are
served by an in-browser mock:

```bash
VITE_ENABLE_MOCK_API=true yarn dev
```

Sign in with any number and the code `123456`. The mock is a development and test
dependency; a production build drops it from the bundle entirely.

## Scripts

| Script               | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `yarn dev`           | Vite dev server with the `/api/v1` proxy               |
| `yarn build`         | Production build into `dist/`                          |
| `yarn preview`       | Serve the production build locally                     |
| `yarn typecheck`     | TypeScript, no emit                                    |
| `yarn lint`          | ESLint over the whole repository                       |
| `yarn test`          | Vitest component and integration suites                |
| `yarn test:e2e`      | Playwright end-to-end suites at four viewport sizes    |
| `yarn doctor`        | React Doctor full scan (advisory; shows every finding) |
| `yarn doctor:check`  | React Doctor, failing on error-level findings          |
| `yarn test:coverage` | Vitest with `coverage/lcov.info`                       |
| `yarn verify`        | Typecheck, lint, format, doctor, test and build        |

CI runs `yarn install --immutable`, so a lockfile that does not match `package.json`
fails the build.

## Project layout

```text
src/
  app/          store, router, navigation model, shared UI state, town scope
  api/          baseApi, base query, DTOs, adapters, tags, feature endpoint modules
  auth/         OTP screens, CSRF and session handling, route guards
  components/   AppShell, ResourceTable, StatusChip, Money, dialogs and other shared parts
  features/     bookings, dispatch, fleet, customers, enquiries, finance, restrictions,
                configuration, alerts, audit, overview, settings
  lib/          money, dates, permissions, phone, idempotency and URL-state helpers
  theme/        semantic tokens, brand presets, theme factory, component overrides
  mocks/        MSW handlers and fixtures typed against the DTOs
tests/          component and integration suites, plus tests/e2e for Playwright
deploy/         reference nginx configuration and deployment notes
```

## Configuration

Public values only; see `.env.example`.

| Variable                     | Default                 | Meaning                                       |
| ---------------------------- | ----------------------- | --------------------------------------------- |
| `VITE_API_BASE_URL`          | `/api/v1`               | Base URL for every delivery-service request   |
| `VITE_DEFAULT_PHONE_COUNTRY` | `+263`                  | Country code pre-selected on the login form   |
| `VITE_DEFAULT_THEME`         | `orchid`                | Default brand preset; a saved preference wins |
| `VITE_APP_LABEL`             | `Delivery Dashboard`    | Product label in the shell and document title |
| `VITE_DEFAULT_TIMEZONE`      | `Africa/Harare`         | Timezone used to render API timestamps        |
| `VITE_ENABLE_MOCK_API`       | `false`                 | Dev/test only: serve contracts from MSW       |
| `VITE_DEV_API_PROXY_TARGET`  | `http://localhost:4400` | Dev server proxy target                       |

WhatsApp credentials, session and OTP secrets and authentication-template settings are
server-side and never reach the bundle.

## Theming

Two complete presets ship in `src/theme/presets`: `orchid` (purple/pink) and
`monochrome` (black/white). Selecting one in the header or in
**Settings → Appearance** applies immediately — no reload, no sign-out, no lost form
draft — and only the preset identifier is stored in the browser. An unknown stored value
falls back to the deployment default.

Colours live exclusively in the theme layer. A test fails the build if a hex colour
appears anywhere outside `src/theme`, and a second test checks text, control-border,
focus-ring and status-chip contrast for every preset. Status meaning is carried by a
label, an icon and a border style as well as a tone, so the monochrome preset stays
readable. Dark mode is a separate future setting, not the black-and-white brand.

## Authentication

Staff sign in with a one-time code delivered to their registered WhatsApp number. The
server sets an opaque `Secure; HttpOnly; SameSite=Lax` session cookie; no bearer token
or staff API key is ever stored in Redux or browser storage. Mutations carry a CSRF
token that rotates on login, and OTP arguments are redacted from Redux DevTools.

Session inactivity is extended only by real user interaction through a throttled
activity signal — background polling never keeps a session alive.

## API layer

One `baseApi` with `credentials: 'include'`; feature modules attach endpoints with
`injectEndpoints`. Components never call `fetch` or Axios; ESLint enforces that outside
`src/api`. Responses are normalized at the boundary (`_id` → `id`, `{items}`,
`{booking}` and composite detail objects unwrapped) into explicit DTOs written against
the backend's JSON rather than its `Date`-bearing interfaces.

Guarded commands send one `Idempotency-Key` per logical action and the latest
`expectedVersion`. Nothing is applied optimistically: no driver is assigned, no rate card
published, no payment marked successful, no cash recorded, no refund completed and no
customer blacklisted before the server says so. A timeout reports **Outcome not
confirmed** and refetches the record instead of silently retrying.

Visible-page polling follows the specification: 10s for dispatch and the active booking,
15s for queues, fleet and alerts, 30s for finance and enquiries, paused when the page is
not focused.

## What still needs backend work

WhatsApp OTP sign-in, cookie sessions with CSRF, `GET /admin/me` and staff provisioning
(the former P0 row) are implemented in `deliveryBooking`.

These screens are built against the contracts in specification section 11 and say so in
the interface until the endpoints exist, rather than inventing data:

| Priority | Missing backend capability                                                        | What the dashboard does today                                                  |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P1       | `GET /admin/overview`                                                             | Shows links and clearly labelled loaded-page counts, never a town-wide total   |
| P1       | Waybill and date search, sorting and pagination metadata on `GET /admin/bookings` | Those controls stay disabled; paging shows the loaded range with Previous/Next |
| P1       | Read-by-ID routes for drivers, vehicles, enquiries and configuration              | Detail pages read the town's list and explain when a deep link cannot resolve  |
| P1       | Paginated booking history                                                         | Detail histories are labelled as recent records, not an exhaustive audit       |
| P1       | `GET /admin/fraud-reports` and a review command                                   | Reports are raised from a booking and shown on the related restriction         |
| P1       | Enquiry conversation history and reply delivery status                            | Shows the enquiry record only, and confirms submission rather than delivery    |

## Testing

- **Component and integration** (`yarn test`): money parsing in cents, permissions,
  theme switching and persistence, WCAG contrast for both presets, the OTP journey,
  role-scoped routing, cache invalidation, session expiry and sign-out, the booking
  queue, and the dispatch offer including its idempotency header.
- **End-to-end** (`yarn test:e2e`): sign-in, deep-link reload, sign-out, theme switching,
  the tablet dispatch layout and dialog handling, at 1440×900, 1280×800, 1024×768 and
  768×1024.

Environments that already ship a Chromium build can point Playwright at it with
`PLAYWRIGHT_CHROMIUM_PATH`.

## Deployment

PRs into `main` (Conventional Commit titles, squash-merged) must pass the `CI gate`.
Pushes to `main` re-run it for that commit, calculate a SemVer with semantic-release,
build and smoke-test an arm64 image (Caddy serving `dist/`) on GitHub, publish it to
Docker Hub by immutable tag and deploy its **digest** next to the API. Activation is
accepted only after container health and public HTTPS smoke checks pass; otherwise the
previous dashboard is restored. The running build is shown in the sidebar footer and at
`/version.json`. See `deploy/README.md` for the pipeline, its GitHub settings, the Google
Maps key restrictions and the verification steps, and the deliveryBooking runbook for
bootstrap order, monitoring and recovery.

## Licence

MIT — see `LICENSE`.
