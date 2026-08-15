import Link from "next/link";

import { CartBadge } from "@/components/cart-badge";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand" href="/">
          Mini E-Commerce
        </Link>
        <nav className="site-nav" aria-label="Navigasi utama">
          <ul>
            <li>
              <Link href="/products">Produk</Link>
            </li>
            <li>
              <Link href="/articles">Artikel</Link>
            </li>
            <li>
              <CartBadge />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>
          Belanja sederhana dengan harga dan ketersediaan yang tetap
          dikonfirmasi server.
        </p>
      </div>
    </footer>
  );
}
