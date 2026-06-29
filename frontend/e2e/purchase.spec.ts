import { test, expect } from "@playwright/test";

// Полный путь покупки на ЗАСЕЯННОМ товаре с остатком (см. e2e/global-setup.ts).
// Если сид не выполнился (например, без docker) — тест помечается пропущенным, а не падает.
test.describe("Покупка", () => {
  test("каталог → корзина → оформление → успех", async ({ page }) => {
    // находим тестовый товар через поиск
    await page.goto("/?search=E2E");
    const card = page.locator(".pcard", { hasText: "E2E Тестовый товар" });
    test.skip((await card.count()) === 0, "тестовый товар не засеян — пропускаем");

    // добавляем в корзину
    await card.first().getByRole("button", { name: "В корзину" }).click();

    // переходим в корзину — позиция на месте
    await page.goto("/cart");
    await expect(page.locator(".lineitem")).toContainText("E2E Тестовый товар");

    // оформление
    await page.getByRole("link", { name: "Оформить заказ" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.fill('input[name="customer_first_name"]', "Тест");
    await page.fill('input[name="customer_last_name"]', "Тестов");
    await page.fill('input[name="customer_phone"]', "+7 900 123-45-67");
    await page.getByRole("button", { name: "Подтвердить заказ" }).click();

    // успех — номер заказа показан
    await expect(page).toHaveURL(/\/checkout\/success/);
    await expect(page.getByRole("heading", { name: "Спасибо за заказ!" })).toBeVisible();
    await expect(page.locator(".thanks__order b")).toContainText("ORD-");
  });
});
