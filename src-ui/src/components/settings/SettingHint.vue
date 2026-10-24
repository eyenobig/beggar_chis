<script setup>
import { CircleHelp } from '@lucide/vue'

defineProps({
  text: { type: String, required: true },
  icon: { type: [Object, Function], default: () => CircleHelp },
})
</script>

<template>
  <span class="inline-flex items-center text-zinc-600 hover:text-zinc-300 transition-colors" :title="text" :aria-label="text" tabindex="0">
    <component :is="icon" class="w-3 h-3" :stroke-width="2" />
  </span>
</template>