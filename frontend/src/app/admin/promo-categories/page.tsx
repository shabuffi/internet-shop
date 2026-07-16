import { redirect } from "next/navigation";

/** Промо-разделы переехали во вкладку «Настройка сайта». Прежний адрес не роняем — на него
 *  есть ссылки и закладки; редирект серверный, поэтому без мигания пустой страницей. */
export default function PromoCategoriesPage() {
  redirect("/admin/site?tab=promo");
}
