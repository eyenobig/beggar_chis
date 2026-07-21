<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ListChecks, Trash2, X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import { useTaskProgress } from '../../../stores/useTaskProgress'
import BaseDrawer from '../BaseDrawer.vue'
import TaskPanel from './TaskPanel.vue'

const emulator = useEmulator()
const taskStore = useTaskProgress()
const { logsOpen, shopOpen, settingsOpen } = storeToRefs(emulator)
const { drawerOpen, runningCount } = storeToRefs(taskStore)
const hasSecondPage = computed(() => logsOpen.value || shopOpen.value || settingsOpen.value)
const drawerVisible = computed(() => drawerOpen.value && hasSecondPage.value)

watch([hasSecondPage, drawerOpen], ([parentOpen, childOpen]) => {
  if (!parentOpen && childOpen) drawerOpen.value = false
}, { immediate: true })
</script>

<template>
  <BaseDrawer :open="drawerVisible" :width="360" :left="720" :top="34" :bottom="128" :z-index="5">
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50 shrink-0">
      <div class="flex items-center gap-2">
        <ListChecks class="w-4 h-4 text-emerald-400" />
        <span class="text-xs font-black text-white">&#x4efb;&#x52a1;&#x8fdb;&#x5ea6;</span>
        <span v-if="runningCount" class="text-[9px] font-black text-emerald-400">{{ runningCount }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button data-no-drag type="button" class="p-1 text-zinc-500 hover:text-white disabled:opacity-30" aria-label="Clear completed tasks" title="Clear completed tasks" @click="taskStore.clearCompleted">
          <Trash2 class="w-3.5 h-3.5" />
        </button>
        <button data-no-drag type="button" class="p-1 text-zinc-500 hover:text-white" aria-label="Close task progress" @click="drawerOpen = false">
          <X class="w-3.5 h-3.5" :stroke-width="2.5" />
        </button>
      </div>
    </div>
    <TaskPanel />
  </BaseDrawer>
</template>