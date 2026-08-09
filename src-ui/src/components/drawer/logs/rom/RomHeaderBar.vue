<!-- 顶栏：卡带型号 + RTC + 校验结果 + 识别 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartData } from '../../../../stores/useCartData'
import { kindLabel } from './romFields'
import RomRtcClock from './RomRtcClock.vue'
import RomChecksumBadge from './RomChecksumBadge.vue'
import RomIdentifyButton from './RomIdentifyButton.vue'

const cart = useCartData()
const { cartInfo, flashInfo } = storeToRefs(cart)

const cartModel = computed(() => {
  const kind = cartInfo.value?.kind || flashInfo.value?.kind
  return kindLabel(kind) || null
})
</script>

<template>
  <div class="flex shrink-0 items-center justify-between gap-2 px-4 pt-2">
    <div class="flex min-w-0 items-center gap-2">
      <span
        v-if="cartModel"
        class="text-[10px] font-black uppercase tracking-widest text-zinc-400"
      >{{ cartModel }}</span>
      <RomRtcClock />
      <RomChecksumBadge />
    </div>
    <RomIdentifyButton />
  </div>
</template>
