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

/** 右键菜单 / 设置下拉：语言代码 -> 本地名称 */
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

const PREF_KEY = "app-locale-pref"; // auto | zh-CN | en | …
const STORAGE_KEY = "app-locale"; // 解析后的实际 locale

export function detectSystemLocale() {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "" || "").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  const prefix = lang.split("-")[0];
  return messages[prefix] ? prefix : "zh-CN";
}

/** 读取偏好：auto 或具体语言码 */
export function getLocalePreference() {
  if (typeof localStorage === "undefined") return "auto";
  const pref = localStorage.getItem(PREF_KEY);
  if (pref === "auto") return "auto";
  if (pref && messages[pref]) return pref;
  // 兼容旧版只存了 app-locale
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (legacy && messages[legacy]) return legacy;
  return "auto";
}

export function resolveLocale(pref) {
  if (!pref || pref === "auto") return detectSystemLocale();
  return messages[pref] ? pref : detectSystemLocale();
}

/** 应用语言偏好（auto / 具体码），同步 vue-i18n + localStorage */
export function applyLocalePreference(pref) {
  const normalized = !pref || pref === "auto" ? "auto" : messages[pref] ? pref : "auto";
  const resolved = resolveLocale(normalized);
  i18n.global.locale.value = resolved;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PREF_KEY, normalized);
    localStorage.setItem(STORAGE_KEY, resolved);
  }
  return resolved;
}

/** 切换到具体语言（非 auto） */
export function setLocale(code) {
  if (!messages[code]) return;
  applyLocalePreference(code);
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveLocale(getLocalePreference()),
  fallbackLocale: "zh-CN",
  messages,
});
