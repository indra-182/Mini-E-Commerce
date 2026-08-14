# Mini E-Commerce

This context describes the customer-facing purchase journey from browsing products through placing and paying for an order.

## Language

**Product**:
The catalog description shared by one or more purchasable variants.
_Avoid_: SKU, purchasable item

**Product Variant**:
The specific purchasable form of a Product, with its own price and inventory. A Product without visible options still has one default Product Variant.
_Avoid_: Product option, item

**Cart**:
A guest's current selection of Product Variants and quantities. It neither reserves inventory nor guarantees a previously displayed price.
_Avoid_: Basket, order draft

**Checkout**:
The process that validates a Cart and attempts to place an Order. It is not a separately owned business record.
_Avoid_: Checkout session

**Order**:
The durable snapshot created when Checkout succeeds, containing the accepted items, prices, customer details, and delivery choice. It is awaiting payment, paid, or expired.
_Avoid_: Purchase, transaction, checkout

**Inventory Reservation**:
A temporary claim by an awaiting-payment Order on the quantities it contains. It is absent from a Cart and becomes final only after successful payment.
_Avoid_: Cart hold, stock lock

**Payment Attempt**:
One attempt to pay an Order through the payment provider. An Order may have multiple Payment Attempts before its Inventory Reservation expires.
_Avoid_: Payment, transaction

**Guest**:
A customer who uses the purchase journey without a registered account.
_Avoid_: Anonymous user

**Regular Shipping**:
The single delivery choice available in the initial product, charged at a flat fee.
_Avoid_: Standard delivery
