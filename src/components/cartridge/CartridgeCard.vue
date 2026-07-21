<script setup>
import { ref } from 'vue'

defineProps({ cartridge: { type: Object, required: true } })

const imageLoaded = ref(false)
const imageFailed = ref(false)
</script>

<template>
  <button
    data-no-drag
    type="button"
    class="relative block border-0 bg-transparent p-0 text-left"
    :title="cartridge.title || cartridge.rom_title || cartridge.game_name || cartridge.payload"
  >
    <span
      v-if="!imageLoaded && !imageFailed"
      class="block h-[96px] w-[168px] animate-pulse rounded bg-zinc-800/15"
      aria-hidden="true"
    />
    <img
      v-if="!imageFailed"
      :src="cartridge.cartridgeImage"
      :alt="cartridge.title || cartridge.rom_title || cartridge.game_name || 'Cartridge'"
      class="block h-auto max-h-[136px] w-auto max-w-[250px] select-none object-contain drop-shadow-[0_8px_7px_rgba(0,0,0,0.28)]"
      :class="imageLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0'"
      draggable="false"
      @load="imageLoaded = true"
      @error="imageFailed = true"
    />
    <span v-if="imageFailed" class="block px-3 py-2 text-[9px] font-bold text-zinc-500">
      Cartridge image unavailable
    </span>
  </button>
</template>
