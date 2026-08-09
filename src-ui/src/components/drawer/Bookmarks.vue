<!-- 左侧书签：贴白卡片左缘；顶组在上、底组下对齐卡片底。 -->
<script setup>
import { Book, Cpu, HelpCircle, Settings, ShoppingBag } from '@lucide/vue'
import { useEmulator, BOOKMARK_IDS } from '../../stores/useEmulator'

const emu = useEmulator()
const { selectBookmark, isBookmarkActive } = emu

const bookmarkStyle = { transform: 'translateX(0)', opacity: '1', pointerEvents: 'auto' }

const TOP_ITEMS = [
  { id: BOOKMARK_IDS.logs, icon: Book, labelKey: 'bookmark.logs', accent: 'white' },
  { id: BOOKMARK_IDS.rom, icon: Cpu, labelKey: 'bookmark.rom', accent: 'emerald' },
]

const UTIL_ITEMS = [
  { id: BOOKMARK_IDS.help, icon: HelpCircle, labelKey: 'bookmark.help', accent: 'white' },
  { id: BOOKMARK_IDS.settings, icon: Settings, labelKey: 'bookmark.settings', accent: 'white' },
  { id: BOOKMARK_IDS.shop, icon: ShoppingBag, labelKey: 'bookmark.shop', accent: 'yellow' },
]

function btnClass(id, opts = {}) {
  const active = isBookmarkActive(id)
  const shape = [
    opts.roundTop ? 'rounded-tl-xl border-t' : '',
    opts.roundBottom ? 'rounded-bl-xl border-b' : '',
  ].filter(Boolean).join(' ')
  const base = `w-7 border-l border-white/10 flex items-center justify-center group transition-all ${shape}`
  if (active) {
    return `${base} flex-col gap-1.5 py-3.5 bg-black text-white`
  }
  return `${base} py-3 bg-zinc-800 hover:bg-zinc-700 text-white`
}

function iconClass(id, accent) {
  const active = isBookmarkActive(id)
  if (accent === 'emerald') {
    return active ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-emerald-400'
  }
  if (accent === 'yellow') {
    return active ? 'text-yellow-400' : 'text-zinc-500 group-hover:text-yellow-400'
  }
  return active ? 'text-white' : 'text-zinc-500 group-hover:text-white'
}
</script>

<template>
  <!-- 单轨贴白卡片全高：顶组对齐 Header，底组贴卡片下沿（下对齐） -->
  <div
    class="pointer-events-none absolute -left-[28px] top-0 bottom-0 z-30 flex w-7 flex-col justify-between overflow-visible drawer-transition"
    :style="bookmarkStyle"
  >
    <!-- 顶部：日志 + ROM（mt-14 = 56px，对齐 Header） -->
    <div class="pointer-events-auto mt-14 flex flex-col">
      <button
        v-for="(item, index) in TOP_ITEMS"
        :key="item.id"
        type="button"
        data-no-drag
        :aria-label="$t(item.labelKey)"
        :aria-pressed="isBookmarkActive(item.id)"
        :class="btnClass(item.id, {
          roundTop: index === 0,
          roundBottom: index === TOP_ITEMS.length - 1,
        })"
        @click="selectBookmark(item.id)"
      >
        <component
          :is="item.icon"
          class="h-3.5 w-3.5 shrink-0 transition-colors"
          :class="iconClass(item.id, item.accent)"
        />
        <span
          v-if="isBookmarkActive(item.id)"
          class="writing-vertical text-[8px] font-black tracking-widest uppercase"
        >{{ $t(item.labelKey) }}</span>
      </button>
    </div>

    <!-- 底部：帮助 / 设置 / 商店 —— 下对齐基础上整体上移 20px -->
    <div class="pointer-events-auto mb-5 flex flex-col">
      <button
        v-for="(item, index) in UTIL_ITEMS"
        :key="item.id"
        type="button"
        data-no-drag
        :aria-label="$t(item.labelKey)"
        :aria-pressed="isBookmarkActive(item.id)"
        :class="btnClass(item.id, {
          roundTop: index === 0,
          roundBottom: index === UTIL_ITEMS.length - 1,
        })"
        @click="selectBookmark(item.id)"
      >
        <component
          :is="item.icon"
          class="h-3.5 w-3.5 shrink-0 transition-colors"
          :class="iconClass(item.id, item.accent)"
        />
        <span
          v-if="isBookmarkActive(item.id)"
          class="writing-vertical text-[8px] font-black tracking-widest uppercase"
        >{{ $t(item.labelKey) }}</span>
      </button>
    </div>
  </div>
</template>
