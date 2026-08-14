import assert from "node:assert/strict";
import test from "node:test";

import { CatalogService, ProductListQueryDto, type ArticleListQueryDto } from "./catalog.js";
import { ProblemException } from "../common/problem-details.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const products = [
  {
    id: "product-coffee",
    slug: "kopi-arabika-gayo",
    name: "Kopi Arabika Gayo",
    description: "Biji kopi panggang.",
    imagePaths: ["/images/coffee.webp"],
    variants: [
      { id: "variant-coffee", optionLabel: "250 g", price: 85000, currency: "IDR", availableQuantity: 12 }
    ]
  },
  {
    id: "product-tea",
    slug: "teh-hijau-melati",
    name: "Teh Hijau Melati",
    description: "Teh melati.",
    imagePaths: ["/images/tea.webp"],
    variants: [{ id: "variant-tea", optionLabel: "25 kantong", price: 42000, currency: "IDR", availableQuantity: 20 }]
  }
];

function query(overrides: Partial<ProductListQueryDto> = {}): ProductListQueryDto {
  return Object.assign(new ProductListQueryDto(), overrides);
}

test("catalog service filters active products and sorts by the minimum active variant price", async () => {
  let receivedWhere: unknown;
  const prisma = {
    product: {
      findMany: async (args: { where: unknown }) => {
        receivedWhere = args.where;
        return products;
      }
    }
  } as unknown as PrismaService;

  const result = await new CatalogService(prisma).listProducts(query({ sort: "price_asc", pageSize: 1 }));

  assert.deepEqual(receivedWhere, { isActive: true });
  assert.deepEqual(result.items.map((item) => item.slug), ["teh-hijau-melati"]);
  assert.deepEqual(result.items[0]?.priceRange?.min, { amount: 42000, currency: "IDR" });
  assert.equal(result.pageInfo.totalItems, 2);
  assert.equal(result.pageInfo.totalPages, 2);
});

test("catalog service returns published articles with page metadata and hides missing products", async () => {
  const article = {
    id: "article-news",
    slug: "berita-toko-minggu-ini",
    type: "NEWS",
    title: "Berita Toko Minggu Ini",
    excerpt: "Pembaruan katalog.",
    contentHtml: "<p>Pembaruan.</p>",
    imagePath: "/images/news.webp",
    publishedAt: new Date("2025-01-09T00:00:00.000Z")
  };
  const prisma = {
    article: {
      count: async () => 1,
      findMany: async () => [article]
    },
    product: {
      findFirst: async () => null
    }
  } as unknown as PrismaService;
  const service = new CatalogService(prisma);

  const articleQuery = { type: "news", page: 1, pageSize: 20 } as ArticleListQueryDto;
  const articles = await service.listArticles(articleQuery);
  assert.equal(articles.items[0]?.type, "NEWS");
  assert.equal(articles.items[0]?.publishedAt, "2025-01-09T00:00:00.000Z");
  assert.equal(articles.pageInfo.totalPages, 1);

  await assert.rejects(
    service.getProduct("missing"),
    (error: unknown) => error instanceof ProblemException && error.problem.code === "PRODUCT_NOT_FOUND"
  );
});
