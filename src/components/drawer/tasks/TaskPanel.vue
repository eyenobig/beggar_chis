<script setup>
import { storeToRefs } from 'pinia'
import { CheckCircle2, Download, Eraser, Flame, HardDriveDownload, LoaderCircle, XCircle } from '@lucide/vue'
import { useTaskProgress } from '../../../stores/useTaskProgress'
import BurnControls from './BurnControls.vue'

const taskStore = useTaskProgress()
const { tasks } = storeToRefs(taskStore)

function percent(task) {
  return task.total > 0 ? Math.min(100, Math.round((task.done / task.total) * 100)) : null
}

function taskIcon(kind) {
  if (kind === 'download') return Download
  if (kind === 'burn') return Flame
  if (kind === 'dump') return HardDriveDownload
  return Eraser
}

function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <BurnControls />

    <div class="min-h-0 flex-1 overflow-auto px-4 py-3 no-scrollbar">
      <div v-if="tasks.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
        <HardDriveDownload class="h-5 w-5" />
        <span class="text-[11px] font-bold">暂无任务记录</span>
      </div>

      <div v-else class="grid grid-cols-2 gap-2">
        <article v-for="task in tasks" :key="task.id" class="flex min-h-[116px] flex-col gap-2 overflow-hidden rounded border border-white/10 bg-zinc-900/70 p-3">
          <div class="flex items-center justify-between gap-2">
            <component :is="taskIcon(task.kind)" class="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <LoaderCircle v-if="task.status === 'running'" class="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
            <CheckCircle2 v-else-if="task.status === 'success'" class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <XCircle v-else class="h-3.5 w-3.5 shrink-0 text-red-400" />
          </div>
          <div class="min-w-0">
            <div class="break-words text-[11px] font-black leading-4 text-white">{{ task.title }}</div>
            <div class="mt-0.5 line-clamp-2 break-all text-[9px] leading-3 text-zinc-500">{{ task.detail || '处理中' }}</div>
          </div>
          <div class="mt-auto space-y-1">
            <div class="h-1 overflow-hidden rounded-full bg-zinc-800">
              <div v-if="percent(task) !== null" class="h-full bg-emerald-400 transition-[width] duration-200" :class="task.status === 'error' ? '!bg-red-400' : ''" :style="{ width: percent(task) + '%' }" />
              <div v-else-if="task.status === 'running'" class="h-full w-1/2 animate-pulse bg-emerald-400" />
              <div v-else class="h-full w-full" :class="task.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'" />
            </div>
            <div class="flex justify-between text-[8px] font-bold text-zinc-600">
              <span>{{ task.status === 'running' ? '进行中' : task.status === 'success' ? '已完成' : '失败' }}</span>
              <span>{{ percent(task) !== null && task.status === 'running' ? percent(task) + '%' : timeLabel(task.finishedAt || task.startedAt) }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
