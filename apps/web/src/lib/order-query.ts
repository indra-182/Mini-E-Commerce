"use client";

import type { components } from "@mini-ecommerce/api-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiFetch, type ApiResponse } from "./api-client";

export type Order = components["schemas"]["OrderDto"];
export type PaymentAttempt = components["schemas"]["PaymentAttemptDto"];
export type FakePaymentOutcome =
  components["schemas"]["FakePaymentOutcomeDto"]["outcome"];

export const ORDER_POLL_INTERVAL = 2_000;
export const ORDER_POLL_TIMEOUT = 2 * 60_000;

export const orderQueryKey = (orderId: string) => ["order", orderId] as const;

export function shouldPollOrder(
  status: Order["status"] | undefined,
  visible: boolean,
  elapsedMs: number,
  timedOut = false,
): boolean {
  return (
    status === "AWAITING_PAYMENT" &&
    visible &&
    !timedOut &&
    elapsedMs < ORDER_POLL_TIMEOUT
  );
}

export async function fetchOrder(orderId: string): Promise<ApiResponse<Order>> {
  return apiFetch<Order>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
}

export async function createPaymentAttempt(
  orderId: string,
): Promise<ApiResponse<PaymentAttempt>> {
  return apiFetch<PaymentAttempt>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/payment-attempts`,
    { method: "POST" },
  );
}

export async function submitFakePaymentOutcome(
  paymentAttemptId: string,
  outcome: FakePaymentOutcome,
): Promise<ApiResponse<PaymentAttempt>> {
  return apiFetch<PaymentAttempt>(
    `/api/v1/fake-payments/${encodeURIComponent(paymentAttemptId)}/outcome`,
    { method: "POST", body: { outcome } },
  );
}

export function useOrder(orderId: string | null) {
  const [visible, setVisible] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [pollingRun, setPollingRun] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    setTimedOut(false);
    setPollingRun((run) => run + 1);
  }, [orderId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateVisibility = () =>
      setVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const query = useQuery<Order, Error>({
    queryKey: orderId ? orderQueryKey(orderId) : ["order", "missing"],
    queryFn: async () => (await fetchOrder(orderId as string)).data,
    enabled: Boolean(orderId) && typeof window !== "undefined",
    refetchInterval: (current) =>
      shouldPollOrder(
        current.state.data?.status,
        visible,
        Date.now() - startedAt.current,
        timedOut,
      )
        ? ORDER_POLL_INTERVAL
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    if (!visible || query.data?.status !== "AWAITING_PAYMENT") return undefined;

    const remaining = ORDER_POLL_TIMEOUT - (Date.now() - startedAt.current);
    if (remaining <= 0) {
      setTimedOut(true);
      return undefined;
    }

    const timeout = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(timeout);
  }, [pollingRun, query.data?.status, visible]);

  const restartPolling = () => {
    startedAt.current = Date.now();
    setTimedOut(false);
    setPollingRun((run) => run + 1);
    void query.refetch();
  };

  return { ...query, pollingTimedOut: timedOut, restartPolling };
}
