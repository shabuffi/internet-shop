"use client";

import { useCart } from "@/context/CartContext";
import { IconChat } from "@/components/icons";
import { buildChatUrl, isChatReady, type ChatConfig } from "@/lib/chat";

// Плавающая кнопка «Чат с менеджером» в правом нижнем углу. Сервис задаётся в админке
// (vk/telegram/whatsapp/custom) — здесь только строим ссылку и рисуем кнопку.
// Когда снизу видна липкая панель корзины (CartBar), приподнимаемся, чтобы не перекрывать её.
export default function ChatWidget({ config }: { config: ChatConfig | null }) {
  const { totalItems } = useCart();

  if (!isChatReady(config)) return null;
  const c = config as ChatConfig;
  const url = buildChatUrl(c.service, c.value);

  // Базовый отступ + safe-area; если показана панель корзины — выше неё (~76px).
  const bottom = totalItems > 0
    ? "calc(env(safe-area-inset-bottom, 0px) + 88px)"
    : "calc(env(safe-area-inset-bottom, 0px) + 20px)";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={c.label}
      className="chat-fab"
      style={{
        position: "fixed",
        right: "calc(env(safe-area-inset-right, 0px) + 18px)",
        bottom,
        zIndex: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 52,
        padding: "0 20px",
        borderRadius: 999,
        background: "var(--accent, #003399)",
        color: "#fff",
        fontWeight: 600,
        fontSize: 15,
        textDecoration: "none",
        boxShadow: "0 8px 24px rgba(0,0,0,.22)",
        transition: "transform .15s ease, box-shadow .15s ease, bottom .2s ease",
      }}
    >
      <IconChat style={{ width: 22, height: 22, flex: "none" }} />
      <span className="chat-fab__label">{c.label}</span>
    </a>
  );
}
