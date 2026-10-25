# Shop orders: paired API/dashboard contract

Targets: deliveryBooking #38 and deliveryService #22. API base: unmerged onboarding
PR47 (`codex/37-shop-onboarding`); dashboard base: main including PR25/PR27. PR46's
shared workflow and reassignment fixes are retained. The existing PR48 secrets
branch and both original working checkouts are unchanged.

## Transport

Owner cookie authentication, owner CSRF and Origin checks apply under `/api/v1/shop`.
The shop-management feature gate/owner pilot allowlist and `FOOD_ORDERING_ENABLED`
remain authoritative. `/shop/me` advertises `orders:manage` only when food is enabled.
Every response is `Cache-Control: no-store`. Missing sessions return 401; inaccessible
shops/orders return 404; invalid fields return 422; stale state/deadline or a changed
idempotency payload returns 409. Errors retain `{code,message,fieldErrors?,correlationId}`.
A conflict message instructs the caller to refresh; current state comes from GET.

| Method and path                | Input                                                                             | Response                                         |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET `/food-orders`             | required `shopId`; `status=ACTIVE` default; optional `cursor`, `limit=25` (1–100) | `{items,nextCursor,serverNow,pollingIntervalMs}` |
| GET `/food-orders/:id`         | Authorizes the order's actual branch                                              | `{order,serverNow}`                              |
| POST `/food-orders/:id/accept` | `{expectedVersion,prepMinutes}`                                                   | `{order,serverNow}`                              |
| POST `/food-orders/:id/reject` | `{expectedVersion,reasonCode}`                                                    | `{order,serverNow}`                              |
| POST `/food-orders/:id/ready`  | `{expectedVersion}`                                                               | `{order,serverNow}`                              |

All three POSTs require `Idempotency-Key` (8–200 characters) and integer version ≥1.
Preparation is whole minutes from 1 through server `prepMaxMinutes` (default 180).
Rejection reasons: `TOO_BUSY`, `OUT_OF_STOCK`, `CLOSING`, `CANNOT_FULFILL`.
Only a pending order before its persisted acceptance deadline permits accept/reject.
Only PREPARING permits READY; terminal delivery state also blocks it. Closing a
branch does not revoke access or cancel an accepted order.

Filters: `ACTIVE`, `ALL`, `COMPLETED`, `AWAITING_SHOP`, `PREPARING`, `READY`,
`REJECTED`, `CANCELLED`. ACTIVE excludes fulfillment outcomes; COMPLETED includes
terminal fulfillment outcomes. READY is food state and can persist after delivery;
use delivery progress for the delivery outcome. Cursor pagination sorts immutable
`createdAt DESC, id DESC`, including tied timestamps. A cursor binds branch and filter;
changing either starts a new page chain. Newly inserted head records appear on the
first page and cannot duplicate already-read records on later pages. Indexes support
branch/status/date/ID and branch/date/ID reads.

## Order projection and action guarantees

Each order contains `id,reference,shopId,status,version,createdAt,updatedAt,placedAt`,
acceptance/preparation/readiness/rejection/cancellation timestamps (nullable),
`prepMinutes`, `prepMaxMinutes`, `availableActions`, `serverNow`, `pollingIntervalMs`,
`itemCount`, and `{currency:'USD',foodSubtotalCents,deliveryFeeCents,totalCents}`.
Money is integer cents; the UI uses the shared USD formatter.

`payment:{method,state}` reflects the linked delivery. `delivery` contains its
`status,version,progress,dispatchEligible,holdCode,estimate`. Progress distinguishes
pending/preparing, held, finding, offered (unaccepted), assigned, picked up, delivered,
closed and operations assistance. Eligibility is advisory at read time: readiness,
service hours, payment, cash arrangement, customer eligibility and immutable load
checks are rechecked by dispatch. Finding a rider is displayed only after readiness
with these checks passed. Offered never implies assigned. Rider suitability/fresh
location and atomic reservations remain enforced by the shared dispatch service.

The nullable estimate contains `estimatedReadyAt,deliveryWindowStart,deliveryWindowEnd,
calculatedAt,source,confidence`. Bounds may be null. Age is shown and estimates older
than five minutes are labelled stale; no distance is presented as a driving ETA.

Detail adds immutable `items` (name/category, quantity, unit/line USD cents and
packaged delivery size), customer name, delivery address/area, and event history
(time, event, channel, actor type). Customer phone/history, risk reports, owner IDs,
private shop contacts, commercial ledger/refusal data, provider payloads and rider
balances are omitted. Original actor identity remains in the privileged audit log.
`notifications:{pending,needsHelp}` exposes only aggregate retry/failure state.
`help` directs staff to delivery operations; `/shop/help` provides the dashboard's
exception instructions. The pilot must agree an operations contact before use.

The existing shared transaction commits state, audit, notification outbox and durable
idempotency record together. Live membership is checked and the membership record
is conditionally written inside that transaction, serializing revocation. Replays
recheck access. State-changing audit names are `SHOP_ORDER_ACCEPTED`,
`SHOP_ORDER_REJECTED`, `SHOP_ORDER_READY`, for both channels. They retain actor,
channel, order/branch, time and correlation. No second order store is introduced.

An identical key/payload replays the original committed **order state/version**, even
if another channel subsequently advanced it. Changed payload/action/actor conflicts.
Replay records last 30 days. `serverNow`, delivery and notification projections are
current response metadata; GET is always the convergence source. A timeout is an
unconfirmed outcome. The UI retains the original frozen payload, version and key in
memory, refetches, blocks new actions and offers only explicit original-command replay.
A reload discards this in-memory attempt; read the latest state before any new action.
Double-click locking occurs synchronously before dispatch. No optimistic mutation is
applied. Query merges refuse older order/delivery versions or older server reads.

## Refresh, privacy and clock behavior

Default visible inbox/detail refresh: 5 seconds plus request latency. Server tuning:
`FOOD_SHOP_POLL_INTERVAL_MS=5000` (1,000–60,000). The UI honors this guidance, refetches
on focus/reconnect/visibility recovery, and cancels the timer on hide/unmount. The
owner/membership and branch lists also refresh every five seconds while focused.
Use first-page polling for new arrivals; historical pages remain stable. Detail stays
on its selected ID, unaffected by new inbox ordering. Text announces new orders.

Last server refresh, offline/stale state and retry are visible. A 15-second read gap
blocks normal actions until refreshed. Countdowns and proposed ready time use server
responses plus monotonic elapsed time, independent of the device's wall clock.
Expired preparation shows overdue and never signals readiness. WhatsApp remains the
notification route while a browser sleeps. The server remains authoritative at the
acceptance boundary even when a stale tab submits.

Keys include owner and branch identity. Protected pages use current scoped query
results and membership; guessed routes cannot render another branch. Logout/session
loss/membership changes reset the protected RTK cache, including in-flight results.
A saved branch ID is restored only after matching current active memberships. No
order, customer details, cookies or tokens are written to browser storage. Sensitive
order requests/results are redacted from Redux DevTools.

## Repeatable local and pilot checks

Use each repo's pinned Yarn/Node tooling. API:

```sh
yarn typecheck
yarn lint
yarn test tests/acceptance/shop_order_api.test.ts tests/acceptance/food_shop_workflow.test.ts tests/acceptance/shop_management.test.ts tests/unit/foodConfiguration.test.ts --maxWorkers=1
yarn build
# Real datastore concurrency (dedicated disposable replica set and Redis):
INTEGRATION_MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' INTEGRATION_REDIS_URL='redis://127.0.0.1:6379' yarn test:integration
```

Dashboard:

```sh
yarn typecheck
yarn lint
yarn test tests/shopOrders.test.tsx tests/shopApi.test.ts --maxWorkers=1
ORDER_FOOD_API_REPO=/absolute/path/to/paired/API yarn test:cross-repo
yarn build
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium yarn playwright test --config playwright.shop-orders.config.ts
```

The browser configuration uses installed Chrome on macOS as a fallback; CI can supply
its own Chromium executable. For cross-repo static typing, the existing
`tsconfig.cross-repo.json` aliases expect a sibling `deliveryBooking-1` checkout.
For ordinary local use disable mock API, point `VITE_DEV_API_PROXY_TARGET` at the paired
API, enable shop management/food with approved pilot owner/customer allowlists and
`FOOD_ORDERING_TEST_MODE=false`. Keep a stable development auth secret and working
OTP/contact-consent configuration. Use an approved/open branch with accepted terms,
packaged items, a service area and a suitable available rider. No settlement/EcoCash
implementation or production configuration changes are included.

For a real pilot, arrange approved WhatsApp order/status/preparation/shop/rider-offer
templates, channel opt-in, configured credentials, delivery operations contact and
calibrated wait ranges. In two authorized branches verify:

1. Keep Orders open; customer confirms a new single-branch order. Record server poll
   completion and observed browser arrival; target ≤5 seconds + measured API latency.
2. Accept in the dashboard, then READY on WhatsApp. Verify no pre-READY offer, one
   rider offer, explicit rider acceptance, pickup, full COD receipt and delivery.
3. Repeat with WhatsApp acceptance and dashboard READY. Verify offered/assigned differ.
4. Race two tabs/channels, disconnect after submission, replay the original command,
   revoke membership, switch owners and close a branch during preparation.
5. Simulate provider outage in the pilot test environment. Confirm action persistence,
   queued retry, operations failure alert and recovery. Record actual message delivery
   receipts and measured wait ranges separately from application test assertions.

Automated HTTP/cross-repo journeys use real application services with in-memory stores
and recorded WhatsApp/payment adapters. Browser tests use explicit contract fixtures.
They validate workflows without sending external user messages or creating production
transactions. They do **not** establish real WhatsApp template approval/delivery,
physical rider handover, network load capacity or calibrated ETA accuracy. Those pilot
checks require configured external services and explicit authorization for live messages.
