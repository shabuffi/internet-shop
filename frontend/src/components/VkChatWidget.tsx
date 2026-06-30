"use client";

import { useEffect } from "react";

// Встроенный на сайт чат через официальный виджет «Сообщения сообщества» ВКонтакте.
// Посетитель пишет в окне на сайте → сообщение попадает в личку сообщества ВК;
// ответ менеджера из ВК возвращается в это же окно (двусторонняя связь).
// Нужны: apiId (ID приложения VK с типом «Сайт») и groupId (ID сообщества с
// включёнными сообщениями). Оба задаются в админке (раздел «Сайт»).
declare global {
  interface Window {
    VK?: {
      init: (opts: { apiId: number }) => void;
      Widgets?: { CommunityMessages: (elId: string, groupId: number, opts?: Record<string, unknown>) => void };
    };
  }
}

const SCRIPT_ID = "vk-openapi";
const EL_ID = "vk_community_messages";

export default function VkChatWidget({ apiId, groupId }: { apiId: string; groupId: string }) {
  useEffect(() => {
    const api = Number(apiId);
    const gid = Number(groupId);
    if (!api || !gid) return;

    function render() {
      const VK = window.VK;
      if (!VK?.Widgets?.CommunityMessages) return;
      VK.init({ apiId: api });
      VK.Widgets.CommunityMessages(EL_ID, gid, { tooltipButtonText: "Напишите нам" });
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.VK?.Widgets) { render(); return; }
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://vk.com/js/api/openapi.js?169";
      script.async = true;
      script.addEventListener("load", render);
      document.body.appendChild(script);
    } else {
      script.addEventListener("load", render);
    }
    return () => { script?.removeEventListener("load", render); };
  }, [apiId, groupId]);

  return <div id={EL_ID} />;
}
