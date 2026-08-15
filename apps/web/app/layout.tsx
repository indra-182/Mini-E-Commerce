import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mini E-Commerce",
    template: "%s | Mini E-Commerce",
  },
  description: "Katalog dan alur pembelian sederhana.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <QueryProvider>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </QueryProvider>
      </body>
    </html>
  );
}
