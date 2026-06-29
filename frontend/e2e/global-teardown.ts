import { execSync } from "node:child_process";
import path from "node:path";

const DOCKER = process.env.DOCKER_BIN || "docker";
const ROOT = path.resolve(__dirname, "..", "..");

// Удаляем тестовые заказы (вместе с позициями — cascade delete-orphan на Order.items)
// и сам тестовый товар. Заказы удаляем ПЕРВЫМИ: OrderItem ссылается на products.id
// внешним ключом, иначе удаление товара упрётся в FK.
const CLEANUP = `
from app.db.session import SessionLocal
from app.db.models.product import Product
from app.db.models.order import Order, OrderItem
from sqlalchemy import select
db = SessionLocal()
order_ids = {i.order_id for i in db.scalars(select(OrderItem).where(OrderItem.product_id == 'e2e-test-product'))}
for oid in order_ids:
    o = db.get(Order, oid)
    if o:
        db.delete(o)
p = db.get(Product, 'e2e-test-product')
if p:
    db.delete(p)
db.commit()
db.close()
print(f'e2e: очистка — удалено заказов {len(order_ids)}, тестовый товар удалён')
`;

export default async function globalTeardown() {
  try {
    execSync(`${DOCKER} compose exec -T backend python3 -`, {
      input: CLEANUP,
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch {
    console.warn("e2e: очистка тестовых данных не выполнена (docker недоступен?)");
  }
}
