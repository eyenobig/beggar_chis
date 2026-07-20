// 基于 vue-i18n 的多语言配置
// 新增语言：在 locales/ 下加 <code>.json，并在下方两处（import + messages + SUPPORTED）登记
import { createI18n } from "vue-i18n";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ru from "./locales/ru.json";

const messages = {
  "zh-CN": zhCN,
  en,
  ja,
  ko,
  es,
  fr,
  de,
  ru,
};

// 右键菜单展示用：语言代码 -> 该语言的本地名称
export const SUPPORTED = {
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
};

const STORAGE_KEY = "app-locale";

function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && messages[saved]) return saved;
  const lang = (navigator.language || "").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  const prefix = lang.split("-")[0];
  return messages[prefix] ? prefix : "zh-CN";
}

export const i18n = createI18n({
  legacy: false, // 使用组合式 API
  globalInjection: true, // 模板里可直接用 $t
  locale: detectLocale(),
  fallbackLocale: "zh-CN",
  messages,
});

// 切换语言并持久化
export function setLocale(code) {
  if (!messages[code]) return;
  i18n.global.locale.value = code;
  localStorage.setItem(STORAGE_KEY, code);
}
