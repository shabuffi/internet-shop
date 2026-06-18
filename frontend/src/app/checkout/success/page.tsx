import Link from "next/link";

interface Props { searchParams: Promise<{ order?: string }>; }

export default async function SuccessPage({ searchParams }: Props) {
  const { order } = await searchParams;
  return (
    <div className="container">
      <div className="thanks">
        <div className="thanks__check">✓</div>
        <h1>Спасибо за заказ!</h1>
        <p>Мы приняли заказ и скоро свяжемся с вами для подтверждения деталей доставки.</p>
        {order && (
          <div className="thanks__order">
            <span>Номер заказа</span>
            <b>{order}</b>
          </div>
        )}
        <div className="thanks__actions">
          <Link href="/catalog" className="btn btn--primary btn--lg">Продолжить покупки</Link>
        </div>
      </div>
    </div>
  );
}
