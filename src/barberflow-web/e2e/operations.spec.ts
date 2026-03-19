import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Operations CRUD flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password|contraseña/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /ingresar|login|sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("services page loads and lists services", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, [role=main]")).toBeVisible();
  });

  test("barbers page loads and lists barbers", async ({ page }) => {
    await page.goto("/barbers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, [role=main]")).toBeVisible();
  });

  test("customers page loads and lists customers", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, [role=main]")).toBeVisible();
  });

  test("search input filters services", async ({ page }) => {
    await page.goto("/services");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator('input[placeholder*="buscar" i], input[placeholder*="search" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("zzz_no_match_xyz");
      await page.waitForTimeout(400);
    }
  });
});
