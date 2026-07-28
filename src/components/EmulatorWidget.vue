<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEmulator } from '../stores/useEmulator'
import { useWindowSync } from '../composables/useWindowSync'
import { useCartData } from '../stores/useCartData'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'
import { inTauri } from '../services/cfb'
import WidgetHeader from './WidgetHeader.vue'
import PlatformToggle from './PlatformToggle.vue'
import HomePage from './page/home/HomePage.vue'
import LaunchButton from './LaunchButton.vue'
import RightDrawers from './drawer/RightDrawers.vue'
import ToastHost from './ui/ToastHost.vue'
import CartridgeManager from './cartridge/CartridgeManager.vue'
import RomCartridgeSlider from './drawer/logs/rom/RomCartridgeSlider.vue'

/** 吐纸区上限（与 ToastHost.SPIT_AREA_H 一致） */
const SPIT_H = 480
const SPIT_PAD = 16
/** 刀口+齿孔高度，绝对吐纸在卡片下，需一并计入窗口底部预留 */
const CUTTER_H = 14

const emu = useEmulator()
const { logsOpen, shopOpen, settingsOpen, helpOpen } = storeToRefs(emu)
const { drawerOpen: tasksOpen } = storeToRefs(useTaskProgress())
const { addLog, closeDrawers } = emu
const cart = useCartData()
const { flashInfo, opRunning, opKind } = storeToRefs(cart)
const { handleDrop } = cart
const toastStore = useToast()

const root = ref(null)
const homepageDropZone = ref(null)

const BOOKMARK_W = 28

const secondPageOpen = computed(
  () => logsOpen.value || shopOpen.value || settingsOpen.value || helpOpen.value,
)
const thirdPageOpen = computed(() => tasksOpen.value && secondPageOpen.value)
const cartridgeStageOpen = computed(() => !!flashInfo.value)
const romCartridgeShelfOpen = computed(() => cartridgeStageOpen.value && logsOpen.value)
const platformOperationLocked = computed(() =>
  opRunning.value && ['burn', 'erase', 'dump'].includes(opKind.value),
)
const cartridgeTopInset = computed(() => (cartridgeStageOpen.value ? 220 : 0))

/**
 * 吐纸槽始终留刀口占位；有纸时按实际纸高预留（跟内容等高，不垫高）。
 * 用 root padding，不进主栏文档流。
 */
const toastBottomInset = computed(() => {
  const live = Number(toastStore.paperHeight) || 0
  const paper = Math.min(Math.max(live, 0), SPIT_H)
  return paper + CUTTER_H + SPIT_PAD
})

const frameWidth = computed(() => {
  if (thirdPageOpen.value) return 796 + BOOKMARK_W
  if (secondPageOpen.value) return 760 + BOOKMARK_W
  return 348 + BOOKMARK_W
})

useWindowSync(root, [cartridgeTopInset, toastBottomInset, frameWidth])

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  if (tasksOpen.value) {
    tasksOpen.value = false
  } else if (secondPageOpen.value) {
    closeDrawers()
  } else {
    return
  }
  event.preventDefault()
}

const dragging = ref(false)
let unlistenDrop = null

function isOverHomepage(position) {
  const el = homepageDropZone.value
  if (!el || !position) return false
  const scaleFactor = window.devicePixelRatio || 1
  const point = typeof position.toLogical === 'function'
    ? position.toLogical(scaleFactor)
    : { x: position.x / scaleFactor, y: position.y / scaleFactor }
  const rect = el.getBoundingClientRect()
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  addLog('System initialized. Awaiting connection.')
  if (inTauri) {
    try {
      unlistenDrop = await getCurrentWebview().onDragDropEvent((e) => {
        const t = e.payload?.type
        if (t === 'over' || t === 'enter') dragging.value = isOverHomepage(e.payload.position)
        else if (t === 'leave') dragging.value = false
        else if (t === 'drop') {
          const accepted = isOverHomepage(e.payload.position)
          dragging.value = false
          if (accepted) handleDrop(e.payload.paths || [])
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
  <!--
    高度随内容：只用 padding 预留卡带 / 吐纸，不再写死 520 把 SkyEmu 下面撑出空白。
    窗口同步读 border-box（含 padding）。
  -->
  <div
    ref="root"
    class="relative inline-flex flex-col flex-shrink-0"
    :style="{
      width: frameWidth + 'px',
      paddingTop: cartridgeTopInset + 'px',
      paddingBottom: toastBottomInset + 'px',
      boxSizing: 'border-box',
    }"
  >
    <div class="absolute inset-y-0 right-0 z-0" :style="{ left: (320 + BOOKMARK_W) + 'px' }" />

    <div
      v-if="cartridgeStageOpen"
      id="homepage-cartridge-slot"
      class="absolute z-10 w-[320px] pointer-events-none"
      :style="{ left: BOOKMARK_W + 'px', top: '0px' }"
    >
      <CartridgeManager />
    </div>

    <Transition name="rom-shelf-fade">
      <div
        v-if="romCartridgeShelfOpen"
        data-no-drag
        class="absolute z-30 w-[440px] overflow-visible bg-transparent"
        :style="{ left: (BOOKMARK_W + 320) + 'px', top: (cartridgeTopInset + 20) + 'px', transform: 'translateY(-100%)' }"
      >
        <RomCartridgeSlider />
      </div>
    </Transition>

    <!-- 主栏随内容增高；Toast 绝对定位在卡片外下沿 -->
    <div
      class="relative z-20 overflow-visible"
      :style="{ marginLeft: BOOKMARK_W + 'px' }"
    >
      <div class="relative z-20 w-[320px]">
        <div class="widget-container relative w-full">
          <WidgetHeader />
          <PlatformToggle :operation-locked="platformOperationLocked" />

          <div class="relative flex flex-col overflow-hidden bg-white">
            <div
              ref="homepageDropZone"
              class="relative z-0 overflow-visible"
            >
              <main class="space-y-3 px-5 pt-3 pb-1" data-no-drag>
                <HomePage />
              </main>
              <LaunchButton />
            </div>

            <div
              v-if="dragging"
              class="pointer-events-none absolute inset-0 z-30 m-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-zinc-900/60 bg-white/70 backdrop-blur-[1px]"
            >
              <span class="text-xs font-black text-zinc-700">拖入 ROM / 存档</span>
            </div>
          </div>
        </div>

        <ToastHost />
      </div>

      <RightDrawers />
    </div>
  </div>
</template>

<style scoped>
.rom-shelf-fade-enter-active,
.rom-shelf-fade-leave-active {
  transition: opacity 220ms ease;
}
.rom-shelf-fade-enter-from,
.rom-shelf-fade-leave-to {
  opacity: 0;
}
</style>
