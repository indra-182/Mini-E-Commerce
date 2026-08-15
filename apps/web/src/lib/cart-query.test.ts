import assert from "node:assert/strict";
import test from "node:test";

import type { components } from "@mini-ecommerce/api-types";

import { ApiError } from "./api-client.js";
import { cartItemCount, cartResponseFromProblem } from "./cart-query.js";

type Cart = components["schemas"]["CartDto"];

const cart: Cart = {
  id: "cart-1",
  version: 4,
  items: [
    {
      id: "item-1",
      productVariantId: "variant-1",
      productId: "product-1",
      productSlug: "kopi-arabika-gayo",
      productName: "Kopi Arabika Gayo",
      thumbnail: "/images/products/kopi-arabika-gayo.webp",
      optionLabel: "250 g",
      quantity: 2,
      unitPrice: { amount: 85000, currency: "IDR" },
      lineTotal: { amount: 170000, currency: "IDR" },
      availableQuantity: 4,
      isAvailable: true,
    },
  ],
  subtotal: { amount: 170000, currency: "IDR" },
};

test("Cart badge counts quantities and stale Cart errors yield a fresh ETag", () => {
  const error = new ApiError(
    {
      type: "urn:mini-e-commerce:problem:CART_VERSION_MISMATCH",
      title: "Cart changed",
      status: 412,
      code: "CART_VERSION_MISMATCH",
      detail: "Refresh the Cart before retrying.",
      requestId: "request-1",
      currentCart: cart as unknown as Record<string, unknown>,
    },
    412,
    "request-1",
    null,
    new Headers(),
  );

  assert.equal(cartItemCount(cart), 2);
  assert.deepEqual(cartResponseFromProblem(error)?.data, cart);
  assert.equal(cartResponseFromProblem(error)?.etag, '"4"');

  const checkoutChanged = new ApiError(
    {
      type: "urn:mini-e-commerce:problem:CHECKOUT_CART_CHANGED",
      title: "Cart changed",
      status: 409,
      code: "CHECKOUT_CART_CHANGED",
      detail: "Refresh the Cart before retrying.",
      requestId: "request-2",
      currentCart: cart as unknown as Record<string, unknown>,
    },
    409,
    "request-2",
    null,
    new Headers(),
  );

  assert.deepEqual(cartResponseFromProblem(checkoutChanged)?.data, cart);
});
