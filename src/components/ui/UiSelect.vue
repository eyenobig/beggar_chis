<!-- shadcn/Headless 风格下拉：实心 zinc 面板，避免原生 select 的系统白边/半透明菜单。
     菜单 Teleport 到 body + fixed，固定向上展开；打开时禁底层滚轮以免错位。 -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: {
    type: Array,
    required: true,
    // [{ value, label }]
  },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  /** sm：ROM 存档操作条等紧凑场景；默认与设置页一致 */
  size: {
    type: String,
    default: 'md',
    validator: (value) => value === 'md' || value === 'sm',
  },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootEl = ref(null)
const menuEl = ref(null)
const menuStyle = ref({})

const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
)

const selectedLabel = computed(
  () => selected.value?.label ?? props.placeholder ?? '',
)

const triggerClass = computed(() =>
  props.size === 'sm'
    ? 'flex h-6 w-full items-center justify-between gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 text-left text-[9px] font-bold text-zinc-100 outline-none transition-colors hover:border-zinc-500 focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40'
    : 'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-left text-xs text-zinc-100 outline-none transition-colors hover:border-zinc-500 focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40',
)

const optionClass = computed(() =>
  props.size === 'sm' ? 'px-1.5 py-1 text-[9px] font-bold' : 'px-2.5 py-1.5 text-xs',
)

/** 固定相对触发器向上展开（不按剩余空间翻转） */
function updateMenuPosition() {
  const trigger = rootEl.value
  if (!trigger || !open.value) return

  const rect = trigger.getBoundingClientRect()
  const gap = 4
  const estimatedRow = props.size === 'sm' ? 26 : 32
  const estimatedH = Math.min(
    props.options.length * estimatedRow + 8,
    Math.floor(window.innerHeight * 0.45),
  )
  const measuredH = menuEl.value?.offsetHeight || estimatedH
  const spaceAbove = Math.max(0, rect.top - gap)
  const maxH = Math.max(80, spaceAbove)
  const menuH = Math.min(measuredH, maxH)
  const top = Math.max(gap, rect.top - menuH - gap)

  menuStyle.value = {
    position: 'fixed',
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`,
    top: `${Math.round(top)}px`,
    maxHeight: `${Math.floor(maxH)}px`,
    zIndex: 10000,
  }
}

function isInsideMenu(event) {
  return Boolean(menuEl.value?.contains(event.target))
}

/** 打开时禁底层滚轮/触摸滚动，避免 fixed 菜单与触发器错位；菜单内仍可滚 */
function onWheel(event) {
  if (!open.value) return
  if (isInsideMenu(event)) {
    const el = menuEl.value
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const canScroll = scrollHeight > clientHeight + 1
    if (!canScroll) {
      event.preventDefault()
      return
    }
    const delta = event.deltaY
    const atTop = scrollTop <= 0 && delta < 0
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && delta > 0
    if (atTop || atBottom) event.preventDefault()
    return
  }
  event.preventDefault()
}

function onTouchMove(event) {
  if (!open.value) return
  if (isInsideMenu(event)) return
  event.preventDefault()
}

const scrollLockOpts = { capture: true, passive: false }

function lockBackgroundScroll() {
  document.addEventListener('wheel', onWheel, scrollLockOpts)
  document.addEventListener('touchmove', onTouchMove, scrollLockOpts)
}

function unlockBackgroundScroll() {
  document.removeEventListener('wheel', onWheel, scrollLockOpts)
  document.removeEventListener('touchmove', onTouchMove, scrollLockOpts)
}

async function openMenu() {
  open.value = true
  await nextTick()
  updateMenuPosition()
  // 二次测量：真实菜单高度出来后再校正 top
  await nextTick()
  updateMenuPosition()
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    open.value = false
    return
  }
  openMenu()
}

function choose(option) {
  if (props.disabled) return
  emit('update:modelValue', option.value)
  open.value = false
}

function onDocPointerDown(event) {
  const t = event.target
  if (rootEl.value?.contains(t) || menuEl.value?.contains(t)) return
  open.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}

function onReposition() {
  if (open.value) updateMenuPosition()
}

watch(open, (isOpen) => {
  if (isOpen) lockBackgroundScroll()
  else unlockBackgroundScroll()
})

watch(
  () => props.options,
  () => {
    if (open.value) nextTick().then(updateMenuPosition)
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onReposition)
})

onBeforeUnmount(() => {
  unlockBackgroundScroll()
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <div ref="rootEl" class="relative w-full" data-no-drag>
    <button
      type="button"
      data-no-drag
      role="combobox"
      :aria-expanded="open"
      :aria-disabled="disabled || undefined"
      :disabled="disabled"
      :class="triggerClass"
      :title="selectedLabel"
      @click="toggle"
      @mousedown.stop
      @pointerdown.stop
    >
      <span class="min-w-0 truncate">{{ selectedLabel }}</span>
      <ChevronDown
        class="shrink-0 text-zinc-500 transition-transform"
        :class="[
          open ? 'rotate-180 text-zinc-300' : '',
          size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
        ]"
        :stroke-width="2"
      />
    </button>

    <Teleport to="body">
      <div
        v-show="open"
        ref="menuEl"
        role="listbox"
        data-no-drag
        class="overflow-y-auto overscroll-contain rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg shadow-black/50"
        :style="menuStyle"
        @mousedown.stop
        @pointerdown.stop
      >
        <button
          v-for="option in options"
          :key="String(option.value)"
          type="button"
          data-no-drag
          role="option"
          :aria-selected="option.value === modelValue"
          class="flex w-full items-center gap-2 text-left transition-colors"
          :class="[
            optionClass,
            option.value === modelValue
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100',
          ]"
          @click="choose(option)"
        >
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <Check
            v-if="option.value === modelValue"
            class="h-3.5 w-3.5 shrink-0 text-emerald-400"
            :stroke-width="2.5"
          />
        </button>
      </div>
    </Teleport>
  </div>
</template>
