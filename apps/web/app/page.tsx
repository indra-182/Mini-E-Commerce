import Link from "next/link";

import { PageShell } from "@/components/page-shell";

export default function HomePage() {
  return (
    <PageShell
      eyebrow="Mini E-Commerce"
      title="Belanja yang ringkas dan jelas."
      description="Shell frontend mobile-first untuk menjelajahi katalog, mengelola keranjang, dan menyelesaikan pembayaran simulasi."
    >
      <section className="surface">
        <h2>Mulai menjelajah</h2>
        <p className="muted">
          Halaman fitur akan terhubung ke API pada fase berikutnya.
        </p>
        <div className="button-row">
          <Link className="button-link button-primary" href="/products">
            Lihat produk
          </Link>
          <Link className="button-link button-secondary" href="/articles">
            Baca artikel
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
