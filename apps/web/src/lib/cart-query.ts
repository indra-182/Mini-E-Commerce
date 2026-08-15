"use client";

import type { components } from "@mini-ecommerce/api-types";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { ApiError, apiFetch, type ApiResponse } from "./api-client";

export type Cart = components["schemas"]["CartDto"];
export type CartResponse = ApiResponse<Cart>;
export type CartItem = components["schemas"]["CartItemDto"];

export const cartQueryKey = ["cart"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMoney(value: unknown): value is components["schemas"]["MoneyDto"] {
  return (
    isRecord(value) &&
    typeof value.amount === "number" &&
    Number.isInteger(value.amount) &&
    value.amount >= 0 &&
    value.currency === "IDR"
  );
}

function isCartItem(value: unknown): value is CartItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.productVariantId === "string" &&
    typeof value.productId === "string" &&
    typeof value.productSlug === "string" &&
    typeof value.productName === "string" &&
    typeof value.thumbnail === "string" &&
    typeof value.optionLabel === "string" &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    isMoney(value.unitPrice) &&
    isMoney(value.lineTotal) &&
    typeof value.availableQuantity === "number" &&
    Number.isInteger(value.availableQuantity) &&
    value.availableQuantity >= 0 &&
    typeof value.isAvailable === "boolean"
  );
}

function isCart(value: unknown): value is Cart {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.version === "number" &&
    Number.isInteger(value.version) &&
    value.version >= 1 &&
    Array.isArray(value.items) &&
    value.items.every(isCartItem) &&
    isMoney(value.subtotal)
  );
}

export function cartItemCount(cart: Cart | null | undefined): number {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

export function cartEtag(
  response: Pick<CartResponse, "data" | "etag">,
): string {
  return response.etag ?? `"${response.data.version}"`;
}

export function cartResponseFromProblem(error: unknown): CartResponse | null {
  if (
    !(error instanceof ApiError) ||
    ![409, 412].includes(error.status) ||
    !["CART_VERSION_MISMATCH", "CHECKOUT_CART_CHANGED"].includes(
      error.problem.code,
    )
  )
    return null;

  const currentCart = error.problem.currentCart;
  if (!isCart(currentCart)) return null;

  return {
    data: currentCart,
    headers: error.headers,
    requestId: error.requestId,
    etag: error.etag ?? `"${currentCart.version}"`,
  };
}

export function reconcileCartProblem(
  queryClient: QueryClient,
  error: unknown,
): void {
  const currentCart = cartResponseFromProblem(error);
  if (currentCart) queryClient.setQueryData(cartQueryKey, currentCart);
}

export async function bootstrapCart(): Promise<CartResponse> {
  return apiFetch<Cart>("/api/v1/cart", { method: "POST" });
}

async function fetchCartForBadge(): Promise<CartResponse | null> {
  try {
    return await apiFetch<Cart>("/api/v1/cart");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useCartBadge(enabled = true) {
  return useQuery<CartResponse | null, ApiError>({
    queryKey: cartQueryKey,
    queryFn: fetchCartForBadge,
    enabled: enabled && typeof window !== "undefined",
    retry: false,
  });
}

export function useCartPage() {
  const queryClient = useQueryClient();
  const bootstrapStarted = useRef(false);
  const query = useQuery<CartResponse | null, ApiError>({
    queryKey: cartQueryKey,
    queryFn: bootstrapCart,
    enabled: typeof window !== "undefined",
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (
      query.data !== null ||
      query.isPending ||
      query.isFetching ||
      bootstrapStarted.current
    )
      return;

    bootstrapStarted.current = true;
    void queryClient
      .fetchQuery({ queryKey: cartQueryKey, queryFn: bootstrapCart })
      .catch(() => undefined);
  }, [query.data, query.isFetching, query.isPending, queryClient]);

  return query;
}

function cachedCart(queryClient: QueryClient): CartResponse {
  const currentCart = queryClient.getQueryData<CartResponse | null>(
    cartQueryKey,
  );
  if (!currentCart) {
    throw new Error("Buka halaman Keranjang sebelum mengubah item.");
  }
  return currentCart;
}

function saveCart(queryClient: QueryClient, response: CartResponse): void {
  queryClient.setQueryData(cartQueryKey, response);
}

export type UpdateCartItemInput = {
  itemId: string;
  quantity: number;
};

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation<CartResponse, Error, UpdateCartItemInput>({
    mutationFn: async ({ itemId, quantity }) => {
      const currentCart = cachedCart(queryClient);
      return apiFetch<Cart>(
        `/api/v1/cart/items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "If-Match": cartEtag(currentCart) },
          body: { quantity },
        },
      );
    },
    onSuccess: (response) => saveCart(queryClient, response),
    onError: (error) => reconcileCartProblem(queryClient, error),
  });
}

export type RemoveCartItemInput = {
  itemId: string;
};

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation<CartResponse, Error, RemoveCartItemInput>({
    mutationFn: async ({ itemId }) => {
      const currentCart = cachedCart(queryClient);
      return apiFetch<Cart>(
        `/api/v1/cart/items/${encodeURIComponent(itemId)}`,
        {
          method: "DELETE",
          headers: { "If-Match": cartEtag(currentCart) },
        },
      );
    },
    onSuccess: (response) => saveCart(queryClient, response),
    onError: (error) => reconcileCartProblem(queryClient, error),
  });
}
