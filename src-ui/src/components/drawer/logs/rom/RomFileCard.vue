<!-- 右侧：待写入 ROM 文件（白框，与左侧对比） -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Upload } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useCartData } from '../../../../stores/useCartData'
import { buildRomFields, romDisplayRows } from './romFields'
import RomFieldGrid from './RomFieldGrid.vue'

const { t } = useI18n()
const cart = useCartData()
const { romFile, romFileInfo, opRunning } = storeToRefs(cart)

const detail = computed(() => {
  if (romFileInfo.value) return buildRomFields(romFileInfo.value)
  if (!romFile.value) return null
  return {
    gameName: romFile.value.name,
    romTitle: romFile.value.name,
    codeRev: '—',
    cartType: '—',
    headerChecksum: '—',
    headerOk: null,
    kind: romFile.value.mbc ? 'gb_mbc' : 'gba',
    hasGame: true,
  }
})

const rows = computed(() => romDisplayRows(detail.value, t))

function onPick() {
  cart.pickRomFile()
}
</script>

<template>
  <button
    v-if="!detail"
    data-no-drag
    type="button"
    class="flex w-[28%] shrink-0 flex-col items-center justify-center gap-1.5 rounded-md bg-white px-2 text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
    :disabled="opRunning"
    @click="onPick"
  >
    <Upload class="h-5 w-5" :stroke-width="2.5" />
    <span class="text-[9px] font-black">{{ $t('rom.upload') }}</span>
  </button>
  <button
    v-else
    data-no-drag
    type="button"
    class="flex w-[42%] shrink-0 flex-col rounded-md bg-white px-2.5 py-2 text-left text-zinc-950 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
    :disabled="opRunning"
    :title="$t('rom.replace')"
    @click="onPick"
  >
    <div class="mb-2 flex items-center justify-between gap-1">
      <span class="text-[8px] font-black uppercase tracking-widest text-zinc-400">
        {{ $t('rom.side.file') }}
      </span>
      <span class="inline-flex items-center gap-0.5 text-[8px] font-black text-zinc-500">
        <Upload class="h-3 w-3" />
        {{ $t('rom.replace') }}
      </span>
    </div>
    <RomFieldGrid :rows="rows" dense />
  </button>
</template>
