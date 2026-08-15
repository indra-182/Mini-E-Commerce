"use client";

import type { components } from "@mini-ecommerce/api-types";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { PageShell } from "@/components/page-shell";
import { Price } from "@/components/price";
import { ProblemMessage } from "@/components/problem-message";
import { Select } from "@/components/select";
import { Skeleton } from "@/components/skeleton";
import { ApiError, apiFetch, type ProblemDetails } from "@/lib/api-client";
import {
  cartEtag,
  cartQueryKey,
  reconcileCartProblem,
  useCartPage,
} from "@/lib/cart-query";
import {
  clearCheckoutIdempotencyKey,
  getCheckoutIdempotencyKey,
  type CheckoutRequest,
} from "@/lib/checkout-session";

type OrderWithPaymentAttempt =
  components["schemas"]["OrderWithInitialPaymentAttemptDto"];

type FormValues = {
  customerName: string;
  customerEmail: string;
  line1: string;
  city: string;
  postalCode: string;
  countryCode: "ID";
  shippingMethod: "REGULAR";
};

type CheckoutField = keyof FormValues;
type FieldErrors = Partial<Record<CheckoutField, string[]>> & {
  form?: string[];
};

const initialValues: FormValues = {
  customerName: "",
  customerEmail: "",
  line1: "",
  city: "",
  postalCode: "",
  countryCode: "ID",
  shippingMethod: "REGULAR",
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail;
  if (error instanceof Error) return error.message;
  return "Checkout belum dapat diproses.";
}

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  const required: Array<[CheckoutField, string, string]> = [
    ["customerName", values.customerName, "Nama wajib diisi."],
    ["customerEmail", values.customerEmail, "Email wajib diisi."],
    ["line1", values.line1, "Alamat wajib diisi."],
    ["city", values.city, "Kota wajib diisi."],
    ["postalCode", values.postalCode, "Kode pos wajib diisi."],
  ];

  for (const [field, value, message] of required) {
    if (!value.trim()) errors[field] = [message];
  }

  if (values.customerName.trim().length > 100) {
    errors.customerName = ["Nama maksimal 100 karakter."];
  }
  if (values.customerEmail.length > 254) {
    errors.customerEmail = ["Email maksimal 254 karakter."];
  } else if (
    values.customerEmail.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customerEmail.trim())
  ) {
    errors.customerEmail = ["Masukkan email yang valid."];
  }
  if (values.line1.trim().length > 200)
    errors.line1 = ["Alamat maksimal 200 karakter."];
  if (values.city.trim().length > 100)
    errors.city = ["Kota maksimal 100 karakter."];
  if (values.postalCode.length < 3 || values.postalCode.length > 12) {
    errors.postalCode = ["Kode pos harus terdiri dari 3 sampai 12 karakter."];
  }

  return errors;
}

function requestFromValues(values: FormValues): CheckoutRequest {
  return {
    customer: {
      name: values.customerName.trim(),
      email: values.customerEmail.trim(),
    },
    shippingAddress: {
      line1: values.line1.trim(),
      city: values.city.trim(),
      postalCode: values.postalCode.trim(),
      countryCode: values.countryCode,
    },
    shippingMethod: values.shippingMethod,
  };
}

function serverField(field: string): CheckoutField | null {
  const normalized = field.replace(/\[(\d+)\]/g, "").replaceAll("_", "");
  const aliases: Record<string, CheckoutField> = {
    customername: "customerName",
    name: "customerName",
    customeremail: "customerEmail",
    email: "customerEmail",
    line1: "line1",
    city: "city",
    postalcode: "postalCode",
    countrycode: "countryCode",
    shippingmethod: "shippingMethod",
  };
  return aliases[normalized.toLowerCase().replaceAll(".", "")] ?? null;
}

function serverErrors(problem: ProblemDetails): FieldErrors {
  const result: FieldErrors = {};
  const formErrors: string[] = [];

  for (const [field, messages] of Object.entries(problem.errors ?? {})) {
    const target = serverField(field);
    if (target) {
      result[target] = messages;
    } else {
      formErrors.push(`${field}: ${messages.join(" ")}`);
    }
  }

  if (formErrors.length > 0) result.form = formErrors;
  return result;
}

function resourceId(value: Record<string, unknown> | undefined): string | null {
  return typeof value?.id === "string" ? value.id : null;
}

function gatewayRoute(error: ApiError): string | null {
  if (error.problem.code !== "PAYMENT_GATEWAY_UNAVAILABLE") return null;
  const orderId = resourceId(error.problem.order);
  const paymentAttemptId = resourceId(error.problem.paymentAttempt);
  if (!orderId || !paymentAttemptId) return null;
  return `/order?orderId=${encodeURIComponent(orderId)}&paymentAttemptId=${encodeURIComponent(paymentAttemptId)}&payment=gateway`;
}

export function CheckoutBrowser() {
  const cart = useCartPage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<
    ApiError | string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const focusErrors = useRef(false);
  const previousCartVersion = useRef<number | undefined>(undefined);

  const currentCart = cart.data?.data;

  useEffect(() => {
    const version = currentCart?.version;
    if (version === undefined) return;
    if (
      previousCartVersion.current !== undefined &&
      previousCartVersion.current !== version
    ) {
      clearCheckoutIdempotencyKey();
    }
    previousCartVersion.current = version;
  }, [currentCart?.version]);

  useEffect(() => {
    if (
      !focusErrors.current ||
      (!submissionError && Object.keys(fieldErrors).length === 0)
    )
      return;
    focusErrors.current = false;
    errorSummary.current?.focus();
  }, [fieldErrors, submissionError]);

  function changeValue<Field extends CheckoutField>(
    field: Field,
    value: FormValues[Field],
  ) {
    if (values[field] !== value) clearCheckoutIdempotencyKey();
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined,
    }));
    setSubmissionError(null);
  }

  function showErrors(
    next: FieldErrors,
    error: ApiError | string | null = null,
  ) {
    focusErrors.current = true;
    setFieldErrors(next);
    setSubmissionError(error);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionError(null);
    setFieldErrors({});

    const clientErrors = validate(values);
    if (Object.keys(clientErrors).length > 0) {
      showErrors(clientErrors);
      return;
    }
    if (!currentCart) return;

    const request = requestFromValues(values);
    setSubmitting(true);

    try {
      const idempotencyKey = getCheckoutIdempotencyKey(
        request,
        currentCart.version,
      );
      const response = await apiFetch<OrderWithPaymentAttempt>(
        "/api/v1/orders",
        {
          method: "POST",
          headers: {
            "If-Match": cartEtag(cart.data!),
            "Idempotency-Key": idempotencyKey,
          },
          body: request,
        },
      );

      clearCheckoutIdempotencyKey();
      void queryClient.invalidateQueries({ queryKey: cartQueryKey });
      router.push(
        `/fake-payment?paymentAttemptId=${encodeURIComponent(response.data.paymentAttempt.id)}&orderId=${encodeURIComponent(response.data.id)}`,
      );
    } catch (error) {
      if (!(error instanceof ApiError)) {
        focusErrors.current = true;
        setSubmissionError(
          "Jaringan tidak memastikan hasil Checkout. Periksa koneksi lalu kirim ulang untuk memakai Idempotency-Key yang sama.",
        );
        return;
      }

      clearCheckoutIdempotencyKey();
      const route = gatewayRoute(error);
      if (route) {
        void queryClient.invalidateQueries({ queryKey: cartQueryKey });
        router.push(route);
        return;
      }

      if (error.problem.code === "CHECKOUT_CART_CHANGED") {
        reconcileCartProblem(queryClient, error);
        await cart.refetch();
        showErrors({
          form: [
            "Cart berubah saat Checkout. Periksa data terbaru lalu kirim ulang.",
          ],
        });
        return;
      }

      if (error.problem.code === "INSUFFICIENT_STOCK") {
        await cart.refetch();
        showErrors({
          form: [
            "Stok berubah saat Checkout. Cart terbaru sudah dimuat, periksa item lalu kirim ulang.",
          ],
        });
        return;
      }

      if (error.problem.code === "VALIDATION_FAILED") {
        showErrors(serverErrors(error.problem), error);
        return;
      }

      showErrors({ form: [error.problem.detail] }, error);
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.isPending || (cart.data === null && !cart.isError)) {
    return (
      <PageShell
        eyebrow="Checkout"
        title="Selesaikan pesanan"
        description="Memuat Cart terbaru sebelum Checkout."
      >
        <section
          className="surface checkout-loading"
          aria-busy="true"
          aria-label="Memuat Checkout"
        >
          <Skeleton width="45%" />
          <Skeleton width="80%" />
          <Skeleton width="65%" />
        </section>
      </PageShell>
    );
  }

  if (cart.isError && !currentCart) {
    return (
      <PageShell
        eyebrow="Checkout"
        title="Checkout belum dapat dimuat"
        description="Cart terbaru diperlukan sebelum Checkout."
      >
        <ProblemMessage problem={cart.error} />
        <div className="button-row">
          <Button type="button" onClick={() => void cart.refetch()}>
            Coba lagi
          </Button>
          <Link className="button-link button-secondary" href="/cart">
            Kembali ke Cart
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!currentCart || currentCart.items.length === 0) {
    return (
      <PageShell
        eyebrow="Checkout"
        title="Cart masih kosong"
        description="Tambahkan Product Variant sebelum melanjutkan Checkout."
      >
        <section className="surface">
          <h2>Belum ada item untuk diproses</h2>
          <p className="muted">Checkout tidak membuat Order tanpa item Cart.</p>
          <div className="button-row">
            <Link className="button-link button-primary" href="/products">
              Lihat produk
            </Link>
            <Link className="button-link button-secondary" href="/cart">
              Buka Cart
            </Link>
          </div>
        </section>
      </PageShell>
    );
  }

  const hasErrors =
    Boolean(submissionError) || Object.keys(fieldErrors).length > 0;

  return (
    <PageShell
      eyebrow="Checkout"
      title="Selesaikan pesanan"
      description="Isi data pengiriman. Harga, item, dan total final tetap ditentukan server."
    >
      {cart.isError ? <ProblemMessage problem={cart.error} /> : null}
      <div className="checkout-layout">
        <form
          className="surface checkout-form"
          noValidate
          onSubmit={submit}
          aria-busy={submitting}
        >
          {hasErrors ? (
            <div
              ref={errorSummary}
              className="error-summary"
              role="alert"
              aria-labelledby="checkout-errors-title"
              tabIndex={-1}
            >
              <h2 id="checkout-errors-title">Periksa Checkout</h2>
              {submissionError ? <p>{errorText(submissionError)}</p> : null}
              {fieldErrors.form ? (
                <ul>
                  {fieldErrors.form.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
              {Object.entries(fieldErrors)
                .filter(([field]) => field !== "form")
                .map(([field, messages]) => (
                  <p key={field}>
                    <a href={`#checkout-${field}`}>{messages?.[0]}</a>
                  </p>
                ))}
            </div>
          ) : null}

          <div className="checkout-fields">
            <Input
              id="checkout-customerName"
              name="customerName"
              label="Nama penerima"
              autoComplete="name"
              maxLength={100}
              required
              value={values.customerName}
              error={fieldErrors.customerName?.[0]}
              onChange={(event) =>
                changeValue("customerName", event.target.value)
              }
            />
            <Input
              id="checkout-customerEmail"
              name="customerEmail"
              label="Email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={values.customerEmail}
              error={fieldErrors.customerEmail?.[0]}
              onChange={(event) =>
                changeValue("customerEmail", event.target.value)
              }
            />
            <Input
              id="checkout-line1"
              name="line1"
              label="Alamat"
              autoComplete="street-address"
              maxLength={200}
              required
              value={values.line1}
              error={fieldErrors.line1?.[0]}
              onChange={(event) => changeValue("line1", event.target.value)}
            />
            <Input
              id="checkout-city"
              name="city"
              label="Kota"
              autoComplete="address-level2"
              maxLength={100}
              required
              value={values.city}
              error={fieldErrors.city?.[0]}
              onChange={(event) => changeValue("city", event.target.value)}
            />
            <Input
              id="checkout-postalCode"
              name="postalCode"
              label="Kode pos"
              autoComplete="postal-code"
              minLength={3}
              maxLength={12}
              required
              value={values.postalCode}
              error={fieldErrors.postalCode?.[0]}
              onChange={(event) =>
                changeValue("postalCode", event.target.value)
              }
            />
            <Select
              id="checkout-countryCode"
              name="countryCode"
              label="Negara"
              value={values.countryCode}
              onChange={(event) =>
                changeValue("countryCode", event.target.value as "ID")
              }
            >
              <option value="ID">Indonesia (ID)</option>
            </Select>
            <Select
              id="checkout-shippingMethod"
              name="shippingMethod"
              label="Metode pengiriman"
              value={values.shippingMethod}
              onChange={(event) =>
                changeValue("shippingMethod", event.target.value as "REGULAR")
              }
            >
              <option value="REGULAR">Regular</option>
            </Select>
          </div>

          <div className="button-row">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Memproses Checkout..." : "Buat Order"}
            </Button>
            <Link className="button-link button-secondary" href="/cart">
              Kembali ke Cart
            </Link>
          </div>
          <p className="muted checkout-note">
            Jika koneksi tidak pasti, kirim ulang form ini. Idempotency-Key akan
            dipertahankan untuk intent yang sama.
          </p>
        </form>

        <aside
          className="surface checkout-summary"
          aria-labelledby="checkout-summary-title"
        >
          <h2 id="checkout-summary-title">Ringkasan Cart</h2>
          <ul className="checkout-item-list">
            {currentCart.items.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.productName}</strong>
                  <span className="muted">
                    {item.optionLabel} · {item.quantity} item
                  </span>
                </span>
                <Price money={item.lineTotal} />
              </li>
            ))}
          </ul>
          <dl className="cart-summary-list">
            <div>
              <dt>Subtotal saat ini</dt>
              <dd>
                <Price money={currentCart.subtotal} />
              </dd>
            </div>
          </dl>
          <p className="muted">
            Ketersediaan, harga, biaya pengiriman, dan grand total divalidasi
            ulang di server.
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
