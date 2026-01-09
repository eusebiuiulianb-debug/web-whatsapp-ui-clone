import { test, expect } from "@playwright/test";

test("A: generar sugerencia rellena el composer en /creator/manager", async ({ page }) => {
  await page.goto("/creator/manager");
  const input = page.getByPlaceholder("Cuéntale al Manager IA en qué necesitas ayuda.");
  await page.getByRole("button", { name: /Generar sugerencia/i }).click();
  await expect(input).toHaveValue(/\S+/);
});

test("B: Enviar al Manager usa bloque original/traduccion", async ({ page }) => {
  await page.route("**/api/creator/ai/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        creditsAvailable: 0,
        hardLimitPerDay: null,
        usedToday: 0,
        remainingToday: null,
        limitReached: false,
        translateConfigured: true,
        creatorLang: "es",
      }),
    });
  });

  await page.route("**/api/creator/messages/translate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        translatedText: "Traduccion clave para pruebas",
        detectedSourceLang: "en",
        targetLang: "es",
      }),
    });
  });

  const fansResponse = page.waitForResponse((res) => res.url().includes("/api/fans") && res.request().method() === "GET");
  await page.goto("/");
  const fansPayload = await (await fansResponse).json();
  const fans = Array.isArray(fansPayload?.items) ? fansPayload.items : Array.isArray(fansPayload?.fans) ? fansPayload.fans : [];
  const fanId = typeof fans?.[0]?.id === "string" ? fans[0].id : null;
  if (!fanId) {
    throw new Error("No hay fans disponibles en /api/fans");
  }

  await page.goto(`/?fan=${fanId}`);

  const firstMessage = page.locator("[data-message-id]").first();
  await firstMessage.hover();
  const actionButton = page.getByLabel("Acciones del mensaje").first();
  await expect(actionButton).toBeVisible();
  await actionButton.click();
  await page.getByRole("menuitem", { name: "Traducir" }).click();

  const sendButton = page.getByRole("button", { name: /Enviar al Manager/i });
  await expect(sendButton).toBeVisible();
  await sendButton.click();

  await page.waitForURL(/\/creator\/manager/);

  const managerInput = page.getByPlaceholder("Cuéntale al Manager IA en qué necesitas ayuda.");
  await expect(managerInput).toHaveValue(/Original/i);
  await page.getByRole("button", { name: /Generar sugerencia/i }).click();
  await expect(managerInput).toHaveValue(/TRAD:Traduccion clave para pruebas/i);
});

test("C: error de provider muestra toast y permite reintentar", async ({ page }) => {
  let callCount = 0;
  await page.route("**/api/creator/cortex/suggest-reply", async (route) => {
    callCount += 1;
    if (callCount === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Proveedor caido" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Respuesta simulada",
        language: "es",
        intent: "reply",
        follow_up_questions: [],
      }),
    });
  });

  await page.goto("/creator/manager");
  const input = page.getByPlaceholder("Cuéntale al Manager IA en qué necesitas ayuda.");
  const generateButton = page.getByRole("button", { name: /Generar sugerencia/i });
  await generateButton.click();

  await expect(page.getByText("Proveedor caido")).toBeVisible();
  await expect(generateButton).toHaveText(/Reintentar sugerencia/i);

  await generateButton.click();
  await expect(input).toHaveValue(/Respuesta simulada/);
});
