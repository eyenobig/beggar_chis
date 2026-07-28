<!-- 数据节点：ROM Payload / Save Data 统一抽象。
     默认显示「当前卡带」内容（连上且有信息时）；拖入文件后显示「待写入」。点击打开左抽屉。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartData } from '../../../stores/useCartData'
import { useEmulator } from '../../../stores/useEmulator'
import { gameCodeOf, romTitleOf } from '../../drawer/logs/rom/romFields'

const props = defineProps({ kind: { type: String, required: true } }) // 'rom' | 'save'
const cart = useCartData()
const { romFile, saveFile, cartInfo, cartReading } = storeToRefs(cart)
const emu = useEmulator()
const { logsOpen, activeTab } = storeToRefs(emu)

/** 识别点击后短时忽略卡片点击，避免 disabled/穿透误开 ROM */
let ignoreCardClickUntil = 0

function handleCardClick() {
  if (Date.now() < ignoreCardClickUntil) return
  if (isRom.value && logsOpen.value && activeTab.value === 'rom') {
    cart.pickRomFile()
  } else {
    emu.toggleLogs(true, 'rom')
  }
}

/** 读卡；成功后再展开 logs 抽屉的 ROM 页（失败不硬开） */
async function onIdentify(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  ignoreCardClickUntil = Date.now() + 800
  emu.toggleLogs(true, 'rom')
  if (cartReading.value) return
  await cart.readCart()
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
    const title = romTitleOf(c)
    const code = gameCodeOf(c)
    const hasGame = !!(title || code)
    const kindTag = c.kind === 'gba' ? 'GBA' : c.kind === 'gb_mbc' ? 'GB/GBC' : (c.kind || '卡带')
    return {
      state: 'current',
      tag: '当前卡带 · ' + kindTag,
      name: hasGame ? title : (mb ? `${mb}MB Flash` : '已识别 Flash'),
      sub: hasGame
        ? ((code || '—') + (mb ? ' · ' + mb + 'MB' : ''))
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

    <div class="grid grid-cols-[1fr_auto] items-stretch gap-2">
      <button
        data-no-drag
        type="button"
        @click="handleCardClick"
        class="min-w-0 text-left rounded-2xl p-4 relative overflow-hidden shadow-md transition active:scale-[0.99]"
        :class="
          isRom
            ? 'bg-zinc-900 text-white'
            : 'bg-zinc-50 border border-zinc-200 text-zinc-900 shadow-sm'
        "
      >
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

      <!-- 右侧识别：独立列；不用 disabled/pointer-events-none，避免点击穿透到卡片误开 ROM -->
      <button
        v-if="isRom"
        data-no-drag
        type="button"
        class="group relative z-30 flex w-14 shrink-0 items-center justify-center self-stretch rounded-2xl bg-zinc-800 text-zinc-400 shadow-md transition active:scale-[0.99] hover:bg-zinc-900 hover:text-white"
        :class="cartReading ? 'opacity-40' : ''"
        :aria-disabled="cartReading ? 'true' : 'false'"
        :aria-label="$t('rom.identify')"
        @click.stop.prevent="onIdentify"
        @mousedown.stop
        @pointerdown.stop
      >
        <svg
          class="h-4 w-4 transition-opacity group-hover:opacity-0"
          :class="cartReading ? 'animate-spin' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.6-6.2" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        <span
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-black opacity-0 transition-opacity group-hover:opacity-100"
        >{{ cartReading ? '…' : $t('rom.identify') }}</span>
      </button>
    </div>
  </section>
</template>
