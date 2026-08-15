"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageShell } from "@/components/page-shell";
import { ProblemMessage } from "@/components/problem-message";
import { ApiError } from "@/lib/api-client";
import {
  submitFakePaymentOutcome,
  type FakePaymentOutcome,
  type PaymentAttempt,
} from "@/lib/order-query";

const outcomes: Array<{
  value: FakePaymentOutcome;
  label: string;
  description: string;
}> = [
  {
    value: "SUCCEEDED",
    label: "Simulasikan berhasil",
    description:
      "Signed webhook akan mengubah Order menjadi PAID jika masih eligible.",
  },
  {
    value: "FAILED",
    label: "Simulasikan gagal",
    description: "Payment Attempt gagal, tetapi Order tetap dapat dicoba lagi.",
  },
  {
    value: "PENDING",
    label: "Biarkan pending",
    description: "Order tetap menunggu pembayaran dan dapat dipantau.",
  },
];

function errorText(error: unknown): ApiError | string {
  return error instanceof ApiError
    ? error
    : error instanceof Error
      ? error.message
      : "Simulasi pembayaran belum dapat diproses.";
}

function outcomeMessage(attempt: PaymentAttempt): string {
  if (attempt.status === "SUCCEEDED")
    return "Payment Attempt berhasil. Status Order sedang dikonfirmasi.";
  if (attempt.status === "FAILED")
    return "Payment Attempt gagal. Kembali ke Order untuk membuat percobaan baru.";
  if (attempt.status === "EXPIRED")
    return "Payment Attempt sudah kedaluwarsa bersama Order.";
  return "Payment Attempt masih pending. Anda dapat mencoba simulasi lagi selama Order belum kedaluwarsa.";
}

export function FakePaymentBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentAttemptId = params.get("paymentAttemptId");
  const orderId = params.get("orderId");
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const outcome = useMutation({
    mutationFn: (value: FakePaymentOutcome) =>
      submitFakePaymentOutcome(paymentAttemptId as string, value),
    onSuccess: (response) => {
      setAttempt(response.data);
      if (!orderId) return;
      if (response.data.status === "SUCCEEDED") {
        router.push(`/order?orderId=${encodeURIComponent(orderId)}`);
      } else if (response.data.status === "FAILED") {
        router.push(
          `/order?orderId=${encodeURIComponent(orderId)}&payment=failed`,
        );
      }
    },
  });

  if (!paymentAttemptId) {
    return (
      <PageShell
        eyebrow="Fake Payment"
        title="Payment Attempt tidak ditemukan"
        description="Buka halaman ini dari Checkout atau Order dengan Payment Attempt ID."
      >
        <section className="surface">
          <p className="muted">
            Query `paymentAttemptId` diperlukan untuk simulasi.
          </p>
          <Link className="button-link button-primary" href="/cart">
            Kembali ke Cart
          </Link>
        </section>
      </PageShell>
    );
  }

  const terminal = attempt && attempt.status !== "PENDING";

  return (
    <PageShell
      eyebrow="Fake Payment"
      title="Simulasikan pembayaran"
      description="Halaman ini hanya menyediakan outcome deterministik. Tidak ada data kartu atau provider nyata."
    >
      {outcome.isError ? (
        <ProblemMessage problem={errorText(outcome.error)} />
      ) : null}
      {attempt ? (
        <p className="status-panel" role="status" aria-live="polite">
          {outcomeMessage(attempt)}
        </p>
      ) : null}
      <section
        className="surface payment-simulation"
        aria-labelledby="payment-outcome-title"
      >
        <h2 id="payment-outcome-title">Pilih hasil simulasi</h2>
        <p className="muted">
          Payment Attempt: <code>{paymentAttemptId}</code>
        </p>
        <div className="payment-option-list">
          {outcomes.map((option) => (
            <div className="payment-option" key={option.value}>
              <div>
                <h3>{option.label}</h3>
                <p className="muted">{option.description}</p>
              </div>
              <Button
                type="button"
                disabled={Boolean(terminal) || outcome.isPending}
                onClick={() => outcome.mutate(option.value)}
              >
                {outcome.isPending && outcome.variables === option.value
                  ? "Mengirim..."
                  : option.label}
              </Button>
            </div>
          ))}
        </div>
        <div className="button-row">
          {orderId ? (
            <Link
              className="button-link button-secondary"
              href={`/order?orderId=${encodeURIComponent(orderId)}&paymentAttemptId=${encodeURIComponent(paymentAttemptId)}`}
            >
              Lihat status Order
            </Link>
          ) : null}
          <Link className="button-link button-secondary" href="/cart">
            Kembali ke Cart
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
