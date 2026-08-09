<!-- ROM 页：烧录 / 导出 / 擦除；仅 ROM 操作运行中烧录位变中断 -->
<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Download, Flame, Square, Trash2 } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'

const cart = useCartData()
const { romFile, flashInfo, opRunning, opKind, opResult } = storeToRefs(cart)

const ROM_OPS = ['burn', 'erase', 'dump']
const isRomOp = computed(() => opRunning.value && ROM_OPS.includes(opKind.value))
/** 有 ROM 即可点；未连接/未识别时 burn() 内 toast 并引导选口，避免按钮灰着「无法使用」。 */
const canBurn = computed(() => !opRunning.value && !!romFile.value)

/** 完成后左上角显示结果；仅 ROM 操作结果；点击还原 */
const showResult = ref(false)

watch(opResult, (v) => {
  showResult.value = !!v && ROM_OPS.includes(opKind.value)
})

watch(opRunning, (running) => {
  if (running) showResult.value = false
})

const resultText = computed(() => {
  if (!showResult.value) return ''
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

function dismissResult() {
  showResult.value = false
}
</script>

<template>
  <section class="shrink-0 border-t border-white/10 px-3 py-1.5">
    <div class="mb-1 flex items-center justify-between gap-2">
      <button
        v-if="showResult && resultText"
        data-no-drag
        type="button"
        class="min-w-0 truncate text-left text-[8px] font-black tracking-wider"
        :class="opResult?.ok ? 'text-emerald-400' : 'text-red-400'"
        :title="resultText"
        @click="dismissResult"
      >
        {{ resultText }}
      </button>
      <div
        v-else
        class="text-[8px] font-black uppercase tracking-wider text-zinc-500"
      >
        烧录操作
      </div>
      <span
        class="min-w-0 truncate text-[8px] font-bold text-zinc-500"
        :title="romFile?.path || romFile?.name || ''"
      >
        {{ romFile?.name || '未选择 ROM' }}
      </span>
    </div>

    <div class="grid grid-cols-3 gap-1">
      <button
        v-if="isRomOp"
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.abortOp()"
      >
        <Square class="h-2.5 w-2.5 fill-current" />
        中断
      </button>
      <button
        v-else
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="!canBurn"
        @click="cart.burn()"
      >
        <Flame class="h-3 w-3 text-orange-500" />
        烧录
      </button>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="opRunning || !flashInfo"
        @click="cart.dump()"
        title="导出 ROM 到文件"
      >
        <Download class="h-3 w-3 text-sky-400" />
        导出
      </button>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="opRunning || !flashInfo"
        @click="cart.erase()"
      >
        <Trash2 class="h-3 w-3 text-red-400" />
        擦除
      </button>
    </div>
  </section>
</template>
