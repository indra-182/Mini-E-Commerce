import assert from "node:assert/strict";
import test from "node:test";

import { shouldPollOrder } from "./order-query.js";

test("Order polling only runs for visible awaiting Orders within two minutes", () => {
  assert.equal(shouldPollOrder("AWAITING_PAYMENT", true, 1_999), true);
  assert.equal(shouldPollOrder("AWAITING_PAYMENT", false, 1_999), false);
  assert.equal(shouldPollOrder("PAID", true, 1_999), false);
  assert.equal(shouldPollOrder("AWAITING_PAYMENT", true, 120_000), false);
  assert.equal(shouldPollOrder("AWAITING_PAYMENT", true, 1_999, true), false);
});
