<!-- 商店 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { storeToRefs } from 'pinia'
import { ExternalLink, X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import { useToast } from '../../../stores/useToast'
import { GBMAKE_HOME_URL, openFlasherStoreUrl } from '../../../services/flasherStore'
import BaseDrawer from '../BaseDrawer.vue'
import ShopPanel from './ShopPanel.vue'

const emu = useEmulator()
const toast = useToast()
const { shopOpen } = storeToRefs(emu)
const { closeDrawers } = emu

async function openGbmakeHome() {
  try {
    await openFlasherStoreUrl(GBMAKE_HOME_URL)
  } catch (cause) {
    toast.error(`无法打开商店：${cause?.message || cause}`)
  }
}
</script>

<template>
  <BaseDrawer :open="shopOpen" side="right">
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        data-drawer-drag
        class="flex shrink-0 cursor-grab items-center justify-between border-b border-white/10 bg-zinc-900/50 px-5 py-3 active:cursor-grabbing"
      >
        <div class="flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-lg bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
            <svg class="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div>
            <div class="text-xs font-black uppercase tracking-widest text-white">Flasher Store</div>
            <div class="text-[9px] text-zinc-600 uppercase tracking-wider">GBMake Hardware</div>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button
            data-no-drag
            data-no-drawer-drag
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-yellow-400"
            title="打开 GBMake 首页"
            aria-label="打开 GBMake 首页"
            @click="openGbmakeHome"
          >
            <ExternalLink class="h-3.5 w-3.5" :stroke-width="2.5" />
          </button>
          <button
            data-no-drag
            data-no-drawer-drag
            type="button"
            class="p-1 text-zinc-500 transition-colors hover:text-white"
            aria-label="Close"
            @click="closeDrawers()"
          >
            <X class="w-3.5 h-3.5" :stroke-width="2.5" />
          </button>
        </div>
      </div>
      <ShopPanel />
    </div>
  </BaseDrawer>
</template>
