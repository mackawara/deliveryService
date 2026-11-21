# Simple shop setup: dashboard contract

Dashboard side of [deliveryService#34](https://github.com/mackawara/deliveryService/issues/34),
paired with the API work in [deliveryBooking#60](https://github.com/mackawara/deliveryBooking/issues/60).
The public `/terms` page itself is served by the API
([deliveryBooking#67](https://github.com/mackawara/deliveryBooking/pull/67)).

Everything below ships behind `VITE_ENABLE_SIMPLE_SHOP_SETUP` (default `false`). Turn it
on only once the matching API is deployed. While it is off, the existing setup,
catalogue and approval screens are unchanged.

The shapes here are what the dashboard sends and reads. Where deliveryBooking#60 left a
detail open (a path or a field name), this document proposes one; the API may rename it,
and the typed DTOs in `src/api/dto/shop.ts` are the single place to follow such a change.

## Conventions

The same conventions as the rest of `/shop` and `/admin/food` apply: the owner or staff
session cookie, the CSRF header on every state change, an `Idempotency-Key` per logical
command, `expectedVersion` on every change to an existing record, USD integer cents,
and `409` with the current record on a stale version.

## Owner

| Method and path                            | Request                                                   | Response                             |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------ |
| GET `/shop/terms`                          | none                                                      | `{terms: {version, url} \| null}`    |
| POST `/shop/shops`                         | `{name, townId, termsVersion, agreeToTerms: true}`        | `{shop}`                             |
| GET `/shop/shops/:shopId`                  | none                                                      | `{shop, readiness[], suggestions[]}` |
| POST `/shop/shops/:shopId/terms-agreement` | `{termsVersion, expectedVersion}`                         | `{shop}`                             |
| PATCH `/shop/shops/:shopId`                | existing body; `pickup: {lat, lng, address}` sets the pin | `{shop}`                             |
| POST `/shop/shops/:shopId/items`           | `{name, priceCents}` plus optional existing fields        | `{item}`                             |
| PATCH `/shop/shops/:shopId/items/:id`      | existing body; `inStock` alone toggles stock              | `{item}`                             |
| POST `/shop/shops/:shopId/images`          | existing body (`itemId`, `expectedVersion`, `base64`)     | existing response                    |

- `GET /shop/terms` returns `terms: null` when no shop terms are configured. The signup
  screen then says signup is closed instead of offering a tick box.
- `POST /shop/shops` with the short body creates a shop whose contact is the login number,
  already verified. No pickup, branch label or settlement schedule is sent. A request
  without `agreeToTerms: true`, or with a `termsVersion` that is not the current one, is
  refused with `422`.
- `shop.pickup` is absent until a pin is set. `shop.termsAgreement` is
  `{version, agreedAt}`. When `termsAgreement.version` differs from `GET /shop/terms`,
  the owner is asked to agree again, once, through `terms-agreement`.
- `item.deliverySize` is optional. An item with no size is one standard bike-sized unit.
  Owners never send one.
- An item with no `thumbnail` is saved but hidden from customers. The dashboard marks it
  "Hidden from customers: add a photo".

### Readiness

`readiness` lists the checks that gate approval, each `{code, done, reason}`:

| code           | done when                                           |
| -------------- | --------------------------------------------------- |
| `PICKUP_POINT` | the shop has a pickup point inside the service area |
| `VISIBLE_ITEM` | at least one item is in stock and has a photo       |
| `TERMS_AGREED` | the owner agreed to the current terms version       |

`reason` is plain words for the owner, for example "Riders need this to find your
shop." The dashboard progress strip is built only from this list and
`shop.approvalState`: 1. shop created, 2. items with photos (`VISIBLE_ITEM`), 3. pin
(`PICKUP_POINT`), 4. waiting for approval, then live. Unknown codes are shown with their
`reason`, so the API can add a check without a dashboard release.

### Suggestions

`suggestions` lists optional improvements, each `{code, itemId?, message}`. One entry per
shop-level suggestion, and one entry per item for item suggestions, so the dashboard can
count them ("3 items need a photo") and offer each in place.

| code                   | about | meaning                     |
| ---------------------- | ----- | --------------------------- |
| `ADD_PICKUP_PIN`       | shop  | no pickup pin yet           |
| `ADD_PICKUP_ADDRESS`   | shop  | no short pickup address     |
| `ADD_ITEM_PHOTO`       | item  | the item has no photo       |
| `ADD_ITEM_DESCRIPTION` | item  | the item has no description |
| `ADD_ITEM_CATEGORY`    | item  | the item has no category    |

Snoozing ("Not now") is a browser preference only, keyed by owner, shop, item and code.
A suggestion that is no longer returned is never shown again.

## Admin

| Method and path                                         | Request                                                 | Response                                               |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| GET `/admin/food/shops/:id`                             | none                                                    | existing detail plus `readiness[]` and `suggestions[]` |
| GET `/admin/food/shops/:id/items`                       | `limit`, `skip`                                         | `{items, limit, skip}`                                 |
| PUT `/admin/food/shops/:id/pickup`                      | `{expectedVersion, pickup: {lat, lng, address}}`        | `{shop}`                                               |
| POST `/admin/food/shops/:id/review`                     | existing body; `zoneCode` and `estimate` may be omitted | `{shop}`                                               |
| PUT `/admin/food/shops/:id/items/:itemId/delivery-size` | `{expectedVersion, deliverySize: {...} \| null}`        | `{item}`                                               |
| GET `/admin/food/towns/:townId/settings`                | none                                                    | `{settings: {townId, bigOrderItemThreshold, version}}` |
| PATCH `/admin/food/towns/:townId/settings`              | `{expectedVersion, bigOrderItemThreshold}`              | `{settings}`                                           |

- Approval with all three readiness checks done needs only a reason. When one is missing,
  the API refuses with `422` naming the check, and the dashboard shows which.
- If `zoneCode` is omitted, the API resolves it from the pin. If `estimate` is omitted,
  the API applies its default wait range.
- `bigOrderItemThreshold` defaults to 10. An order with more items in total is accepted,
  held from automatic rider offers and raised in the existing operator alerts.
- `deliverySize: null` returns an item to the standard bike-sized unit.

## Rollout

1. Deploy the API for deliveryBooking#60 with `SHOP_TERMS_VERSION` and `SHOP_TERMS_TEXT`.
2. Set the repository variable `VITE_ENABLE_SIMPLE_SHOP_SETUP=true` and release the dashboard.
3. Existing shops keep their pins, sizes and settlement terms, and stay editable.
