"use client";

import { useSearchParams } from "next/navigation";

export function RuntimeRoute({
  description,
  queryKey,
  title,
}: Readonly<{
  description: string;
  queryKey: string;
  title: string;
}>) {
  const searchParams = useSearchParams();
  const value = searchParams.get(queryKey);

  return (
    <div className="page-container">
      <header className="page-intro">
        <p className="eyebrow">Runtime route</p>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </header>
      <section className="surface" aria-live="polite">
        <h2>Siap untuk data runtime</h2>
        <p className="muted">
          {value
            ? `${queryKey}: ${value}`
            : `Buka route ini dengan query ${queryKey} untuk melanjutkan.`}
        </p>
      </section>
    </div>
  );
}
