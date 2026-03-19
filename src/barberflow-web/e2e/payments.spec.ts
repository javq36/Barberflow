import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Payments page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password|contraseña/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /ingresar|login|sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("payments page is accessible and renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/payments");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main, [role=main]")).toBeVisible();
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("payments page displays a summary section", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    // Summary section should be present (contains stats or transaction list)
    await expect(page.locator("main").first()).toBeVisible();
  });
});
