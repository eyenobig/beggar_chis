<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ cartridge: { type: Object, required: true } })

const isGbFamily = computed(() => {
  const platform = String(props.cartridge?.platform || props.cartridge?.kind || '').toLowerCase()
  const refKey = String(props.cartridge?.refKey || '').toLowerCase()
  return platform === 'gb' || platform === 'gbc' || platform === 'gb_mbc'
    || refKey.startsWith('gb__') || refKey.startsWith('gbc__')
})

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
      class="block h-[120px] animate-pulse rounded bg-zinc-800/15"
      :class="isGbFamily ? 'w-[180px]' : 'w-[240px]'"
      aria-hidden="true"
    />
    <img
      v-if="!imageFailed"
      :src="cartridge.cartridgeImage"
      :alt="cartridge.title || cartridge.rom_title || cartridge.game_name || 'Cartridge'"
      class="block h-auto select-none object-contain drop-shadow-[0_8px_7px_rgba(0,0,0,0.28)]"
      :class="[isGbFamily ? 'w-[180px]' : 'w-[240px]', imageLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0']"
      draggable="false"
      @load="imageLoaded = true"
      @error="imageFailed = true"
    />
    <span v-if="imageFailed" class="block px-3 py-2 text-[9px] font-bold text-zinc-500">
      Cartridge image unavailable
    </span>
  </button>
</template>
