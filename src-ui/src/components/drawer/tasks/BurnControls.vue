<!-- ROM 页：烧录 / 导出 / 擦除；仅 ROM 操作运行中烧录位变中断 -->
<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Download, Flame, Square, Trash2 } from '@lucide/vue'
import { useCartData } from '../../../stores/useCartData'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import UiSelect from '../../ui/UiSelect.vue'

const { t } = useI18n()
const cart = useCartData()
const settings = useCfbSettings()
const { romFile, flashInfo, opRunning, opKind, opResult, confirm, preferMbc } = storeToRefs(cart)

/** 擦除范围：仅 GB/GBC 卡显示（GBA 无隐藏头部区）。彻底=连开机窗一起清。 */
const eraseModeOptions = [
  { value: 'deep', label: t('rom.ops.eraseModeDeep') },
  { value: 'standard', label: t('rom.ops.eraseModeStandard') },
]
const eraseMode = computed({
  get: () => (settings.eraseBoot ? 'deep' : 'standard'),
  set: (v) => { settings.eraseBoot = v === 'deep' },
})

const ROM_OPS = ['burn', 'erase', 'dump']
const isRomOp = computed(() => opRunning.value && ROM_OPS.includes(opKind.value))
/** 擦除为破坏性整片操作：与存档区同款二次确认状态 */
const isDangerConfirm = computed(() => confirm.value === 'erase')
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
  if (!result.ok) return result.error || t('rom.ops.opFail')
  const details = [t('rom.ops.opDone')]
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
        {{ t('rom.ops.burnSection') }}
      </div>
      <div class="flex min-w-0 items-center gap-1">
        <div
          v-if="preferMbc"
          class="w-[7.5rem] shrink-0"
          data-no-drag
          :title="t('rom.ops.eraseMode')"
          @mousedown.stop
          @pointerdown.stop
        >
          <UiSelect
            v-model="eraseMode"
            size="sm"
            :options="eraseModeOptions"
            :disabled="opRunning"
          />
        </div>
        <span
          class="min-w-0 truncate text-[8px] font-bold text-zinc-500"
          :title="romFile?.path || romFile?.name || ''"
        >
          {{ romFile?.name || t('rom.ops.noRom') }}
        </span>
      </div>
    </div>

    <!-- 中断态：仅 ROM 操作 -->
    <div v-if="isRomOp" class="grid grid-cols-1 gap-1">
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.abortOp()"
      >
        <Square class="h-2.5 w-2.5 fill-current" />
        {{ t('rom.ops.abort') }}
      </button>
    </div>

    <!-- 擦除确认态：二次确认（对齐存档区 saveErase） -->
    <div v-else-if="isDangerConfirm" class="grid grid-cols-3 gap-1">      <button
        data-no-drag type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-red-500 text-[9px] font-black text-white hover:bg-red-400"
        @click="cart.doConfirmed()"
      >
        <Trash2 class="h-3 w-3" />
        {{ t('rom.ops.confirmErase') }}
      </button>
      <button
        data-no-drag type="button"
        class="col-span-2 inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200"
        @click="cart.cancelConfirm()"
      >
        {{ t('rom.ops.cancel') }}
      </button>
    </div>

    <div v-else class="grid grid-cols-3 gap-1">
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="!canBurn"
        @click="cart.burn()"
      >
        <Flame class="h-3 w-3 text-orange-500" />
        {{ t('rom.ops.burn') }}
      </button>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="opRunning || !flashInfo"
        @click="cart.dump()"
        :title="t('rom.ops.exportRomTitle')"
      >
        <Download class="h-3 w-3 text-sky-400" />
        {{ t('rom.ops.export') }}
      </button>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-7 items-center justify-center gap-0.5 rounded-md bg-white text-[9px] font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="opRunning || !flashInfo"
        @click="cart.requestConfirm('erase')"
      >
        <Trash2 class="h-3 w-3 text-red-400" />
        {{ t('rom.ops.erase') }}
      </button>
    </div>
  </section>
</template>
