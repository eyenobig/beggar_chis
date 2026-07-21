<!-- ROM 页：FlashInfo（cfb info）+ 卡带↔文件 + 烧录/识别。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshCw } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'
import { useConnection } from '../../../stores/useConnection'

const cart = useCartData()
const conn = useConnection()
const {
  drawerKind,
  currentFile,
  cartInfo,
  flashInfo,
  cartReading,
  cartError,
  rtcInfo,
  romFileInfo,
  opRunning,
} = storeToRefs(cart)

// 勿对可能尚未就绪的 store 字段做 storeToRefs 强解；直接读 store
const isConnected = computed(() => !!conn.isConnected)
const selectedPort = computed(() => conn.selectedPort || null)

const cartSide = computed(() => {
  const c = cartInfo.value
  if (!c || !(c.present || c.capacity_bytes > 0)) {
    return { title: '—', meta: '—', rtc: '—', checksum: '—' }
  }
  const title = c.rom_title || c.game_name || '—'
  const meta = [c.game_code, kindLabel(c.kind)].filter(Boolean).join(' · ') || '—'
  let rtc = '—'
  if (c.rtc === true) rtc = rtcClock.value || '读取中…'
  else if (c.rtc === false) rtc = '无'
  const cs = c.rom_checksum
  const checksum = cs ? (cs.ok ? `OK ${cs.stored}` : `BAD ${cs.stored}/${cs.computed}`) : '—'
  return { title, meta, rtc, checksum }
})

const fileSide = computed(() => {
  const f = romFileInfo.value
  const dropped = currentFile.value
  if (!f && !dropped) return { title: '—', meta: '—', rtc: '—', checksum: '—' }
  const title = f?.rom_title || f?.game_name || dropped?.name || '—'
  const mb = f?.capacity_bytes ? fmtSize(f.capacity_bytes) : null
  const meta = [f?.game_code, kindLabel(f?.kind), mb].filter(Boolean).join(' · ') || '—'
  let rtc = '—'
  if (f?.rtc === true) rtc = '有'
  else if (f?.rtc === false) rtc = '无'
  const cs = f?.rom_checksum
  const checksum = cs ? (cs.ok ? `OK ${cs.stored}` : `BAD ${cs.stored}/${cs.computed}`) : '—'
  return { title, meta, rtc, checksum }
})

const rtcClock = computed(() => {
  const r = rtcInfo.value
  if (!r?.ok) return null
  if (r.kind === 'gba') {
    const p = (n, w = 2) => String(n).padStart(w, '0')
    return `${String(r.year).slice(-2)}-${p(r.month)}-${p(r.date)} ${p(r.hour)}:${p(r.minute)}:${p(r.second)}`
  }
  if (r.kind === 'mbc3') {
    const p = (n) => String(n).padStart(2, '0')
    const flags = [r.halted ? '停' : '', r.overflow ? '溢' : ''].filter(Boolean).join('')
    return `d${r.day_count} ${p(r.hour)}:${p(r.minute)}:${p(r.second)}${flags ? ` ${flags}` : ''}`
  }
  return null
})

const statusHint = computed(() => {
  if (!isConnected.value) return '请先连接烧录器'
  if (cartReading.value) return '读取 Flash…'
  if (flashInfo.value) return null
  if (cartError.value) return cartError.value
  return '未检测到卡带'
})

function kindLabel(kind) {
  if (kind === 'gba') return 'GBA'
  if (kind === 'gb_mbc') return 'GB/GBC'
  return kind || null
}

function fmtSize(bytes) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) ? 1 : 0)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

async function onIdentify() {
  await cart.readCart()
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-auto no-scrollbar flex flex-col">
    <template v-if="drawerKind !== 'rom'">
      <p class="px-5 py-6 text-[11px] text-zinc-600">存档（RAM）读写待实现。</p>
    </template>

    <template v-else>
      <!-- FlashInfo（chis-burner-cmd / cfb info） -->
      <div class="px-5 py-3 border-b border-white/5 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[8px] font-black uppercase tracking-widest text-zinc-600">Flash</span>
            <span v-if="selectedPort" class="text-[9px] mono text-zinc-600 truncate">{{ selectedPort }}</span>
          </div>
          <button
            @click="onIdentify"
            :disabled="opRunning || cartReading || !isConnected"
            class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white disabled:opacity-40"
          >
            <RefreshCw class="w-3 h-3" :class="cartReading ? 'animate-spin' : ''" :stroke-width="2.5" />
            识别
          </button>
        </div>

        <p v-if="statusHint" class="text-[10px] mono" :class="cartError && !flashInfo ? 'text-red-400/90' : 'text-zinc-600'">
          {{ statusHint }}
        </p>

        <template v-if="flashInfo">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-[12px] font-bold text-white truncate">{{ flashInfo.title || '空白 / 未知游戏' }}</span>
            <span class="text-[9px] mono text-zinc-500 shrink-0">{{ kindLabel(flashInfo.kind) }}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mono">
            <span class="text-zinc-600">容量</span>
            <span class="text-zinc-300 text-right">{{ flashInfo.capacity }}</span>
            <span class="text-zinc-600">写缓冲</span>
            <span class="text-zinc-300 text-right">{{ flashInfo.bufferWrite }}</span>
            <span class="text-zinc-600">扇区</span>
            <span class="text-zinc-300 text-right">{{ flashInfo.sectorSize }} × {{ flashInfo.sectorCount }}</span>
            <span class="text-zinc-600">Map</span>
            <span class="text-zinc-300 text-right">{{ flashInfo.maptype || '—' }}</span>
            <span class="text-zinc-600">ID</span>
            <span class="text-zinc-500 text-right truncate" :title="flashInfo.id">{{ flashInfo.id }}</span>
          </div>
        </template>
      </div>

      <!-- 游戏头对比 -->
      <div class="px-5 py-3 border-b border-white/5">
        <div class="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 items-start text-[10px] mono">
          <span class="text-[8px] font-black uppercase tracking-widest text-zinc-600">卡带</span>
          <span />
          <span class="text-[8px] font-black uppercase tracking-widest text-zinc-600 text-right">文件</span>

          <span class="text-zinc-300 truncate leading-snug">{{ cartSide.title }}</span>
          <span class="text-zinc-700 pt-0.5">→</span>
          <span class="text-yellow-400 truncate text-right leading-snug">{{ fileSide.title }}</span>

          <span class="text-zinc-500 truncate leading-snug">{{ cartSide.meta }}</span>
          <span />
          <span class="text-zinc-500 truncate text-right leading-snug">{{ fileSide.meta }}</span>

          <span class="text-zinc-600 truncate leading-snug">CRC {{ cartSide.checksum }}</span>
          <span />
          <span class="text-zinc-600 truncate text-right leading-snug">CRC {{ fileSide.checksum }}</span>
        </div>
      </div>

    </template>
  </div>
</template>

