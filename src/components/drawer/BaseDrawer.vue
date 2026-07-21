<!-- 抽屉基类（右侧）：深色面板从右侧滑出，宽度 width，open 控制开合。 -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: Boolean,
  width: { type: Number, default: 440 },
  left: { type: Number, default: 300 },
  top: { type: Number, default: 20 },
  bottom: { type: Number, default: 112 },
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
    transform: props.animate ? 'translateX(-10px)' : 'none',
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
      class="absolute top-0 left-0 h-full overflow-hidden bg-zinc-950 border-y border-r border-white/10 rounded-r-[18px] pl-[20px] flex flex-col"
      :style="{ width: width + 'px' }"
    >
      <slot />
    </div>
  </div>
</template>
