<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Download, Flame, Trash2 } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'

const cart = useCartData()
const {
  currentFile,
  flashInfo,
  opRunning,
  opKind,
  progress,
  progressPct,
  opResult,
} = storeToRefs(cart)

const canBurn = computed(() => !opRunning.value && !!currentFile.value && !!flashInfo.value)
const operationLabel = computed(() => ({
  burn: '烧录中',
  dump: '读取中',
  erase: '擦除中',
})[opKind.value] || '处理中')

const resultText = computed(() => {
  const result = opResult.value
  if (!result) return ''
  if (!result.ok) return result.error || '操作失败'
  const details = ['操作完成']
  if (result.bytes) details.push(formatSize(result.bytes))
  if (result.seconds != null) details.push(`${Math.round(result.seconds)}s`)
  if (result.mismatch_bytes != null) details.push(`mismatch ${result.mismatch_bytes}`)
  return details.join(' · ')
})

function formatSize(bytes) {
  if (!bytes) return '0B'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}
</script>

<template>
  <section class="shrink-0 border-b border-white/10 px-4 py-3">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[10px] font-black uppercase text-zinc-500">烧录操作</div>
        <div class="mt-1 truncate text-[11px] font-bold text-white">
          {{ currentFile?.name || '未选择 ROM 文件' }}
        </div>
      </div>
      <span class="shrink-0 text-[9px] font-bold text-zinc-600">
        {{ flashInfo?.capacity || '未识别卡带' }}
      </span>
    </div>

    <div v-if="opRunning" class="mb-3 space-y-1.5">
      <div class="flex justify-between text-[9px] font-bold text-zinc-400">
        <span>{{ operationLabel }}</span>
        <span v-if="progress.total">{{ progressPct }}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          class="h-full rounded-full bg-emerald-400 transition-[width] duration-200"
          :class="progress.total ? '' : 'w-1/2 animate-pulse'"
          :style="progress.total ? { width: progressPct + '%' } : {}"
        />
      </div>
    </div>

    <div
      v-else-if="opResult"
      class="mb-3 rounded border px-2.5 py-2 text-[10px] font-bold"
      :class="opResult.ok
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
        : 'border-red-400/20 bg-red-400/10 text-red-400'"
    >
      {{ resultText }}
      <div v-if="opResult.ok && opResult.outPath" class="mt-1 truncate text-[8px] font-normal text-zinc-500">
        {{ opResult.outPath }}
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <button data-no-drag type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded bg-white text-[10px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30" :disabled="!canBurn" @click="cart.burn()">
        <Flame class="h-3.5 w-3.5 text-orange-500" />
        烧录
      </button>
      <button data-no-drag type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded bg-zinc-800 text-[10px] font-black text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30" :disabled="opRunning || !flashInfo" @click="cart.dump()">
        <Download class="h-3.5 w-3.5 text-sky-400" />
        读取
      </button>
      <button data-no-drag type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded bg-zinc-800 text-[10px] font-black text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30" :disabled="opRunning || !flashInfo" @click="cart.erase()">
        <Trash2 class="h-3.5 w-3.5 text-red-400" />
        擦除
      </button>
    </div>
  </section>
</template>
