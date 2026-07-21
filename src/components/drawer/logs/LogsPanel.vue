<script setup>
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogStore } from '../../../stores/useLogStore'

const { logs } = storeToRefs(useLogStore())
const logOutput = ref(null)

watch(logs, async () => {
  await nextTick()
  if (logOutput.value) logOutput.value.scrollTop = logOutput.value.scrollHeight
}, { deep: true })

function logColor(type) {
  if (type === 'success') return 'text-green-400'
  if (type === 'error') return 'text-red-400'
  if (type === 'warn') return 'text-yellow-400'
  return 'text-zinc-500'
}
</script>

<template>
  <div ref="logOutput" class="flex flex-1 flex-col gap-2 overflow-y-auto p-5 font-mono text-xs no-scrollbar">
    <div v-if="logs.length === 0" class="flex flex-1 items-center justify-center text-[10px] text-zinc-700">
      暂无日志
    </div>
    <div v-for="log in logs" :key="log.id" class="flex gap-3 leading-snug">
      <span class="shrink-0 text-zinc-700">[{{ log.timeStr }}]</span>
      <span :class="logColor(log.type)" class="min-w-0 break-all">{{ log.message }}</span>
      <span v-if="log.count > 1" class="shrink-0 text-[9px] font-bold text-zinc-600">×{{ log.count }}</span>
    </div>
  </div>
</template>
