<!-- 右侧书签栏：打开 logs/progress/payload/help/settings/shop 抽屉。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ChevronRight, CircleHelp, Settings, ShoppingBag } from '@lucide/vue'
import { useEmulator } from '../../stores/useEmulator'
const emu = useEmulator()
const { logsOpen, shopOpen, helpOpen, settingsOpen } = storeToRefs(emu)
const { toggleLogs } = emu

function closeAll() {
  toggleLogs(false)
  shopOpen.value = false
  helpOpen.value = false
  settingsOpen.value = false
}
function openLogs(tab) { closeAll(); toggleLogs(true, tab) }
function openShop()    { closeAll(); shopOpen.value = true }
function openHelp()    { closeAll(); helpOpen.value = true }
function openSettings(){ closeAll(); settingsOpen.value = true }

const anyOpen = computed(
  () => logsOpen.value || shopOpen.value || helpOpen.value || settingsOpen.value,
)
const bookmarkStyle = computed(() =>
  anyOpen.value
    ? { transform: 'translateX(-20px)', opacity: '0', pointerEvents: 'none' }
    : { transform: 'translateX(0)', opacity: '1', pointerEvents: 'auto' },
)
</script>

<template>
  <div class="contents">
  <!-- 书签：LOGS + PROG + 卡带（顶部） -->
  <div class="absolute left-[320px] top-[56px] z-10 flex flex-col drawer-transition" :style="bookmarkStyle">
    <button
      @click="openLogs('logs')"
      :aria-label="$t('bookmark.logs')"
      class="w-7 py-4 bg-zinc-900 hover:bg-black text-white rounded-tr-xl border-t border-r border-white/10 shadow-lg flex flex-col items-center gap-1.5 group"
      data-no-drag
    >
      <ChevronRight class="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
      <span class="writing-vertical text-[8px] font-black tracking-widest uppercase">{{ $t('bookmark.logs') }}</span>
    </button>
    <button
      @click="openLogs('progress')"
      :aria-label="$t('bookmark.progress')"
      class="w-7 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-br-xl border-b border-r border-white/10 shadow-lg flex flex-col items-center gap-1.5 group"
      data-no-drag
    >
      <ChevronRight class="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors" />
      <span class="writing-vertical text-[8px] font-black tracking-widest uppercase">{{ $t('bookmark.progress') }}</span>
    </button>
  </div>

  <!-- 书签：说明 + 设置 + SHOP（底部） -->
  <div class="absolute left-[320px] bottom-[130px] z-10 flex flex-col drawer-transition" :style="bookmarkStyle">
    <button
      @click="openHelp"
      :aria-label="$t('bookmark.help')"
      class="w-7 py-3 bg-zinc-900 hover:bg-black text-white rounded-tr-xl border-t border-r border-white/10 shadow-lg flex items-center justify-center group"
      data-no-drag
    >
      <CircleHelp class="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors" />
    </button>
    <button
      @click="openSettings"
      :aria-label="$t('bookmark.settings')"
      class="w-7 py-3 bg-zinc-800 hover:bg-zinc-700 text-white border-r border-white/10 shadow-lg flex items-center justify-center group"
      data-no-drag
    >
      <Settings class="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors" />
    </button>
    <button
      @click="openShop"
      :aria-label="$t('bookmark.shop')"
      class="w-7 py-3 bg-zinc-900 hover:bg-black text-white rounded-br-xl border-b border-r border-white/10 shadow-lg flex items-center justify-center group"
      data-no-drag
    >
      <ShoppingBag class="w-3.5 h-3.5 text-zinc-500 group-hover:text-yellow-400 transition-colors" />
    </button>
  </div>
  </div>
</template>
