<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEmulator } from '../stores/useEmulator'
import { useWindowSync } from '../composables/useWindowSync'
import { useCartData } from '../stores/useCartData'
import { useTaskProgress } from '../stores/useTaskProgress'
import { inTauri } from '../services/cfb'
import WidgetHeader from './WidgetHeader.vue'
import PlatformToggle from './PlatformToggle.vue'
import HomePage from './page/home/HomePage.vue'
import LaunchButton from './LaunchButton.vue'
import RightDrawers from './drawer/RightDrawers.vue'
import CartridgeManager from './cartridge/CartridgeManager.vue'

const emu = useEmulator()
const { logsOpen, shopOpen, settingsOpen } = storeToRefs(emu)
const { drawerOpen: tasksOpen } = storeToRefs(useTaskProgress())
const { addLog } = emu
const cart = useCartData()
const { handleDrop } = cart

const root = ref(null)
useWindowSync(root)

// 任意右侧抽屉展开 → 主栏 320 + 抽屉 440（重叠约 20）≈ 740
const secondPageOpen = computed(() => logsOpen.value || shopOpen.value || settingsOpen.value)
const thirdPageOpen = computed(() => tasksOpen.value && secondPageOpen.value)

const frameWidth = computed(() => {
  if (thirdPageOpen.value) return 1080
  if (secondPageOpen.value) return 740
  return 348
})

// 整窗口拖放识别 ROM / 存档
function handleKeydown(event) {
  if (event.key !== 'Escape') return
  if (tasksOpen.value) {
    tasksOpen.value = false
  } else if (logsOpen.value || shopOpen.value || settingsOpen.value) {
    logsOpen.value = false
    shopOpen.value = false
    settingsOpen.value = false
  } else {
    return
  }
  event.preventDefault()
}

const dragging = ref(false)
let unlistenDrop = null
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
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
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  unlistenDrop?.()
})
</script>

<template>
  <div ref="root" class="relative h-[740px] flex-shrink-0" :style="{ width: frameWidth + 'px' }">
    <div data-no-drag class="absolute inset-y-0 right-0 left-[320px] z-0 cursor-default" />

    <div class="absolute left-0 top-0 z-10 w-[320px]">
      <CartridgeManager />
    </div>

    <div class="absolute inset-x-0 bottom-0 h-[520px]">
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
