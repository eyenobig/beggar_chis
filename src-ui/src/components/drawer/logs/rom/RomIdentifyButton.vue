<!-- 识别当前卡带（刷新图标，悬停显示文案） -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshCw } from '@lucide/vue'
import { useCartData } from '../../../../stores/useCartData'
import { useConnection } from '../../../../stores/useConnection'

const cart = useCartData()
const conn = useConnection()
const { cartReading, opRunning } = storeToRefs(cart)

const disabled = computed(
  () => opRunning.value || cartReading.value || !conn.isConnected,
)

async function onIdentify() {
  if (disabled.value) return
  await cart.readCart()
}
</script>

<template>
  <button
    type="button"
    data-no-drag
    class="group relative inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-white disabled:opacity-40"
    :disabled="disabled"
    :aria-label="$t('rom.identify')"
    @click="onIdentify"
  >
    <RefreshCw
      class="h-3.5 w-3.5 transition-opacity group-hover:opacity-0"
      :class="cartReading ? 'animate-spin' : ''"
      :stroke-width="2.5"
    />
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-black opacity-0 transition-opacity group-hover:opacity-100">
      {{ $t('rom.identify') }}
    </span>
  </button>
</template>
