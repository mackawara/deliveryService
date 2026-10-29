# Food EcoCash dashboard

Implements deliveryService #24 with deliveryBooking #40. Customer collections belong
to the platform's Paynow merchant integration. Shop payout details remain a separate,
manual settlement destination; no merchant key, PIN or wallet collection form is exposed.

## API contract

Admin reads and PATCHes `/api/v1/admin/food/shops/:shopId/payment-settings`.
Active owners/managers read `/api/v1/shop/shops/:shopId/payment-settings`. Responses
use `{ paymentSettings: { shopId, currency: 'USD', codEnabled, ecoCashEnabled,
status, version, provider: { ready, usdSupported, checkedAt?, blockedReason? },
blockedReason?, enabledAt?, enabledBy? } }`. Status is `DISABLED`, `READY`, `ENABLED`
or `UNAVAILABLE`. Capability data is a safe server summary, never a credential.

PATCH sends `{ ecoCashEnabled, expectedVersion, reason }` and `Idempotency-Key`.
An uncertain result locks the command and offers an explicit identical-key replay.
A conflict reloads the server version, keeps the originally requested enabled/disabled
value, and requires an explicit review/save. The UI never reports success before
the API confirms the command. Unsupported USD, missing evidence, unapproved shops,
missing allowlist entries and provider outages remain backend-enforced gates.

Payment DTOs retain parcel fields and add optional `foodOrderId`, `shopId`, frozen
`allocations` (`foodSubtotalCents`, `deliveryFeeCents`, `commissionCents`,
`shopNetCents`), `verifiedAmountCents`, `verifiedCurrency`,
`provisionalCreditStatus` (`PENDING`, `HELD`, `ELIGIBLE`, `REVERSED`),
`holdReason` and `canReconcile`. Food reconciliation is offered only when both the
server and the current staff capability permit it. No replacement charge or force-paid
action exists. Refund records link to the original payment attempt and food order.

Shop balance responses may add `provisionalPendingCents`, separately from
`pendingCents` awaiting a settlement schedule. The dashboard displays server-owned
amounts; it never calculates shop net from current terms. A $12 collection may include
$10 food and $2 delivery, with a $1 commission and $9 provisional shop net. That credit
is not a completed payout and cannot imply dispatch or settlement eligibility.

## Access and cache behavior

Settings edits require an admin role and an authorized town. Owner panels require a
live active OWNER/MANAGER membership of the selected branch and expose read-only
availability. Existing finance route requirements are unchanged; finance settlement
access does not grant unrelated payment/refund rights. Queries carry actor/branch
identity in their cache keys, never in authorization request bodies; views use current
query data, discard cached data on query errors, and unmount on identity/role changes.
Existing auth providers reset the API cache on account or membership changes.

## Rollout

`VITE_ENABLE_FOOD_ECOCASH=false` is the default in local, Docker and CI builds.
Historical payment attempts and refund/reconciliation tools remain visible when
new checkout is disabled. Enable the panel only with the matching API; the separate
`VITE_ENABLE_FOOD_SETTLEMENTS` gate still controls earnings/payout pages.

Before enabling any pilot branch, record approved provider USD collection evidence,
merchant verification, fee treatment, callback/polling behavior and the manual refund
procedure in the API verification record. Run the controlled customer/payment/shop
acceptance/READY/fulfillment/settlement journey, duplicate and late callback cases,
rejection/refund holds, account/branch switching and narrow-screen keyboard checks.
No production payment or provider sandbox verification was performed by these
dashboard changes; rollout remains disabled until operations completes those gates.

Focused automated fixtures cover admin/owner/town access, default-off behavior,
unavailable provider wording, stale-version reload, double-submit prevention,
identical uncertain retries, actor/branch cache separation, frozen allocations,
wallet masking and narrow reconciliation/refund capabilities.
