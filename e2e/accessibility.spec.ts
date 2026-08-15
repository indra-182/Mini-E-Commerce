import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const requiredPages = [
  ["PLP", "/products"],
  ["PDP", "/products/kopi-arabika-gayo"],
  ["Article Detail", "/articles/panduan-menyeduh-kopi"],
  ["Cart", "/cart"],
  ["Checkout", "/checkout"],
  ["Order", "/order"],
  ["Fake Payment", "/fake-payment"],
] as const;

test.describe("required page accessibility", () => {
  for (const [name, path] of requiredPages) {
    test(`${name} has no serious axe violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});

test("keyboard can open and close the mobile filter drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/products");
  await page.getByRole("button", { name: "Buka filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter produk" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutup" })).toBeFocused();
  await page.getByRole("button", { name: "Tutup" }).press("Enter");
  await expect(dialog).toBeHidden();
});

for (const viewport of [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`required routes do not overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const path of [
      "/products",
      "/articles/panduan-menyeduh-kopi",
      "/checkout",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows at ${viewport.width}px`).toBe(false);
    }
  });
}
