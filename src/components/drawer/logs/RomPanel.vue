<!-- ROM 页：顶栏 / 卡带与 ROM 文件 / 烧录三按钮 + 存档四按钮（并存，紧凑高度） -->
<script setup>
import { storeToRefs } from 'pinia'
import { RefreshCw } from '@lucide/vue'
import { useDragScroll } from '../../../composables/useDragScroll'
import BurnControls from '../tasks/BurnControls.vue'
import SaveControls from '../tasks/SaveControls.vue'
import RomHeaderBar from './rom/RomHeaderBar.vue'
import RomCartInfoCard from './rom/RomCartInfoCard.vue'
import RomFileCard from './rom/RomFileCard.vue'
import { useCartData } from '../../../stores/useCartData'

const { scrollBind } = useDragScroll()
const cart = useCartData()
const { cartReading } = storeToRefs(cart)
</script>

<template>
  <!-- relative 外层定位遮罩；内层 overflow-auto 承载可滚动内容，遮罩不随内容滚动 -->
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      data-drawer-scroll
      class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain no-scrollbar [touch-action:pan-y]"
      v-bind="scrollBind"
    >
      <RomHeaderBar />
      <div class="flex shrink-0 items-stretch gap-2 px-3 py-1.5">
        <RomCartInfoCard />
        <RomFileCard />
      </div>
      <BurnControls />
      <SaveControls />
    </div>

    <!-- 识别/读取卡带时的 loading 遮罩：盖住 ROM 内容区，tab 栏在 LogsDrawer 之外故不受影响 -->
    <div
      v-if="cartReading"
      class="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-zinc-900/80 backdrop-blur-[2px]"
    >
      <RefreshCw class="h-5 w-5 animate-spin text-zinc-300" :stroke-width="2.5" />
      <span class="text-[10px] font-bold text-zinc-300">{{ $t('rom.hint.reading') }}</span>
    </div>
  </div>
</template>
