<!-- Logs / Progress / ROM 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import BaseDrawer from '../BaseDrawer.vue'
import LogsPanel from './LogsPanel.vue'
import RomPanel from './RomPanel.vue'

const emu = useEmulator()
const { logsOpen, activeTab } = storeToRefs(emu)
const { toggleLogs } = emu

const logStore = useLogStore()
const { hasUnread, logs } = storeToRefs(logStore)

// 已在 Logs 页时，新日志不累积未读红点
watch(logs, () => {
  if (activeTab.value === 'logs') logStore.markRead()
}, { deep: false })

function switchTab(name) {
  activeTab.value = name
  if (name === 'logs') logStore.markRead()
}

function tabClass(name) {
  return activeTab.value === name
    ? 'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-zinc-700 text-white transition-colors'
    : 'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors'
}
</script>

<template>
  <BaseDrawer :open="logsOpen" :width="440">
    <div class="flex justify-between items-center px-5 py-3 border-b border-white/10 bg-zinc-900/50 shrink-0">
      <div class="flex gap-0.5 bg-zinc-800/60 p-0.5 rounded-lg">
        <button :class="tabClass('rom')" @click="switchTab('rom')">ROM</button>
        <button
          :class="tabClass('logs')"
          class="relative"
          @click="switchTab('logs')"
        >
          Logs
          <span
            v-if="hasUnread && activeTab !== 'logs'"
            class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500"
            aria-hidden="true"
          />
        </button>
      </div>
      <button
        @click="toggleLogs(false)"
        aria-label="Close"
        class="p-1 text-zinc-500 hover:text-white transition-colors"
      >
        <X class="w-3.5 h-3.5" :stroke-width="2.5" />
      </button>
    </div>

    <LogsPanel v-show="activeTab === 'logs'" />


    <RomPanel v-show="activeTab === 'rom'" />
  </BaseDrawer>
</template>
