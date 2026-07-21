import { ref, watch } from 'vue'
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
  const voltage = ref(['3.3V', '5V'].includes(saved.voltage) ? saved.voltage : 'auto')
  const chipErase = ref(saved.chipErase === true)
  const unlockPpb = ref(saved.unlockPpb !== false)
  const verifyAfter = ref(saved.verifyAfter !== false)
  const emulatorPath = ref(saved.emulatorPath || '')
  const emulatorInstallDir = ref(saved.emulatorInstallDir || '')

  watch(
    () => ({
      preferredPort: preferredPort.value,
      language: language.value,
      voltage: voltage.value,
      chipErase: chipErase.value,
      unlockPpb: unlockPpb.value,
      verifyAfter: verifyAfter.value,
      emulatorPath: emulatorPath.value,
      emulatorInstallDir: emulatorInstallDir.value,
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
    chipErase,
    unlockPpb,
    verifyAfter,
    emulatorPath,
    emulatorInstallDir,
    setPreferredPort,
    clearPreferredPort,
    withGlobalArgs,
    withPortArgs,
    withBurnArgs,
  }
})
