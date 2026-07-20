<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmulator } from '../stores/useEmulator'

const emu = useEmulator()
const { currentPlatform } = storeToRefs(emu)
const { setPlatform } = emu

const isMbc = computed(() => currentPlatform.value === 'gbc')

// GBA 激活字色 — 深靛蓝（配白底描边按钮），每字略带层次
const gbaChars = [
  { char: 'G', color: '#312E81' },
  { char: 'B', color: '#3730A3' },
  { char: 'A', color: '#312E81' },
]

const indicatorStyle = computed(() => ({
  transform: isMbc.value ? 'translateX(0)' : 'translateX(100%)',
  // 背景由类提供：GBC → .gbc-prismatic，GBA → .gba-edge。
}))
</script>

<template>
  <div class="px-5 pt-1 pb-1 shrink-0 z-10 relative bg-white">
    <div class="platform-row flex bg-zinc-100 p-1 rounded-xl relative w-full" data-no-drag>
      <div
        class="absolute top-1 left-1 w-[calc(50%-4px)] h-[calc(100%-8px)] rounded-lg platform-toggle z-0"
        :class="isMbc ? 'gbc-prismatic' : 'gba-edge'"
        :style="indicatorStyle"
      />

      <!-- GB&GBC：激活时白底 + 彩虹描边（.gbc-prismatic）+ 深色字，未激活时 zinc-400 -->
      <button
        @click="setPlatform('gbc')"
        class="gbc-btn relative z-10 flex-1 py-1.5 text-[9px] uppercase tracking-widest font-black transition-colors"
        :class="isMbc ? 'text-[#1d1d1f]' : 'text-zinc-400'"
      >
        GB&amp;GBC
      </button>

      <!-- GBA：激活时白底 + 靛蓝灰描边（.gba-edge）+ 深靛蓝字，未激活时 zinc-400 -->
      <button
        @click="setPlatform('gba')"
        class="gba-btn relative z-10 flex-1 py-1.5 text-[9px] uppercase tracking-widest font-black transition-colors"
        :class="!isMbc ? '' : 'text-zinc-400'"
      >
        <template v-if="!isMbc">
          <span v-for="(c, i) in gbaChars" :key="i" :style="{ color: c.color }">{{ c.char }}</span>
        </template>
        <template v-else>GBA</template>
      </button>
    </div>
  </div>
</template>
