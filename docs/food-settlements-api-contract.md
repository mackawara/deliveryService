# Food settlements API contract

Dashboard issue [#23](https://github.com/mackawara/deliveryService/issues/23) consumes
deliveryBooking [PR #50](https://github.com/mackawara/deliveryBooking/pull/50), pinned
to `40c9923938d20f9b129138bc5789f065b7faf455`.
This document describes that commit, not an assertion that it is deployed.

Authoritative sources are `src/http/routes/foodFinance.ts`,
`src/http/routes/cashReconciliation.ts`, `src/http/routes/admin.ts`,
`src/domain/foodFinanceTypes.ts`, `src/domain/cashReconciliationTypes.ts`, and
`src/modules/food/finance.ts` in the API repository.

## Gates, identity and mutation safety

- All paths below include `/api/v1`. Staff paths use the existing staff cookie
  and CSRF flow; owner paths use the separate shop cookie and shop CSRF flow.
- `FOOD_SETTLEMENTS_ENABLED=false` is the API default. Finance reads and writes
  return `403 FOOD_SETTLEMENTS_DISABLED` while disabled. Owner sessions also
  require shop management and the configured owner allowlist.
- `/shop/me` adds `settlements:read` and `payout-details:manage` only when the
  settlement API feature is enabled. Staff `/admin/me` capabilities are based
  on roles and do not prove deployment enablement. There is no staff settlement
  readiness endpoint; a successful settlement read establishes API availability.
- Both admin-only and finance-only staff receive
  `food.settlements.{read,create,approve,void,pay,reveal,adjust,configure}`.
  Operators receive none. Every route rechecks staff role and town scope; owner
  routes recheck active branch membership, including exports and mutation replay.
  Do not grant unrelated finance features to admins through a shared route guard.
- Every mutation sends `Idempotency-Key` (8–200 characters). Preserve the exact
  key and payload for an unconfirmed retry; changed payloads require a deliberate
  new command. Keys are sent in headers, not JSON.
- All finance JSON bodies are strict. `expectedVersion` is required: shop version
  for draft generation, agreements, payout details and adjustments; statement
  version for approve/void/pay/reveal; order version for failed-food review;
  discrepancy version for resolution. Collection versions are required per
  selected collection for cash hand-ins, rather than one expectedVersion.
- `409` includes state/version/reservation/idempotency conflicts. Preserve the
  user's form, refresh server state and request deliberate resubmission. `422`
  includes invalid dates/amounts or missing payout details. Never optimistically
  display paid, resolved or remitted success.
- Safe errors are `{code,message,correlationId,fieldErrors?:[{field,message}],
currentVersion?:number}`. The version is present for `VERSION_CONFLICT` only;
  no complete replacement record is embedded in the error.
- Money is integer USD cents. API dates serialize as ISO strings. Input instants
  must include an explicit timezone offset. Periods are `[from,to)` and use
  Africa/Harare. Display server totals; do not calculate commission or financial
  balances from visible rows.

## Shared response shapes

All documents use `_id` (not `id`), `version`, `createdAt`, `updatedAt`.
Actor is `{type,id,label?}`. `Page<T>` is `{items:T[],nextCursor:string|null}`.
Food-finance pages accept `limit` (1–100, default 25) and opaque `cursor`.
Cursors are bound to their branch/filter scope and must reset when scope changes.

`Agreement` contains `shopId,townId,enabled,frequency` (`DAILY|WEEKLY|MONTHLY`),
`timezone:'Africa/Harare',cutoffTime:'00:00',weeklyAnchor?,payoutLagDays,
payoutWeekday?,payoutDay?,eligibilityPolicy` (`ON_SCHEDULE|AFTER_REMITTANCE`),
`effectiveFrom,recordedBy`. `weeklyAnchor/payoutWeekday` use Sunday=0;
`payoutDay` is 1–28. Agreements are immutable prospective revisions.

`Destination` contains `shopId,townId,method` (`CASH|BANK_TRANSFER|ECOCASH`),
`accountName,accountIdentifier,provider?,reason,recordedBy`. Ordinary reads and
mutation responses mask `accountIdentifier` as `••••` plus the last four
characters. They do not have a separate `masked` flag.

`Balance` contains `shopId,townId,currency:'USD',grossCents,commissionCents,
adjustmentCents,earnedCents,paidCents,balanceCents,availableCents,reservedCents,
heldCents,carryForwardCents,pendingCents,disputedCents,nextPayoutAt:string|null,
failureExceptions,exceptions`. It has no shop version or shop display name.
`exceptions` are `{payableId,orderId,reason,amountCents}`.
`failureExceptions` are `{orderId,bookingId,shopId,reference,foodSubtotalCents,
shopNetCents,outcome,reason,version,review?}` and remain separate from delivered
earnings. `review?` is `{decision,reason,by,at,amountCents?,adjustmentId?}`.

`LedgerEntry` contains `shopId,townId,entryType`
(`EARNING|COMMISSION|ADJUSTMENT|PAYOUT`), `amountCents,currency:'USD',sourceKey,
operationKey?,orderId?,payableId?,payoutId?,settlementId?,settledAt?,occurredAt,
effectiveAt?,recordedBy,reason?,correctsEntryId?,commissionPolicySnapshot?,
eligibilityAtPosting?,holdReasonAtPosting?,eligibility?,holdReason?`.
Eligibility values are `PAYABLE|HELD|RESERVED|PAID|VOID|PENDING|UNKNOWN`.
Commission and payout ledger amounts are signed debits; balance commission and
paid totals are positive amounts. Legacy pilot entries have `legacy:` source IDs,
preserve paid allocations and may have unknown posting eligibility.

`SettlementLine` contains `sourceId,orderId?,orderReference?,payableId?,entryIds,
occurredAt,foodSubtotalCents,commissionCents,adjustmentCents,netCents,carryForward,
commissionPolicySnapshot?,settlementPolicySnapshot?,originalPeriodStart?,
originalPeriodEnd?,originalPayoutAt?`.

`Settlement` contains `shopId,townId,currency:'USD',status`
(`DRAFT|APPROVED|PAID|VOID`), `from,to,activePeriodKey?,agreementSnapshot,
destinationSnapshot,payoutAt,lines,payableIds,entryIds,grossCents,commissionCents,
adjustmentCents,amountCents,broughtForwardCents,heldCents,disputedCents,
failureExceptions,exceptions,recordedBy,approvedBy?,approvedAt?,voidedBy?,
voidedAt?,voidReason?,payment?`. `payment?` contains
`payoutId,amountCents,method,paidAt,reference,destinationId,destinationVersion,
recordedBy`. Approval freezes the destination; later destination changes do not
change an approved statement. Paid statements cannot be edited or voided.

`commissionPolicySnapshot` is `{kind:'BASIS_POINTS',basisPoints,rounding:'HALF_UP',
reference,effectiveFrom,version}`. `settlementPolicySnapshot` is
`{frequency,timezone,cutoffTime,periodAnchor?,effectiveFrom,version,
financeAgreementId?,payoutLagDays?,payoutWeekday?,payoutDayOfMonth?,
eligibilityPolicy?}`. Render these snapshots without recomputing money.

## Staff settlement endpoints

Paths in this table start with `/api/v1/admin`.

| Method/path                                            | Request                                                                                                                      | Response                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GET `/food/shop-balances`                              | `townId?,limit?,cursor?`                                                                                                     | `Page<Balance>`                                 |
| GET `/food/settlements`                                | `shopId?,townId?,status?,periodStart?,periodEnd?,limit?,cursor?`                                                             | `Page<Settlement>`                              |
| POST `/food/settlements`                               | `{shopId,from,to,expectedVersion,agreementId?}`                                                                              | 201 `{settlement}`                              |
| GET `/food/settlements/:id`                            | —                                                                                                                            | `{settlement}`                                  |
| POST `/food/settlements/:id/approve`                   | `{expectedVersion}`                                                                                                          | `{settlement}`                                  |
| POST `/food/settlements/:id/void`                      | `{expectedVersion,reason}`                                                                                                   | `{settlement}`                                  |
| POST `/food/settlements/:id/paid`                      | `{expectedVersion,amountCents,method,paidAt,reference,destinationId,destinationVersion}`                                     | `{settlement}`                                  |
| POST `/food/settlements/:id/payout-destination/reveal` | `{expectedVersion,reason}`                                                                                                   | `{destination,amountCents}` (unmasked, audited) |
| GET `/food/shops/:shopId/settlement-agreement`         | —                                                                                                                            | `{agreement:Agreement                           | null,shopVersion}` |
| PUT `/food/shops/:shopId/settlement-agreement`         | `{expectedVersion,frequency,weeklyAnchor?,payoutLagDays,payoutWeekday?,payoutDay?,eligibilityPolicy?,enabled,effectiveFrom}` | `{agreement}`                                   |
| GET `/food/shops/:shopId/payout-details`               | —                                                                                                                            | `{payoutDetails:Destination                     | null,shopVersion}` |
| PUT `/food/shops/:shopId/payout-details`               | `{expectedVersion,method,accountName,accountIdentifier,provider?,reason}`                                                    | `{payoutDetails}` (masked)                      |
| POST `/food/shops/:shopId/adjustments`                 | `{expectedVersion,amountCents,reason,orderId?,effectiveAt?,correctsEntryId?}`                                                | 201 `{entry:LedgerEntry}`                       |
| GET `/food/shops/:shopId/failure-exceptions`           | `limit?,cursor?`                                                                                                             | `Page<FailureException>`                        |
| POST `/food/orders/:id/finance-review`                 | `{expectedVersion,decision,amountCents?,reason}`                                                                             | `{order}`                                       |
| POST `/food/payables/:id/decision`                     | `{expectedVersion,decision:'RELEASE'                                                                                         | 'HOLD',reason}`                                 | `{payable}`        |

Draft generation uses `from/to`, whereas list filtering uses
`periodStart/periodEnd`. Generation reserves sources atomically and includes
brought-forward eligible earnings. There is no separate preview endpoint. Draft
generation already requires an active/approved shop, enabled agreement, complete
closed period and payout destination. Approval requires a positive amount.
Zero/negative statements carry forward and cannot be paid. Payment requires the
exact approved positive amount and frozen destination/method; actual `paidAt`
must be at/after approval and payout due time and no later than server time.
Reference length is 3–100. Finance reasons are 3–500 characters.
Reveals are available only for approved/paid statements; clear revealed data when
closing the flow and never persist it to ordinary query cache or browser storage.

## Owner endpoints

Paths start with `/api/v1/shop/shops/:shopId` and always require that branch's
active membership.

| Method/path                   | Request                                          | Response                                                             |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| GET `/earnings`               | `limit?,cursor?`                                 | `{items:LedgerEntry[],nextCursor,balance:Balance,agreement:Agreement | null,shopVersion,serverNow}` |
| GET `/settlements`            | `status?,periodStart?,periodEnd?,limit?,cursor?` | `Page<Settlement>`                                                   |
| GET `/settlements/:id`        | —                                                | `{settlement}`                                                       |
| GET `/payout-details`         | —                                                | `{payoutDetails:Destination                                          | null,shopVersion}`           |
| PUT `/payout-details`         | Same destination body as staff                   | `{payoutDetails}` (masked)                                           |
| GET `/earnings/export`        | `limit?,cursor?`                                 | CSV page, optional `X-Next-Cursor`                                   |
| GET `/settlements/:id/export` | —                                                | Complete statement CSV                                               |

There is **no owner reveal endpoint** and GET payout details is always masked.
An edit must require the full replacement account identifier; never prefill or
resubmit the masked identifier. The write uses `shopVersion`, not the destination
revision version. Refetch after successful writes to obtain the new shop version.
Exports are generated by the API, exclude private destination/customer details
and escape CSV formula prefixes. Owner earnings does not accept date/status
filters at this revision; do not imply a displayed filtered page is a financial
total. Settlement list filtering is supported.

## Rider cash contracts

Paths start with `/api/v1/admin`. These routes authorize admin or finance by
role and town, independently of the food-settlement feature flag. Existing
dashboard finance capabilities/route guards still need separate treatment.

| Method/path                            | Request                                                      | Response                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| GET `/cash-ledger`                     | `bookingId?,driverId?,state?,limit?`                         | `{items:CashLedgerEntry[],totalsScope:'DRIVER_BALANCES_ALL_BOOKINGS_AND_STATES',totals:CashOutstanding}` |
| GET `/cash-outstanding`                | `driverId?`                                                  | `CashOutstanding`                                                                                        |
| POST `/drivers/:id/cash-remittances`   | Exact or actual-received body below                          | 201 `{entry,discrepancy?}`                                                                               |
| GET `/cash-discrepancies`              | `driverId?,status?:'OPEN'                                    | 'RESOLVED',limit?`                                                                                       | `{items:CashLedgerEntry[]}` |
| GET `/cash-discrepancies/:id`          | —                                                            | `{entry}`                                                                                                |
| POST `/cash-discrepancies/:id/resolve` | `{expectedVersion,resolution,amountCents?,reason,evidence?}` | `{discrepancy,correction}`                                                                               |

Exact remittance body is `{ledgerEntryIds,collectionVersions,amountCents,
receiptReference,notes?}`. Versioned actual hand-in body is
`{ledgerEntryIds,collectionVersions,amountReceivedCents,receiptReference,reason?,
evidence?}`. Send exactly one of `amountCents` or `amountReceivedCents`; do not mix
legacy notes with an actual hand-in or reason/evidence with an exact remittance.
`collectionVersions` maps every selected collection `_id` to its current version;
1–200 collection IDs. Expected cash is server owned; a short/over hand-in records
actual cash without altering the original expected total. A mismatch requires a
reason. `receiptReference` is 1–120 characters.

`CashLedgerEntry` has `_id,version,createdAt,updatedAt,bookingId,townId,driverId?,
entryType,state,amountDueCents,amountReceivedCents?,changeGivenCents?,payerRole,
handoverContact?,receiptReference?,recordedBy,occurredAt,operationKey?,
remittanceReference?,reconciliationReference?,notes?,linkedEntryIds,handInId?,
requestHash?,handIn?,discrepancy?,correction?,foodOrderIds?`.
`entryType` is `DUE|COLLECTION|REMITTANCE|RECONCILIATION|DISCREPANCY|CORRECTION|REFUND`;
`state` is `DUE|COLLECTED_BY_DRIVER|REMITTED|RECONCILED|DISCREPANCY`.

`handIn` is `{expectedCents,receivedCents,differenceCents}`. Difference is
**received minus expected** (negative shortage, positive overage).
`discrepancy` adds `handInId,status,currentReceivedCents,outstandingCents,
overageCents,reason,evidence?,resolution?`. Resolution is
`{kind,reason,evidence?,actor,resolvedAt,correctionEntryId}`.
`correction` is `{discrepancyId,handInId,kind,adjustmentCents,
previousReceivedCents,resultingReceivedCents,previousDifferenceCents,
resultingDifferenceCents,reason,evidence?}`. Original evidence stays visible.

Resolution enum is `CASH_RECEIVED|CASH_RETURNED|CORRECT_RECORD|WRITE_OFF|
ACCEPT_OVERAGE`. `amountCents` is movement for `CASH_*`, corrected total for
`CORRECT_RECORD`, and absent otherwise. Reasons must be nonempty. Partial
recoveries/returns are possible; refresh authoritative discrepancy status.

`CashOutstanding` is `{expectedCents,receivedCents,differenceCents,
outstandingCents,overageCents,drivers:DriverCashBalance[]}`.
Each driver balance adds `driverId,townId,unremittedCollectionCents,
unresolvedShortfallCents,entries:CashLedgerEntry[],discrepancies:CashLedgerEntry[]}`
to those amount fields. Ledger totals cover all states/bookings for selected
drivers/towns even when the displayed rows have booking/state filters.

## Known revision limits and release evidence

- PR #50 is unmerged at the inspected revision. Its CI fails formatting and its
  review identifies compensation after a failed attempt followed by successful
  retry as a possible duplicate shop payment. Do not claim production readiness
  from the existence of these routes; revalidate the deployed API before release.
- No staff statement CSV endpoint, no separate draft-preview endpoint and no
  cash-ledger/discrepancy cursor response exist. Cash lists are bounded to 100
  and their parsed `skip` is ignored by services. Do not invent later pages or
  client totals. A staff print view can render the complete server statement.
- No server date/status filters exist for owner earnings. Filtered statement
  lists are available. No combined multi-branch settlement ownership exists.
- The API owns policy, reservations, ledger accounting and authorization. The
  documented initial policy is ON_SCHEDULE, with prospective AFTER_REMITTANCE
  agreements supported. The UI must render the returned policy and snapshots.
- Controlled rollout requires the real branch agreement, payout recipient,
  pilot-payout reconciliation and authorized manual-payment exercise. The API
  records external transfers; it never initiates a payout.
