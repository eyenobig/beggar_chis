<!-- 抽屉基类（右侧）：深色面板从右侧滑出；仅标题栏可上下拖拽，内容区保持滚动。 -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmulator } from '../../stores/useEmulator'

const props = defineProps({
  open: Boolean,
  width: { type: Number, default: 440 },
  left: { type: Number, default: 320 },
  top: { type: Number, default: 20 },
  /** 上下都留白，贴齐主栏视觉边距 */
  bottom: { type: Number, default: 20 },
  animate: { type: Boolean, default: true },
  zIndex: { type: Number, default: 10 },
  /** 顶部与贴纸架贴齐时取消右上圆角，避免折叠后仍留弧形缝 */
  flushTop: { type: Boolean, default: false },
})

const EDGE = 8
const emu = useEmulator()
const { drawerOffsetY } = storeToRefs(emu)

const dragging = ref(false)
let dragPointerId = null
let dragStartClientY = 0
let dragStartOffset = 0

const clampedOffset = computed(() => clampOffset(drawerOffsetY.value))

function clampOffset(value) {
  const min = -(props.top - EDGE)
  const max = props.bottom - EDGE
  return Math.min(max, Math.max(min, value))
}

watch(
  () => [props.top, props.bottom],
  () => {
    drawerOffsetY.value = clampOffset(drawerOffsetY.value)
  },
)

const outerStyle = computed(() => {
  const y = clampedOffset.value
  const top = props.top + y
  const bottom = props.bottom - y
  if (props.open) {
    return {
      left: props.left + 'px',
      top: top + 'px',
      bottom: bottom + 'px',
      width: props.width + 'px',
      opacity: 1,
      pointerEvents: 'auto',
      transform: 'translateX(0)',
      zIndex: props.zIndex,
    }
  }
  return {
    left: props.left + 'px',
    top: top + 'px',
    bottom: bottom + 'px',
    width: '0px',
    opacity: props.animate ? 0 : 1,
    pointerEvents: 'none',
    // 从右侧滑入，避免 translateX(-N) 短暂压住主栏「识别」按钮
    transform: props.animate ? 'translateX(12px)' : 'none',
    zIndex: props.zIndex,
  }
})

const roundClass = computed(() =>
  props.flushTop ? 'rounded-br-[18px] rounded-tr-none' : 'rounded-r-[18px]',
)

function isInteractive(target) {
  return !!target?.closest?.(
    'button, a, input, select, textarea, label, [role="button"], [data-no-drawer-drag]',
  )
}

function onWindowPointerMove(event) {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  const delta = event.clientY - dragStartClientY
  drawerOffsetY.value = clampOffset(dragStartOffset + delta)
}

function endDrag(event) {
  if (!dragging.value) return
  if (event?.pointerId != null && event.pointerId !== dragPointerId) return
  dragging.value = false
  dragPointerId = null
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function onPointerDown(event) {
  if (!props.open || event.button !== 0) return
  // 只认标题栏；内容区滚动交给 panel，绝不在根节点 capture 指针
  const handle = event.target?.closest?.('[data-drawer-drag]')
  if (!handle || isInteractive(event.target)) return
  // 若点在可滚动内容里，绝不开始挪抽屉
  if (event.target?.closest?.('[data-drawer-scroll]')) return

  dragging.value = true
  dragPointerId = event.pointerId
  dragStartClientY = event.clientY
  dragStartOffset = clampedOffset.value
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  event.preventDefault()
}

onBeforeUnmount(() => {
  endDrag()
})
</script>

<template>
  <div
    data-no-drag
    class="absolute overflow-hidden"
    :class="[
      animate && !dragging ? 'drawer-transition' : '',
      dragging ? 'drawer-dragging' : '',
      roundClass,
    ]"
    :style="outerStyle"
    @pointerdown="onPointerDown"
  >
    <div
      class="absolute top-0 left-0 flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-white/10 bg-zinc-950 pl-[20px]"
      :class="[roundClass, flushTop ? 'border-b' : 'border-y']"
      :style="{ width: width + 'px' }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.drawer-dragging {
  cursor: grabbing;
  user-select: none;
  transition: none !important;
}
</style>
