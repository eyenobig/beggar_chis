// 右键菜单：使用 Tauri 原生菜单，不受透明小窗口尺寸裁剪
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { i18n, SUPPORTED, setLocale } from "../i18n";

export function useContextMenu() {
  async function showMenu(e) {
    e.preventDefault();
    const win = getCurrentWindow();
    const { t, locale } = i18n.global;

    // 语言切换项：当前语言前加 ● 标记
    const langItems = Object.entries(SUPPORTED).map(([code, name]) => ({
      id: `lang-${code}`,
      text: (locale.value === code ? "● " : "   ") + name,
      action: () => setLocale(code),
    }));

    const separator = await PredefinedMenuItem.new({ item: "Separator" });

    const menu = await Menu.new({
      items: [
        ...langItems,
        separator,
        { id: "quit", text: t("menu.quit"), action: () => win.close() },
      ],
    });

    await menu.popup();
  }

  return { showMenu };
}
