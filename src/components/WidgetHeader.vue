<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useConnection } from '../stores/useConnection'
import WindowControls from './window/WindowControls.vue'
import ConnectionDialog from './dialog/ConnectionDialog.vue'

const { t } = useI18n()
const conn = useConnection()
const { isConnected, isConnecting, dialogOpen } = storeToRefs(conn)
const { openDialog } = conn
// 不自动连接：默认未连接，由用户在弹窗里点「连接」

const dotClass = computed(() => {
  if (isConnected.value)  return 'w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse transition-colors'
  if (isConnecting.value) return 'w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)] animate-pulse transition-colors'
  return 'w-1.5 h-1.5 rounded-full bg-zinc-400 transition-colors'
})

const statusText = computed(() => {
  if (isConnected.value)  return t('conn.online')
  if (isConnecting.value) return t('conn.detecting')
  return t('conn.offline')
})

const statusTextClass = computed(() => {
  if (isConnected.value)  return 'text-[8px] font-black uppercase tracking-widest text-zinc-900 mt-0.5 transition-colors'
  if (isConnecting.value) return 'text-[8px] font-black uppercase tracking-widest text-yellow-600 mt-0.5 transition-colors'
  return 'text-[8px] font-black uppercase tracking-widest text-zinc-500 mt-0.5 transition-colors'
})
</script>

<template>
  <header class="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-white shrink-0 z-10 relative">

    <!-- 连接状态：与 cfb detect 绑定；点击弹出设备列表 -->
    <button
      data-no-drag
      @click="openDialog"
      class="flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 rounded-full transition-all active:scale-95 cursor-pointer"
    >
      <div :class="dotClass"></div>
      <span :class="statusTextClass">{{ statusText }}</span>
    </button>

    <!-- 窗口控制 (widget 内部右上角，始终跟随 widget 不受 drawer 影响) -->
    <WindowControls />

    <!-- 连接设备弹窗 -->
    <ConnectionDialog v-if="dialogOpen" />

  </header>
</template>
