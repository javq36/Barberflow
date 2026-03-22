// NOTE: @playwright/test is not installed locally — types resolve at CI/test-run time.
// The `route` callback parameter is implicitly `any` because the module can't be resolved
// in strict tsc checks without the package installed. This is pre-existing in all e2e files.
import { test, expect, type Page } from "@playwright/test";

// ─── Mock data ────────────────────────────────────────────────────────────────

const TEST_SLUG = "test-barbershop";

const MOCK_SERVICES = [
  { id: "svc-1", name: "Corte clásico", durationMinutes: 30, price: 2500, imageUrl: null },
  { id: "svc-2", name: "Barba completa", durationMinutes: 20, price: 1500, imageUrl: null },
];

const MOCK_BARBERS = [
  { id: "barber-1", name: "Carlos López", imageUrl: null },
  { id: "barber-2", name: "Pedro García", imageUrl: null },
];

// barberId is needed for "any barber" mode — wizard requires it to auto-assign
const MOCK_SLOTS = [
  { start: "2026-03-23T12:00:00Z", end: "2026-03-23T12:30:00Z", available: true, barberId: "barber-1" },
  { start: "2026-03-23T12:30:00Z", end: "2026-03-23T13:00:00Z", available: true, barberId: "barber-2" },
  { start: "2026-03-23T13:00:00Z", end: "2026-03-23T13:30:00Z", available: false },
];

const MOCK_BOOKING_RESPONSE = {
  appointmentId: "00000000-0000-0000-0000-000000000001",
  status: "pending",
  serviceName: "Corte clásico",
  barberName: "Carlos López",
  dateTime: "2026-03-23T12:00:00Z",
  estimatedDuration: 30,
};

// ─── Route-mocking helper ─────────────────────────────────────────────────────

async function setupPublicMocks(page: Page): Promise<void> {
  await page.route(`**/api/public/${TEST_SLUG}/services`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SERVICES),
    });
  });

  await page.route(`**/api/public/${TEST_SLUG}/barbers`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_BARBERS),
    });
  });

  await page.route(`**/api/public/${TEST_SLUG}/availability**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SLOTS),
    });
  });

  // Default: booking succeeds with 201
  await page.route(`**/api/public/${TEST_SLUG}/appointments`, (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BOOKING_RESPONSE),
      });
    } else {
      route.continue();
    }
  });
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

async function navigateToBooking(page: Page): Promise<void> {
  await page.goto(`/book/${TEST_SLUG}`);
  await page.waitForLoadState("networkidle");
}

/** Step 1 → 2: select "Corte clásico" and click Continuar */
async function completeStep1(page: Page): Promise<void> {
  await page.getByText("Corte clásico").click();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForLoadState("networkidle");
}

/** Step 2 → 3: select a specific barber and click Continuar */
async function completeStep2WithBarber(page: Page, barberName: string): Promise<void> {
  await page.getByText(barberName).click();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForLoadState("networkidle");
}

/** Step 2 → 3: select "any barber" option and click Continuar */
async function completeStep2AnyBarber(page: Page): Promise<void> {
  await page.getByText("Cualquier barbero disponible").click();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForLoadState("networkidle");
}

/** Step 3 → 4: click the first date pill then first available slot, then Continuar */
async function completeStep3(page: Page): Promise<void> {
  // Click first date pill — the horizontally scrollable strip contains 14 date pill buttons
  const dateStrip = page.locator(".flex.gap-2.overflow-x-auto").first();
  const firstDatePill = dateStrip.locator("button").first();
  await firstDatePill.click();
  await page.waitForLoadState("networkidle");

  // Click the first available slot button (available slots are actual <button> elements,
  // unavailable ones are rendered as <div> with cursor-not-allowed)
  const firstAvailableSlot = page
    .locator("button[title]")
    .first();
  await firstAvailableSlot.click();

  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForLoadState("networkidle");
}

/** Step 4 → 5: fill contact data and click Continuar */
async function completeStep4(
  page: Page,
  name = "Juan Test",
  phone = "1155556666",
): Promise<void> {
  await page.locator("#customer-name").fill(name);
  await page.locator("#customer-phone").fill(phone);
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForLoadState("networkidle");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Public Booking Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupPublicMocks(page);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  test.describe("Happy path", () => {
    test("complete booking with specific barber", async ({ page }) => {
      await navigateToBooking(page);

      // Step 1: select service
      await expect(page.getByText("¿Qué servicio buscás?")).toBeVisible();
      await completeStep1(page);

      // Step 2: select specific barber
      await expect(page.getByText("¿Con quién querés sacar turno?")).toBeVisible();
      await completeStep2WithBarber(page, "Carlos López");

      // Step 3: pick date + slot
      await expect(page.getByText("¿Cuándo querés venir?")).toBeVisible();
      await completeStep3(page);

      // Step 4: contact data
      await expect(page.getByText("Tus datos de contacto")).toBeVisible();
      await completeStep4(page);

      // Step 5: confirmation — verify summary visible
      await expect(page.getByText("Confirmá tu reserva")).toBeVisible();
      await expect(page.getByText("Carlos López")).toBeVisible();
      await expect(page.getByText("Corte clásico", { exact: false })).toBeVisible();

      // Submit booking
      await page.getByRole("button", { name: /confirmar reserva/i }).click();
      await page.waitForLoadState("networkidle");

      // Verify success screen
      await expect(page.getByRole("heading", { name: /turno reservado/i })).toBeVisible();
    });

    test("complete booking with any barber", async ({ page }) => {
      await navigateToBooking(page);

      // Step 1
      await completeStep1(page);

      // Step 2: choose "any barber"
      await expect(page.getByText("Cualquier barbero disponible")).toBeVisible();
      await completeStep2AnyBarber(page);

      // Step 3: pick date + slot (slot has barberId, so auto-assign kicks in)
      await expect(page.getByText("¿Cuándo querés venir?")).toBeVisible();
      await completeStep3(page);

      // Step 4
      await completeStep4(page);

      // Step 5: confirm
      await expect(page.getByText("Confirmá tu reserva")).toBeVisible();
      await page.getByRole("button", { name: /confirmar reserva/i }).click();
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: /turno reservado/i })).toBeVisible();
    });
  });

  // ── Navigation ──────────────────────────────────────────────────────────────

  test.describe("Navigation", () => {
    test("back from step 2 preserves service selection", async ({ page }) => {
      await navigateToBooking(page);

      // Select service
      await page.getByText("Corte clásico").click();

      // Go to step 2
      await page.getByRole("button", { name: /continuar/i }).click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("¿Con quién querés sacar turno?")).toBeVisible();

      // Go back to step 1
      await page.getByRole("button", { name: /volver/i }).click();
      await page.waitForLoadState("networkidle");

      // Step 1 visible again
      await expect(page.getByText("¿Qué servicio buscás?")).toBeVisible();

      // Service is still selected (the ✓ checkmark indicator renders inside the button)
      // The selected service card has a visible ✓ span
      const serviceCard = page.getByRole("button", { name: /corte clásico/i });
      await expect(serviceCard.locator("span", { hasText: "✓" })).toBeVisible();
    });

    test("back from step 3 preserves barber selection", async ({ page }) => {
      await navigateToBooking(page);

      await completeStep1(page);

      // Select barber in step 2
      await page.getByText("Carlos López").click();
      const barberContinue = page.getByRole("button", { name: /continuar/i });
      await barberContinue.click();
      await page.waitForLoadState("networkidle");

      // Now in step 3
      await expect(page.getByText("¿Cuándo querés venir?")).toBeVisible();

      // Go back
      await page.getByRole("button", { name: /volver/i }).click();
      await page.waitForLoadState("networkidle");

      // Step 2 visible again with barber selected
      await expect(page.getByText("¿Con quién querés sacar turno?")).toBeVisible();

      const barberCard = page.getByRole("button", { name: /carlos lópez/i });
      await expect(barberCard.locator("span", { hasText: "✓" })).toBeVisible();
    });

    test("next button disabled until selection", async ({ page }) => {
      await navigateToBooking(page);

      // Step 1 loaded
      await expect(page.getByText("¿Qué servicio buscás?")).toBeVisible();

      // "Continuar →" button should be disabled before any selection
      const nextBtn = page.getByRole("button", { name: /continuar/i });
      await expect(nextBtn).toBeDisabled();

      // After selecting a service, button becomes enabled
      await page.getByText("Corte clásico").click();
      await expect(nextBtn).toBeEnabled();
    });
  });

  // ── Contact validation ──────────────────────────────────────────────────────

  test.describe("Contact validation", () => {
    /** Helper that navigates the wizard to step 4 */
    async function goToStep4(page: Page): Promise<void> {
      await navigateToBooking(page);
      await completeStep1(page);
      await completeStep2WithBarber(page, "Carlos López");
      await completeStep3(page);
      await expect(page.getByText("Tus datos de contacto")).toBeVisible();
    }

    test("shows validation errors for empty fields", async ({ page }) => {
      await goToStep4(page);

      // Blur both fields without filling them to trigger touched state
      await page.locator("#customer-name").focus();
      await page.locator("#customer-name").blur();
      await page.locator("#customer-phone").focus();
      await page.locator("#customer-phone").blur();

      // Validation errors should appear
      await expect(page.getByText("El nombre es requerido")).toBeVisible();
      await expect(page.getByText("El teléfono es requerido")).toBeVisible();
    });

    test("shows error for short name", async ({ page }) => {
      await goToStep4(page);

      await page.locator("#customer-name").fill("J");
      await page.locator("#customer-name").blur();

      await expect(page.getByText("El nombre debe tener al menos 2 caracteres")).toBeVisible();
    });

    test("shows error for short phone", async ({ page }) => {
      await goToStep4(page);

      await page.locator("#customer-phone").fill("123");
      await page.locator("#customer-phone").blur();

      await expect(page.getByText("El teléfono debe tener al menos 8 dígitos")).toBeVisible();
    });
  });

  // ── Error states ────────────────────────────────────────────────────────────

  test.describe("Error states", () => {
    test("invalid slug shows not found", async ({ page }) => {
      // Override services mock for an unknown slug
      await page.route(`**/api/public/nonexistent-shop/services`, (route) => {
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not found" }),
        });
      });

      await page.goto("/book/nonexistent-shop");
      await page.waitForLoadState("networkidle");

      // Next.js renders a 404 page — look for "not found" text (any casing)
      await expect(page.getByText(/not found/i)).toBeVisible();
    });

    test("slot conflict shows error and offers retry", async ({ page }) => {
      // Override appointments mock to return 409
      await page.route(`**/api/public/${TEST_SLUG}/appointments`, (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ message: "Slot already booked" }),
          });
        } else {
          route.continue();
        }
      });

      await navigateToBooking(page);
      await completeStep1(page);
      await completeStep2WithBarber(page, "Carlos López");
      await completeStep3(page);
      await completeStep4(page);

      // Step 5: try to confirm
      await expect(page.getByText("Confirmá tu reserva")).toBeVisible();
      await page.getByRole("button", { name: /confirmar reserva/i }).click();
      await page.waitForLoadState("networkidle");

      // Conflict error should appear
      await expect(page.getByText("Este horario ya fue reservado")).toBeVisible();
      await expect(page.getByRole("button", { name: /elegir otro horario/i })).toBeVisible();
    });

    test("generic API error shows retry button", async ({ page }) => {
      // Override appointments mock to return 500
      await page.route(`**/api/public/${TEST_SLUG}/appointments`, (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Internal server error" }),
          });
        } else {
          route.continue();
        }
      });

      await navigateToBooking(page);
      await completeStep1(page);
      await completeStep2WithBarber(page, "Carlos López");
      await completeStep3(page);
      await completeStep4(page);

      // Step 5: try to confirm
      await page.getByRole("button", { name: /confirmar reserva/i }).click();
      await page.waitForLoadState("networkidle");

      // Generic error + retry button
      await expect(page.getByText(/ocurrió un error/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /reintentar/i })).toBeVisible();
    });
  });
});
