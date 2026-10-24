<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window'
import { useEmulator } from '../stores/useEmulator'
import { useConnection } from '../stores/useConnection'
import { useWindowSync } from '../composables/useWindowSync'
import { useCartData } from '../stores/useCartData'
import { useTaskProgress } from '../stores/useTaskProgress'
import { useToast } from '../stores/useToast'
import { useCfbSettings } from '../stores/useCfbSettings'
import { inTauri } from '../services/cfb'
import { applyUiScale, normalizeUiScale, UI_SCALE_STEP } from '../services/uiScale'
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
const conn = useConnection()
const { directPlay } = storeToRefs(conn)
const { drawerOpen: tasksOpen } = storeToRefs(useTaskProgress())
const { addLog, closeDrawers } = emu
const cart = useCartData()
const { flashInfo, opRunning, opKind } = storeToRefs(cart)
const { handleDrop } = cart
const toastStore = useToast()
const { paperHeight: toastPaperHeight } = storeToRefs(toastStore)
const { thermalPaper, cartridgeStage, cartridgeStickers, uiScale } = storeToRefs(useCfbSettings())

const root = ref(null)
const homepageDropZone = ref(null)

const BOOKMARK_W = 28
/** 刀口高度；absolute 吐纸在卡片下，需计入窗口底部预留 */

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
 * 热敏纸：**固定高度预留**（不随 toast 数量变化——窗口高度稳定不因纸伸缩）。
 * 纸在该条带内滚动吐出（可见井 480），累积到窗口高度由 ToastHost 自动撕落；
 * 特殊情况超出窗口底部的部分由 body{overflow:hidden} 裁掉。
 */
const PAPER_AREA_H = 180 + 14 + 16 // 可见吐纸井(180) + 刀口 + 底距；与 ToastHost.SPIT_AREA_H 保持一致
const toastBottomInset = computed(() => (thermalPaper.value ? PAPER_AREA_H : 0))

const frameWidth = computed(() => {
  if (thirdPageOpen.value) return 796 + BOOKMARK_W
  if (secondPageOpen.value) return 760 + BOOKMARK_W
  return 348 + BOOKMARK_W
})

const { resync: resyncWindow } = useWindowSync(root, [cartridgeTopInset, toastBottomInset, frameWidth, thermalPaper])

/** UI 缩放应用后重测窗口：zoom 不改变布局 px，ResizeObserver 对 zoom 变化不触发 */
function onUiScaleApplied() {
  resyncWindow()
}

/** Alt+方向键微调窗口位置（逻辑像素步进，支持负坐标） */
async function moveWindowBy(dx, dy) {
  if (!inTauri) return
  try {
    const w = getCurrentWindow()
    const [pos, scale] = await Promise.all([w.outerPosition(), w.scaleFactor()])
    await w.setPosition(
      new LogicalPosition(
        Math.round(pos.x / scale) + dx,
        Math.round(pos.y / scale) + dy,
      ),
    )
  } catch (err) {
    console.warn('[moveWindowBy]', err)
  }
}

function handleKeydown(event) {
  // SkyEmu 会话中拦截刷新（F5 / Ctrl+R / Ctrl+Shift+R）：刷新会丢会话状态，
  // 且串口在 SkyEmu 手里，刷新后的 detect 只会报占用
  if (
    directPlay.value &&
    (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r'))
  ) {
    event.preventDefault()
    event.stopPropagation()
    toastStore.error(t('launch.refreshBlocked'))
    return
  }
  // 快捷键调缩放（与滑块同一 commit 通道）：Ctrl+Shift+U 放大 / Ctrl+Shift+D 缩小
  if (event.ctrlKey && event.shiftKey && (event.code === 'KeyU' || event.code === 'KeyD')) {
    event.preventDefault()
    const step = event.code === 'KeyU' ? UI_SCALE_STEP : -UI_SCALE_STEP
    const next = normalizeUiScale(uiScale.value + step)
    if (next !== uiScale.value) {
      uiScale.value = next
      applyUiScale(next)
      toastStore.success(`UI ${Math.round(next * 100)}%`)
    }
    return
  }
  // Alt+方向键：手动微调窗口位置。窗口比屏幕高时（如 200% 缩放），鼠标拖拽
  // 受光标停在屏幕边缘的物理限制推不到顶，键盘可移到任意位置（含负坐标）
  if (event.altKey && event.key.startsWith('Arrow')) {
    event.preventDefault()
    const delta = {
      ArrowUp: [0, -60],
      ArrowDown: [0, 60],
      ArrowLeft: [-60, 0],
      ArrowRight: [60, 0],
    }[event.key]
    moveWindowBy(...delta)
    return
  }
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
  // Tauri 给物理像素；CSS zoom（UI 缩放）会放大 gBCR 矩形，需按 DPI×zoom 归一
  const scaleFactor =
    (window.devicePixelRatio || 1) * (parseFloat(document.documentElement.style.zoom) || 1)
  const point = typeof position.toLogical === "function"
    ? position.toLogical(scaleFactor)
    : { x: position.x / scaleFactor, y: position.y / scaleFactor }
  const rect = el.getBoundingClientRect()
  return point.x >= rect.left && point.x <= rect.right
    && point.y >= rect.top && point.y <= rect.bottom
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('ui-scale-applied', onUiScaleApplied)
  await nextTick()
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
  window.removeEventListener('ui-scale-applied', onUiScaleApplied)
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
