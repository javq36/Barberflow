import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Schedule flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password|contraseña/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /ingresar|login|sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("owner can navigate to schedule", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page).toHaveURL(/schedule/);
    await expect(page.locator("main, [role=main]")).toBeVisible();
  });

  test("schedule page renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/schedule");
    await page.waitForLoadState("networkidle");

    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });
});
