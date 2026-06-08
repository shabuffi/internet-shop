import { test, expect } from "@playwright/test";

test.describe("Каталог", () => {
  test("открывается и показывает товары", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Каталог" })).toBeVisible();
    await expect(page.locator(".pcard").first()).toBeVisible();
    await expect(page.locator(".result-count")).toContainText("товаров");
  });

  test("поиск находит товар по его названию", async ({ page }) => {
    await page.goto("/");
    // берём первое слово названия первого товара и ищем по нему — без хардкода данных
    const firstName = await page.locator(".pcard__name").first().innerText();
    const word = firstName.split(/\s+/)[0];
    await page.goto(`/?search=${encodeURIComponent(word)}`);
    await expect(page.locator(".pcard__name").first()).toContainText(word);
  });

  test("чип категории ведёт на отфильтрованную выдачу", async ({ page }) => {
    await page.goto("/");
    const chips = page.locator(".chip");
    await expect(chips.first()).toBeVisible(); // как минимум чип «Все»
    if ((await chips.count()) > 1) {
      await chips.nth(1).click();
      await expect(page).toHaveURL(/category_id=/);
      await expect(page.locator(".chip--active")).toBeVisible();
    }
  });
});
