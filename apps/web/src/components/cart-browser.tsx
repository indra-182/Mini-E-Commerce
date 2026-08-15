"use client";

import type { components } from "@mini-ecommerce/api-types";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageShell } from "@/components/page-shell";
import { Price } from "@/components/price";
import { ProblemMessage } from "@/components/problem-message";
import { QuantityControl } from "@/components/quantity-control";
import { Skeleton } from "@/components/skeleton";
import { ApiError } from "@/lib/api-client";
import {
  cartItemCount,
  useCartPage,
  useRemoveCartItem,
  useUpdateCartItem,
} from "@/lib/cart-query";

type CartItem = components["schemas"]["CartItemDto"];

function errorMessage(error: unknown): ApiError | string {
  return error instanceof ApiError
    ? error
    : error instanceof Error
      ? error.message
      : "Keranjang belum dapat dimuat.";
}

function CartLoading() {
  return (
    <section className="surface" aria-busy="true" aria-label="Memuat keranjang">
      <Skeleton width="35%" />
      <div className="cart-loading-list">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="cart-loading-item" key={index}>
            <Skeleton width="7rem" />
            <div>
              <Skeleton width="12rem" />
              <Skeleton width="8rem" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function itemAvailabilityMessage(item: CartItem): string | null {
  if (!item.isAvailable || item.availableQuantity <= 0) {
    return "Varian ini sudah tidak tersedia. Hapus item ini dari keranjang.";
  }
  if (item.quantity > item.availableQuantity) {
    return `Stok yang tersedia hanya ${item.availableQuantity}. Kurangi jumlah sebelum checkout.`;
  }
  return null;
}

function itemError(
  item: CartItem,
  updateError: unknown,
  updateItemId: string | undefined,
  removeError: unknown,
  removeItemId: string | undefined,
): unknown {
  if (updateError && updateItemId === item.id) return updateError;
  if (removeError && removeItemId === item.id) return removeError;
  return null;
}

export function CartBrowser() {
  const cart = useCartPage();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const [message, setMessage] = useState("");
  const [messageIsWarning, setMessageIsWarning] = useState(false);

  function handleMutationError(error: Error) {
    if (error instanceof ApiError && error.status === 412) {
      setMessage(
        "Keranjang berubah di tempat lain. Data terbaru sudah dimuat, periksa jumlah lalu coba lagi.",
      );
      setMessageIsWarning(true);
      return;
    }

    if (error instanceof ApiError && error.status === 404) {
      setMessage("Item sudah tidak ada. Keranjang terbaru sedang dimuat.");
      setMessageIsWarning(true);
      void cart.refetch();
      return;
    }

    setMessage("");
    setMessageIsWarning(false);
  }

  function beginMutation() {
    setMessage("");
    setMessageIsWarning(false);
  }

  if (cart.isPending || (cart.data === null && !cart.isError)) {
    return (
      <PageShell
        eyebrow="Keranjang"
        title="Keranjang belanja"
        description="Memuat pilihan produk dan harga terbaru dari server."
      >
        <CartLoading />
      </PageShell>
    );
  }

  if (cart.isError && !cart.data) {
    return (
      <PageShell
        eyebrow="Keranjang"
        title="Keranjang belum dapat dimuat"
        description="Coba muat ulang untuk mengambil Cart terbaru dari server."
      >
        <ProblemMessage problem={errorMessage(cart.error)} />
        <div className="button-row">
          <Button type="button" onClick={() => void cart.refetch()}>
            Coba lagi
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!cart.data) return null;

  const currentCart = cart.data.data;

  if (currentCart.items.length === 0) {
    return (
      <PageShell
        eyebrow="Keranjang"
        title="Keranjang masih kosong"
        description="Tambahkan Product Variant dari katalog untuk memulai."
      >
        <section className="surface">
          <h2>Belum ada produk</h2>
          <p className="muted">
            Harga dan ketersediaan akan dikonfirmasi lagi saat Cart dimuat.
          </p>
          <div className="button-row">
            <Link className="button-link button-primary" href="/products">
              Lihat produk
            </Link>
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Keranjang"
      title="Keranjang belanja"
      description="Kelola jumlah berdasarkan harga dan ketersediaan terbaru dari server."
    >
      {cart.isError ? (
        <div className="catalog-inline-error">
          <ProblemMessage problem={errorMessage(cart.error)} />
          <Button type="button" onClick={() => void cart.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : null}

      {message ? (
        <p
          className={messageIsWarning ? "cart-warning" : "cart-status"}
          role={messageIsWarning ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}

      <div className="cart-layout" aria-busy={cart.isFetching}>
        <section className="surface" aria-labelledby="cart-items-title">
          <div className="cart-section-heading">
            <h2 id="cart-items-title">Produk pilihan</h2>
            <p className="muted" aria-live="polite">
              {cart.isFetching
                ? "Memperbarui keranjang..."
                : `${cartItemCount(currentCart)} item`}
            </p>
          </div>

          <ul className="cart-item-list">
            {currentCart.items.map((item) => {
              const updateBusy =
                updateItem.isPending &&
                updateItem.variables?.itemId === item.id;
              const removeBusy =
                removeItem.isPending &&
                removeItem.variables?.itemId === item.id;
              const busy = updateBusy || removeBusy;
              const availabilityMessage = itemAvailabilityMessage(item);
              const problem = itemError(
                item,
                updateItem.error,
                updateItem.variables?.itemId,
                removeItem.error,
                removeItem.variables?.itemId,
              );

              return (
                <li className="cart-item" key={item.id} aria-busy={busy}>
                  <img
                    className="cart-item-image"
                    src={item.thumbnail}
                    alt={item.productName}
                    width="160"
                    height="120"
                    loading="lazy"
                  />
                  <div className="cart-item-body">
                    <div>
                      <h3>
                        <Link
                          href={`/products/${encodeURIComponent(item.productSlug)}`}
                        >
                          {item.productName}
                        </Link>
                      </h3>
                      <p className="muted">{item.optionLabel}</p>
                      <p className="muted">
                        <Price money={item.unitPrice} /> per item
                      </p>
                    </div>

                    {availabilityMessage ? (
                      <p className="cart-item-warning" role="alert">
                        {availabilityMessage}
                      </p>
                    ) : null}

                    <div className="cart-item-controls">
                      {item.isAvailable && item.availableQuantity > 0 ? (
                        <QuantityControl
                          label={`Jumlah ${item.productName}`}
                          max={Math.max(
                            1,
                            Math.min(99, item.availableQuantity),
                          )}
                          value={item.quantity}
                          disabled={busy}
                          onChange={(quantity) => {
                            beginMutation();
                            updateItem.mutate(
                              { itemId: item.id, quantity },
                              {
                                onSuccess: () => {
                                  setMessage(
                                    "Jumlah Cart berhasil diperbarui.",
                                  );
                                  setMessageIsWarning(false);
                                },
                                onError: handleMutationError,
                              },
                            );
                          }}
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          beginMutation();
                          removeItem.mutate(
                            { itemId: item.id },
                            {
                              onSuccess: () => {
                                setMessage("Item dihapus dari Cart.");
                                setMessageIsWarning(false);
                              },
                              onError: handleMutationError,
                            },
                          );
                        }}
                      >
                        {removeBusy ? "Menghapus..." : "Hapus"}
                      </Button>
                    </div>

                    {problem ? (
                      <div className="cart-item-error">
                        <ProblemMessage problem={errorMessage(problem)} />
                      </div>
                    ) : null}
                  </div>
                  <p className="cart-item-total">
                    <span className="visually-hidden">Total item: </span>
                    <Price money={item.lineTotal} />
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <aside
          className="surface cart-summary"
          aria-labelledby="cart-summary-title"
        >
          <h2 id="cart-summary-title">Ringkasan</h2>
          <dl className="cart-summary-list">
            <div>
              <dt>Subtotal</dt>
              <dd>
                <Price money={currentCart.subtotal} />
              </dd>
            </div>
          </dl>
          <p className="muted">
            Total dan ketersediaan akan divalidasi lagi saat checkout.
          </p>
          <div className="button-row">
            <Link className="button-link button-secondary" href="/products">
              Lanjut belanja
            </Link>
            <Link className="button-link button-primary" href="/checkout">
              Lanjut ke Checkout
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
