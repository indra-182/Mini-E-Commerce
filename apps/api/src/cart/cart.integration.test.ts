import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { productFixtures } from "@mini-ecommerce/content-fixtures";
import { PrismaClient } from "@prisma/client";

import { createApplication } from "../bootstrap.js";
import { loadEnvironment } from "../config/environment.js";

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Cart integration tests require NODE_ENV=test and a test DATABASE_URL.");
}

const parsedTestUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedTestUrl.hostname)) {
  throw new Error("Cart integration tests are limited to a local PostgreSQL host.");
}

const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ""));
if (!/(^|[-_])test($|[-_])/i.test(testDatabaseName)) {
  throw new Error("Cart integration tests require a database name containing test.");
}

process.env.DIRECT_URL = process.env.DIRECT_URL ?? testDatabaseUrl;
process.env.PORT ??= "0";
process.env.COOKIE_SECRET ??= "cart-test-cookie-secret";
process.env.FAKE_PAYMENT_WEBHOOK_SECRET ??= "cart-test-webhook-secret";
process.env.PUBLIC_BASE_URL ??= "http://localhost:3000";

const client = new PrismaClient();

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
        imagePaths: [...product.imagePaths],
        isActive: product.isActive,
        createdAt: new Date(product.createdAt),
        updatedAt: new Date(product.updatedAt),
        variants: {
          create: product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            optionLabel: variant.optionLabel,
            price: variant.price,
            currency: variant.currency,
            availableQuantity: variant.availableQuantity,
            isActive: variant.isActive,
            createdAt: new Date(variant.createdAt),
            updatedAt: new Date(variant.updatedAt)
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

type Cart = {
  id: string;
  version: number;
  items: Array<{
    id: string;
    productVariantId: string;
    quantity: number;
    unitPrice: { amount: number; currency: string };
    lineTotal: { amount: number; currency: string };
    availableQuantity: number;
    isAvailable: boolean;
  }>;
  subtotal: { amount: number; currency: string };
};

type Problem = {
  code: string;
  status: number;
  currentCart?: Cart;
};

const coffeeVariant = productFixtures[0]?.variants[0];
const teaVariant = productFixtures[1]?.variants[0];
assert.ok(coffeeVariant);
assert.ok(teaVariant);

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

test("Cart bootstrap is idempotent, returns an ETag, and isolates guests", async () => {
  const first = await fetch(`${baseUrl}/api/v1/cart`, { method: "POST" });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("etag"), '"1"');
  const firstCookie = cookieFrom(first);
  const firstCart = (await first.json()) as Cart;
  assert.equal(firstCart.version, 1);
  assert.deepEqual(firstCart.items, []);
  assert.deepEqual(firstCart.subtotal, { amount: 0, currency: "IDR" });

  const repeat = await fetch(`${baseUrl}/api/v1/cart`, { method: "POST", headers: { Cookie: firstCookie } });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.headers.get("set-cookie"), null);
  assert.equal((await repeat.json()).id, firstCart.id);

  const second = await fetch(`${baseUrl}/api/v1/cart`, { method: "POST" });
  assert.equal(second.status, 200);
  assert.notEqual((await second.json()).id, firstCart.id);

  const unauthorized = await fetch(`${baseUrl}/api/v1/cart`);
  assert.equal(unauthorized.status, 401);
});

async function bootstrap(): Promise<{ cookie: string; cart: Cart; etag: string }> {
  const response = await fetch(`${baseUrl}/api/v1/cart`, { method: "POST" });
  const cart = (await response.json()) as Cart;
  return { cookie: cookieFrom(response), cart, etag: response.headers.get("etag") ?? "" };
}

async function requestCart(
  path: string,
  init: RequestInit & { cookie: string; ifMatch?: string }
): Promise<{ response: Response; body: Cart | Problem }> {
  const headers = new Headers(init.headers);
  headers.set("Cookie", init.cookie);
  if (init.ifMatch !== undefined) headers.set("If-Match", init.ifMatch);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { response, body: (await response.json()) as Cart | Problem };
}

test("Cart item mutations merge quantities and calculate totals from current Variant prices", async () => {
  const current = await bootstrap();

  const added = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: current.etag,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 2 })
  });
  assert.equal(added.response.status, 200);
  assert.equal(added.response.headers.get("etag"), '"2"');
  const addedCart = added.body as Cart;
  assert.equal(addedCart.items[0]?.quantity, 2);
  assert.equal(addedCart.subtotal.amount, coffeeVariant.price * 2);

  const merged = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: '"2"',
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 3 })
  });
  assert.equal(merged.response.status, 200);
  const mergedCart = merged.body as Cart;
  assert.equal(mergedCart.items[0]?.quantity, 5);
  assert.equal(mergedCart.subtotal.amount, coffeeVariant.price * 5);

  await client.productVariant.update({ where: { id: coffeeVariant.id }, data: { price: 12_345 } });
  const refreshed = await requestCart("/api/v1/cart", { method: "GET", cookie: current.cookie });
  assert.equal(refreshed.response.status, 200);
  const refreshedCart = refreshed.body as Cart;
  assert.equal(refreshedCart.items[0]?.unitPrice.amount, 12_345);
  assert.equal(refreshedCart.subtotal.amount, 12_345 * 5);
});

test("Cart mutations enforce quantity bounds and item ownership without changing the version on failure", async () => {
  const current = await bootstrap();

  const missingPrecondition = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
  });
  assert.equal(missingPrecondition.response.status, 428);

  const invalidQuantity = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: current.etag,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 100 })
  });
  assert.equal(invalidQuantity.response.status, 422);

  const added = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: current.etag,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
  });
  const item = (added.body as Cart).items[0];
  assert.ok(item);

  const tooMany = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: added.response.headers.get("etag") ?? "",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 99 })
  });
  assert.equal(tooMany.response.status, 422);

  const missingItem = await requestCart(`/api/v1/cart/items/${teaVariant.id}`, {
    method: "PATCH",
    cookie: current.cookie,
    ifMatch: added.response.headers.get("etag") ?? "",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 2 })
  });
  assert.equal(missingItem.response.status, 404);
  assert.equal((missingItem.body as Problem).code, "CART_ITEM_NOT_FOUND");

  const afterFailure = await requestCart("/api/v1/cart", { method: "GET", cookie: current.cookie });
  assert.equal((afterFailure.body as Cart).version, 2);
  assert.equal((afterFailure.body as Cart).items[0]?.quantity, 1);

  const updated = await requestCart(`/api/v1/cart/items/${item.id}`, {
    method: "PATCH",
    cookie: current.cookie,
    ifMatch: '"2"',
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 2 })
  });
  assert.equal(updated.response.status, 200);
  assert.equal((updated.body as Cart).items[0]?.quantity, 2);

  const removed = await requestCart(`/api/v1/cart/items/${item.id}`, {
    method: "DELETE",
    cookie: current.cookie,
    ifMatch: updated.response.headers.get("etag") ?? ""
  });
  assert.equal(removed.response.status, 200);
  assert.deepEqual((removed.body as Cart).items, []);

  const foreign = await bootstrap();
  const foreignMutation = await requestCart(`/api/v1/cart/items/${item.id}`, {
    method: "DELETE",
    cookie: foreign.cookie,
    ifMatch: foreign.etag
  });
  assert.equal(foreignMutation.response.status, 404);
  assert.equal((foreignMutation.body as Problem).code, "CART_ITEM_NOT_FOUND");
});

test("Cart mutations reconcile stale ETags and allow one winner for parallel mutations", async () => {
  const current = await bootstrap();
  const winner = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: current.etag,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
  });
  assert.equal(winner.response.status, 200);

  const conflict = await requestCart("/api/v1/cart/items", {
    method: "POST",
    cookie: current.cookie,
    ifMatch: current.etag,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productVariantId: teaVariant.id, quantity: 1 })
  });
  assert.equal(conflict.response.status, 412);
  assert.equal((conflict.body as Problem).code, "CART_VERSION_MISMATCH");
  assert.equal((conflict.body as Problem).currentCart?.version, 2);

  const parallel = await bootstrap();
  const results = await Promise.all([
    requestCart("/api/v1/cart/items", {
      method: "POST",
      cookie: parallel.cookie,
      ifMatch: parallel.etag,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
    }),
    requestCart("/api/v1/cart/items", {
      method: "POST",
      cookie: parallel.cookie,
      ifMatch: parallel.etag,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productVariantId: coffeeVariant.id, quantity: 1 })
    })
  ]);
  assert.deepEqual(results.map(({ response }) => response.status).sort(), [200, 412]);

  const final = await requestCart("/api/v1/cart", { method: "GET", cookie: parallel.cookie });
  const finalCart = final.body as Cart;
  assert.equal(finalCart.version, 2);
  assert.equal(finalCart.items[0]?.quantity, 1);
});
