import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { gameCodeOf, romTitleOf } from '../components/drawer/logs/rom/romFields'
import { flashRomMatchesPlatform } from '../services/flashRom'
import { getLocalCache, patchLocalConfig } from '../services/localConfig'

/** 缓存有效期：超过则视为未命中，重新查 Payload。
 *  防止 Payload 数据重建（ROM id 变化）后，旧缓存的 payload id 指向错误 ROM。 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function loadRecords() {
  const carts = getLocalCache().cartridges
  return Array.isArray(carts) ? carts : []
}

function cartridgeKey(info) {
  const identity = gameCodeOf(info) || romTitleOf(info) || info?.id
  if (!identity) return ''
  return [info?.kind || 'cart', String(identity).trim().toUpperCase(), info?.revision ?? 0].join(':')
}

export const useCartridgeCache = defineStore('cartridge-cache', () => {
  const records = ref(loadRecords())
  const activePayload = ref('')
  const activeCartridge = computed(() => records.value.find((item) => item.payload === activePayload.value) || null)

  watch(records, (value) => {
    patchLocalConfig('cache', { cartridges: value })
  }, { deep: true })

  function activateCached(info) {
    const detectionKey = cartridgeKey(info)
    const now = Date.now()
    const record = records.value.find((item) =>
      item.detectionKey === detectionKey
      && item.cartridgeImage
      && flashRomMatchesPlatform(item, info)
      && (!item.cachedAt || now - item.cachedAt < CACHE_TTL_MS),
    )
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
      title: flashRom.title || romTitleOf(info) || null,
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
    patchLocalConfig('cache', { cartridges: [] })
  }

  return { records, activePayload, activeCartridge, activateCached, remember, clearActive, clearAll }
})
