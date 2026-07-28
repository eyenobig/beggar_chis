<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskProgress } from '../../../stores/useTaskProgress'

/** 第三层：单列竖条，随机顺序点亮；进度回落/新操作时必须可清空 */
const ROWS = 40
/** 容器四边 inset 与段间距共用，避免上下/左右/段间视觉不均 */
const GAP = '3px'
const LIT = '#40c463'
const ERROR = '#f87171'
const EMPTY = '#27272a'

const taskStore = useTaskProgress()
const { tasks } = storeToRefs(taskStore)
const current = computed(() => tasks.value[0] || null)

/** 已知 total 时显示 0–100；未知则空（条为不确定脉冲） */
const pctLabel = computed(() => {
  const t = current.value
  if (!t || !(t.total > 0)) return ''
  const pct = Math.round(Math.min(1, Math.max(0, t.done / t.total)) * 100)
  if (t.status === 'success') return '100'
  return String(pct)
})

const order = ref([])
/** 用布尔数组保证 Vue 能可靠追踪点亮状态 */
const litMask = ref(Array.from({ length: ROWS }, () => false))
let pulseTimer = null
/** 上一帧是否已有确定进度；用于 total 归零时强制清空残条 */
let hadDeterminate = false

function litCount() {
  return litMask.value.reduce((n, v) => n + (v ? 1 : 0), 0)
}

function clearLit() {
  litMask.value = Array.from({ length: ROWS }, () => false)
}

function shuffleOrder() {
  const idx = Array.from({ length: ROWS }, (_, i) => i)
  for (let i = ROWS - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  order.value = idx
  clearLit()
}

function stopPulse() {
  if (pulseTimer) {
    clearInterval(pulseTimer)
    pulseTimer = null
  }
}

/** 精确同步点亮数量（可增可减），烧录擦除→写入阶段切换时必须能回落。 */
function setLitCount(count) {
  const target = Math.max(0, Math.min(ROWS, count))
  const next = Array.from({ length: ROWS }, () => false)
  let n = 0
  for (const i of order.value) {
    if (n >= target) break
    next[i] = true
    n++
  }
  litMask.value = next
}

function startPulse() {
  stopPulse()
  setLitCount(3)
  pulseTimer = setInterval(() => {
    const task = current.value
    if (!task || task.status !== 'running' || task.total > 0) {
      stopPulse()
      return
    }
    if (litCount() < 6) setLitCount(litCount() + 1)
  }, 450)
}

function syncFromTask(task) {
  if (!task) {
    stopPulse()
    clearLit()
    hadDeterminate = false
    return
  }
  if (task.status === 'success') {
    stopPulse()
    setLitCount(ROWS)
    hadDeterminate = true
    return
  }
  if (task.status === 'error') {
    stopPulse()
    setLitCount(Math.max(litCount(), Math.round(ROWS * 0.3)))
    hadDeterminate = true
    return
  }
  // running
  if (task.total > 0) {
    stopPulse()
    setLitCount(Math.round(Math.min(1, task.done / task.total) * ROWS))
    hadDeterminate = true
    return
  }
  // 操作刚开始或阶段重置（从确定进度回到 total=0）：清空残条后再进不确定脉冲
  if (hadDeterminate) {
    stopPulse()
    clearLit()
    hadDeterminate = false
  }
  if (!pulseTimer) startPulse()
}

watch(
  () => current.value?.id,
  (id) => {
    stopPulse()
    hadDeterminate = false
    if (!id) {
      clearLit()
      return
    }
    shuffleOrder()
    syncFromTask(current.value)
  },
  { immediate: true },
)

watch(
  () => {
    const t = current.value
    if (!t) return null
    return [t.status, t.done, t.total]
  },
  () => syncFromTask(current.value),
)

onUnmounted(stopPulse)

function cellBg(i) {
  if (!litMask.value[i]) return EMPTY
  if (current.value?.status === 'error') return ERROR
  return LIT
}
</script>

<template>
  <!-- 四边 padding = 段间距；底部叠百分比（窄条竖排数字） -->
  <div class="relative h-full w-full box-border">
    <div
      class="h-full w-full box-border"
      :style="{
        display: 'grid',
        gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        padding: GAP,
        gap: GAP,
      }"
    >
      <span
        v-for="i in ROWS"
        :key="i"
        class="min-h-0 w-full rounded-[2px] transition-colors duration-150"
        :style="{ backgroundColor: cellBg(ROWS - i) }"
      />
    </div>
    <div
      v-if="pctLabel !== ''"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex flex-col items-center justify-end pb-1 pt-4"
      style="background: linear-gradient(to top, rgb(9 9 11 / 0.92) 40%, transparent)"
      :title="`${pctLabel}%`"
    >
      <span
        class="font-mono text-[9px] font-bold leading-none tracking-tight"
        :class="current?.status === 'error' ? 'text-red-400' : 'text-emerald-400'"
      >{{ pctLabel }}</span>
      <span
        class="mt-0.5 font-mono text-[7px] font-bold leading-none"
        :class="current?.status === 'error' ? 'text-red-400/80' : 'text-emerald-400/80'"
      >%</span>
    </div>
  </div>
</template>
