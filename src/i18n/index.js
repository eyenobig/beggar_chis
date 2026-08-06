// 基于 vue-i18n 的多语言配置
// 新增语言：在 locales/ 下加 <code>.json，并在下方两处（import + messages + SUPPORTED）登记
import { createI18n } from "vue-i18n";
import { getLocalLocale, getLocalSettings, loadLocalConfig, saveLocalConfig } from "../services/localConfig";
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

export function detectSystemLocale() {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "" || "").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  const prefix = lang.split("-")[0];
  return messages[prefix] ? prefix : "zh-CN";
}

/** 读取偏好：auto 或具体语言码 */
export function getLocalePreference() {
  const locale = getLocalLocale();
  const pref = locale.pref || getLocalSettings().language;
  if (pref === "auto") return "auto";
  if (pref && messages[pref]) return pref;
  // 兼容旧版只存了 resolved
  if (locale.resolved && messages[locale.resolved]) return locale.resolved;
  return "auto";
}

export function resolveLocale(pref) {
  if (!pref || pref === "auto") return detectSystemLocale();
  return messages[pref] ? pref : detectSystemLocale();
}

/** 应用语言偏好（auto / 具体码），同步 vue-i18n + 统一本地配置 */
export function applyLocalePreference(pref) {
  const normalized = !pref || pref === "auto" ? "auto" : messages[pref] ? pref : "auto";
  const resolved = resolveLocale(normalized);
  i18n.global.locale.value = resolved;
  const doc = loadLocalConfig();
  doc.locale = { ...doc.locale, pref: normalized, resolved };
  doc.settings = { ...doc.settings, language: normalized };
  saveLocalConfig(doc);
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
