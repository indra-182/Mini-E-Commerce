import Link from "next/link";
import type { components } from "@mini-ecommerce/api-types";

import { Price } from "./price";

type Product = components["schemas"]["ProductSummaryDto"];

function priceLabel(product: Product) {
  if (!product.priceRange) return "Harga belum tersedia";
  if (product.priceRange.min.amount === product.priceRange.max.amount)
    return <Price money={product.priceRange.min} />;
  return (
    <>
      <Price money={product.priceRange.min} />
      <span aria-hidden="true"> - </span>
      <Price money={product.priceRange.max} />
    </>
  );
}

export function ProductCard({ product }: Readonly<{ product: Product }>) {
  return (
    <article className="product-card">
      <img
        className="product-card-image"
        src={product.thumbnail}
        alt=""
        width="640"
        height="480"
        loading="lazy"
      />
      <div className="product-card-body">
        <h2 className="product-card-title">
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h2>
        <p className="price" aria-label={`Rentang harga ${product.name}`}>
          {priceLabel(product)}
        </p>
        <p className="availability">
          {availabilityLabel(product.availability)}
        </p>
      </div>
    </article>
  );
}

function availabilityLabel(availability: Product["availability"]) {
  switch (availability) {
    case "IN_STOCK":
      return "Tersedia";
    case "LOW_STOCK":
      return "Stok terbatas";
    default:
      return "Stok habis";
  }
}
