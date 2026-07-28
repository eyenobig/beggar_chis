<!-- 通用 ROM 信息：一行标题 + 一行正文 -->
<script setup>
defineProps({
  /** @type {import('vue').PropType<Array<{ label: string, value: string, mono?: boolean, tone?: 'ok' | 'bad' | null }>>} */
  rows: { type: Array, required: true },
  dense: { type: Boolean, default: false },
  /** 暗色底（左侧无框）用浅色字 */
  onDark: { type: Boolean, default: false },
})
</script>

<template>
  <div
    class="flex min-w-0 flex-col"
    :class="dense ? 'gap-2' : 'gap-2.5'"
  >
    <div v-for="(row, i) in rows" :key="i" class="min-w-0">
      <div
        class="text-[8px] font-black uppercase tracking-widest"
        :class="onDark ? 'text-zinc-500' : 'text-zinc-400'"
      >{{ row.label }}</div>
      <div
        class="truncate"
        :class="[
          dense ? 'text-[10px] leading-4' : 'text-[11px] leading-5',
          row.mono ? 'mono font-medium' : 'font-medium',
          row.tone === 'ok' ? (onDark ? 'text-emerald-400' : 'text-emerald-600') : '',
          row.tone === 'bad' ? (onDark ? 'text-red-400' : 'text-red-600') : '',
          !row.tone && onDark ? 'text-zinc-100' : '',
          !row.tone && !onDark ? 'text-zinc-900' : '',
        ]"
      >{{ row.value }}</div>
    </div>
  </div>
</template>
