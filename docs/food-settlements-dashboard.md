# Shop earnings and manual settlements

Implements dashboard issue [#23](https://github.com/mackawara/deliveryService/issues/23).
The matching API contract is deliveryBooking [PR #50](https://github.com/mackawara/deliveryBooking/pull/50),
commit `40c9923938d20f9b129138bc5789f065b7faf455`. See the
[contract reference](food-settlements-api-contract.md) for exact requests, versions and response shapes.

## Owner and staff workflows

- Owners open Earnings or Payout details from the branch navigation. Each query
  includes the owner and branch in its cache identity. The server owns totals,
  commission snapshots, eligibility, pilot payout allocations and next payout dates.
- Earnings show the current ledger page and server totals separately. Statements
  retain their included orders, calculations, agreement and frozen destination.
  Owner CSV exports come from the API; earnings exports cover one cursor page and
  explicitly indicate whether another page exists.
- Payout reads are masked. Changes require a complete replacement identifier,
  reason and confirmation; masked text is never resubmitted as an account number.
  Raw form values are cleared after confirmed success or ordinary cancellation.
- Admin-only and finance-only staff with explicit food capabilities can review
  branch balances, select a Harare period, generate a draft, inspect it, approve or
  void it, then record an external payment. Record payment requires the approved
  amount, frozen method/destination, actual date, reference and confirmation.
  No action transfers money. Full destination reveal is an audited command and
  stays only in the temporary reveal dialog, outside the ordinary query cache.
- Finance staff use the Cash ledger's food cash section for rider outstanding
  totals, versioned collection selection, actual short/over hand-ins and documented
  discrepancy resolution. Expected cash and original evidence remain visible after
  correction. Admin food-settlement access does not grant unrelated finance routes.

All commands retain their submit-time payload, version and idempotency key. A
conflict retains the form and refreshes the current server state for deliberate
resubmission. An uncertain result offers replay of the original command; it never
shows paid, remitted or resolved success before the server confirms it. Duplicate
clicks are blocked synchronously. Branch, identity and permission changes discard
protected views, and late commands cannot report success into the next scope.

## Release gate

`VITE_ENABLE_FOOD_SETTLEMENTS=false` is the build default. It is passed through the
Docker build and publish workflow; its GitHub repository variable is also false
when unset. Navigation and financial workspaces are hidden while disabled.

Before enabling a new build:

1. Fix and merge the API dependency, including the open failed-attempt compensation
   review in PR #50, and deploy its matching schema, indexes and policy.
2. Record the actual branch agreements and supported destinations, and complete the
   backend reconciliation checks. The API's `FOOD_SETTLEMENTS_ENABLED` flag must be
   enabled for the approved pilot.
3. Build the dashboard with `VITE_ENABLE_FOOD_SETTLEMENTS=true`. Owner capabilities
   must include `settlements:read` and, for editing, `payout-details:manage`. Staff
   must have a permitted role, town scope and the specific action capability.
   Successful matching API reads are required before action controls appear.
4. Rehearse real external transfer references and rider receipts with the pilot
   team. The automated checks use in-memory persistence and recorded transports;
   they do not transfer real funds or send WhatsApp messages.

The flag is compiled into the bundle. Changing a repository variable does not
change an existing immutable image; publish a new release after changing it.
This implementation does not enable production flags or deploy the API.

## Contract limits

The pinned API has no separate period preview endpoint. The UI shows server balance
and eligibility information before generating a reserved draft; its itemized
statement is the authoritative period review before approval. It has no staff CSV
endpoint, so staff can print/save the server statement as PDF. Owner statement CSV
is supported. Earnings have cursor paging but no API date/status filters; statement
lists support those filters. Cash discrepancy lists expose the latest 100 matching
records without a cursor, which is labeled in the UI. Branch balances identify
branches by ID because the finance read contract contains no branch display name.

## Verification

With the pinned Yarn version and Node >=22.13:

```sh
yarn typecheck
yarn lint
yarn format
yarn test
yarn build
yarn test:food-settlements:e2e
```

The phone and desktop browser checks use typed contract fixtures and run in CI.
For opt-in paired API tests, check out the API commit above into the sibling
`../deliveryBooking-settlements` directory and install its pinned dependencies:

```sh
yarn typecheck:food-settlements:api
yarn test:food-settlements:api
```

`ORDER_FOOD_API_REPO` can select another API directory for Vitest. The paired
TypeScript configuration uses the documented sibling path. These tests send the
real frontend endpoint bodies through Express, authorization and application
services. They cover admin-only and finance-only settlement lifecycles, frozen
destinations, stale/duplicate requests, owner branch access and exports, operator
denial and short/over hand-in corrections retaining the original evidence.
