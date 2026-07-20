<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogStore } from '../../../stores/useLogStore'
import { loadRandom, count } from '../../../data/sprites.js'

const { logs } = storeToRefs(useLogStore())
const canvasRef    = ref(null)
const isLoading    = ref(false)
const isPlaying    = ref(false)
const spriteData   = ref(null)
const currentId    = ref(null)
const isSilhouette = ref(false)
const mode         = ref('scatter')

const N    = 80
const CELL = 3
const C    = N * CELL   // 240

const LOG_PALETTE = {
  info: '#9be9a8', success: '#40c463', warn: '#ffa657', error: '#f85149', latest: '#216e39',
}

// 剪影状态颜色（白 + 浅灰斜线）
const SIL_BG    = '#e5e7eb'   // gray-200 透明格底色
const SIL_SLASH = '#9ca3af'   // gray-400 透明格斜线
const SIL_FILL  = '#ffffff'   // 不透明格剪影色（白）

// 动画写入状态（暗底 + 青色斜线）
const WR_BG    = '#0d0d0d'
const WR_SLASH = '#22d3ee'    // cyan-400 写入中

// 填充完成后透明格颜色
const EMPTY_C = '#27272a'

const MODES = [
  { key: 'scatter',  label: 'Scatter'  },
  { key: 'radial',   label: 'Radial'   },
  { key: 'diagonal', label: 'Diag'     },
  { key: 'rain',     label: 'Rain'     },
  { key: 'spiral',   label: 'Spiral'   },
  { key: 'snake',    label: 'Snake'    },
  { key: 'matrix',   label: 'Matrix'   },
  { key: 'wave',     label: 'Wave'     },
  { key: 'shatter',  label: 'Shatter'  },
  { key: 'diamond',  label: 'Diamond'  },
]

// ── 斜线格（剪影背景态）───────────────────────────────────────────────────
function drawBgSlash(ctx, gx, gy) {
  const x = gx * CELL, y = gy * CELL
  ctx.fillStyle = SIL_BG
  ctx.fillRect(x, y, CELL, CELL)
  ctx.fillStyle = SIL_SLASH
  ctx.fillRect(x + 2, y + 0, 1, 1)
  ctx.fillRect(x + 1, y + 1, 1, 1)
  ctx.fillRect(x + 0, y + 2, 1, 1)
}

// ── 斜线格（写入进行中）─────────────────────────────────────────────────
function drawWriteSlash(ctx, gx, gy) {
  const x = gx * CELL, y = gy * CELL
  ctx.fillStyle = WR_BG
  ctx.fillRect(x, y, CELL, CELL)
  ctx.fillStyle = WR_SLASH
  ctx.fillRect(x + 2, y + 0, 1, 1)
  ctx.fillRect(x + 1, y + 1, 1, 1)
  ctx.fillRect(x + 0, y + 2, 1, 1)
}

// ── 动画顺序 ──────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildOrder(m) {
  const total = N * N
  const arr   = Array.from({ length: total }, (_, i) => i)
  const cx = (N - 1) / 2, cy = (N - 1) / 2

  switch (m) {
    case 'scatter':
      return shuffle(arr)

    case 'radial':
      return arr.sort((a, b) => {
        const ax = a % N - cx, ay = Math.floor(a / N) - cy
        const bx = b % N - cx, by = Math.floor(b / N) - cy
        return (ax * ax + ay * ay) - (bx * bx + by * by)
      })

    case 'diagonal':
      return arr.sort((a, b) => {
        const ad = (a % N) + Math.floor(a / N) + Math.random() * 0.8
        const bd = (b % N) + Math.floor(b / N) + Math.random() * 0.8
        return ad - bd
      })

    case 'rain': {
      const cols = shuffle(Array.from({ length: N }, (_, i) => i))
      const result = []
      for (const col of cols)
        for (let row = 0; row < N; row++) result.push(row * N + col)
      return result
    }

    case 'spiral': {
      const result = []
      let top = 0, bottom = N - 1, left = 0, right = N - 1
      while (top <= bottom && left <= right) {
        for (let c = left;  c <= right;  c++) result.push(top    * N + c); top++
        for (let r = top;   r <= bottom; r++) result.push(r      * N + right); right--
        if (top <= bottom) { for (let c = right; c >= left; c--) result.push(bottom * N + c); bottom-- }
        if (left <= right) { for (let r = bottom; r >= top; r--) result.push(r * N + left); left++ }
      }
      return result
    }

    case 'snake': {
      // 锯齿扫描，偶行向右、奇行向左
      const result = []
      for (let row = 0; row < N; row++) {
        if (row % 2 === 0) for (let col = 0; col < N; col++) result.push(row * N + col)
        else               for (let col = N - 1; col >= 0; col--) result.push(row * N + col)
      }
      return result
    }

    case 'matrix': {
      // 每列同时从上往下落，列有随机启动偏移
      const offsets = Array.from({ length: N }, () => Math.floor(Math.random() * N * 0.6))
      const entries = []
      for (let col = 0; col < N; col++)
        for (let row = 0; row < N; row++)
          entries.push({ i: row * N + col, t: offsets[col] + row })
      return entries.sort((a, b) => a.t - b.t).map(e => e.i)
    }

    case 'wave': {
      // 正弦波前沿从左至右扫描
      const AMP = 12, FREQ = 2.5
      return arr.sort((a, b) => {
        const ax = a % N, ay = Math.floor(a / N)
        const bx = b % N, by = Math.floor(b / N)
        return (ax + AMP * Math.sin(ay * FREQ * Math.PI / N))
             - (bx + AMP * Math.sin(by * FREQ * Math.PI / N))
      })
    }

    case 'shatter': {
      // 6 个随机焦点同时向外扩散（多碎片爆炸）
      const foci = Array.from({ length: 6 }, () => ({
        x: Math.random() * N, y: Math.random() * N,
        speed: 0.6 + Math.random() * 0.8,
      }))
      return arr.sort((a, b) => {
        const ax = a % N, ay = Math.floor(a / N)
        const bx = b % N, by = Math.floor(b / N)
        const da = Math.min(...foci.map(f => Math.hypot(ax - f.x, ay - f.y) / f.speed))
        const db = Math.min(...foci.map(f => Math.hypot(bx - f.x, by - f.y) / f.speed))
        return da - db
      })
    }

    case 'diamond':
      // 曼哈顿距离菱形扩散
      return arr.sort((a, b) => {
        const ax = a % N, ay = Math.floor(a / N)
        const bx = b % N, by = Math.floor(b / N)
        return (Math.abs(ax - cx) + Math.abs(ay - cy))
             - (Math.abs(bx - cx) + Math.abs(by - cy))
      })

    default:
      return arr
  }
}

// ── 剪影绘制（白 + 浅灰斜线背景）────────────────────────────────────────
function drawSilhouette() {
  const canvas = canvasRef.value
  if (!canvas || !spriteData.value) return
  const ctx = canvas.getContext('2d')
  const { indices } = spriteData.value
  ctx.fillStyle = SIL_BG
  ctx.fillRect(0, 0, C, C)
  for (let i = 0; i < N * N; i++) {
    const gx = i % N, gy = Math.floor(i / N)
    if (indices[i] === -1) drawBgSlash(ctx, gx, gy)
    else { ctx.fillStyle = SIL_FILL; ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL) }
  }
  isSilhouette.value = true
}

function drawFull() {
  const canvas = canvasRef.value
  if (!canvas || !spriteData.value) return
  const ctx = canvas.getContext('2d')
  const { palette, indices } = spriteData.value
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, C, C)
  for (let i = 0; i < N * N; i++) {
    const idx = indices[i], gx = i % N, gy = Math.floor(i / N)
    ctx.fillStyle = idx === -1 ? EMPTY_C : (palette[idx] ?? '#ebedf0')
    ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL)
  }
  isSilhouette.value = false
}

function drawLog() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, C, C)
  const all = logs.value, lastIdx = all.length - 1
  for (let i = 0; i < N * N; i++) {
    const op = all[i], gx = i % N, gy = Math.floor(i / N)
    if (!op) drawBgSlash(ctx, gx, gy)
    else {
      ctx.fillStyle = i === lastIdx ? LOG_PALETTE.latest : (LOG_PALETTE[op.type] ?? LOG_PALETTE.info)
      ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL)
    }
  }
}

// ── Random ────────────────────────────────────────────────────────────────
async function onRandom() {
  if (isLoading.value) return
  stopAnimation()
  isLoading.value = true
  try {
    if (count > 0) {
      const sprite = await loadRandom()
      if (sprite) { spriteData.value = sprite; currentId.value = sprite.id }
    } else {
      await fetchRandom()
    }
    drawSilhouette()
  } finally { isLoading.value = false }
}

async function fetchRandom() {
  const id  = Math.floor(Math.random() * 493) + 1
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/platinum/${id}.png`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const off = document.createElement('canvas')
      off.width = N; off.height = N
      const ctx = off.getContext('2d')
      ctx.drawImage(img, 0, 0, N, N)
      const data = ctx.getImageData(0, 0, N, N).data
      const colorMap = {}, palette = [], indices = []
      for (let i = 0; i < N * N; i++) {
        const r = data[i*4], g = data[i*4+1], b = data[i*4+2], a = data[i*4+3]
        if (a < 32) { indices.push(-1); continue }
        const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
        if (!(hex in colorMap)) { colorMap[hex] = palette.length; palette.push(hex) }
        indices.push(colorMap[hex])
      }
      spriteData.value = { id, palette, indices }
      currentId.value = id
      resolve()
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load failed')) }
    img.src = objectUrl
  })
}

// ── Fill ──────────────────────────────────────────────────────────────────
async function onFill() {
  if (isLoading.value) return
  stopAnimation()
  if (!spriteData.value) {
    isLoading.value = true
    try { await fetchRandom() } finally { isLoading.value = false }
  }
  drawFull()
}

// ── Play / Stop：写入状态斜线 → 实际颜色（一帧延迟）────────────────────
let rafId = null

function stopAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  isPlaying.value = false
}

async function onPlay() {
  if (isPlaying.value) { stopAnimation(); return }
  if (!spriteData.value) { await onRandom(); if (!spriteData.value) return }
  if (!isSilhouette.value) drawSilhouette()

  const canvas = canvasRef.value
  const ctx    = canvas.getContext('2d')
  const { palette, indices } = spriteData.value
  const order = buildOrder(mode.value)

  isPlaying.value = true
  isSilhouette.value = false

  let pos = 0
  let prevBatch = []   // 上一帧写入的格子（当前帧完成它们，展示写入斜线）
  const BATCH = 60     // 每帧格数

  function step() {
    if (!isPlaying.value) return

    // 1. 将上一帧的写入格子 → 最终颜色
    for (const k of prevBatch) {
      const i = order[k], gx = i % N, gy = Math.floor(i / N)
      const idx = indices[i]
      ctx.fillStyle = idx === -1 ? EMPTY_C : palette[idx]
      ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL)
    }
    prevBatch = []

    // 2. 动画结束
    if (pos >= N * N) { isPlaying.value = false; return }

    // 3. 新格子显示写入斜线
    const end = Math.min(pos + BATCH, N * N)
    for (let k = pos; k < end; k++) {
      const i = order[k], gx = i % N, gy = Math.floor(i / N)
      drawWriteSlash(ctx, gx, gy)
      prevBatch.push(k)
    }
    pos = end

    rafId = requestAnimationFrame(step)
  }

  rafId = requestAnimationFrame(step)
}

onMounted(async () => {
  if (count > 0) {
    const sprite = await loadRandom()
    if (sprite) { spriteData.value = sprite; currentId.value = sprite.id; drawSilhouette() }
  } else { drawLog() }
})
onUnmounted(stopAnimation)
watch(() => logs.value, () => { if (!spriteData.value) drawLog() }, { deep: true })
</script>

<template>
  <div class="flex flex-col h-full select-none">

    <div class="flex-1 flex items-center justify-center overflow-hidden bg-zinc-950">
      <canvas
        ref="canvasRef"
        :width="C"
        :height="C"
        style="display: block; width: 100%; max-width: 100%; aspect-ratio: 1 / 1; image-rendering: pixelated;"
      />
    </div>

    <!-- 动画模式选择条（两行自动换行）-->
    <div class="shrink-0 flex flex-wrap gap-1 px-3 py-2 border-t border-white/5 bg-zinc-900/20">
      <button
        v-for="m in MODES" :key="m.key"
        @click="!isPlaying && (mode = m.key)"
        data-no-drag
        class="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded transition-colors shrink-0"
        :class="mode === m.key
          ? 'bg-zinc-700 text-white'
          : isPlaying ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-zinc-300 cursor-pointer'"
      >{{ m.label }}</button>
    </div>

    <!-- 底部控制栏 -->
    <div class="shrink-0 border-t border-white/5 px-4 py-2 flex items-center justify-between bg-zinc-900/40">

      <div v-if="spriteData" class="flex items-center gap-2">
        <span class="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
          #{{ String(currentId).padStart(3, '0') }}
        </span>
        <span class="text-[7px] uppercase tracking-wide" :class="isSilhouette ? 'text-zinc-600' : 'text-white/20'">
          {{ isSilhouette ? '???' : 'platinum' }}
        </span>
      </div>
      <div v-else class="flex items-center gap-2 flex-wrap">
        <div v-for="item in [
          { color: '#9be9a8', label: 'Info' },
          { color: '#40c463', label: 'OK'   },
          { color: '#ffa657', label: 'Warn' },
          { color: '#f85149', label: 'Err'  },
          { color: '#216e39', label: 'Now'  },
        ]" :key="item.label" class="flex items-center gap-1">
          <div class="w-1.5 h-1.5 rounded-[1px]" :style="{ background: item.color }" />
          <span class="text-[7px] text-white/40 uppercase tracking-wide">{{ item.label }}</span>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0 ml-3">
        <button @click="onRandom" :disabled="isLoading || isPlaying" data-no-drag
          class="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors"
          :class="(isLoading || isPlaying) ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'">
          {{ isLoading ? '...' : 'Rand' }}
        </button>
        <button @click="onPlay" :disabled="isLoading" data-no-drag
          class="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors"
          :class="isLoading ? 'text-zinc-600 cursor-not-allowed'
            : isPlaying   ? 'text-red-400 hover:text-red-300 hover:bg-zinc-700'
                           : 'text-emerald-400 hover:text-emerald-300 hover:bg-zinc-700'">
          {{ isPlaying ? 'Stop' : 'Play' }}
        </button>
        <button @click="onFill" :disabled="isLoading || isPlaying" data-no-drag
          class="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors"
          :class="(isLoading || isPlaying) ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'">
          Fill
        </button>
      </div>
    </div>

  </div>
</template>
