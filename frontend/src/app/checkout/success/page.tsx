import Link from "next/link";

interface Props { searchParams: Promise<{ order?: string }>; }

export default async function SuccessPage({ searchParams }: Props) {
  const { order } = await searchParams;
  return (
    <div className="success-page">
      <div className="success-icon">✅</div>
      <h1 className="success-title">Заказ оформлен!</h1>
      {order && <p className="success-order">Номер заказа: <strong>{order}</strong></p>}
      <p className="success-body">Мы свяжемся с вами в ближайшее время для подтверждения.</p>
      <Link href="/" className="btn btn-primary">Продолжить покупки</Link>
    </div>
  );
}
