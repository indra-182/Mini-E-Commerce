import Link from "next/link";

import { PageShell } from "@/components/page-shell";

export default function NotFound() {
  return (
    <PageShell
      eyebrow="404"
      title="Halaman tidak ditemukan"
      description="Alamat yang dibuka tidak tersedia atau sudah berubah."
    >
      <Link className="button-link button-primary" href="/">
        Kembali ke beranda
      </Link>
    </PageShell>
  );
}
