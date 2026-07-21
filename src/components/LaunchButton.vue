<script setup>
// SkyEmu 启动逻辑（emulator.rs）已移除：客户端统一走 cfb sidecar。
// 此按钮保留为禁用占位，维持 EmulatorWidget 底部布局不塌。
</script>

<template>
  <div class="p-4 bg-white relative border-t border-zinc-100 shrink-0 z-10">
    <button
      disabled
      class="w-full mt-2 bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed h-12 rounded-xl flex items-center justify-center gap-2 transition-all"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
      </svg>
      <span class="text-[10px] font-black uppercase tracking-[0.2em]">SkyEmu 未接入</span>
    </button>
  </div>
</template>
