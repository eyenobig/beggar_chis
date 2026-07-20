<!-- 说明 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import BaseDrawer from '../BaseDrawer.vue'
import HelpPanel from './HelpPanel.vue'

const { helpOpen } = storeToRefs(useEmulator())
</script>

<template>
  <BaseDrawer :open="helpOpen" side="right">
    <div class="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-zinc-900/50 shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-6 h-6 rounded-lg bg-zinc-700/60 border border-white/10 flex items-center justify-center">
          <svg class="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="text-xs font-black uppercase tracking-widest text-white">说明文档</div>
      </div>
      <button
        @click="helpOpen = false"
        aria-label="Close"
        class="p-1 text-zinc-500 hover:text-white transition-colors"
      >
        <X class="w-3.5 h-3.5" :stroke-width="2.5" />
      </button>
    </div>
    <HelpPanel />
  </BaseDrawer>
</template>
