import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOrderTotals,
  canExpireOrder,
  canTransitionOrder,
  checkoutRequestHash,
  type CreateOrderDto,
  money
} from "./order.js";

test("order money and totals use integer IDR arithmetic", () => {
  assert.deepEqual(money(85_000), { amount: 85_000, currency: "IDR" });
  assert.deepEqual(
    calculateOrderTotals(
      [
        { unitPrice: 85_000, quantity: 2 },
        { unitPrice: 42_000, quantity: 1 }
      ],
      0
    ),
    { subtotal: 212_000, shippingFee: 0, grandTotal: 212_000 }
  );
});

test("Order transitions only leave awaiting payment once", () => {
  assert.equal(canTransitionOrder("AWAITING_PAYMENT", "PAID"), true);
  assert.equal(canTransitionOrder("AWAITING_PAYMENT", "EXPIRED"), true);
  assert.equal(canTransitionOrder("PAID", "EXPIRED"), false);
  assert.equal(canTransitionOrder("EXPIRED", "PAID"), false);
});

test("expiry eligibility uses database time and ignores terminal Orders", () => {
  const now = new Date("2026-08-15T00:00:00.000Z");
  assert.equal(canExpireOrder("AWAITING_PAYMENT", new Date("2026-08-15T00:00:00.000Z"), now), true);
  assert.equal(canExpireOrder("AWAITING_PAYMENT", new Date("2026-08-15T00:00:00.001Z"), now), false);
  assert.equal(canExpireOrder("PAID", new Date("2026-08-14T00:00:00.000Z"), now), false);
});

test("checkout request hashing ignores JSON property order", () => {
  const first = {
    customer: { name: "Ada", email: "ada@example.test" },
    shippingAddress: { line1: "Jl. Contoh", city: "Jakarta", postalCode: "10110", countryCode: "ID" },
    shippingMethod: "REGULAR"
  };
  const second = {
    shippingMethod: "REGULAR",
    shippingAddress: { countryCode: "ID", postalCode: "10110", city: "Jakarta", line1: "Jl. Contoh" },
    customer: { email: "ada@example.test", name: "Ada" }
  };
  assert.equal(checkoutRequestHash(first as CreateOrderDto), checkoutRequestHash(second as CreateOrderDto));
});
