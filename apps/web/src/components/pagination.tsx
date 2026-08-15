import Link from "next/link";

export function Pagination({
  page,
  pageCount,
  hrefForPage = (nextPage) => `?page=${nextPage}`,
}: Readonly<{
  page: number;
  pageCount: number;
  hrefForPage?: (page: number) => string;
}>) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pagination" aria-label="Paginasi">
      <span className="muted">
        Halaman {page} dari {pageCount}
      </span>
      <ol className="pagination-list">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map(
          (pageNumber) => (
            <li key={pageNumber}>
              <Link
                className="pagination-link"
                href={hrefForPage(pageNumber)}
                aria-current={pageNumber === page ? "page" : undefined}
              >
                {pageNumber}
              </Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
