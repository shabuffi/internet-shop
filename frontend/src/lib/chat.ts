// Связь с менеджером — одна точка построения ссылки по паре «сервис + значение».
// Сменить мессенджер = поменять настройку в админке (chat_service/chat_value),
// код трогать не нужно. Все варианты — нативные deep-link, без сторонних скриптов.

export type ChatService = "vk" | "telegram" | "whatsapp" | "custom";

export interface ChatConfig {
  enabled: boolean;
  service: ChatService;
  value: string; // ник/номер/screen_name либо готовый URL
  label: string; // подпись кнопки
}

export const CHAT_SERVICE_LABEL: Record<ChatService, string> = {
  vk: "ВКонтакте",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  custom: "Произвольная ссылка",
};

// Строит итоговую ссылку. Если value уже полный URL (http/https) — используем как есть,
// чтобы можно было вставить любую ссылку независимо от выбранного сервиса.
export function buildChatUrl(service: ChatService, value: string): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;

  switch (service) {
    case "vk":
      // vk.me/<screen_name> — диалог с сообществом/пользователем
      return `https://vk.me/${v.replace(/^@/, "")}`;
    case "telegram":
      return `https://t.me/${v.replace(/^@/, "")}`;
    case "whatsapp":
      return `https://wa.me/${v.replace(/\D/g, "")}`;
    case "custom":
    default:
      return v;
  }
}

// Готова ли кнопка к показу (включена и есть валидный адрес).
export function isChatReady(config: ChatConfig | null | undefined): boolean {
  return !!config && config.enabled && !!buildChatUrl(config.service, config.value);
}

// Сборка ChatConfig из сырого ответа store-info (одна точка маппинга для layout и PDP).
export function chatConfigFromStore(d: {
  chat_enabled?: boolean; chat_service?: string; chat_value?: string; chat_label?: string;
} | null | undefined): ChatConfig {
  return {
    enabled: !!d?.chat_enabled,
    service: ((d?.chat_service as ChatService) || "vk"),
    value: d?.chat_value || "",
    label: d?.chat_label || "Чат с менеджером",
  };
}
