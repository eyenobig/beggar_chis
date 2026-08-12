<script setup>
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useDragScroll } from '../../../composables/useDragScroll'
import { useLogStore } from '../../../stores/useLogStore'

const { t } = useI18n()
const { scrollBind } = useDragScroll()
const { logs } = storeToRefs(useLogStore())
const logOutput = ref(null)

/** 仅新增日志时滚到底；进度/总计原地更新不触发 */
watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (logOutput.value) logOutput.value.scrollTop = logOutput.value.scrollHeight
  },
)

function logColor(type) {
  if (type === 'success') return 'text-green-400'
  if (type === 'error') return 'text-red-400'
  if (type === 'warn') return 'text-yellow-400'
  return 'text-zinc-500'
}
</script>

<template>
  <div
    ref="logOutput"
    data-drawer-scroll
    class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain p-5 font-mono text-xs no-scrollbar [touch-action:pan-y]"
    v-bind="scrollBind"
  >
    <div v-if="logs.length === 0" class="flex flex-1 items-center justify-center text-[10px] text-zinc-700">
      {{ t('logs.empty') }}
    </div>
    <div v-for="log in logs" :key="log.id" class="flex items-baseline gap-3 leading-snug">
      <span v-if="!log.isTotal" class="w-[4.5rem] shrink-0 text-zinc-700">[{{ log.timeStr }}]</span>
      <span v-else class="w-[4.5rem] shrink-0" aria-hidden="true"></span>
      <span :class="logColor(log.type)" class="min-w-0 flex-1 truncate" :title="log.message">
        {{ log.message }}<span v-if="log.elapsed" class="ml-1 text-zinc-600">· {{ log.elapsed }}</span>
        <span v-if="log.count > 1" class="ml-1 text-[9px] font-bold text-zinc-600">×{{ log.count }}</span>
      </span>
    </div>
  </div>
</template>
