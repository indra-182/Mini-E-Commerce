import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
let guestCookie = "";

function url(path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function responseCookies(response: Response): string[] {
  const getSetCookie = response.headers.getSetCookie;
  if (getSetCookie) return getSetCookie.call(response.headers);
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json, text/html");
  if (guestCookie) headers.set("Cookie", guestCookie);
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Origin", baseUrl);
  }

  const response = await fetch(url(path), { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status}: ${text}`,
    );
  }

  const setCookie = responseCookies(response)[0];
  if (setCookie) guestCookie = setCookie.split(";", 1)[0] ?? guestCookie;

  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

const health = await request("/health");
assert.equal(record(health.body).status, "healthy");

for (const path of [
  "/docs",
  "/docs-json",
  "/products/",
  "/products/kopi-arabika-gayo/",
  "/articles/panduan-menyeduh-kopi/",
]) {
  await request(path);
}

const products = record((await request("/api/v1/products")).body);
const items = products.items;
assert.ok(Array.isArray(items) && items.length > 0);
const product = items
  .map(record)
  .find((candidate) => candidate.availability !== "OUT_OF_STOCK");
assert.ok(product);
const detail = record(
  (
    await request(
      `/api/v1/products/${encodeURIComponent(String(product.slug))}`,
    )
  ).body,
);
const variants = detail.variants;
assert.ok(Array.isArray(variants) && variants.length > 0);
const variant = record(variants[0]);

const cart = await request("/api/v1/cart", { method: "POST" });
assert.match(guestCookie, /^guest_session=/);
const cartVersion = cart.response.headers.get("etag");
assert.ok(cartVersion);

const updatedCart = await request("/api/v1/cart/items", {
  method: "POST",
  headers: { "Content-Type": "application/json", "If-Match": cartVersion },
  body: JSON.stringify({ productVariantId: variant.id, quantity: 1 }),
});
const updatedCartVersion = updatedCart.response.headers.get("etag");
assert.ok(updatedCartVersion);

const order = await request("/api/v1/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "If-Match": updatedCartVersion,
    "Idempotency-Key": `smoke-${randomUUID()}`,
  },
  body: JSON.stringify({
    customer: { name: "Smoke Test", email: "smoke@example.test" },
    shippingAddress: {
      line1: "Jl. Smoke 1",
      city: "Jakarta",
      postalCode: "10110",
      countryCode: "ID",
    },
    shippingMethod: "REGULAR",
  }),
});
const orderBody = record(order.body);
const paymentAttempt = record(orderBody.paymentAttempt);
const paymentResult = await request(
  `/api/v1/fake-payments/${paymentAttempt.id}/outcome`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "SUCCEEDED" }),
  },
);
assert.equal(record(paymentResult.body).status, "SUCCEEDED");

const finalOrder = record(
  (await request(`/api/v1/orders/${orderBody.id}`)).body,
);
assert.equal(finalOrder.status, "PAID");
console.log(
  "Production smoke flow passed: health, docs, static routes, cookie, Cart, Checkout, fake payment, and PAID Order.",
);
