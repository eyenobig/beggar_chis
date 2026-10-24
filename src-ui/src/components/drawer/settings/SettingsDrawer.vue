<!-- 设置 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import BaseDrawer from '../BaseDrawer.vue'
import SettingsPanel from './SettingsPanel.vue'

const emu = useEmulator()
const { settingsOpen } = storeToRefs(emu)
const { closeDrawers } = emu
</script>

<template>
  <BaseDrawer :open="settingsOpen" side="right">
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="flex shrink-0 items-center justify-between border-b border-white/10 bg-zinc-900/50 px-5 py-3"
      >
        <div class="flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-lg bg-zinc-700/60 border border-white/10 flex items-center justify-center">
            <svg class="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div class="text-xs font-black uppercase tracking-widest text-white">{{ $t('settings.title') }}</div>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="p-1 text-zinc-500 hover:text-white transition-colors"
          @click="closeDrawers()"
        >
          <X class="w-3.5 h-3.5" :stroke-width="2.5" />
        </button>
      </div>
      <SettingsPanel />
    </div>
  </BaseDrawer>
</template>
