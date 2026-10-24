<!-- 任务进度：极窄竖向方格条（单任务，无标题栏）。 -->
<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import { useTaskProgress } from '../../../stores/useTaskProgress'
import TaskPanel from './TaskPanel.vue'

/** 第二层右缘 320+440=760；第三层在其外侧，窗口需加宽才不被裁切 */
const STRIP_WIDTH = 36
const OPEN_LEFT = 760
const CLOSED_LEFT = OPEN_LEFT - STRIP_WIDTH
/** 比 BaseDrawer(20) 再收一截，避开第二层 rounded-r-[18px] 上下角，避免竖条「高出」抽屉 */
const STRIP_INSET = 34

const emulator = useEmulator()
const taskStore = useTaskProgress()
const { logsOpen, shopOpen, settingsOpen, helpOpen } = storeToRefs(emulator)
const { drawerOpen } = storeToRefs(taskStore)
const hasSecondPage = computed(
  () => logsOpen.value || shopOpen.value || settingsOpen.value || helpOpen.value,
)
const drawerVisible = computed(() => drawerOpen.value && hasSecondPage.value)

watch([hasSecondPage, drawerOpen], ([parentOpen, childOpen]) => {
  if (!parentOpen && childOpen) drawerOpen.value = false
}, { immediate: true })

function closeStrip() {
  drawerOpen.value = false
}
</script>

<template>
  <div
    data-no-drag
    class="group/strip absolute"
    :class="drawerVisible ? 'drawer-transition' : ''"
    :style="{
      left: drawerVisible ? OPEN_LEFT + 'px' : CLOSED_LEFT + 'px',
      top: STRIP_INSET + 'px',
      bottom: STRIP_INSET + 'px',
      width: drawerVisible ? STRIP_WIDTH + 'px' : '0px',
      opacity: drawerVisible ? 1 : 0,
      pointerEvents: drawerVisible ? 'auto' : 'none',
      zIndex: 20,
    }"
  >
    <!-- LED 条本体：圆角 + 裁切；关闭钮在外侧 absolute 叠盖，不占条内布局 -->
    <div
      class="h-full w-full overflow-hidden rounded-r-[4px] bg-zinc-950 border-y border-r border-white/10"
    >
      <TaskPanel />
    </div>
    <button
      type="button"
      aria-label="Close"
      class="absolute -top-0.5 -right-0.5 z-10 flex items-center justify-center rounded-sm p-0.5 text-zinc-500 bg-zinc-950/90 opacity-0 transition-opacity group-hover/strip:opacity-100 hover:text-white"
      @click.stop="closeStrip"
    >
      <X class="w-3 h-3" :stroke-width="2.5" />
    </button>
  </div>
</template>
