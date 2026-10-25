# Order Food onboarding fixes and local verification

These changes pair with deliveryBooking's shop-management API. Phases 4–6,
production activation, deployment and real business transactions remain separate.

## Run locally

Use Node 22.12 or newer. Install each repository's dependencies using its pinned
Yarn version (API: Yarn 1; dashboard: Yarn 4). Start the API with its memory/test
configuration or a dedicated local test database; never point rehearsal commands
at production. For ordinary local UI work set `VITE_ENABLE_MOCK_API=false` and
`VITE_DEV_API_PROXY_TARGET=http://localhost:4400` (or your local API port).
The shop owner journey needs real API contracts; the staff demo mocks are not an
onboarding backend.

The API needs `FOOD_SHOP_MANAGEMENT_ENABLED=true`, a stable development
`AUTH_SECRET`, and the existing OTP template/delivery settings. Owner and customer
allowlists are independent. New branches start closed/pending with no order-message
consent. Owner sign-in does not verify the branch contact. On the branch profile,
obtain explicit permission from the actual WhatsApp contact, send that contact a
code, and verify it to record `food-shop-orders-v1` consent. Contact changes close
the branch, invalidate prior consent/codes, and require fresh verification.
Contacts cannot change while an order awaits acceptance or READY. Admins cannot
replace the contact's verification with an approval or import.

The owner-only `/shop/towns` endpoint returns active bookable town names and public
service-area geometry. No staff town configuration API is needed. The pickup
picker reuses `VITE_GOOGLE_MAPS_API_KEY` and the shared Maps JavaScript loader.
Restrict this browser key to your frontend origins. With no key, denied location,
auth failure or a loading timeout, paste coordinates/a map URL, or enter coordinates
under the fallback. Current-location selection is also available. Supply a short
address; the API still rejects out-of-area and ambiguous pickup pins.

Setup drafts live in tab-scoped session storage, partitioned by owner ID, and expire
after seven days. The branch-creation idempotency key survives a reload of an
unchanged draft. Successful creation clears the draft; edits start a new logical
creation attempt. Codes and consent are never restored from drafts. Use Clear setup
draft on a shared computer. Browser storage restrictions do not prevent setup.

Commercial terms use the API's nested `commissionPolicy` / `settlementPolicy` shape.
`proposedTermsId` identifies the exact current proposal, irrespective of array order.
`acknowledgedAt` determines its acknowledgement state. Existing agreed policy and
historical proposals remain visible. Weekly requests require weekday 0–6 (Sunday=0),
monthly requests day 1–28; daily requests omit the anchor. Timezone and cutoff remain
part of every request. Opening/closing sends only `isOpen` and `expectedVersion`;
unchanged pickup coordinates/address do not remove approval.

Owner shop and item reads project the current JPEG derivative as `thumbnailBase64`.
They omit private original references. Image upload invalidates the branch detail,
branch list and relevant item/list caches. Reloads read the same authorized current
rendition; the client never constructs public original URLs.

## Regression commands

From deliveryBooking:

```sh
yarn typecheck
yarn test tests/unit tests/acceptance
yarn build
```

From deliveryService:

```sh
yarn typecheck
yarn test tests/shopApi.test.ts tests/shopForms.test.tsx
yarn build
yarn typecheck:cross-repo
ORDER_FOOD_API_REPO=/absolute/path/to/deliveryBooking-1 yarn test:cross-repo
```

The cross-repository test defaults to the sibling `../deliveryBooking-1`; set
`ORDER_FOOD_API_REPO` when your checkout has a different name. The optional cross-repository TypeScript configuration assumes that default sibling
name; adjust its two `paths` entries if you use a different checkout layout. Both
checkouts must contain these fixes and have dependencies installed. The dedicated Vitest config
runs only `cross-repo/`, aliases the API's helpers to the same Vitest runtime, and
uses the dashboard's ordinary store, endpoints and rendered profile. It opens an
ephemeral loopback Express server. A transparent MSW transport bridge forwards real
request bodies, responses and cookies; it supplies no mock shop/terms contracts.
No live API, real WhatsApp transport, real cash, MongoDB or Redis is used. Local
socket access is required by the test runner.

The journey covers owner OTP → two branches → separate contact consent/OTP →
packaged catalogue/photos → two admin proposals → exact latest acknowledgement →
admin approval → owner opening without losing approval → cache-empty photo reload →
encrypted customer Flow catalogue/cart → confirmation → received shop notification →
explicit acceptance → explicit READY → first rider offer. It checks that contact
changes cannot strand active orders and that later catalogue/terms changes preserve
confirmed item and amount snapshots. API regressions additionally cover other-owner
and other-branch isolation, key replays/conflicts, stale contact codes, failed OTP
attempts, transaction rollback, service coverage and period-anchor boundaries.

The normal `yarn test` also includes deployment tooling suites. On macOS those may
need GNU `timeout`; release rule tests require `@semantic-release/commit-analyzer`
to be installed in the existing release-test environment. These tools are unrelated
to onboarding. A real Google map/device and Meta template/publication rehearsal is
still an external integration check; the automated journey does not claim to test
provider delivery or publish any Flow.
