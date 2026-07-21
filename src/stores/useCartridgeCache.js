import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'chis.cartridges.v2'

function loadRecords() {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function cartridgeKey(info) {
  const identity = info?.game_code || info?.rom_title || info?.game_name || info?.id
  if (!identity) return ''
  return [info?.kind || 'cart', String(identity).trim().toUpperCase(), info?.revision ?? 0].join(':')
}

export const useCartridgeCache = defineStore('cartridge-cache', () => {
  const records = ref(loadRecords())
  const activePayload = ref('')
  const activeCartridge = computed(() => records.value.find((item) => item.payload === activePayload.value) || null)

  watch(records, (value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }, { deep: true })

  function activateCached(info) {
    const detectionKey = cartridgeKey(info)
    const record = records.value.find((item) => item.detectionKey === detectionKey && item.cartridgeImage)
    activePayload.value = record?.payload || ''
    return record || null
  }

  function remember(info, flashRom) {
    const detectionKey = cartridgeKey(info)
    if (!detectionKey || !flashRom?.id || !flashRom?.cartridgeImage) return null
    const payload = String(flashRom.id)
    const record = {
      ...info,
      payload,
      payloadId: flashRom.id,
      detectionKey,
      refKey: flashRom.refKey || null,
      title: flashRom.title || info.rom_title || info.game_name || null,
      serialCode: flashRom.serialCode || null,
      cartridgeImage: flashRom.cartridgeImage,
      platform: String(flashRom.refKey || '').split('__')[0] || null,
      cachedAt: Date.now(),
    }
    records.value = [
      record,
      ...records.value.filter((item) => item.detectionKey !== detectionKey && item.payload !== payload),
    ].slice(0, 24)
    activePayload.value = payload
    return record
  }

  function clearActive() {
    activePayload.value = ''
  }

  function clearAll() {
    records.value = []
    activePayload.value = ''
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('chis.cartridges.v1')
    }
  }

  return { records, activePayload, activeCartridge, activateCached, remember, clearActive, clearAll }
})
