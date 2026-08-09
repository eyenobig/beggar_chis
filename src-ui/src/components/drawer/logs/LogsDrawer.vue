<!-- Logs / Progress / ROM 右抽屉。用 BaseDrawer 基类。 -->
<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import { useCartData } from '../../../stores/useCartData'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import BaseDrawer from '../BaseDrawer.vue'
import LogsPanel from './LogsPanel.vue'
import RomPanel from './RomPanel.vue'

const { t } = useI18n()
const emu = useEmulator()
const { logsOpen, activeTab } = storeToRefs(emu)
const { closeDrawers, openBookmark } = emu
const { flashInfo } = storeToRefs(useCartData())
const { cartridgeStage, cartridgeStickers } = storeToRefs(useCfbSettings())

const logStore = useLogStore()
const { hasUnread, logs } = storeToRefs(logStore)

/** 贴纸架在抽屉上方时仅取消右上圆角贴齐；抽屉 top/bottom 不变，高度保持原样。 */
const shelfAboveDrawer = computed(() =>
  cartridgeStickers.value && cartridgeStage.value && !!flashInfo.value && logsOpen.value,
)

// 已在 Logs 页时，新日志不累积未读红点
watch(logs, () => {
  if (activeTab.value === 'logs') logStore.markRead()
}, { deep: false })

function switchTab(name) {
  if (openBookmark(name) && name === 'logs') logStore.markRead()
}

function tabClass(name) {
  return activeTab.value === name
    ? 'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-zinc-700 text-white transition-colors'
    : 'text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors'
}
</script>

<template>
  <BaseDrawer :open="logsOpen" :width="440" :flush-top="shelfAboveDrawer">
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class="flex shrink-0 items-center justify-between border-b border-white/10 bg-zinc-900/50 px-5 py-3"
      >
        <div class="flex gap-0.5 rounded-lg bg-zinc-800/60 p-0.5">
          <button :class="tabClass('rom')" @click="switchTab('rom')">{{ t('bookmark.rom') }}</button>
          <button
            :class="tabClass('logs')"
            class="relative"
            @click="switchTab('logs')"
          >
            {{ t('bookmark.logs') }}
            <span
              v-if="hasUnread && activeTab !== 'logs'"
              class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500"
              aria-hidden="true"
            />
          </button>
        </div>
        <button
          :aria-label="t('logs.close')"
          class="p-1 text-zinc-500 transition-colors hover:text-white"
          @click="closeDrawers()"
        >
          <X class="h-3.5 w-3.5" :stroke-width="2.5" />
        </button>
      </div>

      <LogsPanel v-show="activeTab === 'logs'" />
      <RomPanel v-show="activeTab === 'rom'" />
    </div>
  </BaseDrawer>
</template>
