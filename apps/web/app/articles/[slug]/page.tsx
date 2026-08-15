import { articleFixtures } from "@mini-ecommerce/content-fixtures";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";

export const dynamicParams = false;

export function generateStaticParams() {
  return articleFixtures.map(({ slug }) => ({ slug }));
}

export default async function ArticleDetailShell({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articleFixtures.find(
    (candidate) => candidate.slug === slug && candidate.isPublished,
  );

  if (!article) notFound();

  return (
    <PageShell
      eyebrow="Artikel"
      title={article.title}
      description={article.excerpt}
    >
      <article className="article-detail">
        <img
          className="article-detail-image"
          src={article.imagePath}
          alt=""
          width="1280"
          height="720"
          loading="eager"
        />
        <p className="muted">
          <time dateTime={article.publishedAt ?? undefined}>
            {article.publishedAt
              ? new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(article.publishedAt))
              : "Tanggal belum tersedia"}
          </time>
        </p>
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      </article>
    </PageShell>
  );
}
