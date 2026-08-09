<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Sparkle } from '@lucide/vue'

const props = defineProps({
  /** 烧录中：加快、加多环境星星 */
  busy: { type: Boolean, default: false },
  /** 0~1，越大越快越多 */
  intensity: { type: Number, default: 0 },
})

const burstStars = ref([])
let nextStarId = 1
const timers = new Set()

const baseAmbient = [
  { left: 6, delay: 0.1, duration: 1.9, size: 7 },
  { left: 14, delay: 1.2, duration: 2.3, size: 5 },
  { left: 23, delay: 0.6, duration: 1.7, size: 6 },
  { left: 31, delay: 1.6, duration: 2.1, size: 5 },
  { left: 39, delay: 0.3, duration: 2.5, size: 7 },
  { left: 47, delay: 1.9, duration: 1.8, size: 5 },
  { left: 55, delay: 0.8, duration: 2.2, size: 8 },
  { left: 63, delay: 1.4, duration: 2.4, size: 5 },
  { left: 71, delay: 0.4, duration: 1.8, size: 6 },
  { left: 79, delay: 2.0, duration: 2.5, size: 7 },
  { left: 87, delay: 1.0, duration: 2.0, size: 5 },
  { left: 94, delay: 0.2, duration: 2.3, size: 6 },
]

const busyExtra = [
  { left: 10, delay: 0.05, duration: 1.1, size: 6 },
  { left: 18, delay: 0.35, duration: 0.95, size: 5 },
  { left: 27, delay: 0.15, duration: 1.05, size: 7 },
  { left: 35, delay: 0.55, duration: 0.9, size: 5 },
  { left: 42, delay: 0.25, duration: 1.0, size: 6 },
  { left: 50, delay: 0.45, duration: 0.85, size: 5 },
  { left: 58, delay: 0.2, duration: 1.15, size: 7 },
  { left: 66, delay: 0.6, duration: 0.95, size: 5 },
]

const ambientStars = computed(() => {
  if (!props.busy) return baseAmbient
  const speed = Math.max(0.35, 1 - props.intensity * 0.55)
  const scaled = [...baseAmbient, ...busyExtra].map((s, i) => ({
    ...s,
    delay: s.delay * speed * 0.4,
    duration: Math.max(0.45, s.duration * speed),
    size: s.size + (i % 3 === 0 ? 1 : 0),
  }))
  return scaled
})

function addStar() {
  const id = nextStarId++
  const positions = [18, 34, 50, 66, 82]
  burstStars.value.push({ id, left: positions[id % positions.length] })
  const timer = setTimeout(() => {
    burstStars.value = burstStars.value.filter((star) => star.id !== id)
    timers.delete(timer)
  }, 900)
  timers.add(timer)
}

watch(
  () => props.busy,
  (on) => {
    if (!on) return
    for (let i = 0; i < 4; i++) setTimeout(() => addStar(), i * 80)
  },
)

onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <div class="unknown-cartridge relative h-full w-full overflow-hidden">
    <Sparkle
      v-for="(star, index) in ambientStars"
      :key="index + '-' + (busy ? 'b' : 'n')"
      class="ambient-star pointer-events-none absolute fill-amber-300 text-amber-400"
      :style="{
        left: star.left + '%',
        width: star.size + 'px',
        height: star.size + 'px',
        animationDelay: star.delay + 's',
        animationDuration: star.duration + 's',
      }"
    />
    <Sparkle
      v-for="star in burstStars"
      :key="star.id"
      class="burst-star pointer-events-none absolute bottom-2 h-2.5 w-2.5 fill-amber-300 text-amber-400"
      :style="{ left: star.left + '%' }"
    />
    <button
      data-no-drag
      type="button"
      class="unknown-mark absolute bottom-0 left-1/2 h-[88px] w-[110px] cursor-pointer pb-1 text-[75px] font-black italic leading-none text-zinc-700"
      aria-label="Unknown cartridge"
      title="Click to reveal another star"
      @click="addStar"
    >?</button>
  </div>
</template>

<style scoped>
.unknown-mark { transform: translateX(-50%) rotate(14deg); text-shadow: 2px 2px 0 rgba(250, 204, 21, 0.35); transition: transform 120ms ease; }
.unknown-mark:active { transform: translateX(-50%) rotate(14deg) scale(0.88); }
.ambient-star { bottom: 2px; opacity: 0; animation-name: star-rise; animation-timing-function: ease-out; animation-iteration-count: infinite; }
.burst-star { animation: star-burst 850ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes star-rise {
  0% { opacity: 0; transform: translate3d(0, 3px, 0) scale(0.45) rotate(0deg); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(-4px, -34px, 0) scale(1.15) rotate(100deg); }
}
@keyframes star-burst {
  0% { opacity: 0; transform: translate(-50%, 4px) scale(0.25) rotate(0deg); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -38px) scale(1.5) rotate(150deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ambient-star { animation: none; opacity: 0.65; }
  .burst-star { animation-duration: 1ms; }
}
</style>
