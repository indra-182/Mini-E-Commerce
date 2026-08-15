import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProductFilters,
  productPageHref,
  updateProductSearchParams,
} from "./catalog-query.js";

test("catalog filters parse safe defaults and reject invalid URL values", () => {
  const filters = parseProductFilters(
    new URLSearchParams("sort=not-a-sort&page=0&search=kopi"),
  );

  assert.deepEqual(filters, {
    search: "kopi",
    category: "",
    sort: "newest",
    page: 1,
  });
});

test("changing a catalog filter resets the page while pagination preserves filters", () => {
  const next = updateProductSearchParams("search=kopi&page=3", {
    category: "coffee",
  });

  assert.equal(next.toString(), "search=kopi&category=coffee");
  assert.equal(
    productPageHref(
      { search: "kopi", category: "coffee", sort: "price_asc", page: 1 },
      2,
    ),
    "/products?search=kopi&category=coffee&sort=price_asc&page=2",
  );
});
