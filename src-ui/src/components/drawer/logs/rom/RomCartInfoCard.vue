<!-- 左侧：当前卡带信息（无白框，与右侧对比） -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useCartData } from '../../../../stores/useCartData'
import { useConnection } from '../../../../stores/useConnection'
import { buildRomFields, romDisplayRows } from './romFields'
import RomFieldGrid from './RomFieldGrid.vue'

const { t } = useI18n()
const cart = useCartData()
const conn = useConnection()
const { cartInfo, flashInfo, cartReading, cartError } = storeToRefs(cart)

const detail = computed(() => buildRomFields(cartInfo.value))

/** 无字段数据时的状态文案，填入 Game Name 行，保持与有数据时相同的标题+值布局 */
const statusHint = computed(() => {
  if (conn.needsSelection) return t('conn.selectHint')
  if (!conn.isConnected) return t('rom.hint.connect')
  if (cartReading.value) return t('rom.hint.reading')
  if (detail.value || flashInfo.value) return null
  if (cartError.value) return cartError.value
  return t('rom.hint.empty')
})

const romRows = computed(() => {
  const rows = romDisplayRows(detail.value, t, { placeholder: statusHint.value })
  if (detail.value?.hasGame) return rows
  const tone = cartError.value && !detail.value ? 'bad' : 'muted'
  return rows.map((row, i) => (i === 0 ? { ...row, tone } : { ...row, tone: 'muted' }))
})
</script>

<template>
  <div class="min-w-0 flex-1 px-1 py-1 text-zinc-100">
    <div class="mb-2 text-[8px] font-black uppercase tracking-widest text-zinc-500">
      {{ $t('rom.side.cart') }}
    </div>
    <RomFieldGrid :rows="romRows" on-dark />
  </div>
</template>
