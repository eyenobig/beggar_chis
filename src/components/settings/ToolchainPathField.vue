<!-- 工具链路径栏：标题 + 右上角版本 + 路径/选择/下载。cfb / rule / SkyEmu 共用。 -->
<script setup>
import { FolderOpen, Download, LoaderCircle } from '@lucide/vue'

defineProps({
  title: { type: String, default: '' },
  version: { type: String, default: '—' },
  pathLabel: { type: String, required: true },
  path: { type: String, default: '' },
  pickTitle: { type: String, required: true },
  downloadTitle: { type: String, required: true },
  downloading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

defineEmits(['pick', 'download'])
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-1 text-[11px] font-bold text-zinc-300">
        <slot name="title">{{ title }}</slot>
      </div>
      <span
        class="shrink-0 text-[9px] font-bold tabular-nums text-zinc-500"
        :title="$t('settings.versionsHint')"
      >{{ version }}</span>
    </div>
    <div class="flex items-center gap-2">
      <div
        class="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2.5 py-2 text-[10px] font-medium"
        :class="path ? 'text-zinc-200' : 'text-zinc-600'"
        :title="path || undefined"
      >
        {{ pathLabel }}
      </div>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40"
        :disabled="disabled"
        :title="pickTitle"
        :aria-label="pickTitle"
        @click="$emit('pick')"
      >
        <FolderOpen class="h-3.5 w-3.5" />
      </button>
      <button
        data-no-drag
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
        :disabled="disabled || downloading"
        :title="downloadTitle"
        :aria-label="downloadTitle"
        @click="$emit('download')"
      >
        <LoaderCircle v-if="downloading" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.5" />
        <Download v-else class="h-3.5 w-3.5" :stroke-width="2.5" />
      </button>
    </div>
  </div>
</template>
