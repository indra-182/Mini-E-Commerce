import type { paths } from "@mini-ecommerce/api-types";

type ProductListQuery = NonNullable<
  paths["/api/v1/products"]["get"]["parameters"]["query"]
>;

export type ProductSort = NonNullable<ProductListQuery["sort"]>;

export type ProductFilters = {
  search: string;
  category: string;
  sort: ProductSort;
  page: number;
};

const productSorts = ["newest", "price_asc", "price_desc"] as const;

function isProductSort(value: string | null): value is ProductSort {
  return productSorts.some((sort) => sort === value);
}

function positivePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function parseProductFilters(
  params: Pick<URLSearchParams, "get">,
): ProductFilters {
  const sort = params.get("sort");

  return {
    search: params.get("search") ?? "",
    category: params.get("category") ?? "",
    sort: isProductSort(sort) ? sort : "newest",
    page: positivePage(params.get("page")),
  };
}

export function productQuery(filters: ProductFilters): ProductListQuery {
  return {
    search: filters.search || undefined,
    category: filters.category || undefined,
    sort: filters.sort,
    page: filters.page,
  };
}

export function updateProductSearchParams(
  current: string,
  changes: Partial<ProductFilters>,
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (changes.search !== undefined) {
    changes.search ? next.set("search", changes.search) : next.delete("search");
  }
  if (changes.category !== undefined) {
    changes.category
      ? next.set("category", changes.category)
      : next.delete("category");
  }
  if (changes.sort !== undefined) {
    changes.sort === "newest"
      ? next.delete("sort")
      : next.set("sort", changes.sort);
  }
  if (changes.page !== undefined) {
    changes.page > 1
      ? next.set("page", String(changes.page))
      : next.delete("page");
  } else if (
    changes.search !== undefined ||
    changes.category !== undefined ||
    changes.sort !== undefined
  ) {
    next.delete("page");
  }

  return next;
}

export function productPageHref(filters: ProductFilters, page: number): string {
  const params = updateProductSearchParams("", { ...filters, page });
  const query = params.toString();
  return `/products${query ? `?${query}` : ""}`;
}
