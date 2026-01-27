import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

const HEADER_CLIP_HEIGHT = 360;

const disableMotion = async (page: Page) => {
  await page.addStyleTag({
    content:
      "* { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; }",
  });
};

const clipForViewport = (viewport: { width: number; height: number }) => ({
  x: 0,
  y: 0,
  width: viewport.width,
  height: Math.min(viewport.height, HEADER_CLIP_HEIGHT),
});

test.describe("Public headers visual", () => {
  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await disableMotion(page);
      });

      test(`explore header top - ${viewport.name}`, async ({ page }) => {
        await page.goto("/explore", { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Explora creadores" }).waitFor();
        await page.evaluate(() => document.fonts?.ready);
        await expect(page).toHaveScreenshot(`explore-header-top-${viewport.name}.png`, {
          clip: clipForViewport(viewport),
        });
      });

      test(`explore header scrolled - ${viewport.name}`, async ({ page }) => {
        await page.goto("/explore", { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Explora creadores" }).waitFor();
        await page.evaluate(() => document.fonts?.ready);
        await page.evaluate(() => window.scrollTo(0, 220));
        await page.waitForSelector('header[data-scrolled="true"]');
        await expect(page).toHaveScreenshot(`explore-header-scrolled-${viewport.name}.png`, {
          clip: clipForViewport(viewport),
        });
      });

      test(`discover header - ${viewport.name}`, async ({ page }) => {
        await page.goto("/discover", { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Filtros" }).waitFor();
        await page.evaluate(() => document.fonts?.ready);
        await expect(page).toHaveScreenshot(`discover-header-${viewport.name}.png`, {
          clip: clipForViewport(viewport),
        });
      });

      test(`public profile header - ${viewport.name}`, async ({ page }) => {
        await page.goto("/creator", { waitUntil: "domcontentloaded" });
        await page.locator("main").first().waitFor();
        await page.evaluate(() => document.fonts?.ready);
        await expect(page).toHaveScreenshot(`public-profile-header-${viewport.name}.png`, {
          clip: clipForViewport(viewport),
        });
      });
    });
  }
});
