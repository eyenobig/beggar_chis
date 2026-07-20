<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmulator } from '../stores/useEmulator'

const emu = useEmulator()
const { emulatorState, bootProgress } = storeToRefs(emu)
const { toggleEmulator } = emu

const isBooting = computed(() => emulatorState.value === 'booting')
const isRunning = computed(() => emulatorState.value === 'running')

const btnClass = computed(() => {
  if (isBooting.value) {
    return 'w-full mt-2 bg-zinc-100 text-zinc-900 border border-zinc-200 hover:bg-zinc-200 cursor-wait h-12 rounded-xl flex items-center justify-center gap-2 transition-all relative overflow-hidden'
  }
  if (isRunning.value) {
    return 'w-full mt-2 bg-red-500 text-white border border-transparent hover:bg-red-600 active:scale-95 shadow-lg h-12 rounded-xl flex items-center justify-center gap-2 transition-all relative overflow-hidden group'
  }
  return 'w-full mt-2 bg-zinc-900 text-white border border-transparent hover:bg-black active:scale-95 shadow-lg h-12 rounded-xl flex items-center justify-center gap-2 transition-all relative overflow-hidden group'
})

const btnLabel = computed(() => {
  if (isBooting.value) return 'Booting Core...'
  if (isRunning.value) return 'Stop Emulator'
  return 'Launch Emulator'
})
</script>

<template>
  <div class="p-4 bg-white relative border-t border-zinc-100 shrink-0 z-10">
    <!-- 启动进度条 -->
    <div
      v-if="isBooting"
      class="absolute top-0 left-4 right-4 h-1 bg-zinc-100 rounded-b-lg overflow-hidden"
    >
      <div
        class="h-full bg-zinc-900 flash-progress progress-stripe"
        :style="{ width: `${bootProgress}%` }"
      ></div>
    </div>

    <button :class="btnClass" data-no-drag @click="toggleEmulator">
      <!-- Booting: 旋转加载图标 -->
      <svg v-if="isBooting" class="w-4 h-4 z-10 relative animate-spin" fill="none" viewBox="0 0 24 24">
        <path d="M12 4V2M12 22v-2M4 12H2m20 0h-2m-2.05-6.95l1.41-1.41M4.64 19.36l1.41-1.41m13.31 0l-1.41-1.41M4.64 4.64l1.41 1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <!-- Running: 方形停止图标 -->
      <svg v-else-if="isRunning" class="w-4 h-4 z-10 relative transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
      <!-- Stopped: 三角播放图标 -->
      <svg v-else class="w-4 h-4 z-10 relative transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span class="text-[10px] font-black uppercase tracking-[0.2em] z-10 relative mt-0.5">{{ btnLabel }}</span>
    </button>
  </div>
</template>
