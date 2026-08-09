<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEmulator } from '../stores/useEmulator'
import { useWindowSync } from '../composables/useWindowSync'
import { useCartData } from '../stores/useCartData'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'
import { useCfbSettings } from '../stores/useCfbSettings'
import { inTauri } from '../services/cfb'
import WidgetHeader from './WidgetHeader.vue'
import PlatformToggle from './PlatformToggle.vue'
import HomePage from './page/home/HomePage.vue'
import LaunchButton from './LaunchButton.vue'
import RightDrawers from './drawer/RightDrawers.vue'
import ToastHost from './ui/ToastHost.vue'
import CartridgeManager from './cartridge/CartridgeManager.vue'
import RomCartridgeSlider from './drawer/logs/rom/RomCartridgeSlider.vue'

const emu = useEmulator()
const { t } = useI18n()
const { logsOpen, shopOpen, settingsOpen, helpOpen, romShelfCollapsed } = storeToRefs(emu)
const { drawerOpen: tasksOpen } = storeToRefs(useTaskProgress())
const { addLog, closeDrawers } = emu
const cart = useCartData()
const { flashInfo, opRunning, opKind } = storeToRefs(cart)
const { handleDrop } = cart
const toastStore = useToast()
const { paperHeight: toastPaperHeight } = storeToRefs(toastStore)
const { thermalPaper, cartridgeStage, cartridgeStickers } = storeToRefs(useCfbSettings())

const root = ref(null)
const homepageDropZone = ref(null)

const BOOKMARK_W = 28
/** 吐纸区上限（与 ToastHost.SPIT_AREA_H 一致） */
const SPIT_H = 480
const SPIT_PAD = 16
/** 刀口高度；absolute 吐纸在卡片下，需计入窗口底部预留 */
const CUTTER_H = 14

const secondPageOpen = computed(
  () => logsOpen.value || shopOpen.value || settingsOpen.value || helpOpen.value,
)
const thirdPageOpen = computed(() => tasksOpen.value && secondPageOpen.value)
const cartridgeStageOpen = computed(() => cartridgeStage.value && !!flashInfo.value)
const romCartridgeShelfOpen = computed(
  () => cartridgeStickers.value && cartridgeStageOpen.value && logsOpen.value,
)
/** 卡带舞台预留高度（贴纸架贴在其右侧上沿，折叠后只留顶栏）。 */
const CARTRIDGE_STAGE_H = 220
const cartridgeTopInset = computed(() => (cartridgeStageOpen.value ? CARTRIDGE_STAGE_H : 0))
/** 展开贴齐抽屉；折叠时信息 bar 再上移一点。 */
const romShelfStyle = computed(() => {
  const lift = romShelfCollapsed.value ? 10 : 0
  return {
    left: `${BOOKMARK_W + 320}px`,
    top: `${cartridgeTopInset.value + 20}px`,
    transform: `translateY(calc(-100% - ${lift}px))`,
  }
})
const platformOperationLocked = computed(() =>
  opRunning.value && ['burn', 'erase', 'dump'].includes(opKind.value),
)

/**
 * 热敏纸：absolute 吐纸，用 padding 预留高度（勿把 Toast 做成 z 高于抽屉的文档流兄弟，会挡点击）。
 * 关闭热敏纸：Teleport banner，不占底。
 */
const toastBottomInset = computed(() => {
  if (!thermalPaper.value) return 0
  const live = Number(toastPaperHeight.value) || 0
  const paper = Math.min(Math.max(live, 0), SPIT_H)
  return paper + CUTTER_H + SPIT_PAD
})

const frameWidth = computed(() => {
  if (thirdPageOpen.value) return 796 + BOOKMARK_W
  if (secondPageOpen.value) return 760 + BOOKMARK_W
  return 348 + BOOKMARK_W
})

useWindowSync(root, [cartridgeTopInset, toastBottomInset, frameWidth, thermalPaper])

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
  addLog(t('logs.systemInit'))
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
    高度随内容：paddingTop 预留卡带，paddingBottom 预留 absolute 吐纸。
    Toast 必须挂在左栏 320 内（勿做成更高 z 的文档流兄弟，否则挡抽屉点击）。
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
    <!-- 右侧透明拖拽区：绝不能抢抽屉点击 -->
    <div
      class="pointer-events-none absolute inset-y-0 right-0 z-0"
      :style="{ left: (320 + BOOKMARK_W) + 'px' }"
    />

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
        :style="romShelfStyle"
      >
        <RomCartridgeSlider />
      </div>
    </Transition>

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
              <span class="text-xs font-black text-zinc-700">{{ $t('home.dropOverlay') }}</span>
            </div>
          </div>
        </div>

        <!-- 左栏内 absolute 吐纸 / banner；外层 pointer-events 由 ToastHost 控制 -->
        <ToastHost :thermal="thermalPaper" />
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
