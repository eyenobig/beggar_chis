<script setup>
import { watchEffect, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from './layouts/AppLayout.vue'
import EmulatorWidget from './components/EmulatorWidget.vue'
import { useConnection } from './stores/useConnection'
import { useCartData } from './stores/useCartData'
import { useEmulator } from './stores/useEmulator'
import { useCfbSettings } from './stores/useCfbSettings'
import { useAppUpdater } from './stores/useAppUpdater'
import { useToast } from './stores/useToast'
import { inTauri } from './services/cfb'

const { t } = useI18n()
watchEffect(() => { document.title = t('app.title') })

async function reportVerify(payload) {
  try {
    await fetch('/__chis_verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, at: new Date().toISOString() }),
    })
  } catch { /* ignore */ }
}

/** 通过 Pinia store（客户端 sidecar）烧录，供验证 / 调试。 */
async function clientBurn(path) {
  const cart = useCartData()
  const emu = useEmulator()
  const conn = useConnection()
  emu.toggleLogs(true, 'rom')
  if (!cart.setDropped(path)) {
    return { ok: false, error: '无法识别 ROM 路径' }
  }
  // 等连接 + Flash 识别（由 startWatching / readCart 完成），避免抢串口
  for (let i = 0; i < 60; i++) {
    if (conn.isConnected && cart.flashInfo && !cart.cartReading && !cart.opRunning) break
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!conn.isConnected) {
    return { ok: false, error: '烧录器未连接' }
  }
  if (!cart.flashInfo) {
    await cart.readCart()
  }
  if (!cart.flashInfo) {
    return { ok: false, error: cart.cartError || '未检测到卡带' }
  }
  // 等串口完全释放（info 进程退出）
  await new Promise((r) => setTimeout(r, 800))
  const before = cart.cartInfo?.rom_title || cart.cartInfo?.game_name || null
  await cart.burn()
  const after = cart.cartInfo?.rom_title || cart.cartInfo?.game_name || null
  return {
    ok: !!cart.opResult?.ok,
    before,
    after,
    result: cart.opResult,
    rom: cart.romFile,
    fileInfo: cart.romFileInfo,
    error: cart.opResult?.ok ? undefined : (cart.opResult?.error || '烧录失败'),
  }
}

onMounted(() => {
  // 透明窗口防闪白：窗体在 tauri.conf.json 里 visible:false 启动，
  // 首帧渲染完成后再 show，避免 webview 初始化阶段的白色底一闪而过。
  // 注意：隐藏窗口里 rAF 可能被暂停，必须带 setTimeout 兜底（Rust 侧 on_page_load 还有第二重兜底）。
  if (inTauri) {
    const showWin = () =>
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().show())
        .catch(() => {})
    requestAnimationFrame(() => requestAnimationFrame(showWin))
    setTimeout(showWin, 400)
  }
  // 先等 cfb 路径就绪再 detect，避免启动竞态：路径未好 → detect 空结果 → 一直显示未连接。
  ;(async () => {
    await useCfbSettings().ensurePathsReady()
    await useConnection().startWatching()
  })()
  // 老板键：启动即按设置注册全局快捷键（默认 mac ⌘B / Windows Ctrl+B，设置页可改/可关）
  useCfbSettings().applyBossKey()
  useAppUpdater().init()

  // ⌘P / Ctrl+P：截取应用窗口（含当前连接/卡带/任务状态）到桌面 PNG。
  // 应用内快捷键（非全局），不抢系统打印。
  if (inTauri) {
    window.addEventListener('keydown', async (e) => {
      if (e.code !== 'KeyP' || !(e.metaKey || e.ctrlKey) || e.repeat) return
      e.preventDefault()
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke('screenshot_window')
        useToast().success(useI18n().t('app.screenshotSaved', { path }))
      } catch (err) {
        useToast().error(useI18n().t('app.screenshotFail', { err: String(err || '') }))
      }
    })
  }

  if (inTauri) {
    window.__chis = {
      burn: clientBurn,
      readCart: () => useCartData().readCart(),
      state: () => {
        const cart = useCartData()
        return {
          connected: useConnection().isConnected,
          port: useConnection().selectedPort,
          cartInfo: cart.cartInfo,
          flashInfo: cart.flashInfo,
          romFile: cart.romFile,
          opResult: cart.opResult,
        }
      },
    }
  }

  const autoPath = import.meta.env.VITE_CLIENT_BURN
  if (autoPath && inTauri) {
    ;(async () => {
      await reportVerify({ phase: 'start', path: autoPath })
      // 等设备热插拔初始 detect
      await new Promise((r) => setTimeout(r, 1500))
      const out = await clientBurn(autoPath)
      await reportVerify({ phase: 'done', path: autoPath, ...out })
    })()
  }
})
</script>

<template>
  <AppLayout>
    <EmulatorWidget />
  </AppLayout>
</template>
