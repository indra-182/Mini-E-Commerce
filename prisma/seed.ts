import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { articleFixtures, productFixtures } from "@mini-ecommerce/content-fixtures";

type SeedClient = Pick<PrismaClient, "product" | "article">;

export async function seedIfEmpty(client: SeedClient): Promise<boolean> {
  const [productCount, articleCount] = await Promise.all([client.product.count(), client.article.count()]);

  if (productCount > 0 || articleCount > 0) {
    return false;
  }

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

  return true;
}

export async function seedDatabase(client: PrismaClient): Promise<boolean> {
  return client.$transaction((transaction) => seedIfEmpty(transaction));
}

async function main(): Promise<void> {
  const client = new PrismaClient();

  try {
    const seeded = await seedDatabase(client);
    console.log(seeded ? "Seeded deterministic content fixtures." : "Content already exists; seed skipped.");
  } finally {
    await client.$disconnect();
  }
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
