"use client";

import type { components } from "@mini-ecommerce/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type ApiResponse } from "@/lib/api-client";
import {
  bootstrapCart,
  cartEtag,
  cartQueryKey,
  reconcileCartProblem,
  type CartResponse,
} from "@/lib/cart-query";

type Cart = components["schemas"]["CartDto"];

export type AddToCartInput = {
  productVariantId: string;
  quantity: number;
};

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<Cart>, Error, AddToCartInput>({
    mutationFn: async ({ productVariantId, quantity }) => {
      let currentCart = queryClient.getQueryData<CartResponse | null>(
        cartQueryKey,
      );
      if (!currentCart) {
        currentCart = await bootstrapCart();
        queryClient.setQueryData(cartQueryKey, currentCart);
      }

      return apiFetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "If-Match": cartEtag(currentCart) },
        body: { productVariantId, quantity },
      });
    },
    onSuccess: (response) => queryClient.setQueryData(cartQueryKey, response),
    onError: (error) => reconcileCartProblem(queryClient, error),
  });
}
