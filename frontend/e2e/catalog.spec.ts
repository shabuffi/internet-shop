import { test, expect } from "@playwright/test";

// Каталог живёт на /catalog (главная — лендинг с плитками разделов).
test.describe("Каталог", () => {
  test("открывается и показывает товары", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Каталог" })).toBeVisible();
    await expect(page.locator(".pcard").first()).toBeVisible();
    await expect(page.locator(".result-count")).toContainText("товаров");
  });

  test("поиск находит товар по его названию", async ({ page }) => {
    await page.goto("/catalog");
    // берём первое слово названия первого товара и ищем по нему — без хардкода данных
    const firstName = await page.locator(".pcard__name").first().innerText();
    const word = firstName.split(/\s+/)[0];
    await page.goto(`/catalog?search=${encodeURIComponent(word)}`);
    await expect(page.locator(".pcard__name").first()).toContainText(word);
  });

  test("выбор категории ведёт на отфильтрованную выдачу с хлебными крошками", async ({ page }) => {
    await page.goto("/catalog");
    const select = page.getByLabel("Категория");
    await expect(select).toBeVisible();
    // выбираем первую реальную категорию (после «Все категории»)
    const value = await select.locator("option").nth(1).getAttribute("value");
    if (value) {
      await select.selectOption(value);
      await expect(page).toHaveURL(/category_id=/);
      // видно, в какой категории находимся: крошки «Каталог → …»
      await expect(page.getByLabel("Вы находитесь в разделе")).toBeVisible();
    }
  });
});
