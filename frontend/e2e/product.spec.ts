import { test, expect } from "@playwright/test";

test.describe("Карточка товара", () => {
  test("переход из каталога в карточку товара", async ({ page }) => {
    await page.goto("/catalog");
    const firstName = await page.locator(".pcard__name").first().innerText();
    await page.locator(".pcard__name").first().click();

    await expect(page).toHaveURL(/\/products\//);
    await expect(page.locator(".pdp__title")).toHaveText(firstName);
    await expect(page.locator(".pdp__price")).toBeVisible();
    // бейдж наличия («В наличии» / «Нет в наличии») должен присутствовать
    await expect(page.locator(".badge")).toBeVisible();
  });
});
