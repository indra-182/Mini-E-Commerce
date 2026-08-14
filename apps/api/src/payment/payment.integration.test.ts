import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { productFixtures } from "@mini-ecommerce/content-fixtures";
import { PrismaClient } from "@prisma/client";

import { createApplication } from "../bootstrap.js";
import { GuestSessionService } from "../common/guest-session.js";
import { ProblemException } from "../common/problem-details.js";
import { loadEnvironment } from "../config/environment.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PaymentService } from "./payment.js";
import {
  signFakePaymentWebhook,
  type PaymentGateway
} from "./payment-gateway.js";

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Payment integration tests require NODE_ENV=test and a test DATABASE_URL.");
}

const parsedTestUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedTestUrl.hostname)) {
  throw new Error("Payment integration tests are limited to a local PostgreSQL host.");
}
const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ""));
if (!/(^|[-_])test($|[-_])/i.test(testDatabaseName)) {
  throw new Error("Payment integration tests require a database name containing test.");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = process.env.DIRECT_URL ?? testDatabaseUrl;
process.env.FAKE_PAYMENT_WEBHOOK_SECRET ??= "payment-test-webhook-secret";

const client = new PrismaClient();
const coffeeVariant = productFixtures[0]?.variants[0];
assert.ok(coffeeVariant);

type Cart = { id: string; version: number; items: Array<{ id: string; productVariantId: string; quantity: number }> };
type Problem = { code: string; status?: number };
type PaymentAttempt = {
  id: string;
  status: string;
  providerReference: string;
  amount: { amount: number; currency: string };
};
type Order = { id: string; status: string; paymentAttempt?: PaymentAttempt };

async function clearDatabase(): Promise<void> {
  await client.idempotencyRecord.deleteMany();
  await client.webhookEvent.deleteMany();
  await client.paymentAttempt.deleteMany();
  await client.orderItem.deleteMany();
  await client.order.deleteMany();
  await client.cartItem.deleteMany();
  await client.cart.deleteMany();
  await client.productVariant.deleteMany();
  await client.product.deleteMany();
  await client.article.deleteMany();
  await client.guestSession.deleteMany();
}

async function seedProducts(): Promise<void> {
  for (const product of productFixtures) {
    await client.product.create({
      data: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        category: product.category,
        imagePaths: product.imagePaths,
        variants: {
          create: product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            optionLabel: variant.optionLabel,
            price: variant.price,
            currency: variant.currency,
            availableQuantity: variant.availableQuantity,
            isActive: variant.isActive
          }))
        }
      }
    });
  }
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(value);
  return value;
}

async function bootstrap(): Promise<{ cookie: string; cart: Cart; etag: string }> {
  const response = await fetch(`${baseUrl}/api/v1/cart`, { method: "POST" });
  assert.equal(response.status, 200);
  return { cookie: cookieFrom(response), cart: (await response.json()) as Cart, etag: response.headers.get("etag") ?? "" };
}

async function addItem(current: { cookie: string; etag: string }): Promise<{ cart: Cart; etag: string }> {
  const response = await fetch(`${baseUrl}/api/v1/cart/items`, {
    method: "POST",
    headers: { Cookie: current.cookie, "If-Match": current.etag, "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
  });
  assert.equal(response.status, 200);
  return { cart: (await response.json()) as Cart, etag: response.headers.get("etag") ?? "" };
}

async function checkout(cookie: string, etag: string, key: string): Promise<{ response: Response; body: Order | Problem }> {
  const response = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: { Cookie: cookie, "If-Match": etag, "Idempotency-Key": key, "content-type": "application/json" },
    body: JSON.stringify({
      customer: { name: "Ada Lovelace", email: "ada@example.test" },
      shippingAddress: { line1: "Jl. Contoh 1", city: "Jakarta", postalCode: "10110", countryCode: "ID" },
      shippingMethod: "REGULAR"
    })
  });
  return { response, body: (await response.json()) as Order | Problem };
}

async function createOrder(key: string): Promise<{ cookie: string; order: Order }> {
  const current = await bootstrap();
  const added = await addItem(current);
  const result = await checkout(current.cookie, added.etag, key);
  assert.equal(result.response.status, 201);
  return { cookie: current.cookie, order: result.body as Order };
}

async function outcome(cookie: string, paymentAttemptId: string, value: "SUCCEEDED" | "FAILED" | "PENDING"): Promise<{ response: Response; body: PaymentAttempt | Problem }> {
  const response = await fetch(`${baseUrl}/api/v1/fake-payments/${paymentAttemptId}/outcome`, {
    method: "POST",
    headers: { Cookie: cookie, "content-type": "application/json" },
    body: JSON.stringify({ outcome: value })
  });
  return { response, body: (await response.json()) as PaymentAttempt | Problem };
}

function signedPayload(attempt: PaymentAttempt, eventType: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED", amount = attempt.amount.amount): {
  body: string;
  eventId: string;
  timestamp: string;
  signature: string;
} {
  const body = JSON.stringify({
    eventType,
    paymentAttemptId: attempt.id,
    providerReference: attempt.providerReference,
    amount,
    currency: attempt.amount.currency
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    body,
    eventId: `event-${attempt.id}`,
    timestamp,
    signature: signFakePaymentWebhook(process.env.FAKE_PAYMENT_WEBHOOK_SECRET ?? "", timestamp, body)
  };
}

async function sendWebhook(event: ReturnType<typeof signedPayload>, body = event.body): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/webhooks/fake-payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Fake-Event-Id": event.eventId,
      "X-Fake-Timestamp": event.timestamp,
      "X-Fake-Signature": event.signature
    },
    body
  });
}

let baseUrl = "";
let closeApp: (() => Promise<void>) | undefined;
let application: Awaited<ReturnType<typeof createApplication>>["app"] | undefined;

before(async () => {
  await client.$connect();
  const created = await createApplication({ environment: loadEnvironment(), logger: false });
  application = created.app;
  await application.listen(0);
  baseUrl = await application.getUrl();
  closeApp = () => application!.close();
});

beforeEach(async () => {
  await clearDatabase();
  await seedProducts();
});

after(async () => {
  await closeApp?.();
  await client.$disconnect();
});

test("failed Payment Attempts can be retried on the same unexpired Order", async () => {
  const { cookie, order } = await createOrder("payment-failure-retry");
  assert.ok(order.paymentAttempt);

  const failed = await outcome(cookie, order.paymentAttempt.id, "FAILED");
  assert.equal(failed.response.status, 200);
  assert.equal((failed.body as PaymentAttempt).status, "FAILED");

  const retry = await fetch(`${baseUrl}/api/v1/orders/${order.id}/payment-attempts`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(retry.status, 201);
  const retryAttempt = (await retry.json()) as PaymentAttempt;
  assert.notEqual(retryAttempt.id, order.paymentAttempt.id);
  assert.equal(retryAttempt.status, "PENDING");

  const pending = await outcome(cookie, retryAttempt.id, "PENDING");
  assert.equal(pending.response.status, 200);
  assert.equal((pending.body as PaymentAttempt).status, "PENDING");
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "AWAITING_PAYMENT");
});

test("valid success webhook marks the Order paid and duplicate events are no-ops", async () => {
  const { cookie, order } = await createOrder("payment-success-duplicate");
  assert.ok(order.paymentAttempt);
  const event = signedPayload(order.paymentAttempt, "PAYMENT_SUCCEEDED");

  const first = await sendWebhook(event);
  const duplicate = await sendWebhook(event);
  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await first.json(), { acknowledged: true });
  assert.deepEqual(await duplicate.json(), { acknowledged: true });

  const changedBody = event.body.replace("PAYMENT_SUCCEEDED", "PAYMENT_FAILED");
  const changed = await sendWebhook(
    {
      ...event,
      signature: signFakePaymentWebhook(process.env.FAKE_PAYMENT_WEBHOOK_SECRET ?? "", event.timestamp, changedBody)
    },
    changedBody
  );
  assert.equal(changed.status, 400);

  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PAID");
  assert.equal((await client.paymentAttempt.findUniqueOrThrow({ where: { id: order.paymentAttempt.id } })).status, "SUCCEEDED");
  assert.equal(await client.webhookEvent.count(), 1);

  const ownerRead = await fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: cookie } });
  assert.equal((await ownerRead.json() as Order).status, "PAID");
});

test("forged, modified, and old webhook signatures are rejected", async () => {
  const { order } = await createOrder("payment-invalid-signature");
  assert.ok(order.paymentAttempt);
  const event = signedPayload(order.paymentAttempt, "PAYMENT_SUCCEEDED");

  const forged = await sendWebhook({ ...event, signature: "0".repeat(64) });
  assert.equal(forged.status, 400);

  const modified = await sendWebhook(event, event.body.replace("PAYMENT_SUCCEEDED", "PAYMENT_FAILED"));
  assert.equal(modified.status, 400);

  const oldTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
  const old = await sendWebhook({
    ...event,
    timestamp: oldTimestamp,
    signature: signFakePaymentWebhook(process.env.FAKE_PAYMENT_WEBHOOK_SECRET ?? "", oldTimestamp, event.body)
  });
  assert.equal(old.status, 400);
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "AWAITING_PAYMENT");
});

test("amount mismatch is rejected without changing the Order", async () => {
  const { order } = await createOrder("payment-amount-mismatch");
  assert.ok(order.paymentAttempt);
  const event = signedPayload(order.paymentAttempt, "PAYMENT_SUCCEEDED", order.paymentAttempt.amount.amount + 1);
  const response = await sendWebhook(event);

  assert.equal(response.status, 400);
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "AWAITING_PAYMENT");
  assert.equal((await client.paymentAttempt.findUniqueOrThrow({ where: { id: order.paymentAttempt.id } })).status, "PENDING");
  assert.equal(await client.webhookEvent.count(), 0);
});

test("late success expires the Order and returns stock exactly once", async () => {
  const { cookie, order } = await createOrder("payment-late-success");
  assert.ok(order.paymentAttempt);
  await client.order.update({ where: { id: order.id }, data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") } });
  const event = signedPayload(order.paymentAttempt, "PAYMENT_SUCCEEDED");

  const response = await sendWebhook(event);
  assert.equal(response.status, 200);
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "EXPIRED");
  assert.equal((await client.paymentAttempt.findUniqueOrThrow({ where: { id: order.paymentAttempt.id } })).status, "EXPIRED");
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 12);

  const read = await fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: cookie } });
  assert.equal((await read.json() as Order).status, "EXPIRED");
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 12);
});

test("expiry and success race leaves one terminal state and one inventory return", async () => {
  const { cookie, order } = await createOrder("payment-expiry-race");
  assert.ok(order.paymentAttempt);
  await client.order.update({ where: { id: order.id }, data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") } });
  const event = signedPayload(order.paymentAttempt, "PAYMENT_SUCCEEDED");

  const [webhook, read] = await Promise.all([
    sendWebhook(event),
    fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: cookie } })
  ]);
  assert.equal(webhook.status, 200);
  assert.equal(read.status, 200);
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "EXPIRED");
  assert.equal((await client.paymentAttempt.findUniqueOrThrow({ where: { id: order.paymentAttempt.id } })).status, "EXPIRED");
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 12);
});

test("gateway setup failure marks a committed retry attempt failed", async () => {
  const { cookie, order } = await createOrder("payment-gateway-failure");
  assert.ok(order.paymentAttempt);
  const failed = await outcome(cookie, order.paymentAttempt.id, "FAILED");
  assert.equal(failed.response.status, 200);

  const app = application;
  assert.ok(app);
  const failingGateway: PaymentGateway = {
    createPaymentSession: async () => {
      throw new Error("fake provider unavailable");
    },
    createOutcomeWebhook: () => {
      throw new Error("not used");
    }
  };
  const paymentService = new PaymentService(
    app.get(PrismaService),
    app.get(GuestSessionService),
    failingGateway,
    loadEnvironment()
  );

  await assert.rejects(
    paymentService.createAttempt(cookie, order.id),
    (error: unknown) => error instanceof ProblemException && error.getStatus() === 502
  );
  const attempts = await client.paymentAttempt.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1]?.status, "FAILED");
  assert.equal((await client.order.findUniqueOrThrow({ where: { id: order.id } })).status, "AWAITING_PAYMENT");
});
