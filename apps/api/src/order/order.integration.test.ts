import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { productFixtures } from "@mini-ecommerce/content-fixtures";
import { PrismaClient } from "@prisma/client";

import { createApplication } from "../bootstrap.js";
import { loadEnvironment } from "../config/environment.js";

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Order integration tests require NODE_ENV=test and a test DATABASE_URL.");
}

const parsedTestUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedTestUrl.hostname)) {
  throw new Error("Order integration tests are limited to a local PostgreSQL host.");
}
const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ""));
if (!/(^|[-_])test($|[-_])/i.test(testDatabaseName)) {
  throw new Error("Order integration tests require a database name containing test.");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = process.env.DIRECT_URL ?? testDatabaseUrl;

const client = new PrismaClient();
const coffeeVariant = productFixtures[0]?.variants[0];
const teaVariant = productFixtures[1]?.variants[0];
assert.ok(coffeeVariant);
assert.ok(teaVariant);

type Cart = {
  id: string;
  version: number;
  items: Array<{ id: string; productVariantId: string; quantity: number }>;
};

type Problem = { code: string; currentCart?: Cart };

type Order = {
  id: string;
  status: string;
  customerEmail: string;
  subtotal: { amount: number; currency: string };
  shippingFee: { amount: number; currency: string };
  grandTotal: { amount: number; currency: string };
  expiresAt: string;
  items: Array<{
    productVariantId: string;
    sku: string;
    name: string;
    unitPrice: { amount: number; currency: string };
    quantity: number;
    lineTotal: { amount: number; currency: string };
  }>;
  paymentAttempt?: { id: string; status: string };
};

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
  return {
    cookie: cookieFrom(response),
    cart: (await response.json()) as Cart,
    etag: response.headers.get("etag") ?? ""
  };
}

async function addItem(current: { cookie: string; etag: string }, productVariantId = coffeeVariant.id, quantity = 1): Promise<{ cart: Cart; etag: string }> {
  const response = await fetch(`${baseUrl}/api/v1/cart/items`, {
    method: "POST",
    headers: {
      Cookie: current.cookie,
      "If-Match": current.etag,
      "content-type": "application/json"
    },
    body: JSON.stringify({ productVariantId, quantity })
  });
  assert.equal(response.status, 200);
  return { cart: (await response.json()) as Cart, etag: response.headers.get("etag") ?? "" };
}

const checkoutBody = {
  customer: { name: "Ada Lovelace", email: "ada@example.test" },
  shippingAddress: { line1: "Jl. Contoh 1", city: "Jakarta", postalCode: "10110", countryCode: "ID" },
  shippingMethod: "REGULAR"
};

async function checkout(cookie: string, etag: string, key: string, body = checkoutBody): Promise<{ response: Response; body: Order | Problem }> {
  const response = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "If-Match": etag,
      "Idempotency-Key": key,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return { response, body: (await response.json()) as Order | Problem };
}

let baseUrl = "";
let closeApp: (() => Promise<void>) | undefined;

before(async () => {
  await client.$connect();
  const { app } = await createApplication({ environment: loadEnvironment(), logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  closeApp = () => app.close();
});

beforeEach(async () => {
  await clearDatabase();
  await seedProducts();
});

after(async () => {
  await closeApp?.();
  await client.$disconnect();
});

test("checkout snapshots current prices, creates a payment attempt, and replaces the Cart", async () => {
  const current = await bootstrap();
  const added = await addItem(current, coffeeVariant.id, 2);
  await client.productVariant.update({ where: { id: coffeeVariant.id }, data: { price: 12_345 } });

  const result = await checkout(current.cookie, added.etag, "checkout-price-001");
  assert.equal(result.response.status, 201);
  const order = result.body as Order;
  assert.equal(order.status, "AWAITING_PAYMENT");
  assert.equal(order.customerEmail, checkoutBody.customer.email);
  assert.deepEqual(order.items[0]?.unitPrice, { amount: 12_345, currency: "IDR" });
  assert.equal(order.items[0]?.quantity, 2);
  assert.equal(order.subtotal.amount, 24_690);
  assert.equal(order.shippingFee.amount, 0);
  assert.equal(order.grandTotal.amount, 24_690);
  assert.equal(order.paymentAttempt?.status, "PENDING");
  assert.ok(order.paymentAttempt?.id);

  const oldCart = await client.cart.findUniqueOrThrow({ where: { id: current.cart.id } });
  assert.equal(oldCart.status, "CLOSED");
  const activeCart = await client.cart.findFirstOrThrow({ where: { guestSessionId: oldCart.guestSessionId, status: "ACTIVE" }, include: { items: true } });
  assert.deepEqual(activeCart.items, []);
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 10);
});

test("checkout rejects browser-supplied commerce fields and requires both headers", async () => {
  const current = await bootstrap();
  const added = await addItem(current);

  const missingKey = await checkout(current.cookie, added.etag, "short");
  assert.equal(missingKey.response.status, 422);

  const missingIfMatch = await fetch(`${baseUrl}/api/v1/orders`, {
    method: "POST",
    headers: { Cookie: current.cookie, "Idempotency-Key": "checkout-missing-if-match", "content-type": "application/json" },
    body: JSON.stringify(checkoutBody)
  });
  assert.equal(missingIfMatch.status, 428);

  const unknown = await checkout(current.cookie, added.etag, "checkout-unknown-001", { ...checkoutBody, items: [] } as typeof checkoutBody & { items: never[] });
  assert.equal(unknown.response.status, 422);
});

test("same idempotency key replays the same Order and changed payload conflicts", async () => {
  const current = await bootstrap();
  const added = await addItem(current);
  const first = await checkout(current.cookie, added.etag, "checkout-replay-001");
  const repeat = await checkout(current.cookie, added.etag, "checkout-replay-001");
  assert.equal(first.response.status, 201);
  assert.equal(repeat.response.status, 201);
  assert.equal((repeat.body as Order).id, (first.body as Order).id);
  assert.equal((repeat.body as Order).paymentAttempt?.id, (first.body as Order).paymentAttempt?.id);

  const changed = await checkout(current.cookie, added.etag, "checkout-replay-001", {
    ...checkoutBody,
    customer: { ...checkoutBody.customer, name: "Grace Hopper" }
  });
  assert.equal(changed.response.status, 409);
  assert.equal((changed.body as Problem).code, "IDEMPOTENCY_KEY_REUSED");
});

test("stale Cart checkout returns CHECKOUT_CART_CHANGED with the current Cart", async () => {
  const current = await bootstrap();
  const added = await addItem(current);
  const changed = await addItem({ cookie: current.cookie, etag: added.etag }, teaVariant.id);
  const result = await checkout(current.cookie, added.etag, "checkout-cart-changed");
  assert.equal(result.response.status, 409);
  assert.equal((result.body as Problem).code, "CHECKOUT_CART_CHANGED");
  assert.equal((result.body as Problem).currentCart?.version, 3);
  assert.equal(await client.order.count(), 0);
  assert.equal(changed.cart.items.length, 2);
});

test("insufficient stock rejects the whole checkout", async () => {
  await client.productVariant.update({ where: { id: coffeeVariant.id }, data: { availableQuantity: 1 } });
  const current = await bootstrap();
  const added = await addItem(current, coffeeVariant.id, 2);
  const result = await checkout(current.cookie, added.etag, "checkout-stock-001");
  assert.equal(result.response.status, 409);
  assert.equal((result.body as Problem).code, "INSUFFICIENT_STOCK");
  assert.equal(await client.order.count(), 0);
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 1);
});

test("concurrent checkouts competing for the last unit have exactly one winner", async () => {
  await client.productVariant.update({ where: { id: coffeeVariant.id }, data: { availableQuantity: 1 } });
  const first = await bootstrap();
  const second = await bootstrap();
  const firstCart = await addItem(first);
  const secondCart = await addItem(second);
  const results = await Promise.all([
    checkout(first.cookie, firstCart.etag, "checkout-race-001"),
    checkout(second.cookie, secondCart.etag, "checkout-race-002")
  ]);

  assert.deepEqual(results.map(({ response }) => response.status).sort(), [201, 409]);
  const rejected = results.find(({ response }) => response.status === 409);
  assert.equal((rejected?.body as Problem).code, "INSUFFICIENT_STOCK");
  assert.equal(await client.order.count(), 1);
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 0);
});

test("Order reads are Guest-owned and lazy expiry returns stock exactly once", async () => {
  const owner = await bootstrap();
  const added = await addItem(owner);
  const created = await checkout(owner.cookie, added.etag, "checkout-expiry-001");
  const order = created.body as Order;
  const foreign = await bootstrap();

  const foreignRead = await fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: foreign.cookie } });
  assert.equal(foreignRead.status, 404);
  assert.equal((await foreignRead.json() as Problem).code, "ORDER_NOT_FOUND");

  await client.order.update({ where: { id: order.id }, data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") } });
  const firstRead = await fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: owner.cookie } });
  assert.equal(firstRead.status, 200);
  assert.equal((await firstRead.json() as Order).status, "EXPIRED");
  assert.equal((await client.paymentAttempt.findUniqueOrThrow({ where: { id: order.paymentAttempt!.id } })).status, "EXPIRED");
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 12);

  const secondRead = await fetch(`${baseUrl}/api/v1/orders/${order.id}`, { headers: { Cookie: owner.cookie } });
  assert.equal(secondRead.status, 200);
  assert.equal((await secondRead.json() as Order).status, "EXPIRED");
  assert.equal((await client.productVariant.findUniqueOrThrow({ where: { id: coffeeVariant.id } })).availableQuantity, 12);
});
