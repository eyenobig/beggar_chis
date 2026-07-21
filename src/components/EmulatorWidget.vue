<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEmulator } from '../stores/useEmulator'
import { useWindowSync } from '../composables/useWindowSync'
import { useCartData } from '../stores/useCartData'
import { inTauri } from '../composables/useCfb'
import WidgetHeader from './WidgetHeader.vue'
import PlatformToggle from './PlatformToggle.vue'
import HomePage from './page/home/HomePage.vue'
import LaunchButton from './LaunchButton.vue'
import RightDrawers from './drawer/RightDrawers.vue'

const emu = useEmulator()
const { logsOpen, shopOpen, settingsOpen } = storeToRefs(emu)
const { addLog } = emu
const cart = useCartData()
const { handleDrop } = cart

const root = ref(null)
useWindowSync(root)

// 任意右侧抽屉展开 → 主栏 320 + 抽屉 440（重叠约 20）≈ 740
const frameWidth = computed(() =>
  logsOpen.value || shopOpen.value || settingsOpen.value
    ? 740
    : 348,
)

// 整窗口拖放识别 ROM / 存档
const dragging = ref(false)
let unlistenDrop = null
onMounted(async () => {
  addLog('System initialized. Awaiting connection.')
  if (inTauri) {
    try {
      unlistenDrop = await getCurrentWebview().onDragDropEvent((e) => {
        const t = e.payload?.type
        if (t === 'over' || t === 'enter') dragging.value = true
        else if (t === 'leave') dragging.value = false
        else if (t === 'drop') {
          dragging.value = false
          handleDrop(e.payload.paths || [])
        }
      })
    } catch { /* 非 Tauri 或不支持 */ }
  }
})
onUnmounted(() => unlistenDrop?.())
</script>

<template>
  <div ref="root" class="relative h-[520px] flex-shrink-0" :style="{ width: frameWidth + 'px' }">
    <div class="absolute inset-0">
      <div class="widget-container absolute inset-0 z-20" style="width: 320px">
        <WidgetHeader />
        <PlatformToggle />

        <div class="relative flex-1 flex flex-col overflow-hidden bg-white">
          <main
            class="flex-1 px-5 py-3 space-y-4 overflow-y-auto no-scrollbar relative z-0"
            data-no-drag
          >
            <HomePage />
          </main>

          <!-- 拖放高亮 -->
          <div
            v-if="dragging"
            class="absolute inset-0 z-30 m-3 rounded-2xl border-2 border-dashed border-zinc-900/60 bg-white/70 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
          >
            <span class="text-xs font-black text-zinc-700">拖入 ROM / 存档</span>
          </div>
        </div>

        <LaunchButton />
      </div>

      <RightDrawers />
    </div>
  </div>
</template>
