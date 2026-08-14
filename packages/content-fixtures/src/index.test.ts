import assert from "node:assert/strict";
import test from "node:test";

import { articleFixtures, productFixtures } from "./index.js";

test("content fixtures have stable identifiers and safe static content", () => {
  const ids = [
    ...productFixtures.map((product) => product.id),
    ...productFixtures.flatMap((product) => product.variants.map((variant) => variant.id)),
    ...articleFixtures.map((article) => article.id)
  ];
  const slugs = [...productFixtures.map((product) => product.slug), ...articleFixtures.map((article) => article.slug)];
  const skus = productFixtures.flatMap((product) => product.variants.map((variant) => variant.sku));

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(new Set(skus).size, skus.length);
  assert.ok(productFixtures.every((product) => product.imagePaths.every((path) => path.startsWith("/images/"))));
  assert.ok(articleFixtures.every((article) => article.imagePath.startsWith("/images/")));
  assert.ok(articleFixtures.every((article) => !/<script\b|\son[a-z]+\s*=|javascript:/i.test(article.contentHtml)));
});
