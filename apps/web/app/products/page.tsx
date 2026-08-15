import { Suspense } from "react";

import { ProductsBrowser } from "@/components/products-browser";
import { PageShell } from "@/components/page-shell";

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <PageShell
          eyebrow="Katalog"
          title="Produk"
          description="Memuat katalog produk."
        >
          <section className="surface" aria-busy="true">
            Memuat produk...
          </section>
        </PageShell>
      }
    >
      <ProductsBrowser />
    </Suspense>
  );
}
