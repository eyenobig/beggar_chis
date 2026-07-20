<!--
  ╔══════════════════════════════════════════════════════════╗
  ║  Pikachu · ピカチュウ · 皮卡丘                            ║
  ╚══════════════════════════════════════════════════════════╝
-->
<script setup>
import { watchEffect, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from './layouts/AppLayout.vue'
import EmulatorWidget from './components/EmulatorWidget.vue'
import { useConnection } from './stores/useConnection'
import { useCartData } from './stores/useCartData'
import { useEmulator } from './stores/useEmulator'
import { inTauri } from './composables/useCfb'

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
  useConnection().startWatching()

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
