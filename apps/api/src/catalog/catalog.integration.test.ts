import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import { articleFixtures, productFixtures } from "@mini-ecommerce/content-fixtures";
import { PrismaClient } from "@prisma/client";

import { createApplication } from "../bootstrap.js";
import { loadEnvironment } from "../config/environment.js";

const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Catalog integration tests require NODE_ENV=test and a test DATABASE_URL.");
}

const parsedTestUrl = new URL(testDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedTestUrl.hostname)) {
  throw new Error("Catalog integration tests are limited to a local PostgreSQL host.");
}
const testDatabaseName = decodeURIComponent(parsedTestUrl.pathname.replace(/^\//, ""));
if (!/(^|[-_])test($|[-_])/i.test(testDatabaseName)) {
  throw new Error("Catalog integration tests require a database name containing test.");
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

async function seedContent(): Promise<void> {
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

  for (const article of articleFixtures) {
    await client.article.create({
      data: {
        id: article.id,
        slug: article.slug,
        type: article.type,
        title: article.title,
        excerpt: article.excerpt,
        contentHtml: article.contentHtml,
        imagePath: article.imagePath,
        isPublished: article.isPublished,
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
        createdAt: new Date(article.createdAt),
        updatedAt: new Date(article.updatedAt)
      }
    });
  }
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
  await seedContent();
});

after(async () => {
  await closeApp?.();
  await client.$disconnect();
});

test("products support filters, deterministic price sorting, pagination, shape, and cache policy", async () => {
  const filtered = await fetch(`${baseUrl}/api/v1/products?search=KOPI&category=coffee`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.headers.get("cache-control"), "no-store");
  const filteredBody = (await filtered.json()) as { items: Array<Record<string, unknown>>; pageInfo: Record<string, number> };
  assert.deepEqual(filteredBody.items.map((item) => item.slug), ["kopi-arabika-gayo"]);
  assert.deepEqual(Object.keys(filteredBody.items[0] ?? {}), ["id", "slug", "name", "thumbnail", "priceRange", "availability"]);
  assert.deepEqual(filteredBody.pageInfo, { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });

  const sorted = await fetch(`${baseUrl}/api/v1/products?sort=price_asc&page=1&pageSize=2`);
  assert.equal(sorted.status, 200);
  const sortedBody = (await sorted.json()) as { items: Array<{ slug: string }>; pageInfo: Record<string, number> };
  assert.deepEqual(sortedBody.items.map((item) => item.slug), ["teh-hijau-melati", "kopi-arabika-gayo"]);
  assert.deepEqual(sortedBody.pageInfo, { page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });

  const secondPage = await fetch(`${baseUrl}/api/v1/products?sort=price_desc&page=2&pageSize=2`);
  assert.equal(secondPage.status, 200);
  const secondPageBody = (await secondPage.json()) as { items: Array<{ slug: string }> };
  assert.deepEqual(secondPageBody.items.map((item) => item.slug), ["teh-hijau-melati"]);

  const invalidSort = await fetch(`${baseUrl}/api/v1/products?sort=unsupported`);
  assert.equal(invalidSort.status, 422);
});

test("product detail exposes only active data and conceals inactive products", async () => {
  await client.productVariant.update({ where: { id: productFixtures[0]!.variants[1]!.id }, data: { isActive: false } });

  const detailResponse = await fetch(`${baseUrl}/api/v1/products/${productFixtures[0]!.slug}`);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.headers.get("cache-control"), "no-store");
  const detail = (await detailResponse.json()) as { priceRange: { min: { amount: number }; max: { amount: number } }; variants: Array<{ optionLabel: string }> };
  assert.deepEqual(detail.priceRange, { min: { amount: 85000, currency: "IDR" }, max: { amount: 85000, currency: "IDR" } });
  assert.deepEqual(detail.variants.map((variant) => variant.optionLabel), ["250 g"]);

  await client.product.update({ where: { id: productFixtures[0]!.id }, data: { isActive: false } });
  const hidden = await fetch(`${baseUrl}/api/v1/products/${productFixtures[0]!.slug}`);
  assert.equal(hidden.status, 404);
  assert.equal((await hidden.json()).code, "PRODUCT_NOT_FOUND");
});

test("articles filter, paginate, expose detail content, and conceal unpublished records", async () => {
  const listResponse = await fetch(`${baseUrl}/api/v1/articles?type=news&page=1&pageSize=1`);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=86400");
  const list = (await listResponse.json()) as { items: Array<Record<string, unknown>>; pageInfo: Record<string, number> };
  assert.equal(list.items[0]?.type, "NEWS");
  assert.deepEqual(Object.keys(list.items[0] ?? {}), ["id", "slug", "type", "title", "excerpt", "coverImage", "publishedAt"]);
  assert.deepEqual(list.pageInfo, { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 });

  const detailResponse = await fetch(`${baseUrl}/api/v1/articles/${articleFixtures[0]!.slug}`);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=86400");
  assert.match((await detailResponse.json()).contentHtml, /^<p>/);

  await client.article.update({ where: { id: articleFixtures[0]!.id }, data: { isPublished: false } });
  const hidden = await fetch(`${baseUrl}/api/v1/articles/${articleFixtures[0]!.slug}`);
  assert.equal(hidden.status, 404);
  assert.equal((await hidden.json()).code, "ARTICLE_NOT_FOUND");

  const invalidType = await fetch(`${baseUrl}/api/v1/articles?type=unsupported`);
  assert.equal(invalidType.status, 422);
});
