import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'chis.cfb.settings.v1'

function loadSettings() {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveSettings(value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function cleanPort(port) {
  const s = String(port || '').trim()
  return s || ''
}

export const useCfbSettings = defineStore('cfbSettings', () => {
  const saved = loadSettings()

  const preferredPort = ref(cleanPort(saved.preferredPort))
  const language = ref(saved.language || 'auto')
  const voltageAuto = ref(saved.voltageAuto ?? (saved.voltage ? saved.voltage === 'auto' : true))
  const manualVoltage = ref(
    ['3.3V', '5V'].includes(saved.manualVoltage)
      ? saved.manualVoltage
      : ['3.3V', '5V'].includes(saved.voltage) ? saved.voltage : '3.3V',
  )
  const voltage = computed(() => voltageAuto.value ? 'auto' : manualVoltage.value)
  const chipErase = ref(saved.chipErase === true)
  const unlockPpb = ref(saved.unlockPpb !== false)
  const verifyAfter = ref(saved.verifyAfter !== false)

  watch(
    () => ({
      preferredPort: preferredPort.value,
      language: language.value,
      voltage: voltage.value,
      voltageAuto: voltageAuto.value,
      manualVoltage: manualVoltage.value,
      chipErase: chipErase.value,
      unlockPpb: unlockPpb.value,
      verifyAfter: verifyAfter.value,
    }),
    saveSettings,
    { deep: true },
  )

  function setPreferredPort(port) {
    preferredPort.value = cleanPort(port)
  }

  function clearPreferredPort() {
    preferredPort.value = ''
  }

  function withGlobalArgs(args) {
    if (!language.value || language.value === 'auto') return [...args]
    return ['--lang', language.value, ...args]
  }

  function withPortArgs(args) {
    const out = [...args]
    if (preferredPort.value && !out.includes('--port')) {
      out.push('--port', preferredPort.value)
    }
    return out
  }

  function withBurnArgs(args) {
    const out = withPortArgs(args)
    if (chipErase.value) out.push('--chip-erase')
    if (!unlockPpb.value) out.push('--no-ppb')
    if (!verifyAfter.value) out.push('--no-verify')
    return out
  }


  return {
    preferredPort,
    language,
    voltage,
    voltageAuto,
    manualVoltage,
    chipErase,
    unlockPpb,
    verifyAfter,
    setPreferredPort,
    clearPreferredPort,
    withGlobalArgs,
    withPortArgs,
    withBurnArgs,
  }
})
