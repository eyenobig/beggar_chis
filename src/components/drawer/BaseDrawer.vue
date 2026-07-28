<!-- 抽屉基类（右侧）：深色面板从右侧滑出，宽度 width，open 控制开合。 -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: Boolean,
  width: { type: Number, default: 440 },
  left: { type: Number, default: 320 },
  top: { type: Number, default: 20 },
  /** 上下都留白，贴齐主栏视觉边距 */
  bottom: { type: Number, default: 20 },
  animate: { type: Boolean, default: true },
  zIndex: { type: Number, default: 10 },
})

const outerStyle = computed(() => {
  if (props.open) {
    return { left: props.left + 'px', top: props.top + 'px', bottom: props.bottom + 'px', width: props.width + 'px', opacity: 1, pointerEvents: 'auto', transform: 'translateX(0)', zIndex: props.zIndex }
  }
  return {
    left: props.left + 'px',
    top: props.top + 'px',
    bottom: props.bottom + 'px',
    width: '0px',
    opacity: props.animate ? 0 : 1,
    pointerEvents: 'none',
    // 从右侧滑入，避免 translateX(-N) 短暂压住主栏「识别」按钮
    transform: props.animate ? 'translateX(12px)' : 'none',
    zIndex: props.zIndex,
  }
})
</script>

<template>
  <div
    data-no-drag
    class="absolute overflow-hidden rounded-r-[18px]"
    :class="animate ? 'drawer-transition' : ''"
    :style="outerStyle"
  >
    <div
      class="absolute top-0 left-0 flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-950 border-y border-r border-white/10 rounded-r-[18px] pl-[20px]"
      :style="{ width: width + 'px' }"
    >
      <slot />
    </div>
  </div>
</template>
