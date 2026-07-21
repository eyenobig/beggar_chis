<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Sparkle } from '@lucide/vue'
import { useCartData } from '../../stores/useCartData'
import { useCartridgeCache } from '../../stores/useCartridgeCache'
import { useEmulator } from '../../stores/useEmulator'
import { findFlashRom } from '../../services/flashRom'
import CartridgeCard from './CartridgeCard.vue'
import UnknownCartridge from './UnknownCartridge.vue'

const cart = useCartData()
const cache = useCartridgeCache()
const emulator = useEmulator()
const { cartInfo } = storeToRefs(cart)
const { activeCartridge } = storeToRefs(cache)
const insertionKey = ref(0)
const cardRaised = ref(false)
const cardMotion = ref('')
const ejectStars = ref([])
let previousPayload = ''
let lookupSequence = 0
let motionTimer = null
let starTimer = null
let motionFrame = null
let queuedToggle = false

function resetEffects() {
  clearTimeout(motionTimer)
  clearTimeout(starTimer)
  cancelAnimationFrame(motionFrame)
  cardMotion.value = ''
  ejectStars.value = []
  queuedToggle = false
}

function useRecord(record) {
  resetEffects()
  if (record?.payload !== previousPayload) insertionKey.value += 1
  previousPayload = record?.payload || ''
  cardRaised.value = false
}

watch(cartInfo, async (info) => {
  const sequence = ++lookupSequence
  const present = info && (info.present === true || info.capacity_bytes > 0)
  if (!present) {
    previousPayload = ''
    cache.clearActive()
    return
  }

  const cached = cache.activateCached(info)
  if (cached) {
    useRecord(cached)
    return
  }

  try {
    const flashRom = await findFlashRom(info)
    if (sequence !== lookupSequence) return
    const record = cache.remember(info, flashRom)
    if (record) {
      useRecord(record)
      emulator.addLog(`Cartridge artwork matched: ${record.title} (#${record.payload})`, 'success')
    } else {
      cache.clearActive()
      emulator.addLog(`No FlashRom cartridge image matched ${info.game_code || info.rom_title || info.game_name || 'this cartridge'}.`, 'warn')
    }
  } catch (error) {
    if (sequence !== lookupSequence) return
    cache.clearActive()
    emulator.addLog(`Unable to load FlashRom cartridge data: ${String(error)}`, 'error')
  }
}, { immediate: true, deep: true })

function toggleCartridgeHeight() {
  if (!activeCartridge.value) return
  if (cardMotion.value) {
    queuedToggle = !queuedToggle
    return
  }
  runCartridgeMotion()
}

function runCartridgeMotion() {
  if (!activeCartridge.value) return
  const ejecting = !cardRaised.value
  clearTimeout(motionTimer)
  cardMotion.value = ejecting ? 'eject' : 'insert'
  cardRaised.value = ejecting

  clearTimeout(starTimer)
  const seed = Date.now()
  const starCount = ejecting ? 20 : 14
  ejectStars.value = Array.from({ length: starCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1
    const pair = Math.floor(index / 2)
    return {
      id: `${seed}-${index}`,
      kind: ejecting ? 'eject' : 'insert',
      startX: side * (86 + ((pair * 17) % 38)),
      driftX: side * ((ejecting ? 34 : 22) + ((pair * 13) % (ejecting ? 42 : 28))),
      rise: (ejecting ? 58 : 32) + ((pair * 31) % (ejecting ? 72 : 38)),
      size: 7 + (pair % 4) * 2,
      delay: (pair % 5) * (ejecting ? 18 : 12),
    }
  })
  starTimer = setTimeout(() => { ejectStars.value = [] }, ejecting ? 760 : 520)

  motionTimer = setTimeout(() => {
    cardMotion.value = ''
    if (queuedToggle) {
      queuedToggle = false
      cardMotion.value = 'queued'
      motionFrame = requestAnimationFrame(() => {
        motionFrame = null
        cardMotion.value = ''
        runCartridgeMotion()
      })
    }
  }, ejecting ? 340 : 240)
}

onBeforeUnmount(resetEffects)
</script>

<template>
  <div data-no-drag class="h-[220px] w-full cursor-default overflow-visible bg-transparent">
    <div class="relative h-full w-full overflow-visible">
      <div class="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden="true">
        <Sparkle
          v-for="star in ejectStars"
          :key="star.id"
          class="cartridge-star absolute bottom-0 fill-amber-300 text-amber-400"
          :class="star.kind === 'insert' ? 'cartridge-star-insert' : 'cartridge-star-eject'"
          :style="{
            left: `calc(50% + ${star.startX}px)`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            '--star-x': `${star.driftX}px`,
            '--star-y': `${-star.rise}px`,
            '--star-delay': `${star.delay}ms`,
          }"
        />
      </div>

      <Transition name="cartridge-insert" mode="out-in" appear>
        <CartridgeCard
          v-if="activeCartridge"
          :key="activeCartridge.payload + '-' + insertionKey"
          :cartridge="activeCartridge"
          class="absolute left-1/2 -translate-x-1/2 transition-[bottom]"
          :class="[
            cardRaised ? 'bottom-[-18px] duration-[160ms] ease-out' : 'bottom-[-118px] duration-[120ms] ease-in',
            cardMotion === 'eject' ? 'cartridge-ejecting' : '',
            cardMotion === 'insert' ? 'cartridge-inserting' : '',
          ]"
          @click="toggleCartridgeHeight"
        />
        <UnknownCartridge v-else key="unknown" />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.cartridge-insert-enter-active { animation: cartridge-slam 620ms cubic-bezier(0.2, 0.95, 0.25, 1.2); }
.cartridge-ejecting { animation: cartridge-eject-motion 340ms cubic-bezier(0.12, 0.92, 0.2, 1.22); }
.cartridge-inserting { animation: cartridge-insert-motion 240ms cubic-bezier(0.56, 0, 0.18, 1); }
.cartridge-star { opacity: 0; }
.cartridge-star-eject { animation: cartridge-star-burst 460ms ease-out var(--star-delay) both; }
.cartridge-star-insert { animation: cartridge-star-impact 300ms ease-out var(--star-delay) both; }
@keyframes cartridge-slam {
  0% { transform: translate(-50%, -66px); }
  62% { transform: translate(-50%, 7px); }
  82% { transform: translate(-50%, -3px); }
  100% { transform: translate(-50%, 0); }
}
@keyframes cartridge-eject-motion {
  0% { transform: translate(-50%, 0); }
  46% { transform: translate(-50%, -32px); }
  70% { transform: translate(-50%, 9px); }
  84% { transform: translate(-50%, -5px); }
  100% { transform: translate(-50%, 0); }
}
@keyframes cartridge-insert-motion {
  0% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 26px); }
  70% { transform: translate(-50%, -10px); }
  84% { transform: translate(-50%, 5px); }
  100% { transform: translate(-50%, 0); }
}
@keyframes cartridge-star-burst {
  0% { opacity: 0; transform: translate3d(0, 8px, 0) rotate(0deg); }
  18% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--star-x), var(--star-y), 0) rotate(230deg); }
}
@keyframes cartridge-star-impact {
  0% { opacity: 0; transform: translate3d(0, -5px, 0) rotate(0deg); }
  12% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--star-x), var(--star-y), 0) rotate(190deg); }
}
@media (prefers-reduced-motion: reduce) {
  .cartridge-insert-enter-active,
  .cartridge-ejecting,
  .cartridge-inserting,
  .cartridge-star-eject,
  .cartridge-star-insert { animation-duration: 1ms; }
}
</style>