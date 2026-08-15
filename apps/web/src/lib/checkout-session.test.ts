import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutIntentFingerprint,
  clearCheckoutIdempotencyKey,
  getCheckoutIdempotencyKey,
  type CheckoutRequest,
} from "./checkout-session.js";

const request: CheckoutRequest = {
  customer: { name: "Ada Lovelace", email: "ada@example.test" },
  shippingAddress: {
    line1: "Jl. Contoh 1",
    city: "Jakarta",
    postalCode: "10110",
    countryCode: "ID",
  },
  shippingMethod: "REGULAR",
};

test("checkout retries reuse one key only for the same input and Cart version", () => {
  const values = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage;
  const globalObject = globalThis as unknown as Record<string, unknown>;
  const previousWindow = globalObject.window;

  Object.defineProperty(globalObject, "window", {
    configurable: true,
    value: { sessionStorage },
  });

  try {
    clearCheckoutIdempotencyKey();
    const first = getCheckoutIdempotencyKey(request, 3);
    assert.equal(getCheckoutIdempotencyKey(request, 3), first);
    assert.notEqual(
      getCheckoutIdempotencyKey(
        { ...request, customer: { ...request.customer, name: "Grace Hopper" } },
        3,
      ),
      first,
    );
    clearCheckoutIdempotencyKey();
    assert.notEqual(getCheckoutIdempotencyKey(request, 3), first);
  } finally {
    clearCheckoutIdempotencyKey();
    if (previousWindow === undefined) {
      delete globalObject.window;
    } else {
      globalObject.window = previousWindow;
    }
  }
});

test("checkout intent fingerprint is deterministic and tracks Cart version", () => {
  assert.equal(
    checkoutIntentFingerprint(request, 3),
    checkoutIntentFingerprint(request, 3),
  );
  assert.notEqual(
    checkoutIntentFingerprint(request, 3),
    checkoutIntentFingerprint(request, 4),
  );
});
