<!-- 「下载 SKYEMU」正下方：WAAPI 恒速吐纸；点击从刀口撕下坠落（非展开） -->
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from '../../stores/useToast'

const toast = useToast()
const { toasts } = storeToRefs(toast)

const receiptRef = ref(null)
const wellRef = ref(null)

/** 可见吐纸区上限（与 EmulatorWidget.SPIT_H 一致） */
const SPIT_AREA_H = 320
/** 有纸时井高下限，避免只剩一两行时纸条过短 */
const MIN_PAPER_H = 168
const SPIT_PX_PER_SEC = 56

const wellH = ref(0)
const spitY = ref(0)

const tearing = ref(false)
/** @type {import('vue').Ref<Array<{ id: number, message: string, type: string }>>} */
const tearItems = ref([])
/** 撕纸时 transform 由 WAAPI 接管，这里只作结束清理 */
const tearDriving = ref(false)

/** 吐纸进行中：transform 交给 WAAPI，避免 Vue :style 抢写 */
const spitDriving = ref(false)

let prevHeight = 0
let animating = false
let pendingGrow = false
let rafId = 0
/** @type {Animation | null} */
let spitAnim = null
/** @type {Animation | null} */
let tearAnim = null

const liveItems = computed(() => [...toasts.value].reverse())
const items = computed(() => (tearing.value ? tearItems.value : liveItems.value))

const receiptStyle = computed(() => {
  if (tearing.value || tearDriving.value || spitDriving.value) return {}
  return { transform: `translateY(${spitY.value}px)` }
})

function mark(type) {
  if (type === 'success') return { tag: 'OK', cls: 'text-emerald-800/80' }
  if (type === 'error') return { tag: 'ERR', cls: 'text-red-800/80' }
  return { tag: 'INFO', cls: 'text-zinc-700/70' }
}

function reportArea(occupied) {
  if (!occupied) {
    toast.setPaperHeight(0)
    return
  }
  const h = Math.min(Math.max(wellH.value, MIN_PAPER_H), SPIT_AREA_H)
  toast.setPaperHeight(h)
}

function cancelRaf() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function cancelSpitAnim() {
  if (spitAnim) {
    try {
      spitAnim.cancel()
    } catch {
      /* ignore */
    }
    spitAnim = null
  }
}

function cancelTearAnim() {
  if (tearAnim) {
    try {
      tearAnim.cancel()
    } catch {
      /* ignore */
    }
    tearAnim = null
  }
}

function rAF() {
  return new Promise((r) => requestAnimationFrame(r))
}

function measureReceipt(el) {
  if (!el) return 0
  return Math.max(el.scrollHeight || 0, el.offsetHeight || 0)
}

function finishSpit() {
  animating = false
  spitDriving.value = false
  spitY.value = 0
  const el = receiptRef.value
  if (el && !tearing.value) el.style.transform = 'translateY(0px)'
  if (tearing.value) return
  if (liveItems.value.length) {
    const h = measureReceipt(receiptRef.value) || prevHeight
    wellH.value = Math.min(Math.max(h, MIN_PAPER_H), SPIT_AREA_H)
    reportArea(true)
  } else {
    wellH.value = 0
    reportArea(false)
  }
  if (pendingGrow) {
    pendingGrow = false
    void spitGrow()
  }
}

function animateWell(fromWell, toWell, durationMs) {
  return new Promise((resolve) => {
    cancelRaf()
    const start = performance.now()
    wellH.value = fromWell
    reportArea(true)
    const tick = (now) => {
      if (tearing.value) {
        rafId = 0
        resolve()
        return
      }
      const t = Math.min(1, (now - start) / durationMs)
      wellH.value = fromWell + (toWell - fromWell) * t
      reportArea(true)
      if (t < 1) rafId = requestAnimationFrame(tick)
      else {
        wellH.value = toWell
        reportArea(true)
        rafId = 0
        resolve()
      }
    }
    rafId = requestAnimationFrame(tick)
  })
}

async function spitGrow() {
  if (tearing.value) return
  if (animating) {
    pendingGrow = true
    return
  }
  animating = true

  await nextTick()
  await rAF()
  await nextTick()
  await rAF()

  if (tearing.value) {
    animating = false
    return
  }

  let receipt = receiptRef.value
  if (!receipt || !liveItems.value.length) {
    await nextTick()
    await rAF()
    receipt = receiptRef.value
  }
  if (!receipt || !liveItems.value.length) {
    prevHeight = 0
    finishSpit()
    return
  }

  const prevWell = wellH.value
  wellH.value = Math.max(prevWell, SPIT_AREA_H)
  void receipt.offsetHeight
  const newH = measureReceipt(receipt)
  wellH.value = prevWell
  void (wellRef.value || receipt).offsetHeight

  const oldH = prevHeight
  const delta = newH - oldH
  const fromWell = Math.min(oldH, SPIT_AREA_H)
  const toWell = Math.min(Math.max(newH, MIN_PAPER_H), SPIT_AREA_H)

  if (delta <= 0 || newH <= 0) {
    prevHeight = Math.max(newH, oldH)
    spitY.value = 0
    wellH.value = toWell || Math.max(prevHeight, MIN_PAPER_H)
    finishSpit()
    return
  }

  prevHeight = newH
  const duration = Math.max(420, Math.round((delta / SPIT_PX_PER_SEC) * 1000))

  spitDriving.value = true
  spitY.value = -delta
  wellH.value = fromWell
  receipt.style.transform = `translateY(${-delta}px)`
  void receipt.offsetHeight
  reportArea(true)

  cancelSpitAnim()
  spitAnim = receipt.animate(
    [
      { transform: `translateY(${-delta}px)` },
      { transform: 'translateY(0px)' },
    ],
    { duration, easing: 'linear', fill: 'forwards' },
  )

  try {
    await Promise.all([spitAnim.finished.catch(() => {}), animateWell(fromWell, toWell, duration)])
  } catch {
    /* cancelled */
  }

  cancelSpitAnim()
  if (receipt) receipt.style.transform = 'translateY(0px)'
  spitY.value = 0
  spitDriving.value = false
  finishSpit()
}

/** 点击：整张纸从刀口拧断并坠落（扭转前置、幅度够大） */
async function tearOff(e) {
  e?.preventDefault?.()
  e?.stopPropagation?.()
  if (tearing.value || !liveItems.value.length) return

  pendingGrow = false
  animating = false
  spitDriving.value = false
  cancelRaf()
  cancelSpitAnim()
  cancelTearAnim()

  tearItems.value = liveItems.value.map((t) => ({ ...t }))
  tearing.value = true
  tearDriving.value = true
  spitY.value = 0

  await nextTick()
  await rAF()

  let receipt = receiptRef.value
  if (!receipt) {
    tearing.value = false
    tearDriving.value = false
    tearItems.value = []
    return
  }

  try {
    receipt.getAnimations?.().forEach((a) => a.cancel())
  } catch {
    /* ignore */
  }

  const holdWell = Math.max(wellH.value, measureReceipt(receipt) || MIN_PAPER_H, MIN_PAPER_H)
  wellH.value = holdWell
  toast.clear()
  prevHeight = 0

  const fall = Math.max(480, holdWell + 320)
  // 一开始就拧开（约 -22°），坠落过程拧到 -38°，避免「只有下落没有扭转」
  tearAnim = receipt.animate(
    [
      {
        transform: 'translateY(0px) rotateZ(0deg) skewX(0deg)',
        offset: 0,
      },
      {
        transform: 'translateY(12px) rotateZ(-22deg) skewX(-8deg)',
        offset: 0.12,
      },
      {
        transform: `translateY(${fall * 0.45}px) rotateZ(-32deg) skewX(-10deg)`,
        offset: 0.45,
      },
      {
        transform: `translateY(${fall}px) rotateZ(-38deg) skewX(-12deg)`,
        offset: 1,
      },
    ],
    {
      duration: 700,
      easing: 'cubic-bezier(0.2, 0.05, 0.55, 1)',
      fill: 'forwards',
    },
  )

  // 井高后半段收起
  const wellPromise = new Promise((resolve) => {
    const start = performance.now()
    const duration = 700
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      if (p > 0.5) {
        const s = (p - 0.5) / 0.5
        wellH.value = holdWell * (1 - s)
        reportArea(wellH.value > 4)
      } else {
        reportArea(true)
      }
      if (p < 1) rafId = requestAnimationFrame(tick)
      else {
        rafId = 0
        resolve()
      }
    }
    rafId = requestAnimationFrame(tick)
  })

  try {
    await Promise.all([tearAnim.finished.catch(() => {}), wellPromise])
  } catch {
    /* cancelled */
  }

  cancelTearAnim()
  tearItems.value = []
  wellH.value = 0
  tearing.value = false
  tearDriving.value = false
  reportArea(false)
}

watch(
  () => toasts.value.map((t) => t.id).join(','),
  (ids, prevIds) => {
    if (tearing.value) return
    if (!ids) {
      prevHeight = 0
      animating = false
      pendingGrow = false
      spitDriving.value = false
      cancelRaf()
      cancelSpitAnim()
      cancelTearAnim()
      spitY.value = 0
      wellH.value = 0
      reportArea(false)
      return
    }
    const grew = !prevIds || ids.split(',').length > prevIds.split(',').length
    if (grew) void spitGrow()
    else {
      nextTick(() => {
        if (tearing.value) return
        prevHeight = measureReceipt(receiptRef.value)
        wellH.value = Math.min(Math.max(prevHeight, MIN_PAPER_H), SPIT_AREA_H)
        spitY.value = 0
        reportArea(true)
      })
    }
  },
)

onBeforeUnmount(() => {
  cancelRaf()
  cancelSpitAnim()
  cancelTearAnim()
  reportArea(false)
})
</script>

<template>
  <div
    class="pointer-events-none absolute left-0 top-full z-[100] flex w-full -translate-y-[3px] flex-col items-stretch overflow-visible px-4"
    aria-live="polite"
  >
    <div
      data-no-drag
      class="toast-mouth pointer-events-auto relative mx-auto flex w-[78%] flex-col items-stretch overflow-visible"
    >
      <div
        class="toast-cutter relative z-50 shrink-0 cursor-pointer"
        title="点击撕下热敏纸"
        role="button"
        tabindex="-1"
        aria-label="点击撕下热敏纸"
        @pointerdown.stop
        @click.stop.prevent="tearOff"
      >
        <div class="toast-cutter-lip" />
        <div class="toast-cutter-slot" />
        <div class="toast-cutter-blade" />
      </div>

      <div class="toast-stage relative z-30 -mt-[8px] w-full">
        <div
          ref="wellRef"
          class="toast-spit-well w-full"
          :class="{ 'toast-spit-well--tearing': tearing }"
          :style="{ height: `${wellH}px` }"
        >
          <div
            v-if="items.length"
            ref="receiptRef"
            data-no-drag
            class="toast-receipt relative z-40 m-0 w-full cursor-pointer px-3 py-2.5 font-mono text-[10px] text-zinc-800"
            :class="{ 'toast-receipt--tearing': tearing }"
            :style="receiptStyle"
            role="button"
            tabindex="0"
            title="点击撕下热敏纸"
            aria-label="点击撕下热敏纸"
            @pointerdown.stop
            @click.stop.prevent="tearOff"
            @keydown.enter.prevent="tearOff"
            @keydown.space.prevent="tearOff"
          >
            <div
              v-for="item in items"
              :key="item.id"
              class="toast-line flex items-start gap-1.5"
            >
              <span
                class="mt-px shrink-0 text-[9px] font-bold tracking-wider"
                :class="mark(item.type).cls"
              >[{{ mark(item.type).tag }}]</span>
              <p class="min-w-0 flex-1 text-[10px] font-medium leading-snug tracking-tight text-zinc-800 break-words">
                {{ item.message }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-cutter-lip {
  height: 3px;
  border-radius: 1px 1px 0 0;
  background: linear-gradient(180deg, #3f3f46 0%, #27272a 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.toast-cutter-slot {
  height: 4px;
  margin: 0 1px;
  background: linear-gradient(180deg, #09090b 0%, #18181b 55%, #3f3f46 100%);
  box-shadow:
    inset 0 2px 3px rgba(0, 0, 0, 0.65),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06);
}

.toast-cutter-blade {
  height: 1px;
  margin: 0 2px;
  background: rgba(24, 24, 27, 0.55);
}

.toast-spit-well {
  overflow: hidden;
  box-sizing: border-box;
  height: 0;
}

.toast-spit-well--tearing {
  overflow: visible;
}

.toast-receipt {
  background-color: #fdfdfd;
  background-image: radial-gradient(circle at 10px 0, transparent 10px, #fdfdfd 11px);
  background-size: 20px 12px;
  background-repeat: repeat-x;
  background-position: top left;
  border: 1px solid rgba(228, 228, 231, 0.5);
  border-top: none;
  box-shadow: none;
  color: #27272a;
  min-height: 168px;
  padding-top: 14px;
  padding-bottom: 18px;
  will-change: transform;
  transform-origin: top center;
}

.toast-receipt--tearing {
  pointer-events: none;
  user-select: none;
  box-shadow: none;
}

.toast-line + .toast-line {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(161, 161, 170, 0.4);
}
</style>
