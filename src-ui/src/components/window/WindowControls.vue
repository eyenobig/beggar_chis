<script setup>
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

async function closeWindow()    { try { await getCurrentWindow().close()    } catch {} }
async function minimizeWindow() { try { await getCurrentWindow().minimize() } catch {} }
</script>

<template>
  <div class="flex items-center gap-1.5 group" data-no-drag>
    <!-- 关闭 · 红 -->
    <button
      @click="closeWindow"
      :title="t('window.close')"
      class="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/[.12]
             flex items-center justify-center
             hover:brightness-90 active:brightness-75 transition-[filter]"
    >
      <svg class="w-[7px] h-[7px] opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10" fill="none">
        <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="#820005" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>

    <!-- 最小化 · 黄 -->
    <button
      @click="minimizeWindow"
      :title="t('window.minimize')"
      class="w-3 h-3 rounded-full bg-[#febc2e] border border-black/[.12]
             flex items-center justify-center
             hover:brightness-90 active:brightness-75 transition-[filter]"
    >
      <svg class="w-[7px] h-[7px] opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10" fill="none">
        <path d="M2 5h6" stroke="#7a4b00" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</template>
