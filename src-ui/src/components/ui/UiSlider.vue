<!-- 音量条风格滑块：原生 range + appearance-none 自绘轨道，填充段用渐变背景按百分比着色。
     ticks 开启时在轨道下方按 step 渲染刻度点，已越过的高亮（与音量条档位标识一致）。
     WebView2/Chromium 走 ::-webkit-slider-thumb，Firefox 走 ::-moz-range-thumb。 -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
  disabled: { type: Boolean, default: false },
  /** 轨道下方按 step 渲染每档刻度点 */
  ticks: { type: Boolean, default: false },
  /** 无可见文字时的 aria-label / title */
  label: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'commit'])

function onInput(event) {
  const v = Number(event.target.value)
  if (Number.isFinite(v)) emit('update:modelValue', v)
}

/** 拖动松手 / 点击落定 / 键盘步进时触发；value 为最终落定值。 */
function onChange(event) {
  const v = Number(event.target.value)
  if (Number.isFinite(v)) emit('commit', v)
}

const percent = computed(() => {
  const span = props.max - props.min || 1
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100))
})

const trackStyle = computed(() => ({
  background: `linear-gradient(to right, #34d399 0%, #34d399 ${percent.value}%, #3f3f46 ${percent.value}%, #3f3f46 100%)`,
}))

// 刻度：每档一个点；档位过多（> 25）时放弃刻度避免糊成一条线。
// 刻度行左右内缩半个滑块头宽（w-3.5 → 7px），使刻度与滑块头在各档位的圆心对齐。
const thumbInset = 'mx-[7px]'
const tickPositions = computed(() => {
  if (!props.ticks) return []
  const count = Math.round((props.max - props.min) / props.step) + 1
  if (count < 2 || count > 32) return []
  const activeIndex = Math.round((props.modelValue - props.min) / props.step)
  return Array.from({ length: count }, (_, i) => ({
    left: (i / (count - 1)) * 100,
    active: i <= activeIndex,
  }))
})
</script>

<template>
  <div class="w-full" data-no-drag>
    <input
      type="range"
      data-no-drag
      class="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-40 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-black/40 [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110"
      :style="trackStyle"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="label || undefined"
      :title="label || undefined"
      @input="onInput"
      @change="onChange"
      @mousedown.stop
      @pointerdown.stop
    />
    <div v-if="tickPositions.length" :class="thumbInset" class="relative mt-1 h-1" aria-hidden="true">
      <span
        v-for="(tick, i) in tickPositions"
        :key="i"
        class="absolute top-0 h-1 w-px -translate-x-1/2 rounded-full"
        :class="tick.active ? 'bg-emerald-400' : 'bg-zinc-600'"
        :style="{ left: `${tick.left}%` }"
      />
    </div>
  </div>
</template>
