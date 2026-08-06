/**
 * Toolchain path-row version labels (cfb / rule / SkyEmu).
 * Formats via adapters; cfb may refresh from `cfb version` when drawer opens.
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { cfbClient, inTauri } from '../services/cfb'
import {
  formatCfbVersion,
  formatRuleVersion,
  formatSkyEmuVersion,
} from '../services/toolchain'
import { useCfbSettings } from '../stores/useCfbSettings'
import { useEmulator } from '../stores/useEmulator'

export function useToolchainVersions() {
  const { t } = useI18n()
  const settings = useCfbSettings()
  const emu = useEmulator()
  const { activeCfbVersion, ruleDataDir } = storeToRefs(settings)
  const { skyEmuPath } = storeToRefs(emu)

  const i18nLabels = () => ({
    local: t('settings.versionLocal'),
    unknown: t('settings.versionUnknown'),
  })

  const cfbVersion = computed(() => formatCfbVersion(activeCfbVersion.value))
  const ruleVersion = computed(() => formatRuleVersion(ruleDataDir.value, i18nLabels()))
  const skyEmuVersion = computed(() => formatSkyEmuVersion(skyEmuPath.value, i18nLabels()))

  async function refreshCfbVersion() {
    await settings.ensurePathsReady()
    if (!inTauri || activeCfbVersion.value) return
    try {
      let binVer = ''
      await cfbClient.version((ev) => {
        if (ev?.type === 'version' && ev.version) binVer = String(ev.version)
        else if (ev?.type === 'log' && ev.message) binVer = String(ev.message)
      })
      if (binVer) settings.setActiveCfbVersion(binVer)
    } catch {
      // 未配置 / 不可用：保持「—」
    }
  }

  return {
    cfbVersion,
    ruleVersion,
    skyEmuVersion,
    refreshCfbVersion,
  }
}
