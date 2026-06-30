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
from app.db.models.user import User
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
# Тестовые аккаунты регистрации (registration.spec.ts) — email вида e2e-reg-*@example.test.
# Order.user_id -> ON DELETE SET NULL, поэтому удаление пользователей безопасно.
reg_users = db.scalars(select(User).where(User.email.like('e2e-reg-%@example.test'))).all()
for u in reg_users:
    db.delete(u)
db.commit()
db.close()
print(f'e2e: очистка — заказов {len(order_ids)}, товар удалён, аккаунтов регистрации {len(reg_users)}')
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
