import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  signFakePaymentWebhook,
  verifyFakePaymentWebhookSignature
} from "./payment-gateway.js";

test("fake webhook signing is deterministic over timestamp and raw body", () => {
  const secret = "webhook-secret";
  const timestamp = "1760000000";
  const rawBody = Buffer.from('{"eventType":"PAYMENT_SUCCEEDED"}', "utf8");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`, "utf8")
    .digest("hex");

  assert.equal(signFakePaymentWebhook(secret, timestamp, rawBody), expected);
  assert.equal(verifyFakePaymentWebhookSignature(secret, timestamp, rawBody, expected, new Date(1760000000 * 1000)), true);
  assert.equal(
    verifyFakePaymentWebhookSignature(secret, timestamp, Buffer.from('{"eventType":"PAYMENT_FAILED"}'), expected, new Date(1760000000 * 1000)),
    false
  );
});

test("fake webhook signatures reject timestamps outside the five-minute window", () => {
  const secret = "webhook-secret";
  const timestamp = "1760000000";
  const rawBody = Buffer.from("{}", "utf8");
  const signature = signFakePaymentWebhook(secret, timestamp, rawBody);
  const now = new Date((1760000000 + 301) * 1000);

  assert.equal(verifyFakePaymentWebhookSignature(secret, timestamp, rawBody, signature, now), false);
  assert.equal(verifyFakePaymentWebhookSignature(secret, timestamp, rawBody, "not-a-signature", new Date(1760000000 * 1000)), false);
});
