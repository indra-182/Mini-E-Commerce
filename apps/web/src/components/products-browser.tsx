"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { productFixtures } from "@mini-ecommerce/content-fixtures";
import type { components } from "@mini-ecommerce/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { PageShell } from "@/components/page-shell";
import { Pagination } from "@/components/pagination";
import { ProblemMessage } from "@/components/problem-message";
import { ProductCard } from "@/components/product-card";
import { Select } from "@/components/select";
import { Skeleton } from "@/components/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  parseProductFilters,
  productPageHref,
  productQuery,
  updateProductSearchParams,
  type ProductFilters,
} from "@/lib/catalog-query";

type ProductCollection = components["schemas"]["ProductCollectionDto"];

const categories = Array.from(
  new Set(productFixtures.map((product) => product.category)),
).sort();

function errorMessage(error: unknown): ApiError | string {
  return error instanceof ApiError
    ? error
    : error instanceof Error
      ? error.message
      : "Produk belum dapat dimuat.";
}

function ProductGridSkeleton() {
  return (
    <div className="product-grid" aria-busy="true" aria-label="Memuat produk">
      {Array.from({ length: 3 }, (_, index) => (
        <article className="product-card" key={index}>
          <Skeleton width="100%" />
          <div className="product-card-body">
            <Skeleton width="75%" />
            <Skeleton width="50%" />
          </div>
        </article>
      ))}
    </div>
  );
}

function CatalogFilters({
  filters,
  idPrefix,
  onClear,
  onClose,
  onFilterChange,
  onSearch,
  searchDraft,
  setSearchDraft,
}: Readonly<{
  filters: ProductFilters;
  idPrefix: string;
  onClear: () => void;
  onClose?: () => void;
  onFilterChange: (key: "category" | "sort", value: string) => void;
  onSearch: () => void;
  searchDraft: string;
  setSearchDraft: (value: string) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <form onSubmit={submit}>
      <div className="catalog-filter-heading">
        <h2 id={`${idPrefix}-title`}>Filter produk</h2>
        {onClose ? (
          <Button type="button" variant="secondary" onClick={onClose} autoFocus>
            Tutup
          </Button>
        ) : null}
      </div>
      <div className="catalog-filter-fields">
        <Input
          id={`${idPrefix}-search`}
          label="Cari produk"
          maxLength={100}
          placeholder="Nama atau deskripsi"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        <Select
          id={`${idPrefix}-category`}
          label="Kategori"
          value={filters.category}
          onChange={(event) => onFilterChange("category", event.target.value)}
        >
          <option value="">Semua kategori</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <Select
          id={`${idPrefix}-sort`}
          label="Urutkan"
          value={filters.sort}
          onChange={(event) => onFilterChange("sort", event.target.value)}
        >
          <option value="newest">Terbaru</option>
          <option value="price_asc">Harga terendah</option>
          <option value="price_desc">Harga tertinggi</option>
        </Select>
      </div>
      <div className="button-row">
        <Button type="submit">Terapkan pencarian</Button>
        <Button type="button" variant="secondary" onClick={onClear}>
          Reset filter
        </Button>
      </div>
    </form>
  );
}

export function ProductsBrowser() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseProductFilters(searchParams);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  function navigate(changes: Partial<ProductFilters>) {
    const next = updateProductSearchParams(searchParams.toString(), changes);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function changeFilter(key: "category" | "sort", value: string) {
    navigate({ [key]: value } as Partial<ProductFilters>);
  }

  const products = useQuery<ProductCollection, ApiError>({
    queryKey: ["products", filters],
    enabled: typeof window !== "undefined",
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch("/api/v1/products", {
        query: productQuery(filters),
        signal,
      }).then((response) => response.data),
  });

  const filterProps = {
    filters,
    onClear: () => {
      setSearchDraft("");
      navigate({ search: "", category: "", sort: "newest" });
    },
    onFilterChange: changeFilter,
    onSearch: () => navigate({ search: searchDraft.trim() }),
    searchDraft,
    setSearchDraft,
  };

  return (
    <PageShell
      eyebrow="Katalog"
      title="Produk"
      description="Jelajahi produk dengan harga dan ketersediaan terbaru dari server."
    >
      <div className="catalog-toolbar">
        <p className="muted" aria-live="polite">
          {products.isFetching && products.data
            ? "Memuat halaman berikutnya..."
            : products.data
              ? `${products.data.pageInfo.totalItems} produk ditemukan.`
              : "Memuat produk..."}
        </p>
        <Button
          className="catalog-filter-trigger"
          type="button"
          variant="secondary"
          aria-controls="mobile-product-filters"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen(true)}
        >
          Buka filter
        </Button>
      </div>

      <div className="catalog-layout">
        <aside
          className="catalog-filter-desktop"
          aria-labelledby="desktop-filters-title"
        >
          <CatalogFilters {...filterProps} idPrefix="desktop-filters" />
        </aside>

        <section aria-labelledby="product-results-title">
          <h2 id="product-results-title" className="visually-hidden">
            Hasil produk
          </h2>
          {products.isPending ? <ProductGridSkeleton /> : null}

          {products.isError && !products.data ? (
            <div>
              <ProblemMessage problem={errorMessage(products.error)} />
              <div className="button-row">
                <Button type="button" onClick={() => void products.refetch()}>
                  Coba lagi
                </Button>
              </div>
            </div>
          ) : null}

          {products.data && products.data.items.length === 0 ? (
            <section className="surface" aria-live="polite">
              <h2>Produk tidak ditemukan</h2>
              <p className="muted">
                Coba hapus filter atau gunakan kata kunci lain.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={filterProps.onClear}
              >
                Hapus filter
              </Button>
            </section>
          ) : null}

          {products.data && products.data.items.length > 0 ? (
            <>
              {products.isError ? (
                <div className="catalog-inline-error">
                  <ProblemMessage problem={errorMessage(products.error)} />
                  <Button type="button" onClick={() => void products.refetch()}>
                    Coba lagi
                  </Button>
                </div>
              ) : null}
              <div className="product-grid">
                {products.data.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination
                page={products.data.pageInfo.page}
                pageCount={products.data.pageInfo.totalPages}
                hrefForPage={(page) => productPageHref(filters, page)}
              />
            </>
          ) : null}
        </section>
      </div>

      {filterOpen ? (
        <div
          className="filter-drawer"
          id="mobile-product-filters"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-filters-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setFilterOpen(false);
          }}
        >
          <aside className="filter-drawer-panel">
            <CatalogFilters
              {...filterProps}
              idPrefix="mobile-filters"
              onClose={() => setFilterOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </PageShell>
  );
}
