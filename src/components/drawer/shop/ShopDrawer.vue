<!-- Shop 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import BaseDrawer from '../BaseDrawer.vue'
import ShopPanel from './ShopPanel.vue'

const { shopOpen } = storeToRefs(useEmulator())
</script>

<template>
  <BaseDrawer :open="shopOpen" side="right">
    <div class="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-zinc-900/50 shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-6 h-6 rounded-lg bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
          <svg class="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <div>
          <div class="text-xs font-black uppercase tracking-widest text-white">Poké Mart</div>
          <div class="text-[9px] text-zinc-600 uppercase tracking-wider">Platinum Edition</div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 bg-yellow-400/5 border border-yellow-400/15 rounded-lg px-2 py-1">
          <span class="text-[10px] text-yellow-400/70">₽</span>
          <span class="text-[11px] font-black text-yellow-400 tracking-wider">99,999</span>
        </div>
        <button
          @click="shopOpen = false"
          aria-label="Close"
          class="p-1 text-zinc-500 hover:text-white transition-colors"
        >
          <X class="w-3.5 h-3.5" :stroke-width="2.5" />
        </button>
      </div>
    </div>
    <ShopPanel />
  </BaseDrawer>
</template>
