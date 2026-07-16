import { test, expect, type Page } from "@playwright/test";

// Внешняя (браузерная) проверка регистрации покупателя против поднятого стека.
// Каждый тест — свой изолированный контекст (куки не протекают между тестами).
// Email И ТЕЛЕФОН уникальны на регистрацию: бэкенд требует уникальности обоих
// (иначе 2-я регистрация с тем же телефоном → 409 «телефон уже зарегистрирован»,
// и все тесты после первого падают). Аккаунты чистит global-teardown (e2e-reg-*).

const uniqueEmail = () =>
  `e2e-reg-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

// Валидный уникальный РФ-мобильный: 10 цифр, первая «9» (см. normalizeRuPhone).
const uniquePhone = () =>
  "+79" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");

// Заполняет общие поля формы регистрации. Тип заказчика и ИНН — отдельно по месту.
async function fillCommon(page: Page, email: string, password = "Passw0rd!23") {
  await page.goto("/register");
  // Ждём, пока форма отрисуется и прогидрируется (в dev первая компиляция страницы
  // может занять секунды) — иначе fill полей иногда упирается в таймаут.
  await expect(page.getByRole("button", { name: "Зарегистрироваться" })).toBeVisible();
  await page.getByPlaceholder("you@example.ru").fill(email);
  await page.getByPlaceholder("+7 999 123 45 67").fill(uniquePhone());
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="checkbox"]').check();
}

test.describe("Регистрация покупателя", () => {
  test("физлицо: успешная регистрация → ожидание активации", async ({ page }) => {
    const email = uniqueEmail();
    await fillCommon(page, email);
    // тип по умолчанию — «Физическое лицо»; ИНН не требуется
    await page.getByPlaceholder("Иванов Иван Иванович").fill("Тестов Тест Тестович");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    // новый аккаунт создаётся неактивным → редирект в кабинет с заглушкой активации
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Ожидайте активации учётной записи" })).toBeVisible();
  });

  test("ООО: регистрация с корректным ИНН", async ({ page }) => {
    const email = uniqueEmail();
    await fillCommon(page, email);
    await page.locator("select").selectOption("ooo");
    await page.getByPlaceholder("ООО «Ромашка»").fill("ООО «Тест»");
    await page.getByPlaceholder("10 цифр").fill("7707083893"); // 10 цифр — валидный ИНН ООО
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Ожидайте активации учётной записи" })).toBeVisible();
  });

  test("дубликат email → понятная ошибка", async ({ page }) => {
    const email = uniqueEmail();
    // первая регистрация — успешна
    await fillCommon(page, email);
    await page.getByPlaceholder("Иванов Иван Иванович").fill("Первый Пользователь");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(page).toHaveURL(/\/account/);

    // повторная с тем же email — сервер отвечает 409, форма показывает ошибку
    await fillCommon(page, email);
    await page.getByPlaceholder("Иванов Иван Иванович").fill("Второй Пользователь");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator(".form-error")).toContainText(/уже зарегистрирован/i);
  });

  test("ИП: некорректный ИНН отклоняется сервером", async ({ page }) => {
    const email = uniqueEmail();
    await fillCommon(page, email);
    await page.locator("select").selectOption("ip");
    await page.getByPlaceholder("ООО «Ромашка»").fill("ИП Тестов");
    await page.getByPlaceholder("12 цифр").fill("123"); // слишком короткий — пройдёт HTML5, упрётся в сервер
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator(".form-error")).toContainText(/ИНН/i);
  });

  test("без согласия на обработку ПД форма не отправляется", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/register");
    await page.getByPlaceholder("you@example.ru").fill(email);
    await page.getByPlaceholder("+7 999 123 45 67").fill(uniquePhone());
    await page.getByPlaceholder("Иванов Иван Иванович").fill("Без Согласия");
    await page.locator('input[type="password"]').fill("Passw0rd!23");
    // НЕ ставим галочку согласия
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    // нативная валидация required не пускает — остаёмся на /register
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('input[type="checkbox"]')).toBeFocused();
  });
});
