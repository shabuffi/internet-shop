import Link from "next/link";

interface Props {
  searchParams: Promise<{ order?: string }>;
}

export default async function SuccessPage({ searchParams }: Props) {
  const { order } = await searchParams;

  return (
    <div className="catalog-page" style={{ textAlign: "center", maxWidth: 480, margin: "4rem auto" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✓</div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Заказ оформлен!
      </h1>
      {order && (
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Номер заказа: <strong>{order}</strong>
        </p>
      )}
      <p style={{ color: "#555", marginBottom: "2rem" }}>
        Мы свяжемся с вами в ближайшее время для подтверждения заказа.
      </p>
      <Link href="/" className="btn">Продолжить покупки</Link>
    </div>
  );
}
