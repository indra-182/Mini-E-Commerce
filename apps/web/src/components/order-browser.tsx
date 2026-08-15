"use client";

import type { components } from "@mini-ecommerce/api-types";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/button";
import { PageShell } from "@/components/page-shell";
import { Price } from "@/components/price";
import { ProblemMessage } from "@/components/problem-message";
import { Skeleton } from "@/components/skeleton";
import { ApiError } from "@/lib/api-client";
import { createPaymentAttempt, useOrder, type Order } from "@/lib/order-query";

function errorText(error: unknown): ApiError | string {
  return error instanceof ApiError
    ? error
    : error instanceof Error
      ? error.message
      : "Order belum dapat dimuat.";
}

function statusTitle(status: Order["status"]): string {
  if (status === "PAID") return "Pembayaran diterima";
  if (status === "EXPIRED") return "Order kedaluwarsa";
  return "Menunggu pembayaran";
}

function statusDescription(status: Order["status"]): string {
  if (status === "PAID")
    return "Order sudah dibayar dan tidak dapat diubah lagi.";
  if (status === "EXPIRED")
    return "Masa reservasi berakhir dan stok sudah dikembalikan.";
  return "Order menahan stok sementara sampai pembayaran berhasil atau masa reservasi berakhir.";
}

function paymentFailureMessage(value: string | null): string | null {
  if (value === "failed")
    return "Payment Attempt gagal. Buat percobaan baru untuk Order yang sama.";
  if (value === "gateway")
    return "Provider belum siap. Payment Attempt ditandai gagal, coba buat percobaan baru.";
  return null;
}

export function OrderBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("orderId");
  const paymentAttemptId = params.get("paymentAttemptId");
  const paymentMessage = paymentFailureMessage(params.get("payment"));
  const order = useOrder(orderId);
  const retry = useMutation({
    mutationFn: () => createPaymentAttempt(orderId as string),
    onSuccess: (response) => {
      order.restartPolling();
      router.push(
        `/fake-payment?paymentAttemptId=${encodeURIComponent(response.data.id)}&orderId=${encodeURIComponent(orderId as string)}`,
      );
    },
  });

  if (!orderId) {
    return (
      <PageShell
        eyebrow="Order"
        title="Order tidak ditemukan"
        description="Buka halaman ini dengan query orderId dari Checkout."
      >
        <section className="surface">
          <p className="muted">
            Query `orderId` diperlukan untuk memuat status Order.
          </p>
          <Link className="button-link button-primary" href="/cart">
            Kembali ke Cart
          </Link>
        </section>
      </PageShell>
    );
  }

  if (order.isPending) {
    return (
      <PageShell
        eyebrow="Order"
        title="Memuat status Order"
        description="Mengambil status terbaru dari server."
      >
        <section
          className="surface order-loading"
          aria-busy="true"
          aria-label="Memuat Order"
        >
          <Skeleton width="45%" />
          <Skeleton width="80%" />
          <Skeleton width="60%" />
        </section>
      </PageShell>
    );
  }

  if (order.isError || !order.data) {
    return (
      <PageShell
        eyebrow="Order"
        title="Order tidak dapat dimuat"
        description="Order hanya dapat dibaca oleh Guest Session yang membuatnya."
      >
        <ProblemMessage problem={errorText(order.error)} />
        <div className="button-row">
          <Button type="button" onClick={() => void order.refetch()}>
            Coba lagi
          </Button>
          <Link className="button-link button-secondary" href="/cart">
            Kembali ke Cart
          </Link>
        </div>
      </PageShell>
    );
  }

  const currentOrder: Order = order.data;
  const showRetry =
    currentOrder.status === "AWAITING_PAYMENT" &&
    (!paymentAttemptId || Boolean(paymentMessage));

  return (
    <PageShell
      eyebrow="Order"
      title={statusTitle(currentOrder.status)}
      description={statusDescription(currentOrder.status)}
    >
      {paymentMessage ? (
        <p className="cart-warning" role="alert">
          {paymentMessage}
        </p>
      ) : null}
      {retry.isError ? (
        <ProblemMessage problem={errorText(retry.error)} />
      ) : null}
      <div className="order-layout">
        <section className="surface" aria-labelledby="order-items-title">
          <div
            className={`status-panel status-${currentOrder.status.toLowerCase()}`}
            role="status"
            aria-live="polite"
          >
            <p className="eyebrow">Status Order</p>
            <h2>{statusTitle(currentOrder.status)}</h2>
            <p>{statusDescription(currentOrder.status)}</p>
            <p className="muted">
              Order ID: <code>{currentOrder.id}</code>
            </p>
          </div>

          {currentOrder.status === "AWAITING_PAYMENT" ? (
            <div className="order-actions">
              {paymentAttemptId ? (
                <Link
                  className="button-link button-primary"
                  href={`/fake-payment?paymentAttemptId=${encodeURIComponent(paymentAttemptId)}&orderId=${encodeURIComponent(currentOrder.id)}`}
                >
                  Lanjutkan simulasi pembayaran
                </Link>
              ) : null}
              {showRetry ? (
                <Button
                  type="button"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate()}
                >
                  {retry.isPending
                    ? "Menyiapkan Payment Attempt..."
                    : "Coba Payment Attempt lagi"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => void order.refetch()}
              >
                Segarkan status
              </Button>
              {order.pollingTimedOut ? (
                <p className="muted" role="status">
                  Pemantauan otomatis berhenti setelah dua menit. Segarkan
                  status secara manual.
                </p>
              ) : (
                <p className="muted" role="status">
                  Status diperbarui otomatis setiap dua detik saat tab terlihat.
                </p>
              )}
            </div>
          ) : null}

          <h2 id="order-items-title">Item Order</h2>
          <ul className="order-item-list">
            {currentOrder.items.map((item) => (
              <li className="order-item" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {item.optionLabel} · {item.quantity} item
                  </span>
                </span>
                <Price money={item.lineTotal} />
              </li>
            ))}
          </ul>
        </section>

        <aside
          className="surface order-summary"
          aria-labelledby="order-summary-title"
        >
          <h2 id="order-summary-title">Ringkasan</h2>
          <dl className="cart-summary-list">
            <div>
              <dt>Subtotal</dt>
              <dd>
                <Price money={currentOrder.subtotal} />
              </dd>
            </div>
            <div>
              <dt>Pengiriman</dt>
              <dd>
                <Price money={currentOrder.shippingFee} />
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                <Price money={currentOrder.grandTotal} />
              </dd>
            </div>
          </dl>
          <h3>Pengiriman ke</h3>
          <p>
            {currentOrder.customerName}
            <br />
            {currentOrder.shippingAddress.line1}
            <br />
            {currentOrder.shippingAddress.city}{" "}
            {currentOrder.shippingAddress.postalCode}
          </p>
          <p className="muted">
            Email konfirmasi: {currentOrder.customerEmail}
          </p>
          <div className="button-row">
            <Link className="button-link button-secondary" href="/products">
              Lanjut belanja
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
