<!-- ROM 页存档操作条：左 导出+擦除 / 右 验证+烧录；仅存档操作运行中变中断 -->
<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, Download, Square, Trash2, Upload } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'
import UiSelect from '../../ui/UiSelect.vue'

const { t } = useI18n()
const cart = useCartData()
const { saveFile, saveType, flashInfo, opRunning, opKind, opResult, confirm, preferMbc } = storeToRefs(cart)

const saveTypeOptions = computed(() => preferMbc.value
  ? [
      { value: 'sram', label: 'SRAM' },
      { value: 'fram', label: 'FRAM' },
    ]
  : [
      { value: 'eeprom4k', label: '4K EEPROM (512B)' },
      { value: 'eeprom64k', label: '64K EEPROM (8KiB)' },
      { value: 'sram', label: 'SRAM' },
      { value: 'flash', label: 'FLASH' },
      { value: 'fram', label: 'FRAM' },
    ])

const SAVE_OPS = ['saveDump', 'saveWrite', 'saveVerify', 'saveErase']
const isSaveOp = computed(() => opRunning.value && SAVE_OPS.includes(opKind.value))
/** 有存档即可点；未连接/未识别时由 saveWrite/saveVerify 内 toast，避免按钮灰着「无法使用」。 */
const canWrite = computed(() => !opRunning.value && !!saveFile.value)
const canVerify = computed(() => !opRunning.value && !!saveFile.value)
const canDump = computed(() => !opRunning.value && !!flashInfo.value)
const isDangerConfirm = computed(() => confirm.value === 'saveWrite' || confirm.value === 'saveErase')

const showResult = ref(false)
watch(opResult, (v) => {
  showResult.value = !!v && SAVE_OPS.includes(opKind.value)
})
watch(opRunning, (running) => {
  if (running) showResult.value = false
})

const resultOk = computed(() => {
  if (!showResult.value || !opResult.value) return false
  if (!opResult.value.ok) return false
  if (opKind.value === 'saveVerify') {
    return !(Number(opResult.value.mismatch_bytes) > 0)
  }
  return true
})

const resultText = computed(() => {
  if (!showResult.value) return ''
  const r = opResult.value
  if (!r) return ''
  if (opKind.value === 'saveVerify') {
    if (!r.ok) return r.error || t('rom.ops.verifyFailShort')
    const mismatch = Number(r.mismatch_bytes) || 0
    if (mismatch > 0) return t('rom.ops.verifyMismatchShort', { n: mismatch })
    return t('rom.ops.verifyOkShort')
  }
  if (!r.ok) return r.error || t('rom.ops.opFail')
  const details = [t('rom.ops.opDone')]
  if (r.bytes) details.push(formatSize(r.bytes))
  if (r.seconds != null) details.push(`${Math.round(r.seconds)}s`)
  if (r.mismatch_bytes != null && r.mismatch_bytes > 0) details.push(t('rom.ops.mismatchBytes', { n: r.mismatch_bytes }))
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
        :class="resultOk ? 'text-emerald-400' : 'text-red-400'"
        :title="resultText"
        @click="dismissResult"
      >
        {{ resultText }}
      </button>
      <div v-else-if="isSaveOp && opKind === 'saveVerify'" class="text-[8px] font-black uppercase tracking-wider text-amber-400">
        {{ t('rom.ops.verifying') }}
      </div>
      <div v-else class="text-[8px] font-black uppercase tracking-wider text-zinc-500">{{ t('rom.ops.saveSection') }}</div>
      <div class="flex min-w-0 items-center gap-1">
        <div
          class="w-[7.5rem] shrink-0"
          data-no-drag
          :title="t('rom.ops.saveType')"
          @mousedown.stop
          @pointerdown.stop
        >
          <UiSelect
            v-model="saveType"
            size="sm"
            :options="saveTypeOptions"
            :disabled="opRunning"
          />
        </div>
        <button
          data-no-drag
          type="button"
          class="min-w-0 truncate text-[8px] font-bold text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
          :title="saveFile?.path || t('rom.ops.pickSave')"
          :disabled="opRunning"
          @click.stop.prevent="cart.pickSaveFile()"
          @mousedown.stop
          @pointerdown.stop
        >
          {{ saveFile?.name || t('rom.ops.pickSave') }}
        </button>
      </div>
    </div>

    <!-- 写入 / 擦除确认态：二次确认 -->
    <div v-if="isDangerConfirm" class="grid grid-cols-2 gap-1">
      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.doConfirmed()"
      >
        <component :is="confirm === 'saveErase' ? Trash2 : Upload" class="h-3 w-3" />
        {{ confirm === 'saveErase' ? t('rom.ops.confirmErase') : t('rom.ops.confirmBurn') }}
      </button>
      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200"
        @click="cart.cancelConfirm()"
      >
        {{ t('rom.ops.cancel') }}
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
        {{ t('rom.ops.abort') }}
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
          {{ t('rom.ops.export') }}
        </button>
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canDump"
          @click="cart.requestConfirm('saveErase')"
        >
          <Trash2 class="h-3 w-3 text-red-400" />
          {{ t('rom.ops.erase') }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canVerify"
          :title="canVerify ? t('rom.ops.verifyHint') : t('rom.ops.needSave')"
          @click="cart.saveVerify()"
        >
          <CheckCircle2 class="h-3 w-3 text-emerald-500" />
          {{ t('rom.ops.verify') }}
        </button>
        <button
          data-no-drag type="button"
          class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          :disabled="!canWrite"
          :title="canWrite ? t('rom.ops.writeHint') : t('rom.ops.needSave')"
          @click="cart.requestConfirm('saveWrite')"
        >
          <Upload class="h-3 w-3 text-orange-500" />
          {{ t('rom.ops.burn') }}
        </button>
      </div>
    </div>
  </section>
</template>
