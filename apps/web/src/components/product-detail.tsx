"use client";

import { useEffect, useState } from "react";
import type { components } from "@mini-ecommerce/api-types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useAddToCart } from "@/components/add-to-cart";
import { Button } from "@/components/button";
import { PageShell } from "@/components/page-shell";
import { Price } from "@/components/price";
import { ProblemMessage } from "@/components/problem-message";
import { QuantityControl } from "@/components/quantity-control";
import { Skeleton } from "@/components/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";

type Product = components["schemas"]["ProductDetailDto"];

function availabilityLabel(quantity: number) {
  if (quantity <= 0) return "Stok habis";
  if (quantity <= 5) return `Stok terbatas, tersisa ${quantity}`;
  return "Tersedia";
}

function errorMessage(error: unknown): ApiError | string {
  return error instanceof ApiError
    ? error
    : error instanceof Error
      ? error.message
      : "Detail produk belum dapat dimuat.";
}

function ProductLoading() {
  return (
    <section className="product-detail-layout" aria-busy="true">
      <Skeleton width="100%" />
      <div className="surface product-detail-info">
        <Skeleton width="60%" />
        <Skeleton width="35%" />
        <Skeleton width="85%" />
      </div>
    </section>
  );
}

export function ProductDetail({ slug }: Readonly<{ slug: string }>) {
  const product = useQuery<Product, ApiError>({
    queryKey: ["product", slug],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const path = `/api/v1/products/${encodeURIComponent(slug)}`;
      return (await apiFetch<Product>(path)).data;
    },
  });
  const addToCart = useAddToCart();
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [confirmation, setConfirmation] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    if (
      product.data &&
      !product.data.variants.some((variant) => variant.id === selectedVariantId)
    ) {
      setSelectedVariantId(product.data.variants[0]?.id);
      setQuantity(1);
    }
  }, [product.data, selectedVariantId]);

  if (product.isPending) {
    return (
      <PageShell
        eyebrow="Produk"
        title="Detail produk"
        description="Memuat harga dan ketersediaan terbaru dari server."
      >
        <ProductLoading />
      </PageShell>
    );
  }

  if (product.isError || !product.data) {
    return (
      <PageShell
        eyebrow="Produk"
        title="Produk tidak tersedia"
        description="Produk mungkin sudah tidak aktif atau alamatnya tidak benar."
      >
        <ProblemMessage problem={errorMessage(product.error)} />
        <div className="button-row">
          <Link className="button-link button-primary" href="/products">
            Kembali ke produk
          </Link>
        </div>
      </PageShell>
    );
  }

  const currentProduct = product.data;
  const selectedVariant =
    currentProduct.variants.find(
      (variant) => variant.id === selectedVariantId,
    ) ?? currentProduct.variants[0];
  const maxQuantity = selectedVariant
    ? Math.max(1, Math.min(99, selectedVariant.availableQuantity))
    : 1;
  const safeQuantity = Math.min(quantity, maxQuantity);
  const images = currentProduct.images.length
    ? currentProduct.images
    : [currentProduct.thumbnail];

  function submitAddToCart() {
    if (!selectedVariant || selectedVariant.availableQuantity <= 0) return;

    setConfirmation("");
    setWarning("");
    addToCart.mutate(
      {
        productVariantId: selectedVariant.id,
        quantity: safeQuantity,
      },
      {
        onSuccess: () => {
          setWarning("");
          setConfirmation(
            `${currentProduct.name}, ${selectedVariant.optionLabel}, ditambahkan ke keranjang.`,
          );
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 412) {
            setWarning(
              "Keranjang berubah di tempat lain. Data terbaru sudah dimuat, coba tambah lagi.",
            );
          }
        },
      },
    );
  }

  return (
    <PageShell
      eyebrow="Produk"
      title={currentProduct.name}
      description={currentProduct.description}
    >
      <section className="product-detail-layout">
        <div className="product-gallery">
          {images.map((image, index) => (
            <img
              className={
                index === 0 ? "product-detail-image" : "product-gallery-image"
              }
              key={image}
              src={image}
              alt={index === 0 ? currentProduct.name : ""}
              width="1280"
              height="960"
              loading={index === 0 ? "eager" : "lazy"}
            />
          ))}
        </div>

        <div className="surface product-detail-info">
          <p className="availability" aria-live="polite">
            {selectedVariant
              ? availabilityLabel(selectedVariant.availableQuantity)
              : currentProduct.availability === "OUT_OF_STOCK"
                ? "Stok habis"
                : "Varian belum tersedia"}
          </p>

          {selectedVariant ? (
            <p className="product-detail-price">
              <Price money={selectedVariant.price} />
            </p>
          ) : null}

          {currentProduct.variants.length ? (
            <fieldset className="variant-options">
              <legend>Pilih varian</legend>
              <div className="variant-option-list">
                {currentProduct.variants.map((variant) => (
                  <label className="variant-option" key={variant.id}>
                    <input
                      type="radio"
                      name="product-variant"
                      value={variant.id}
                      checked={variant.id === selectedVariant?.id}
                      onChange={() => {
                        setSelectedVariantId(variant.id);
                        setQuantity(1);
                        setConfirmation("");
                      }}
                    />
                    <span>
                      <strong>{variant.optionLabel}</strong>
                      <span className="muted">
                        <Price money={variant.price} /> ·{" "}
                        {availabilityLabel(variant.availableQuantity)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {selectedVariant && selectedVariant.availableQuantity > 0 ? (
            <QuantityControl
              label="Jumlah produk"
              max={maxQuantity}
              value={safeQuantity}
              onChange={setQuantity}
            />
          ) : null}

          <Button
            type="button"
            disabled={
              !selectedVariant ||
              selectedVariant.availableQuantity <= 0 ||
              addToCart.isPending
            }
            onClick={submitAddToCart}
          >
            {addToCart.isPending ? "Menambahkan..." : "Tambah ke keranjang"}
          </Button>

          {confirmation ? (
            <p className="success-message" role="status" aria-live="polite">
              {confirmation} <Link href="/cart">Buka keranjang.</Link>
            </p>
          ) : null}
          {warning ? (
            <p className="cart-warning" role="alert" aria-live="polite">
              {warning}
            </p>
          ) : null}
          {addToCart.isError && !warning ? (
            <ProblemMessage problem={errorMessage(addToCart.error)} />
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
