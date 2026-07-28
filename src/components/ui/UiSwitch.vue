<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: undefined },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <!--
    Conventional toggle: On = emerald + thumb right; Off = zinc + thumb left.
    Button (not nested label) so it works inside setting rows and with async handlers.
  -->
  <button
    data-no-drag
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel"
    :disabled="disabled"
    class="relative h-5 w-9 shrink-0 rounded-full transition-colors
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900
           disabled:cursor-not-allowed disabled:opacity-40"
    :class="modelValue ? 'bg-emerald-500' : 'bg-zinc-700'"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      class="pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
      aria-hidden="true"
    />
  </button>
</template>
