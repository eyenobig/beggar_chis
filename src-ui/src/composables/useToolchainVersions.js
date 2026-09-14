/**
 * Toolchain path-row version labels (cfb / rule / SkyEmu).
 * cfb 徽章只认当前路径（或 sidecar）现场跑的 `cfb version`。
 */
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { clearDirectBinaryCache, cfbClient, inTauri } from '../services/cfb'
import {
  formatCfbVersion,
  formatRuleVersion,
  formatSkyEmuVersion,
  versionFromCfbEvent,
} from '../services/toolchain'
import { useCfbSettings } from '../stores/useCfbSettings'
import { useEmulator } from '../stores/useEmulator'

export function useToolchainVersions() {
  const { t } = useI18n()
  const settings = useCfbSettings()
  const emu = useEmulator()
  const { activeCfbVersion, cfbBinPath, ruleDataDir } = storeToRefs(settings)
  const { skyEmuPath } = storeToRefs(emu)

  const i18nLabels = () => ({
    local: t('settings.versionLocal'),
    unknown: t('settings.versionUnknown'),
  })

  const cfbVersion = computed(() => formatCfbVersion(activeCfbVersion.value))
  const ruleVersion = computed(() => formatRuleVersion(ruleDataDir.value, i18nLabels()))
  const skyEmuVersion = computed(() => formatSkyEmuVersion(skyEmuPath.value, i18nLabels()))

  let probeGen = 0
  let inFlight = null
  let inFlightKey = ''

  /** 对当前 `cfbBinPath`（空则 sidecar）跑 `cfb version`；同路径并发合并。 */
  async function refreshCfbVersion() {
    await settings.ensurePathsReady()
    if (!inTauri) return ''
    const key = String(cfbBinPath.value || '')
    if (inFlight && inFlightKey === key) return inFlight
    const my = ++probeGen
    inFlightKey = key
    inFlight = (async () => {
      try {
        let binVer = ''
        await cfbClient.version((ev) => {
          const v = versionFromCfbEvent(ev)
          if (v) binVer = v
        })
        if (my !== probeGen) return null
        settings.setActiveCfbVersion(binVer)
        return binVer
      } catch {
        if (my !== probeGen) return null
        settings.setActiveCfbVersion('')
        return ''
      } finally {
        if (my === probeGen) {
          inFlight = null
          inFlightKey = ''
        }
      }
    })()
    return inFlight
  }

  watch(cfbBinPath, (next, prev) => {
    if (next === prev) return
    clearDirectBinaryCache()
    refreshCfbVersion()
  })

  return {
    cfbVersion,
    ruleVersion,
    skyEmuVersion,
    refreshCfbVersion,
  }
}
