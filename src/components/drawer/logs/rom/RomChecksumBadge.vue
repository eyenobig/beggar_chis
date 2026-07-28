<!-- 顶栏：当前卡带 Header/ROM 校验结果（绿通过 / 红失败） -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartData } from '../../../../stores/useCartData'
import { buildRomFields } from './romFields'

const cart = useCartData()
const { cartInfo } = storeToRefs(cart)

const detail = computed(() => buildRomFields(cartInfo.value))

const text = computed(() => {
  const d = detail.value
  if (!d || d.headerOk == null) return null
  return d.headerChecksum
})

const toneClass = computed(() => {
  const ok = detail.value?.headerOk
  if (ok === true) return 'text-emerald-400'
  if (ok === false) return 'text-red-400'
  return 'text-zinc-500'
})
</script>

<template>
  <span
    v-if="text"
    class="mono truncate text-[10px] font-medium"
    :class="toneClass"
    :title="$t('rom.field.romChecksum')"
  >{{ text }}</span>
</template>
