import { articleFixtures } from "@mini-ecommerce/content-fixtures";
import Link from "next/link";

import { PageShell } from "@/components/page-shell";

const articleTypeLabels = {
  PRODUCT: "Produk",
  NEWS: "Berita",
  OTHER: "Lainnya",
} as const;

const publishedArticles = articleFixtures.filter(
  (article) => article.isPublished,
);

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Tanggal belum tersedia";
}

export default function ArticlesPage() {
  return (
    <PageShell
      eyebrow="Bacaan"
      title="Artikel"
      description="Bacaan singkat dari konten terkurasi untuk membantu perjalanan belanja."
    >
      <section aria-labelledby="article-list-title">
        <h2 id="article-list-title" className="visually-hidden">
          Daftar artikel
        </h2>
        <div className="article-grid">
          {publishedArticles.map((article) => (
            <article className="article-card" key={article.id}>
              <img
                className="article-card-image"
                src={article.imagePath}
                alt=""
                width="1280"
                height="720"
                loading="lazy"
              />
              <div className="article-card-body">
                <p className="eyebrow">{articleTypeLabels[article.type]}</p>
                <h2>
                  <Link href={`/articles/${article.slug}`}>
                    {article.title}
                  </Link>
                </h2>
                <p className="muted">{article.excerpt}</p>
                <time dateTime={article.publishedAt ?? undefined}>
                  {formatDate(article.publishedAt)}
                </time>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
