<!-- 紧凑横条进度：随机点亮，统一绿色，已亮不熄。 -->
<script setup>
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  active: { type: Boolean, default: false },
  done: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, default: 'running' },
  resetKey: { type: [Number, String], default: 0 },
  cells: { type: Number, default: 48 },
})

const LIT = '#40c463'
const ERROR = '#f87171'
const EMPTY = '#3f3f46'

const order = ref([])
const litMask = ref([])
let pulseTimer = null

function litCount() {
  return litMask.value.reduce((n, v) => n + (v ? 1 : 0), 0)
}

function shuffleOrder() {
  const n = props.cells
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  order.value = idx
  litMask.value = Array.from({ length: n }, () => false)
}

function stopPulse() {
  if (pulseTimer) {
    clearInterval(pulseTimer)
    pulseTimer = null
  }
}

function lightUpTo(count) {
  const target = Math.max(0, Math.min(props.cells, count))
  let n = litCount()
  if (target <= n) return
  const next = litMask.value.slice()
  for (const i of order.value) {
    if (n >= target) break
    if (!next[i]) {
      next[i] = true
      n++
    }
  }
  litMask.value = next
}

function startPulse() {
  stopPulse()
  lightUpTo(3)
  pulseTimer = setInterval(() => {
    if (!props.active || props.status !== 'running' || props.total > 0) {
      stopPulse()
      return
    }
    if (litCount() < 8) lightUpTo(litCount() + 1)
  }, 400)
}

function sync() {
  if (!props.active) {
    stopPulse()
    litMask.value = Array.from({ length: props.cells }, () => false)
    return
  }
  if (props.status === 'success') {
    stopPulse()
    lightUpTo(props.cells)
    return
  }
  if (props.status === 'error') {
    stopPulse()
    lightUpTo(Math.max(litCount(), Math.round(props.cells * 0.3)))
    return
  }
  if (props.total > 0) {
    stopPulse()
    lightUpTo(Math.round(Math.min(1, props.done / props.total) * props.cells))
    return
  }
  if (!pulseTimer) startPulse()
}

watch(
  () => [props.active, props.resetKey],
  () => {
    stopPulse()
    if (!props.active) {
      litMask.value = Array.from({ length: props.cells }, () => false)
      return
    }
    shuffleOrder()
    sync()
  },
  { immediate: true },
)

watch(
  () => [props.done, props.total, props.status],
  () => sync(),
)

onUnmounted(stopPulse)

function cellBg(i) {
  if (!litMask.value[i]) return EMPTY
  if (props.status === 'error') return ERROR
  return LIT
}
</script>

<template>
  <div
    class="grid w-full gap-px"
    :style="{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }"
  >
    <span
      v-for="i in cells"
      :key="i"
      class="h-2.5 rounded-[2px] transition-colors duration-150"
      :style="{ backgroundColor: cellBg(i - 1) }"
    />
  </div>
</template>
