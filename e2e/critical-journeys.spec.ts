import { expect, test } from "@playwright/test";

async function fillCheckout(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.getByLabel("Nama penerima").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Alamat").fill("Jl. Contoh 1");
  await page.getByLabel("Kota").fill("Jakarta");
  await page.getByLabel("Kode pos").fill("10110");
}

async function addCoffee(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/products/kopi-arabika-gayo");
  await expect(
    page.getByRole("heading", { name: "Kopi Arabika Gayo", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tambah ke keranjang" }).click();
  await expect(page.getByRole("status")).toContainText("ditambahkan");
}

test("filters PLP, opens PDP, and adds a Product Variant", async ({ page }) => {
  await page.goto("/products?search=kopi");
  await expect(page).toHaveURL(/search=kopi/);
  await expect(
    page.getByRole("link", { name: "Kopi Arabika Gayo" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Kopi Arabika Gayo" }).click();
  await expect(
    page.getByRole("heading", { name: "Kopi Arabika Gayo", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tambah ke keranjang" }).click();
  await expect(page.getByRole("status")).toContainText("ditambahkan");
});

test("changes Cart quantity and keeps it after refresh", async ({ page }) => {
  await addCoffee(page);
  await page.getByRole("link", { name: /Buka keranjang/ }).click();
  await expect(
    page.getByRole("heading", { name: "Keranjang belanja", level: 1 }),
  ).toBeVisible();

  const quantity = page.getByRole("spinbutton", {
    name: "Jumlah Kopi Arabika Gayo",
  });
  await quantity.fill("2");
  await expect(page.getByRole("status")).toContainText("berhasil diperbarui");
  await page.reload();
  await expect(quantity).toHaveValue("2");
});

test("checks out, simulates payment success, and observes PAID", async ({
  page,
}) => {
  await addCoffee(page);
  await page.getByRole("link", { name: /Buka keranjang/ }).click();
  await page.getByRole("link", { name: "Lanjut ke Checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "Selesaikan pesanan" }),
  ).toBeVisible();
  await fillCheckout(page);
  await page.getByRole("button", { name: "Buat Order" }).click();
  await expect(page).toHaveURL(/\/fake-payment\/\?/);
  await page.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await expect(page).toHaveURL(/\/order\/\?/);
  await expect(
    page.getByRole("heading", { name: "Pembayaran diterima", level: 1 }),
  ).toBeVisible();
});

test("fails payment, retries the same Order, then succeeds", async ({
  page,
}) => {
  await addCoffee(page);
  await page.getByRole("link", { name: /Buka keranjang/ }).click();
  await page.getByRole("link", { name: "Lanjut ke Checkout" }).click();
  await fillCheckout(page);
  await page.getByRole("button", { name: "Buat Order" }).click();
  await expect(page).toHaveURL(/\/fake-payment\/\?/);
  await page.getByRole("button", { name: "Simulasikan gagal" }).click();
  await expect(page).toHaveURL(/\/order\/\?/);
  const failedOrderUrl = new URL(page.url());
  const orderId = failedOrderUrl.searchParams.get("orderId");
  expect(orderId).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Coba Payment Attempt lagi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Coba Payment Attempt lagi" }).click();
  await expect(page).toHaveURL(/\/fake-payment\/\?/);
  await page.getByRole("button", { name: "Simulasikan berhasil" }).click();
  await expect(page).toHaveURL(new RegExp(`/order/\\?orderId=${orderId}`));
  await expect(
    page.getByRole("heading", { name: "Pembayaran diterima", level: 1 }),
  ).toBeVisible();
});

test("shows Cart reconciliation when Cart changes during Checkout", async ({
  page,
  context,
  baseURL,
}) => {
  await addCoffee(page);
  await page.getByRole("link", { name: /Buka keranjang/ }).click();
  await page.getByRole("link", { name: "Lanjut ke Checkout" }).click();
  await fillCheckout(page);

  const cookieHeader = (await context.cookies())
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const currentCart = await context.request.get(`${baseURL}/api/v1/cart`, {
    headers: { Cookie: cookieHeader },
  });
  expect(currentCart.ok()).toBeTruthy();
  const etag = currentCart.headers().etag;
  expect(etag).toBeTruthy();
  const changedCart = await context.request.post(
    `${baseURL}/api/v1/cart/items`,
    {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
        "If-Match": etag ?? "",
      },
      data: {
        productVariantId: "20000000-0000-4000-8000-000000000003",
        quantity: 1,
      },
    },
  );
  expect(changedCart.ok()).toBeTruthy();

  await page.getByRole("button", { name: "Buat Order" }).click();
  await expect(
    page.getByRole("alert", { name: "Periksa Checkout" }),
  ).toContainText("Cart berubah");
});
