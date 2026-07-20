<!-- 抽屉基类（右侧）：深色面板从右侧滑出，宽度 width，open 控制开合。 -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: Boolean,
  width: { type: Number, default: 440 },
  animate: { type: Boolean, default: true },
})

const outerStyle = computed(() => {
  if (props.open) {
    return { width: props.width + 'px', opacity: 1, pointerEvents: 'auto', transform: 'translateX(0)' }
  }
  return {
    width: '0px',
    opacity: props.animate ? 0 : 1,
    pointerEvents: 'none',
    transform: props.animate ? 'translateX(-10px)' : 'none',
  }
})
</script>

<template>
  <div
    data-no-drag
    class="absolute top-[24px] bottom-[88px] overflow-hidden left-[300px] z-10"
    :class="animate ? 'drawer-transition' : ''"
    :style="outerStyle"
  >
    <div
      class="absolute top-0 left-0 h-full bg-zinc-950 border-y border-r border-white/10 rounded-r-[24px] pl-[20px] flex flex-col"
      :style="{ width: width + 'px' }"
    >
      <slot />
    </div>
  </div>
</template>
