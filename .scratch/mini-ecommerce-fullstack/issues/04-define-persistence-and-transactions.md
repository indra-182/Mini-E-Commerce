Type: grilling
Status: resolved
Blocked by: 02

## Question

What data model, ownership rules, transaction boundaries, inventory strategy, idempotency guarantees, and order snapshots are required to preserve correctness while keeping the backend small enough for a portfolio project?

## Comments

- Round one accepted: persist only GuestSession, Product, ProductVariant, Article, Cart, CartItem, Order, OrderItem, PaymentAttempt, WebhookEvent, and IdempotencyRecord; keep available quantity on ProductVariant; snapshot order-facing data; identify GuestSession by a hashed opaque token; preserve commerce history without a generic soft-delete framework.
- Round two accepted: enforce critical invariants with PostgreSQL constraints; run Checkout at serializable isolation with bounded conflict retry and conditional inventory decrements; call the Payment Gateway adapter only after commit; bind idempotency keys to a request hash; enforce one active Cart per Guest Session with a partial unique index.
- Round three accepted: derive Cart totals rather than storing them; use four explicit transaction flows instead of a generic transaction abstraction; resolve expiry and webhook races with database time and guarded state transitions; limit JSON to snapshots and sanitized webhook payloads; use basic PostgreSQL indexes without a separate search system.

## Answer

### Persistent model

Use these Prisma models and no generic base entity:

- `GuestSession`: opaque-token hash, timestamps, Carts, and Orders.
- `Product`: slug, name, description, category, image paths, and `isActive`.
- `ProductVariant`: Product reference, SKU, option label, integer price, currency, `availableQuantity`, and `isActive`.
- `Article`: slug, type, title, excerpt, sanitized HTML content, static image path, publication timestamp, and publication state.
- `Cart`: Guest Session reference, `ACTIVE` or `CLOSED` status, integer version, and timestamps.
- `CartItem`: Cart reference, Product Variant reference, and quantity.
- `Order`: Guest Session reference, lifecycle status, expiry, customer and shipping snapshot, integer totals, currency, and timestamps.
- `OrderItem`: Order reference, Product Variant reference, SKU/name/option snapshots, unit price, quantity, and line total.
- `PaymentAttempt`: Order reference, status, stable provider reference, amount, currency, expiry, and timestamps.
- `WebhookEvent`: unique provider event ID, event type, sanitized JSON payload, and receive timestamp.
- `IdempotencyRecord`: Guest Session reference, key, request hash, Order reference, initial Payment Attempt reference, and creation timestamp.

There is no `Checkout`, `Inventory`, `InventoryReservation`, `Customer`, `Address`, `ShippingMethod`, audit-log, or soft-delete model in the MVP.

### Derived data and snapshots

- Product Variant owns the current price and available quantity.
- Cart stores only Variant references and quantities. Cart totals are recomputed from current Variant prices whenever the Cart is read or mutated.
- Order and Order Item store immutable commerce snapshots. Their historical names, prices, address, delivery label, and totals never depend on later catalog changes.
- Shipping address is JSON because a Guest does not reuse an address. Commerce values used for filtering, constraints, or calculations remain typed columns.
- WebhookEvent may store a sanitized JSON payload, but never secrets, signature headers, or arbitrary request metadata.

### Database invariants

Use Prisma constraints where possible and focused SQL in Prisma migrations where PostgreSQL-specific enforcement is required:

- Positive Cart Item and Order Item quantities.
- Non-negative prices, totals, shipping fee, and `availableQuantity`.
- Unique Product slug, Article slug, SKU, Guest token hash, provider reference, and provider event ID.
- Unique `(cartId, productVariantId)` Cart Item.
- Unique `(guestSessionId, key)` Idempotency Record.
- Partial unique index allowing only one `ACTIVE` Cart per Guest Session.
- Referential deletion restrictions for Products, Product Variants, Orders, Order Items, and Payment Attempts that form commerce history.

Product and Product Variant use `isActive`; Article uses publication fields; submitted Carts become `CLOSED`. Do not build a reusable soft-delete framework.

### Inventory representation

Store one `availableQuantity` on Product Variant:

- Checkout conditionally decrements it when creating an Order reservation.
- Successful payment leaves it unchanged because the sale is already accounted for.
- Order expiry increments it using the Order Item quantities.
- A guarded Order state transition ensures the same reservation cannot be returned twice.

This intentionally omits separate on-hand and reserved counters. Add a richer inventory ledger only when the product gains stock receiving, adjustments, fulfillment, or multi-location inventory.

### Transaction flows

Use four explicit flows. Do not add generic repository, Unit of Work, or transaction-manager layers.

1. **Cart mutation**: match the active Cart and expected version, change one item, and increment the Cart version. A stale version changes no rows and becomes a conflict.
2. **Checkout**: use a Prisma interactive transaction at PostgreSQL `Serializable` isolation. Revalidate Cart version, prices, and inventory; sort Variant IDs; conditionally decrement every quantity; create Order and Order Items; close the old Cart; open a new Cart; create Idempotency Record and initial pending Payment Attempt. Retry transaction conflict `P2034` at most three times.
3. **Order expiry**: if database time is at or beyond `expiresAt`, transition only an `AWAITING_PAYMENT` Order to `EXPIRED` and return its quantities in the same transaction.
4. **Payment webhook**: insert the unique Webhook Event, update its Payment Attempt, and transition an eligible Order in one transaction. A duplicate provider event is a successful no-op.

The Payment Gateway adapter is called only after Checkout commits. It receives the stable Payment Attempt ID as its idempotency reference. A gateway failure marks that attempt failed without rolling back the Order, allowing another attempt while the Order remains eligible.

### Race semantics

Database time is authoritative:

- Payment succeeds only when Order status is `AWAITING_PAYMENT` and `expiresAt` is still in the future.
- Expiry succeeds only when status is `AWAITING_PAYMENT` and `expiresAt` is reached or passed.
- Both operations use guarded writes inside transactions. Only the transaction that changes the state performs its associated effects.
- `PAID` and `EXPIRED` are immutable terminal states.

### Idempotency

- Checkout requires a key scoped to Guest Session.
- The record stores a canonical request-body hash and the created resource IDs.
- Repeating the same key and hash returns the original result.
- Reusing the key with another hash is a conflict.
- No cleanup job is needed for the MVP.

### Indexing and connections

Add B-tree indexes only for demonstrated query paths: catalog activity/category, article publication/date, Cart ownership/status, Order ownership/date, Order status/expiry, Payment Attempt ownership, and unique webhook event lookup. Product name search uses a case-insensitive PostgreSQL query; there is no full-text engine or external search service.

Local PostgreSQL uses a direct connection. The public Neon runtime uses its pooled connection string while migrations use a direct connection string. Keep transactions short and never perform network calls inside them.
