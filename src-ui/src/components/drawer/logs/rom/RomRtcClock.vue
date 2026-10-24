<!-- 顶栏：当前卡带 RTC 时间 + 刷新 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Settings } from '@lucide/vue'
import { useCartData } from '../../../../stores/useCartData'
import { formatRtcClock } from './romFields'

const cart = useCartData()
const { cartInfo, rtcInfo } = storeToRefs(cart)

const rtcClock = computed(() => formatRtcClock(rtcInfo.value))
const visible = computed(() => cartInfo.value?.rtc === true || !!rtcClock.value)

async function onRefresh() {
  if (cart.opRunning) return
  await cart.readRtc()
}
</script>

<template>
  <template v-if="visible">
    <span class="mono truncate text-[10px] text-zinc-300">
      {{ rtcClock || $t('rom.rtc.reading') }}
    </span>
    <button
      type="button"
      data-no-drag
      class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-white"
      :title="$t('rom.rtc.refresh')"
      :aria-label="$t('rom.rtc.refresh')"
      @click="onRefresh"
    >
      <Settings class="h-3 w-3" :stroke-width="2.5" />
    </button>
  </template>
</template>
