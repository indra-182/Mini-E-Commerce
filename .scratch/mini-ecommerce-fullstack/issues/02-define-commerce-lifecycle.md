Type: grilling
Status: resolved
Blocked by:

## Question

What are the canonical commerce terms, lifecycle states, and invariants from product selection through cart, checkout, simulated payment, and confirmed order, including the behavior when prices or inventory change?

## Comments

- Round one accepted: Product Variant is the purchasable SKU; Cart does not reserve stock or guarantee price; Checkout is a process that creates an awaiting-payment Order rather than a separate record; totals contain subtotal plus one flat Regular Shipping fee with tax included; a Guest owns Cart and Order access through the same session.
- Round two accepted: Checkout reserves inventory for 15 minutes; any price or stock drift rejects the whole Checkout and returns the refreshed Cart; only a verified webhook can mark payment successful; Order creation closes the submitted Cart and opens a new empty Cart for the Guest.
- Round three accepted: an awaiting-payment Order can have multiple Payment Attempts; expiry is enforced lazily without a scheduler; Checkout is idempotent per Guest and key; duplicate webhooks are no-ops; terminal Order states never transition; fulfillment is outside the MVP.

## Answer

### Canonical model

- Product describes catalog content. Product Variant is the purchasable SKU and owns price and inventory. A simple Product still has one default Product Variant.
- Cart belongs to a Guest session and contains Product Variant quantities. It neither reserves inventory nor guarantees a displayed price.
- Checkout is a process, not a persistent business entity. A successful Checkout creates an Order directly.
- Order is the durable snapshot of accepted items, prices, customer details, Regular Shipping, and totals.
- Payment Attempt represents one attempt to pay an Order. One Order can have several Payment Attempts while awaiting payment.

The canonical terms and avoided synonyms are recorded in the root [domain glossary](../../../CONTEXT.md).

### Totals

- Money uses an integer minor-unit amount and an explicit currency.
- The MVP total is `subtotal + regularShippingFee = grandTotal`.
- Product prices are treated as tax-inclusive.
- Vouchers, a discount engine, multiple shipping methods, and separately calculated tax are outside the MVP.

### Checkout invariants

Checkout must atomically:

1. identify the active Guest Cart;
2. validate the Cart version and reject stale submissions;
3. re-read current Product Variant prices and available inventory;
4. reject the entire Checkout if any price or stock changed, returning the refreshed Cart for explicit customer confirmation;
5. create an `AWAITING_PAYMENT` Order snapshot;
6. reserve every ordered quantity for 15 minutes;
7. close the submitted Cart and issue a new empty Cart to the Guest;
8. create or return the initial Payment Attempt.

Checkout never trusts prices, totals, availability, or payment state supplied by the browser. A mandatory idempotency key scoped to the Guest returns the same Order and Payment Attempt on double click, timeout retry, or duplicate submission.

### State machines

Order has only three states:

- `AWAITING_PAYMENT`: inventory is reserved and another Payment Attempt may be created before expiry.
- `PAID`: a verified successful webhook finalized the reserved inventory. This is terminal.
- `EXPIRED`: the reservation window ended before successful payment. Inventory is released and this is terminal.

Payment Attempt has four states:

- `PENDING`
- `SUCCEEDED`
- `FAILED`
- `EXPIRED`

A failed Payment Attempt does not fail the Order. The Guest may retry payment against the same `AWAITING_PAYMENT` Order until its reservation expires.

### Expiry and webhook rules

- The MVP has no queue, worker, or cron scheduler. Expiry is enforced lazily whenever an Order is read, another Payment Attempt is requested, or a Checkout needs the same inventory.
- Redirect and query parameters from the browser never mark payment successful. Only a correctly signed fake-gateway webhook may do so.
- Provider event IDs are unique. Repeated delivery of the same event is an idempotent successful no-op.
- `PAID` and `EXPIRED` Orders never transition again. The fake gateway does not generate a successful event after expiry, and the backend rejects invalid terminal transitions.

### Guest access and MVP limit

- The signed Guest session grants access to its active Cart and Orders. Knowing a public Order identifier alone grants no access.
- Losing the Guest session has no recovery flow in the MVP.
- `PAID` is the end of the MVP lifecycle. Fulfillment, shipment tracking, cancellation, refund, account recovery, and real payment providers are outside scope.
