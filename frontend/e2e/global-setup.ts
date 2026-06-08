import { execSync } from "node:child_process";
import path from "node:path";

const DOCKER = process.env.DOCKER_BIN || "docker";
const ROOT = path.resolve(__dirname, "..", "..");

// Засеваем ОДИН тестовый товар с остатком. Артикул E2E-TEST-001 заведомо отсутствует
// в МойСклад — поэтому фоновая отправка заказа не найдёт товара и НЕ создаст реальный
// заказ в МойСклад (find_product_href_by_article вернёт None). Так путь покупки можно
// прогонять, не засоряя склад клиента. Остаток сбрасываем в 10 на каждый прогон.
const SEED = `
from app.db.session import SessionLocal
from app.db.models.product import Product
db = SessionLocal()
p = db.get(Product, 'e2e-test-product')
if p:
    p.stock = 10
    p.is_active = True
else:
    db.add(Product(id='e2e-test-product', moysklad_id='e2e-ms-product',
                   name='E2E Тестовый товар', article='E2E-TEST-001',
                   price=100, stock=10, is_active=True))
db.commit()
db.close()
print('e2e: тестовый товар готов (stock=10)')
`;

export default async function globalSetup() {
  try {
    execSync(`${DOCKER} compose exec -T backend python3 -`, {
      input: SEED,
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch {
    console.warn(
      "e2e: не удалось засеять тестовый товар (docker недоступен?) — тест покупки пропустится",
    );
  }
}
