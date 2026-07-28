<!-- shadcn/Headless 风格下拉：实心 zinc 面板，避免原生 select 的系统白边/半透明菜单。 -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootEl = ref(null)

const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
)

const selectedLabel = computed(
  () => selected.value?.label ?? props.placeholder ?? '',
)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function choose(option) {
  if (props.disabled) return
  emit('update:modelValue', option.value)
  open.value = false
}

function onDocPointerDown(event) {
  if (!rootEl.value?.contains(event.target)) open.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="rootEl" class="relative w-full">
    <button
      type="button"
      data-no-drag
      role="combobox"
      :aria-expanded="open"
      :aria-disabled="disabled || undefined"
      :disabled="disabled"
      class="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-left text-xs text-zinc-100 outline-none transition-colors hover:border-zinc-500 focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
      @click="toggle"
    >
      <span class="min-w-0 truncate">{{ selectedLabel }}</span>
      <ChevronDown
        class="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform"
        :class="open ? 'rotate-180 text-zinc-300' : ''"
        :stroke-width="2"
      />
    </button>

    <div
      v-show="open"
      role="listbox"
      class="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg shadow-black/50"
    >
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        data-no-drag
        role="option"
        :aria-selected="option.value === modelValue"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors"
        :class="option.value === modelValue
          ? 'bg-zinc-800 text-white'
          : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'"
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
  </div>
</template>
