<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Check } from '@lucide/vue'
import { useCartData } from '../../../../stores/useCartData'
import { useCartridgeCache } from '../../../../stores/useCartridgeCache'
import { useEmulator } from '../../../../stores/useEmulator'
import { findFlashRomGroup, approvedStickersOf } from '../../../../services/flashRom'
import { buildGbmakeStickerUrl, resolveStickerMode } from '../../../../services/gbmakeStickerUrl'
import { gameCodeOf, romTitleOf } from './romFields'

const cart = useCartData()
const cache = useCartridgeCache()
const emu = useEmulator()
const { cartInfo } = storeToRefs(cart)
const { activePayload } = storeToRefs(cache)

const matches = ref([])
const loading = ref(false)
const loadError = ref('')
const activeStickerId = ref('')
const selectedRomId = ref('')
/** 下缩隐藏贴纸主体，仅保留顶栏；默认折叠 */
const shelfCollapsed = ref(true)
const titleTrack = ref(null)
const titleText = ref(null)
const titleHover = ref(false)
const titleOverflowPx = ref(0)
const titleScrollMs = ref(0)
let loadSequence = 0

const identity = computed(() => gameCodeOf(cartInfo.value) || romTitleOf(cartInfo.value) || '')
const canShow = computed(() => !!cartInfo.value && !!identity.value)

function stickersOf(rom) {
  return approvedStickersOf(rom)
}

const selectedRom = computed(() =>
  matches.value.find((rom) => String(rom.id) === String(selectedRomId.value))
  || matches.value.find((rom) => String(rom.id) === String(activePayload.value))
  || matches.value[0]
  || null,
)
const headerTitle = computed(() => selectedRom.value?.title || romTitleOf(cartInfo.value) || '—')
const titleScrollStyle = computed(() => ({
  '--title-shift': titleHover.value && titleOverflowPx.value > 0
    ? `-${titleOverflowPx.value}px`
    : '0px',
  '--title-duration': `${titleScrollMs.value}ms`,
}))
/** 当前选中 ROM 的贴纸。 */
const currentStickers = computed(() => stickersOf(selectedRom.value))
/** 加号卡片比例：跟随当前机型贴纸尺寸（GBA 44×23、GB 44×38），与贴纸卡片同高。
 *  GBA 宽扁、GB 接近方形；无卡带时回落 GB 比例。 */
const editCardStyle = computed(() => {
  const mode = resolveStickerMode(selectedRom.value, currentStickers.value[0])
  // GBA bleed 44×23mm，GB bleed 44×38mm（width/height）。
  return { aspectRatio: mode === 'gba' ? '44 / 23' : '44 / 38' }
})
/** ROM 指示：当前是第几个 / 共几个。 */
const romIndexLabel = computed(() => {
  const list = matches.value
  if (!list.length) return ''
  const cur = selectedRom.value
  const idx = cur ? list.findIndex((rom) => String(rom.id) === String(cur.id)) : -1
  return `${Math.max(idx, 0) + 1} / ${list.length}`
})
function regionFlagUrl(region) {
  const code = String(region || '').toLowerCase()
  return code && code !== 'world' ? `https://flagcdn.com/24x18/${code}.png` : ''
}

function selectRomCartridge(rom) {
  selectedRomId.value = String(rom?.id || '')
  if (rom?.cartridgeImage) cache.remember(cartInfo.value, rom)
  else cache.clearActive()
}

function isActiveSticker(sticker) {
  return String(activeStickerId.value) === String(sticker?.id)
}

async function openGbmakePage({ rom = null, sticker = null } = {}) {
  const url = buildGbmakeStickerUrl({
    rom: rom || selectedRom.value,
    sticker,
    cartInfo: cartInfo.value,
  })
  try {
    await openUrl(url)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** 点击贴纸：选中并直接跳转 gbmake（带 sticker + ROM 参数堆）。 */
async function openStickerPage(item) {
  activeStickerId.value = String(item.sticker.id)
  selectRomCartridge(item.rom)
  await openGbmakePage({ rom: item.rom, sticker: item.sticker })
}

/** 加号：新建贴纸，只带当前 ROM 参数堆。 */
async function openGbmakeEditor() {
  await openGbmakePage({ rom: selectedRom.value, sticker: null })
}

async function loadMatches() {
  const sequence = ++loadSequence
  if (!canShow.value) {
    matches.value = []
    activeStickerId.value = ''
    selectedRomId.value = ''
    loadError.value = ''
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const docs = await findFlashRomGroup(cartInfo.value)
    if (sequence !== loadSequence) return
    matches.value = docs
    const initialRom = docs.find((rom) => String(rom.id) === String(activePayload.value)) || docs[0]
    selectedRomId.value = String(initialRom?.id || '')
    activeStickerId.value = String(stickersOf(initialRom)[0]?.id || '')
    if (initialRom?.cartridgeImage) cache.remember(cartInfo.value, initialRom)
  } catch (error) {
    if (sequence === loadSequence) {
      loadError.value = String(error?.message || error)
    }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

watch(
  () => [cartInfo.value?.kind, gameCodeOf(cartInfo.value), romTitleOf(cartInfo.value), cartInfo.value?.revision],
  loadMatches,
  { immediate: true },
)

/** 左右按钮：在 matches 数组里切换当前 ROM（而非滚动）。 */
function switchRom(direction) {
  const list = matches.value
  if (!list.length) return
  const current = selectedRom.value
  const idx = current ? list.findIndex((rom) => String(rom.id) === String(current.id)) : -1
  const next = (idx + direction + list.length) % list.length
  selectRomCartridge(list[next])
}

function prevRom() {
  switchRom(-1)
}

function nextRom() {
  switchRom(1)
}

function toggleShelfCollapsed() {
  shelfCollapsed.value = !shelfCollapsed.value
  emu.romShelfCollapsed = shelfCollapsed.value
}

watch(shelfCollapsed, (v) => {
  emu.romShelfCollapsed = v
}, { immediate: true })

onBeforeUnmount(() => {
  emu.romShelfCollapsed = false
})

async function measureTitleOverflow() {
  await nextTick()
  const track = titleTrack.value
  const text = titleText.value
  if (!track || !text) {
    titleOverflowPx.value = 0
    titleScrollMs.value = 0
    return
  }
  const overflow = Math.max(0, text.scrollWidth - track.clientWidth)
  titleOverflowPx.value = overflow
  // ~40px/s，最短 600ms，最长 6s
  titleScrollMs.value = overflow > 0 ? Math.min(6000, Math.max(600, Math.round(overflow * 25))) : 0
}

function onTitleEnter() {
  titleHover.value = true
  measureTitleOverflow()
}

function onTitleLeave() {
  titleHover.value = false
}

watch(headerTitle, () => {
  titleHover.value = false
  measureTitleOverflow()
})
</script>

<template>
  <section
    v-if="canShow"
    class="rom-shelf shrink-0 bg-transparent px-2 pb-0 pt-0"
    :class="{ 'is-collapsed': shelfCollapsed }"
  >
    <!-- 顶部：切 ROM + 标题 + 国旗/序号 + 折叠 -->
    <div class="flex shrink-0 items-center gap-1 leading-none">
      <button data-no-drag type="button" class="shelf-control" aria-label="上一个 ROM" :disabled="matches.length < 2" @click="prevRom">
        <ChevronLeft class="h-4 w-4" :stroke-width="2.5" />
      </button>

      <div class="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
        <div
          ref="titleTrack"
          class="title-marquee min-w-0 flex-1"
          :title="headerTitle"
          @mouseenter="onTitleEnter"
          @mouseleave="onTitleLeave"
        >
          <span
            ref="titleText"
            class="title-marquee__text inline-block text-[10px] font-bold whitespace-nowrap text-black"
            :class="{ 'is-hover': titleHover }"
            :style="{ ...titleScrollStyle, textShadow: '1px 1px 0 #fff, -1px 1px 0 #fff, 1px -1px 0 #fff, -1px -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff' }"
          >{{ headerTitle }}</span>
        </div>
        <span class="inline-flex shrink-0 items-center gap-1">
          <img
            v-if="regionFlagUrl(selectedRom?.region)"
            :src="regionFlagUrl(selectedRom?.region)"
            :alt="selectedRom?.region"
            class="h-[12px] w-[17px] rounded-[2px] object-cover"
          />
          <span
            v-if="romIndexLabel"
            class="rounded border border-black bg-white px-1 py-px text-[7px] font-black leading-none text-black shadow-[1px_1px_0_#18181b]"
          >{{ romIndexLabel }}</span>
        </span>
      </div>

      <button data-no-drag type="button" class="shelf-control" aria-label="下一个 ROM" :disabled="matches.length < 2" @click="nextRom">
        <ChevronRight class="h-4 w-4" :stroke-width="2.5" />
      </button>

      <button
        data-no-drag
        type="button"
        class="shelf-control ml-1"
        :title="shelfCollapsed ? '展开贴纸' : '下缩隐藏贴纸'"
        :aria-label="shelfCollapsed ? '展开贴纸' : '下缩隐藏贴纸'"
        :aria-expanded="!shelfCollapsed"
        @click="toggleShelfCollapsed"
      >
        <ChevronUp v-if="shelfCollapsed" class="h-4 w-4" :stroke-width="2.5" />
        <ChevronDown v-else class="h-4 w-4" :stroke-width="2.5" />
      </button>
    </div>

    <Transition name="shelf-body">
      <div v-show="!shelfCollapsed" class="shelf-body">
        <!-- 外层滚动 + 内层水平优先 grid；末尾加号跳转 gbmake -->
        <div
          data-no-drag
          class="sticker-scroll"
          @wheel.stop
        >
          <div class="sticker-grid">
            <button
              v-for="sticker in currentStickers"
              :key="sticker.id"
              data-no-drag
              type="button"
              class="sticker-card relative bg-transparent text-center"
              :class="isActiveSticker(sticker) ? 'is-active' : ''"
              :title="sticker.name || selectedRom?.title"
              :aria-pressed="isActiveSticker(sticker)"
              @click="openStickerPage({ rom: selectedRom, sticker })"
            >
              <img
                :src="sticker.image"
                :alt="sticker.name || selectedRom?.title"
                loading="lazy"
                class="sticker-card__img w-full rounded-md object-contain"
                draggable="false"
              />
              <span
                v-if="isActiveSticker(sticker)"
                class="sticker-badge"
                aria-hidden="true"
              >
                <Check class="h-2.5 w-2.5" :stroke-width="3" />
              </span>
            </button>

            <button
              data-no-drag
              type="button"
              class="sticker-edit-card inline-flex items-center justify-center rounded-md border border-dashed border-zinc-500 bg-zinc-900/50 text-zinc-100 transition hover:border-zinc-300 hover:bg-zinc-900/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              :style="editCardStyle"
              :disabled="!selectedRom?.id"
              :title="selectedRom ? `在 GBMake 编辑「${selectedRom.title || selectedRom.id}」贴纸` : '在 GBMake 编辑贴纸'"
              aria-label="在 GBMake 编辑贴纸"
              @click="openGbmakeEditor"
            >
              <Plus class="sticker-edit-card__icon h-7 w-7 shrink-0" :stroke-width="2.5" aria-hidden="true" />
            </button>
          </div>

          <div v-if="!loading && currentStickers.length === 0" class="flex min-h-[48px] items-center justify-center text-[9px] text-zinc-600">
            暂无已通过贴纸
          </div>
          <div v-if="loading" class="flex min-h-[48px] items-center justify-center text-[9px] text-zinc-500">
            加载中…
          </div>
        </div>

        <p v-if="loadError" class="mt-1 px-1 text-[8px] text-red-400">{{ loadError }}</p>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
/* 与 EmulatorWidget.CARTRIDGE_STAGE_H 对齐：展开时占满顶部固定舞台高度 */
.rom-shelf {
  --shelf-stage-h: 220px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.rom-shelf:not(.is-collapsed) {
  height: var(--shelf-stage-h);
}
.shelf-control {
  display: flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid #18181b;
  border-radius: 6px;
  background: white;
  color: #18181b;
  box-shadow: 2px 2px 0 #18181b;
  transition: transform 100ms ease, box-shadow 100ms ease;
}
.shelf-control:active:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: none;
}
.shelf-control:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
.title-marquee {
  position: relative;
  overflow: hidden;
  text-align: center;
}
.title-marquee__text {
  will-change: transform;
}
.title-marquee__text.is-hover {
  animation: title-marquee-run var(--title-duration, 800ms) linear alternate infinite;
}
@keyframes title-marquee-run {
  from { transform: translateX(0); }
  to { transform: translateX(var(--title-shift, 0px)); }
}
.shelf-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}
.shelf-body-enter-active,
.shelf-body-leave-active {
  overflow: hidden;
  transition: opacity 160ms ease, transform 180ms ease, max-height 200ms ease;
}
.shelf-body-enter-from,
.shelf-body-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(8px);
}
.shelf-body-enter-to,
.shelf-body-leave-from {
  opacity: 1;
  max-height: var(--shelf-stage-h);
  transform: translateY(0);
}
/* 外层占满剩余高度并滚动；内层水平优先 grid */
.sticker-scroll {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  /* 上下留白，避免 hover 上浮 / 阴影被裁切 */
  padding: 8px 6px 12px;
  scrollbar-width: thin;
  scrollbar-color: #52525b transparent;
}
.sticker-scroll::-webkit-scrollbar {
  width: 6px;
}
.sticker-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sticker-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #52525b;
}
.sticker-scroll::-webkit-scrollbar-thumb:hover {
  background: #71717a;
}
.sticker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 12px;
  row-gap: 12px;
  align-items: start;
}
@media (min-width: 380px) {
  .sticker-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.sticker-card,
.sticker-edit-card {
  width: 100%;
  min-width: 0;
  overflow: visible;
}
/* 加号格比例由 editCardStyle 按机型动态注入（GBA 44/23、GB 44/38）；加号默认可见，不依赖 hover */
.sticker-edit-card {
  color: #f4f4f5;
}
.sticker-edit-card__icon {
  display: block;
  color: inherit;
  pointer-events: none;
}
.sticker-card {
  opacity: 0.78;
  transition: transform 150ms ease, opacity 150ms ease, filter 150ms ease;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.24));
}
.sticker-card:hover,
.sticker-card.is-active {
  z-index: 2;
  opacity: 1;
  transform: translateY(-2px);
  filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.32));
}
.sticker-card__img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
  object-fit: contain;
}
.sticker-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border: 1px solid #18181b;
  border-radius: 999px;
  background: #facc15;
  color: #18181b;
  box-shadow: 1px 1px 0 #18181b;
  pointer-events: none;
}
</style>
