import { redirect } from "next/navigation";

// Страница «Оплата» объединена с «Оформлением заказа» — редиректим на раздел #payment.
export default function PaymentRedirect() {
  redirect("/how-to-order#payment");
}
