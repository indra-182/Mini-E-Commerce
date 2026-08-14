import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";
import { productFixtures } from "@mini-ecommerce/content-fixtures";
import { seedDatabase } from "../seed.js";

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Prisma integration tests require NODE_ENV=test and a test DATABASE_URL.");
}

const parsedTestUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedTestUrl.hostname)) {
  throw new Error("Prisma integration tests are limited to a local PostgreSQL host.");
}
const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ""));
if (!/(^|[-_])test($|[-_])/i.test(testDatabaseName)) {
  throw new Error("Prisma integration tests require a database name containing test.");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = process.env.DIRECT_URL ?? testDatabaseUrl;

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

async function assertConstraintFailure(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      assert.ok(["P2002", "P2004"].includes(error.code));
      return true;
    }

    assert.ok(error instanceof Prisma.PrismaClientUnknownRequestError);
    assert.match(error.message, /violates check constraint/);
    return true;
  });
}

before(async () => {
  await client.$connect();
});

beforeEach(async () => {
  await clearDatabase();
});

after(async () => {
  await client.$disconnect();
});

test("seed-if-empty is deterministic and idempotent", async () => {
  assert.equal(await seedDatabase(client), true);
  assert.equal(await seedDatabase(client), false);
  assert.equal(await client.product.count(), productFixtures.length);
  assert.equal(await client.article.count(), 3);
  assert.equal(await client.productVariant.count(), 4);
  assert.equal((await client.product.findUniqueOrThrow({ where: { slug: "kopi-arabika-gayo" } })).name, "Kopi Arabika Gayo");
});

test("one guest can have one active Cart but multiple closed Carts", async () => {
  const guest = await client.guestSession.create({ data: { tokenHash: "test-token-hash" } });

  await client.cart.create({ data: { guestSessionId: guest.id } });
  await client.cart.create({ data: { guestSessionId: guest.id, status: "CLOSED" } });
  await client.cart.create({ data: { guestSessionId: guest.id, status: "CLOSED" } });

  await assertConstraintFailure(() => client.cart.create({ data: { guestSessionId: guest.id } }));
});

test("duplicate SKU is rejected by the database", async () => {
  await seedDatabase(client);
  const existingVariant = await client.productVariant.findFirstOrThrow();
  const product = await client.product.create({
    data: {
      slug: "constraint-test-product",
      name: "Constraint Test Product",
      description: "Used only for a database constraint test.",
      category: "test",
      imagePaths: ["/images/products/constraint-test.webp"]
    }
  });

  await assertConstraintFailure(() =>
    client.productVariant.create({
      data: {
        productId: product.id,
        sku: existingVariant.sku,
        optionLabel: "Default",
        price: 1,
        availableQuantity: 1
      }
    })
  );
});

test("CartItem and OrderItem quantities must be positive", async () => {
  await seedDatabase(client);
  const guest = await client.guestSession.create({ data: { tokenHash: "quantity-test-token" } });
  const cart = await client.cart.create({ data: { guestSessionId: guest.id } });
  const variant = await client.productVariant.findFirstOrThrow();

  await assertConstraintFailure(() =>
    client.cartItem.create({
      data: {
        cartId: cart.id,
        productVariantId: variant.id,
        quantity: 0
      }
    })
  );

  const order = await client.order.create({
    data: {
      guestSessionId: guest.id,
      customerName: "Quantity Test",
      customerEmail: "quantity@example.test",
      shippingAddress: { line1: "Test", city: "Jakarta", postalCode: "10110", countryCode: "ID" },
      subtotal: 0,
      shippingFee: 0,
      grandTotal: 0,
      expiresAt: new Date(Date.now() + 60_000)
    }
  });

  await assertConstraintFailure(() =>
    client.orderItem.create({
      data: {
        orderId: order.id,
        productVariantId: variant.id,
        skuSnapshot: variant.sku,
        nameSnapshot: "Quantity Test",
        optionLabelSnapshot: "Default",
        unitPrice: 0,
        quantity: 0,
        lineTotal: 0
      }
    })
  );
});
