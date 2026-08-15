<!--
  热敏纸（thermal）或紧凑横幅（banner）：
  - thermal：挂在左栏 absolute top-full（与抽屉同列层级，不挡右侧点击）
  - banner：关闭热敏纸时 Teleport；仅有 toast 时挂载，外层 pointer-events-none
-->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useToast } from '../../stores/useToast'

const props = defineProps({
  /** false 时走 banner，保证关闭「热敏纸」后仍有反馈 */
  thermal: { type: Boolean, default: true },
})

const { t } = useI18n()
const toast = useToast()
const { toasts } = storeToRefs(toast)

const receiptRef = ref(null)

const MIN_PAPER_H = 36
const SPIT_PX_PER_SEC = 56
/** 二条及以上量高失败时的保底增量，避免 delta=0 变成覆盖 */
const MIN_LINE_DELTA = 28
/** 可见吐纸区/布局预留上限：固定值——与 EmulatorWidget.PAPER_AREA_H 的井高(180)一致 */
const SPIT_AREA_H = 180
/** 自动裁剪阈值：窗口高度（累积纸长达到一屏即撕下；只管撕纸，不影响布局预留） */
const winH = ref(typeof window === 'undefined' ? 480 : Math.max(160, window.innerHeight))
const onWinResize = () => { winH.value = Math.max(160, window.innerHeight) }
const AUTO_TEAR_H = computed(() => winH.value)

const wellH = ref(0)
/** 整张纸的 translateY；吐纸时从 -delta → 0 */
const spitY = ref(0)

const tearing = ref(false)
/** @type {import('vue').Ref<Array<{ id: number, message: string, type: string }>>} */
const tearItems = ref([])
const tearDriving = ref(false)

/** 已吐出的 id（先到的在数组前 = 纸面上更靠下） */
const revealedIds = ref(/** @type {number[]} */ ([]))
/** @type {number[]} */
let spitQueue = []
let draining = false

let prevHeight = 0
let rafId = 0
let spitRafId = 0
/** @type {Animation | null} */
let tearAnim = null

const toastById = computed(() => {
  /** @type {Map<number, { id: number, message: string, type: string }>} */
  const map = new Map()
  for (const t of toasts.value) map.set(t.id, t)
  return map
})

/** 刀口在上：最新一行贴近刀口，更早的行在下方 */
const liveItems = computed(() => {
  const rows = []
  for (const id of revealedIds.value) {
    const t = toastById.value.get(id)
    if (t) rows.push(t)
  }
  return rows.reverse()
})

const items = computed(() => (tearing.value ? tearItems.value : liveItems.value))

const receiptStyle = computed(() => {
  if (tearing.value || tearDriving.value) return {}
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
  if ((toast.paperHeight || 0) !== h) toast.setPaperHeight(h)
}

function cancelRaf() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function cancelSpitRaf() {
  if (spitRafId) {
    cancelAnimationFrame(spitRafId)
    spitRafId = 0
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
  // 不要用被父级裁切影响的 clientHeight；scrollHeight / 强制布局更稳
  void el.offsetHeight
  return Math.max(el.scrollHeight || 0, el.offsetHeight || 0)
}

/** 量「贴刀口那一行」的占位高度（含与下一行的分隔） */
function measureTopLineDelta(receipt) {
  if (!receipt) return MIN_LINE_DELTA
  const lines = receipt.querySelectorAll('.toast-line')
  const top = lines[0]
  if (!top) return MIN_LINE_DELTA
  const style = window.getComputedStyle(top)
  const mt = Number.parseFloat(style.marginTop) || 0
  const mb = Number.parseFloat(style.marginBottom) || 0
  // 第二行起才有分隔，但新行在最上时，分隔在「新行与旧行」之间，落在旧行（lines[1]）上
  let sep = 0
  const second = lines[1]
  if (second) {
    const s2 = window.getComputedStyle(second)
    sep =
      (Number.parseFloat(s2.marginTop) || 0) +
      (Number.parseFloat(s2.paddingTop) || 0) +
      (Number.parseFloat(s2.borderTopWidth) || 0)
  }
  const h = top.getBoundingClientRect().height || top.offsetHeight || MIN_LINE_DELTA
  return Math.max(MIN_LINE_DELTA, Math.ceil(h + mt + mb + sep))
}

function resetSpitState() {
  spitQueue = []
  draining = false
  revealedIds.value = []
  prevHeight = 0
  spitY.value = 0
  cancelRaf()
  cancelSpitRaf()
  cancelTearAnim()
  wellH.value = 0
  reportArea(false)
}

function animateWell(fromWell, toWell, durationMs) {
  return new Promise((resolve) => {
    cancelRaf()
    const start = performance.now()
    wellH.value = fromWell
    reportArea(fromWell > 0)
    const tick = (now) => {
      if (tearing.value) {
        rafId = 0
        resolve()
        return
      }
      const t = Math.min(1, (now - start) / Math.max(1, durationMs))
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

/** 整张纸 translateY：from → to，与井高同步 */
function animateSpitY(fromY, toY, durationMs) {
  return new Promise((resolve) => {
    cancelSpitRaf()
    const start = performance.now()
    spitY.value = fromY
    const tick = (now) => {
      if (tearing.value) {
        spitRafId = 0
        resolve()
        return
      }
      const t = Math.min(1, (now - start) / Math.max(1, durationMs))
      spitY.value = fromY + (toY - fromY) * t
      if (t < 1) spitRafId = requestAnimationFrame(tick)
      else {
        spitY.value = toY
        spitRafId = 0
        resolve()
      }
    }
    spitRafId = requestAnimationFrame(tick)
  })
}

/**
 * 等 DOM 行数对齐后再量高（二条时 nextTick 偶发仍是旧高 → delta=0 → 覆盖）
 */
async function waitLinesReady(expected) {
  for (let i = 0; i < 8; i++) {
    await nextTick()
    const n = receiptRef.value?.querySelectorAll('.toast-line')?.length || 0
    if (n >= expected) {
      await rAF()
      return true
    }
    await rAF()
  }
  return (receiptRef.value?.querySelectorAll('.toast-line')?.length || 0) >= expected
}

/**
 * 吐出刚揭示的那一行：
 * 先 -delta（新行藏刀口，旧行视觉不动）→ 再落到 0（整张一起下）
 */
async function spitCurrentSheet() {
  if (tearing.value) return
  const expectedLines = revealedIds.value.length
  if (!expectedLines) {
    prevHeight = 0
    wellH.value = 0
    spitY.value = 0
    reportArea(false)
    return
  }

  const oldH = Math.max(0, prevHeight)

  // 二条起：揭示前就抬纸，避免首帧新行盖住旧行
  if (oldH > 0) {
    spitY.value = -MIN_LINE_DELTA
    wellH.value = Math.min(oldH, SPIT_AREA_H)
    reportArea(true)
  }

  await waitLinesReady(expectedLines)
  if (tearing.value) return

  const receipt = receiptRef.value
  if (!receipt) {
    // 没有节点就按保底长高，避免卡死队列
    const fallback = oldH > 0 ? oldH + MIN_LINE_DELTA : MIN_PAPER_H
    prevHeight = fallback
    wellH.value = Math.min(fallback, SPIT_AREA_H)
    spitY.value = 0
    reportArea(true)
    return
  }

  // 保持井=旧高 + 已上移，避免量高时撑开闪帧；scrollHeight 不受 overflow 裁切
  wellH.value = Math.min(oldH || MIN_PAPER_H, SPIT_AREA_H)
  await nextTick()
  void receipt.offsetHeight

  let newH = measureReceipt(receipt)
  const lineDelta = oldH > 0 ? measureTopLineDelta(receipt) : 0

  if (oldH <= 0) {
    if (newH < MIN_PAPER_H) newH = MIN_PAPER_H
  } else {
    // 关键：整表增量 与 「顶行占位」取大，杜绝 delta=0 变成覆盖
    const bySheet = Math.max(0, newH - oldH)
    const delta = Math.max(bySheet, lineDelta, MIN_LINE_DELTA)
    newH = oldH + delta
  }

  const delta = oldH <= 0 ? newH : newH - oldH
  const fromWell = Math.min(oldH, SPIT_AREA_H)
  const toWell = Math.min(newH, SPIT_AREA_H)
  const duration = Math.max(320, Math.round((delta / SPIT_PX_PER_SEC) * 1000))

  spitY.value = -delta
  wellH.value = fromWell
  reportArea(fromWell > 0)
  await rAF()

  try {
    await Promise.all([
      animateSpitY(-delta, 0, duration),
      animateWell(fromWell, toWell, duration),
    ])
  } catch {
    /* cancelled */
  }

  spitY.value = 0
  prevHeight = newH
  wellH.value = toWell
  reportArea(true)
}

async function drainSpitQueue() {
  if (draining || tearing.value) return
  draining = true
  try {
    while (spitQueue.length && !tearing.value) {
      const id = spitQueue.shift()
      if (id == null) continue
      if (revealedIds.value.includes(id)) continue
      if (!toastById.value.has(id)) continue

      revealedIds.value = [...revealedIds.value, id]
      await spitCurrentSheet()
    }
    // 自动裁剪：待吐队列排空后纸仍超最大高度 → 自动撕下（先放完再撕，不吞队列里的消息）
    if (!tearing.value && liveItems.value.length && prevHeight >= AUTO_TEAR_H.value) {
      await tearOff()
    }
  } finally {
    draining = false
    if (spitQueue.length && !tearing.value) void drainSpitQueue()
  }
}

function enqueueNewToasts(ids) {
  if (tearing.value) return
  const known = new Set([...revealedIds.value, ...spitQueue])
  let added = false
  for (const id of ids) {
    if (known.has(id)) continue
    spitQueue.push(id)
    known.add(id)
    added = true
  }
  if (added) {
    // 立刻预留最小纸高，避免吐纸动画首帧被 body overflow 裁切
    if ((toast.paperHeight || 0) < MIN_PAPER_H) toast.setPaperHeight(MIN_PAPER_H)
    void drainSpitQueue()
  }
}

async function tearOff(e) {
  e?.preventDefault?.()
  e?.stopPropagation?.()
  if (tearing.value || !liveItems.value.length) return

  spitQueue = []
  draining = false
  cancelRaf()
  cancelSpitRaf()
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
    revealedIds.value = []
    toast.clear()
    prevHeight = 0
    wellH.value = 0
    reportArea(false)
    return
  }

  try {
    receipt.getAnimations?.().forEach((a) => a.cancel())
  } catch {
    /* ignore */
  }

  const holdWell = Math.max(wellH.value, measureReceipt(receipt) || MIN_PAPER_H, MIN_PAPER_H)
  wellH.value = holdWell
  revealedIds.value = []
  toast.clear()
  prevHeight = 0

  const fall = Math.max(480, holdWell + 320)
  tearAnim = receipt.animate(
    [
      { transform: 'translateY(0px) rotateZ(0deg) skewX(0deg)', offset: 0 },
      { transform: 'translateY(12px) rotateZ(-22deg) skewX(-8deg)', offset: 0.12 },
      { transform: `translateY(${fall * 0.45}px) rotateZ(-32deg) skewX(-10deg)`, offset: 0.45 },
      { transform: `translateY(${fall}px) rotateZ(-38deg) skewX(-12deg)`, offset: 1 },
    ],
    {
      duration: 700,
      easing: 'cubic-bezier(0.2, 0.05, 0.55, 1)',
      fill: 'forwards',
    },
  )

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
  () => toasts.value.map((t) => t.id),
  (ids) => {
    if (!props.thermal) {
      // banner 模式不跑吐纸机；清空热敏纸占位高度
      if (toast.paperHeight) toast.setPaperHeight(0)
      return
    }
    if (tearing.value) return
    if (!ids.length) {
      resetSpitState()
      return
    }
    enqueueNewToasts(ids)
  },
  { immediate: true },
)

watch(
  () => props.thermal,
  (on) => {
    if (!on) {
      resetSpitState()
      return
    }
    if (toasts.value.length) enqueueNewToasts(toasts.value.map((t) => t.id))
  },
)

onMounted(() => window.addEventListener('resize', onWinResize))
onBeforeUnmount(() => window.removeEventListener('resize', onWinResize))

onMounted(() => {
  if (props.thermal && toasts.value.length) {
    enqueueNewToasts(toasts.value.map((t) => t.id))
  }
})

onBeforeUnmount(() => {
  spitQueue = []
  draining = false
  cancelRaf()
  cancelSpitRaf()
  cancelTearAnim()
  toast.setPaperHeight(0)
})

function bannerClass(type) {
  if (type === 'success') return 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
  if (type === 'error') return 'border-red-500/40 bg-red-950 text-red-100'
  return 'border-white/15 bg-zinc-900 text-zinc-100'
}

function dismissBanner(id) {
  toast.dismiss(id)
}
</script>

<template>
  <!-- 关闭热敏纸：仅有消息时挂载；外层永不接收指针 -->
  <Teleport v-if="!thermal && toasts.length" to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-3 z-[9999] flex flex-col items-center gap-1.5 px-3"
      aria-live="polite"
    >
      <button
        v-for="item in toasts"
        :key="item.id"
        data-no-drag
        type="button"
        class="pointer-events-auto max-w-[min(420px,92vw)] rounded-md border px-3 py-2 text-left font-mono text-[11px] font-medium leading-snug shadow-lg shadow-black/40"
        :class="bannerClass(item.type)"
        :title="item.message"
        @click="dismissBanner(item.id)"
      >
        <span class="mr-1.5 text-[9px] font-bold tracking-wider opacity-70">[{{ mark(item.type).tag }}]</span>
        {{ item.message }}
      </button>
    </div>
  </Teleport>

  <!-- 热敏纸：absolute 在左栏卡片下沿；外层 pointer-events-none，仅刀口/纸可点 -->
  <div
    v-else-if="thermal"
    class="pointer-events-none absolute left-0 top-full z-10 flex w-full -translate-y-[3px] flex-col items-stretch overflow-visible px-4"
    aria-live="polite"
  >
    <div
      data-no-drag
      class="toast-mouth pointer-events-auto relative mx-auto flex w-[78%] flex-col items-stretch overflow-visible"
    >
      <div
        class="toast-cutter relative z-50 shrink-0 cursor-pointer"
        :title="t('toast.tearHint')"
        role="button"
        tabindex="-1"
        :aria-label="t('toast.tearHint')"
        @pointerdown.stop
        @click.stop.prevent="tearOff"
      >
        <div class="toast-cutter-lip" />
        <div class="toast-cutter-slot" />
        <div class="toast-cutter-blade" />
      </div>

      <div class="toast-stage relative z-30 -mt-[8px] w-full">
        <div
          class="toast-spit-well w-full"
          :class="{ 'toast-spit-well--tearing': tearing }"
          :style="{ height: `${wellH}px` }"
        >
          <div
            v-if="items.length"
            ref="receiptRef"
            data-no-drag
            class="toast-receipt relative z-40 m-0 w-full cursor-pointer px-3 py-2.5 font-mono text-[10px] text-zinc-800"
            :class="{ 'toast-receipt--tearing': tearing || tearDriving }"
            :style="receiptStyle"
            role="button"
            tabindex="0"
            :title="t('toast.tearHint')"
            :aria-label="t('toast.tearHint')"
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
  padding-top: 14px;
  padding-bottom: 12px;
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
