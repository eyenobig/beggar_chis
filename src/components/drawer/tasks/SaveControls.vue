<!-- ROM 页存档操作条：左 导出+擦除 / 右 验证+烧录；仅存档操作运行中变中断 -->
<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CheckCircle2, Download, Square, Trash2, Upload } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'

const cart = useCartData()
const { saveFile, flashInfo, opRunning, opKind, opResult, confirm } = storeToRefs(cart)

const SAVE_OPS = ['saveDump', 'saveWrite', 'saveVerify', 'saveErase']
const isSaveOp = computed(() => opRunning.value && SAVE_OPS.includes(opKind.value))
const canWrite = computed(() => !opRunning.value && !!saveFile.value && !!flashInfo.value)
const canDump = computed(() => !opRunning.value && !!flashInfo.value)
const isDangerConfirm = computed(() => confirm.value === 'saveWrite' || confirm.value === 'saveErase')

const showResult = ref(false)
watch(opResult, (v) => {
  showResult.value = !!v && SAVE_OPS.includes(opKind.value)
})
watch(opRunning, (running) => {
  if (running) showResult.value = false
})

const resultText = computed(() => {
  if (!showResult.value) return ''
  const r = opResult.value
  if (!r) return ''
  if (!r.ok) return r.error || '操作失败'
  const details = ['操作完成']
  if (r.bytes) details.push(formatSize(r.bytes))
  if (r.seconds != null) details.push(`${Math.round(r.seconds)}s`)
  if (r.mismatch_bytes != null && r.mismatch_bytes > 0) details.push(`不符 ${r.mismatch_bytes}`)
  return details.join(' · ')
})

function formatSize(bytes) {
  if (!bytes) return '0B'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}
function dismissResult() { showResult.value = false }
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
      <div v-else class="text-[8px] font-black uppercase tracking-wider text-zinc-500">存档操作</div>
      <button
        data-no-drag
        type="button"
        class="min-w-0 truncate text-[8px] font-bold text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        :title="saveFile?.path || '点击选择存档'"
        :disabled="opRunning"
        @click.stop.prevent="cart.pickSaveFile()"
        @mousedown.stop
        @pointerdown.stop
      >
        {{ saveFile?.name || '点击选择存档' }}
      </button>
    </div>

    <!-- 写入 / 擦除确认态：二次确认 -->
    <div v-if="isDangerConfirm" class="grid grid-cols-2 gap-1">
      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.doConfirmed()"
      >
        <component :is="confirm === 'saveErase' ? Trash2 : Upload" class="h-3 w-3" />
        {{ confirm === 'saveErase' ? '确认擦除' : '确认烧录' }}
      </button>
      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200"
        @click="cart.cancelConfirm()"
      >
        取消
      </button>
    </div>

    <!-- 中断态：仅存档操作 -->
    <div v-else-if="isSaveOp" class="grid grid-cols-1 gap-1">
      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.abortOp()"
      >
        <Square class="h-2.5 w-2.5 fill-current" />
        中断
      </button>
    </div>

    <!-- 默认四按钮：左组 导出+擦除 · 右组 验证+烧录 -->
    <div v-else class="grid grid-cols-2 gap-2">
      <div class="grid grid-cols-2 gap-1">
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canDump"
          @click="cart.saveDump()"
        >
          <Download class="h-3 w-3 text-sky-400" />
          导出
        </button>
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canDump"
          @click="cart.requestConfirm('saveErase')"
        >
          <Trash2 class="h-3 w-3 text-red-400" />
          擦除
        </button>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canWrite"
          :class="{ 'opacity-30': !saveFile }"
          @click="cart.saveVerify()"
        >
          <CheckCircle2 class="h-3 w-3 text-emerald-500" />
          验证
        </button>
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canWrite"
          :class="{ 'opacity-30': !saveFile }"
          @click="cart.requestConfirm('saveWrite')"
        >
          <Upload class="h-3 w-3 text-orange-500" />
          烧录
        </button>
      </div>
    </div>
  </section>
</template>
