<!-- 数据节点：ROM Payload / Save Data 统一抽象。
     默认显示「当前卡带」内容（连上且有信息时）；拖入文件后显示「待写入」。点击打开左抽屉。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartData } from '../../../stores/useCartData'
import { useEmulator } from '../../../stores/useEmulator'

const props = defineProps({ kind: { type: String, required: true } }) // 'rom' | 'save'
const cart = useCartData()
const { romFile, saveFile, cartInfo, cartReading } = storeToRefs(cart)
const emu = useEmulator()
const { logsOpen, activeTab } = storeToRefs(emu)

function handleCardClick() {
  if (isRom.value && logsOpen.value && activeTab.value === 'rom') {
    cart.pickRomFile()
  } else {
    emu.toggleLogs(true, 'rom')
  }
}

const isRom = computed(() => props.kind === 'rom')
const dropped = computed(() => (isRom.value ? romFile.value : saveFile.value))
const label = computed(() => (isRom.value ? 'ROM Payload' : 'Save Data'))
const hint = computed(() => (isRom.value ? '拖入 .gba / .gb / .gbc' : '拖入 .sav / .srm'))

// 展示：待写入(拖入文件) > 当前卡带(连上有信息) > 空
const view = computed(() => {
  if (dropped.value) {
    return {
      state: 'pending',
      tag: isRom.value ? (dropped.value.mbc ? 'GB/GBC ROM · 待写入' : 'GBA ROM · 待写入') : 'SAVE · 待写入',
      name: dropped.value.name,
      sub: dropped.value.path,
    }
  }
  // 当前卡带（存档暂无法读取 RAM，只对 ROM 生效）
  if (isRom.value && cartInfo.value && (cartInfo.value.present || cartInfo.value.capacity_bytes > 0)) {
    const c = cartInfo.value
    const mb = c.capacity_bytes ? Math.round(c.capacity_bytes / 1024 / 1024) : 0
    const hasGame = !!(c.rom_title || c.game_name)
    const kindTag = c.kind === 'gba' ? 'GBA' : c.kind === 'gb_mbc' ? 'GB/GBC' : (c.kind || '卡带')
    return {
      state: 'current',
      tag: '当前卡带 · ' + kindTag,
      name: hasGame ? (c.rom_title || c.game_name) : (mb ? `${mb}MB Flash` : '已识别 Flash'),
      sub: hasGame
        ? ((c.game_code || '—') + (mb ? ' · ' + mb + 'MB' : ''))
        : (mb ? mb + 'MB' : null),
    }
  }
  return { state: 'empty' }
})
</script>

<template>
  <section>
    <div class="mb-2 px-1">
      <span class="text-[9px] font-black uppercase tracking-widest text-zinc-900">{{ label }}</span>
    </div>

    <div class="grid grid-cols-[1fr_auto] gap-2">
      <button
        data-no-drag
        @click="handleCardClick"
        class="flex-1 min-w-0 text-left rounded-2xl p-4 relative overflow-hidden shadow-md transition active:scale-[0.99]"
        :class="
          isRom
            ? 'bg-zinc-900 text-white'
            : 'bg-zinc-50 border border-zinc-200 text-zinc-900 shadow-sm'
        "
      >
        <div
          v-if="isRom"
          class="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"
        ></div>

        <template v-if="view.state !== 'empty'">
          <p
            class="text-[8px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5"
            :class="isRom ? 'text-zinc-400' : 'text-zinc-500'"
          >
            <span
              v-if="view.state === 'pending'"
              class="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"
            ></span>
            {{ view.tag }}
          </p>
          <template v-if="view.name">
            <h3 class="text-xs font-black mono truncate" :class="isRom ? 'text-zinc-100' : 'text-zinc-900'">
              {{ view.name }}
            </h3>
          </template>
          <p v-else class="text-xs font-black" :class="isRom ? 'text-zinc-100' : 'text-zinc-900'">查看</p>
        </template>

        <template v-else>
          <!-- 与识别后保持相同的两层结构：tag 行 + 主内容行 -->
          <p class="text-[8px] font-black uppercase tracking-widest mb-1" :class="isRom ? 'text-zinc-600' : 'text-zinc-400'">
            {{ label }}
          </p>
          <div class="flex items-center gap-2">
            <svg
              class="w-4 h-4 shrink-0"
              :class="isRom ? 'text-zinc-500' : 'text-zinc-300'"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="2" width="18" height="15" rx="2" />
              <path d="M3 13h18" />
              <path d="M7 13v4M10 13v4M14 13v4M17 13v4" />
              <rect x="5.5" y="4.5" width="13" height="6" rx="1" />
            </svg>
            <span class="text-xs font-bold" :class="isRom ? 'text-zinc-500' : 'text-zinc-400'">请插入卡带</span>
          </div>
        </template>
      </button>

      <!-- 右侧识别按钮：始终显示，点击重新读卡 -->
      <button
        v-if="isRom"
        data-no-drag
        @click="cart.readCart()"
        :disabled="cartReading"
        class="h-full aspect-square rounded-2xl p-4 flex items-center justify-center text-[10px] font-black shadow-md transition active:scale-[0.99] disabled:opacity-40 bg-zinc-900 text-zinc-400 hover:text-white"
      >{{ cartReading ? '…' : '识别' }}</button>
    </div>
  </section>
</template>
