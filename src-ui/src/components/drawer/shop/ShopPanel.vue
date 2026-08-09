<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, LoaderCircle, RefreshCw, ShoppingBag } from '@lucide/vue'
import { useDragScroll } from '../../../composables/useDragScroll'
import { useToast } from '../../../stores/useToast'
import {
  FLASHER_STORE_FALLBACK_LISTS,
  fetchFlasherStoreRecommendations,
  openFlasherStoreUrl,
} from '../../../services/flasherStore'
import { resolveGbmakeHref } from '../../../services/lexicalRichText'
import UiLexical from '../../ui/UiLexical.vue'

const { t } = useI18n()
const { scrollBind } = useDragScroll()
const toast = useToast()
const lists = ref([])
const loading = ref(false)
const error = ref('')
/** 图片缓存破坏键：刷新时更新，给 img src 拼 ?_t= 让 WebView 重新拉图。 */
const cacheBustKey = ref(Date.now())
let requestController = null

/** 给图片 URL 加 cache-busting query，刷新时强制破 WebView 图片缓存。 */
function bustUrl(url) {
  if (!url) return url
  try {
    const u = new URL(url, window.location.origin)
    u.searchParams.set('_t', String(cacheBustKey.value))
    return u.toString()
  } catch {
    return url
  }
}

async function loadRecommendations() {
  requestController?.abort()
  requestController = new AbortController()
  loading.value = true
  error.value = ''
  try {
    lists.value = await fetchFlasherStoreRecommendations({ signal: requestController.signal })
    // 刷新成功 → 更新 cache-bust 键，让图片也重新加载（破 WebView 缓存）
    cacheBustKey.value = Date.now()
  } catch (cause) {
    if (cause?.name !== 'AbortError') {
      lists.value = FLASHER_STORE_FALLBACK_LISTS
      console.warn('[flasherStore] recommendations failed:', cause)
    }
  } finally {
    loading.value = false
  }
}

async function visit(url) {
  try {
    await openFlasherStoreUrl(url)
  } catch (cause) {
    toast.error(t('toast.shopOpenFail', { err: cause?.message || cause }))
  }
}

async function onRichNavigate(safeUrl) {
  if (!safeUrl) {
    toast.error(t('toast.shopInvalidLink'))
    return
  }
  await visit(safeUrl)
}

/** 多商品：columns=2|3 网格；单商品：左图右文行卡。 */
function isSingleProduct(list) {
  return (list.products?.length || 0) <= 1
}

function productGridClass(list) {
  return list.columns === 2 ? 'grid-cols-2' : 'grid-cols-3'
}

onMounted(loadRecommendations)
onBeforeUnmount(() => requestController?.abort())

// 暴露给 ShopDrawer 标题栏的刷新按钮调用
defineExpose({ loadRecommendations, loading })
</script>

<template>
  <div
    data-drawer-scroll
    class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-5 py-4 space-y-6 text-zinc-200 [touch-action:pan-y]"
    v-bind="scrollBind"
  >
    <div
      v-if="loading"
      class="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-white/10 text-[10px] text-zinc-500"
    >
      <LoaderCircle class="h-4 w-4 animate-spin" :stroke-width="2.25" />
      正在读取烧录器推荐…
    </div>

    <template v-else-if="lists.length">
      <section v-for="list in lists" :key="list.id" class="space-y-3">
        <div class="space-y-2">
          <h3 class="text-[12px] font-bold tracking-tight text-zinc-100">{{ list.title }}</h3>

          <ul
            v-if="list.featureTags?.length"
            class="flex flex-wrap gap-1.5"
            aria-label="Feature tags"
          >
            <li
              v-for="tag in list.featureTags"
              :key="tag"
              class="rounded-md border border-white/10 bg-zinc-950/80 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-400"
            >
              {{ tag }}
            </li>
          </ul>

          <UiLexical
            v-if="list.subtitle"
            :content="list.subtitle"
            root-class="text-[9px] leading-relaxed text-zinc-500 [&_p+_p]:mt-1.5"
            strong-class="font-semibold text-zinc-300"
            :resolve-href="resolveGbmakeHref"
            @navigate="onRichNavigate"
          />
        </div>

        <!-- 单商品：左图右文；多商品：CMS columns 网格 -->
        <div
          v-if="isSingleProduct(list)"
          class="space-y-2.5"
        >
          <button
            v-for="product in list.products"
            :key="product.id"
            data-no-drag
            type="button"
            class="group flex w-full items-stretch gap-3 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 p-2 text-left transition hover:border-yellow-400/35 hover:bg-zinc-900"
            @click="visit(product.url)"
          >
            <span class="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
              <img
                v-if="product.image"
                :src="bustUrl(product.image)"
                :alt="product.title"
                loading="lazy"
                draggable="false"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="flex h-full w-full items-center justify-center text-zinc-700"
              >
                <ShoppingBag class="h-5 w-5" :stroke-width="2" />
              </span>
              <span
                v-if="product.preorder"
                class="absolute left-1 top-1 rounded bg-violet-500/90 px-1 py-px text-[8px] font-black uppercase tracking-wide text-white"
              >Pre</span>
            </span>

            <span class="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5 pr-1">
              <span class="flex items-start justify-between gap-2">
                <span class="min-w-0">
                  <span
                    v-if="product.subtitle"
                    class="mb-0.5 block truncate text-[8px] font-semibold uppercase tracking-widest text-zinc-500"
                  >{{ product.subtitle }}</span>
                  <span class="block truncate text-[11px] font-bold text-zinc-100 group-hover:text-white">{{ product.title }}</span>
                </span>
                <ExternalLink class="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-hover:text-yellow-400" :stroke-width="2.25" />
              </span>
            </span>
          </button>
        </div>

        <div
          v-else
          class="grid gap-2"
          :class="productGridClass(list)"
        >
          <button
            v-for="product in list.products"
            :key="product.id"
            data-no-drag
            type="button"
            class="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 text-left transition hover:border-yellow-400/35 hover:bg-zinc-900"
            @click="visit(product.url)"
          >
            <span class="relative aspect-square w-full overflow-hidden border-b border-white/10 bg-zinc-950">
              <img
                v-if="product.image"
                :src="bustUrl(product.image)"
                :alt="product.title"
                loading="lazy"
                draggable="false"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="flex h-full w-full items-center justify-center text-zinc-700"
              >
                <ShoppingBag class="h-5 w-5" :stroke-width="2" />
              </span>
              <span
                v-if="product.preorder"
                class="absolute left-1 top-1 rounded bg-violet-500/90 px-1 py-px text-[8px] font-black uppercase tracking-wide text-white"
              >Pre</span>
              <ExternalLink
                class="absolute right-1 top-1 h-3 w-3 text-zinc-600 opacity-0 transition group-hover:opacity-100 group-hover:text-yellow-400"
                :stroke-width="2.25"
              />
            </span>

            <span class="flex min-w-0 flex-col gap-0.5 p-2">
              <span
                v-if="product.subtitle"
                class="truncate text-[8px] font-semibold uppercase tracking-widest text-zinc-500"
              >{{ product.subtitle }}</span>
              <span class="line-clamp-2 text-[10px] font-bold leading-snug text-zinc-100 group-hover:text-white">{{ product.title }}</span>
            </span>
          </button>
        </div>
      </section>
    </template>

    <div
      v-else
      class="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-white/10 text-[10px] text-zinc-500"
    >
      <span>{{ error || '当前没有启用烧录器推荐' }}</span>
      <button
        data-no-drag
        type="button"
        class="inline-flex items-center gap-1.5 font-bold text-yellow-400"
        @click="loadRecommendations"
      >
        <RefreshCw class="h-3.5 w-3.5" :stroke-width="2.25" />
        重新加载
      </button>
    </div>
  </div>
</template>
