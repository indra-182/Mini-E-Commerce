import { productFixtures } from "@mini-ecommerce/content-fixtures";

import { ProductDetail } from "@/components/product-detail";

export const dynamicParams = false;

export function generateStaticParams() {
  return productFixtures.map(({ slug }) => ({ slug }));
}

export default async function ProductDetailShell({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ProductDetail slug={slug} />;
}
