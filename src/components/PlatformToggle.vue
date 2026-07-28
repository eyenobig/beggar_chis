<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmulator } from '../stores/useEmulator'

const props = defineProps({ operationLocked: Boolean })
const emu = useEmulator()
const { currentPlatform, uiSwitchLocked } = storeToRefs(emu)
const { setPlatform } = emu

const isMbc = computed(() => currentPlatform.value === 'gbc')
const platformLocked = computed(() => uiSwitchLocked.value || props.operationLocked)
const gbaChars = [
  { char: 'G', color: '#312E81' },
  { char: 'B', color: '#3730A3' },
  { char: 'A', color: '#312E81' },
]
const indicatorStyle = computed(() => ({
  transform: isMbc.value ? 'translateX(0)' : 'translateX(100%)',
  width: 'calc(50% - 4px)',
  height: 'calc(100% - 8px)',
}))
</script>

<template>
  <div data-no-drag class="relative z-30 min-h-[38px] shrink-0 bg-white px-5 py-1">
    <div class="platform-row relative flex min-h-[30px] w-full rounded-xl bg-zinc-100 p-1">
      <div
        class="platform-toggle absolute left-1 top-1 z-0 rounded-lg"
        :class="isMbc ? 'gbc-prismatic' : 'gba-edge'"
        :style="indicatorStyle"
      />

      <button
        type="button"
        class="gbc-btn relative z-10 min-h-[22px] flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-100"
        :class="isMbc ? 'text-[#1d1d1f]' : 'text-zinc-400'"
        :disabled="platformLocked"
        :aria-disabled="platformLocked"
        :title="platformLocked ? 'ROM 操作进行中' : undefined"
        @click="setPlatform('gbc')"
      >
        GB&amp;GBC
      </button>

      <button
        type="button"
        class="gba-btn relative z-10 min-h-[22px] flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-100"
        :class="isMbc ? 'text-zinc-400' : ''"
        :disabled="platformLocked"
        :aria-disabled="platformLocked"
        :title="platformLocked ? 'ROM 操作进行中' : undefined"
        @click="setPlatform('gba')"
      >
        <template v-if="!isMbc">
          <span v-for="(item, index) in gbaChars" :key="index" :style="{ color: item.color }">{{ item.char }}</span>
        </template>
        <template v-else>GBA</template>
      </button>
    </div>
  </div>
</template>