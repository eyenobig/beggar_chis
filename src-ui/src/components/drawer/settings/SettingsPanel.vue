<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { BadgeCheck, LoaderCircle, Trash2 } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { clearDirectBinaryCache, cfbClient, inTauri } from '../../../services/cfb'
import { SUPPORTED } from '../../../i18n'
import { useSkyEmuDownload } from '../../../composables/useSkyEmuDownload'
import { useCfbRuleDownload } from '../../../composables/useCfbRuleDownload'
import { useToolchainVersions } from '../../../composables/useToolchainVersions'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import { useCartridgeCache } from '../../../stores/useCartridgeCache'
import { useToast } from '../../../stores/useToast'
import { useDragScroll } from '../../../composables/useDragScroll'
import SettingHint from '../../settings/SettingHint.vue'
import ToolchainPathField from '../../settings/ToolchainPathField.vue'
import UiSelect from '../../ui/UiSelect.vue'
import UiSwitch from '../../ui/UiSwitch.vue'

const { scrollBind } = useDragScroll()
const { t } = useI18n()
const settings = useCfbSettings()
const emulator = useEmulator()
const logStore = useLogStore()
const toast = useToast()
const cartridgeCache = useCartridgeCache()
const { downloading, downloadSkyEmu } = useSkyEmuDownload()
const { downloadingCfb, downloadingRule, downloadCfb, downloadRule } = useCfbRuleDownload()
const { cfbVersion, ruleVersion, skyEmuVersion, refreshCfbVersion } = useToolchainVersions()
const { records: cachedCartridges } = storeToRefs(cartridgeCache)
const { currentPlatform, skyEmuPath } = storeToRefs(emulator)
const {
  language,
  voltageAuto,
  manualVoltage,
  chipErase,
  verifyAfter,
  thermalPaper,
  cartridgeStage,
  cartridgeStickers,
  cfbBinPath,
  ruleDataDir,
} = storeToRefs(settings)

const languageOptions = computed(() => [
  { value: 'auto', label: t('settings.langAuto') },
  ...Object.entries(SUPPORTED).map(([value, label]) => ({ value, label })),
])

const saving = ref(false)
const verifying = ref(false)
const isGbFamily = computed(() => currentPlatform.value === 'gbc')

const voltageLabel = computed(() =>
  voltageAuto.value ? t('settings.voltageAutoLabel') : manualVoltage.value,
)
const skyEmuPathLabel = computed(() => skyEmuPath.value || t('settings.skyemuUnset'))
const cfbPathLabel = computed(() => cfbBinPath.value || t('settings.pathUnset'))
const rulePathLabel = computed(() => ruleDataDir.value || t('settings.pathUnset'))

onMounted(() => {
  settings.ensurePathsReady()
  refreshCfbVersion()
})

/** 选择 cfb 可执行文件（与一般 bin 引用一致）。 */
async function pickCfbBin() {
  if (!inTauri) {
    toast.error(t('settings.pathPickDesktopOnly'))
    return
  }
  const selected = await openDialog({
    multiple: false,
    title: t('settings.cfbPathPick'),
    defaultPath: cfbBinPath.value || undefined,
  })
  if (!selected) return
  const path = typeof selected === 'string' ? selected : selected[0]
  if (!path) return
  cfbBinPath.value = path
  clearDirectBinaryCache()
  toast.success(t('settings.pathUpdated'))
  logStore.addLog(`cfb: ${path}`, 'success')
}

/** 选择已解压的 rule 数据目录（含 profiles）。 */
async function pickRuleDir() {
  if (!inTauri) {
    toast.error(t('settings.pathPickDesktopOnly'))
    return
  }
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: t('settings.rulePathPick'),
    defaultPath: ruleDataDir.value || undefined,
  })
  if (!selected) return
  const path = typeof selected === 'string' ? selected : selected[0]
  if (!path) return
  ruleDataDir.value = path
  toast.success(t('settings.pathUpdated'))
  logStore.addLog(`rule: ${path}`, 'success')
}

/**
 * 验证配置的 cfb 路径：解析可执行文件 → 运行 `cfb version`。
 * 只确认二进制可运行，不比对 Cargo.toml。
 */
async function verifyToolchain() {
  if (verifying.value) return
  if (!inTauri) {
    toast.error(t('settings.pathPickDesktopOnly'))
    return
  }
  if (!cfbBinPath.value) {
    toast.error(t('settings.verifyNeedPath'))
    logStore.addLog(t('settings.verifyNeedPath'), 'warn')
    return
  }
  verifying.value = true
  toast.info(t('settings.verifying'))
  try {
    clearDirectBinaryCache()
    const binPath = await invoke('resolve_cfb_binary', { cfbPath: cfbBinPath.value })
    // 若配置的是源码根/bins 目录，验证成功后写回实际 exe，避免设置页继续显示目录。
    if (binPath && binPath !== cfbBinPath.value) {
      cfbBinPath.value = binPath
    }
    let binVer = ''
    const { error } = await cfbClient.version((ev) => {
      if (ev?.type === 'version' && ev.version) binVer = String(ev.version)
      else if (ev?.type === 'log' && ev.message) binVer = String(ev.message)
    })
    if (!binVer) throw new Error(error || 'cfb version 无输出')
    settings.setActiveCfbVersion(binVer)

    const msg = t('settings.verifyOk', { path: binPath, bin: binVer })
    toast.success(msg)
    logStore.addLog(msg, 'success')
  } catch (error) {
    settings.setActiveCfbVersion('')
    const raw = String(error?.message || error)
    const missing = /未找到|不存在|未配置/i.test(raw)
    const msg = missing ? t('settings.verifyMissing') : t('settings.verifyFail', { err: raw })
    toast.error(msg)
    logStore.addLog(msg, 'error')
  } finally {
    verifying.value = false
  }
}

async function pickSkyEmuPath() {
  if (!inTauri) {
    toast.error(t('settings.skyemuPathDesktopOnly'))
    return
  }
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: t('settings.skyemuPick'),
    defaultPath: skyEmuPath.value || undefined,
  })
  if (!selected) return
  const path = typeof selected === 'string' ? selected : selected[0]
  if (!path) return
  emulator.setSkyEmuPath(path)
  toast.success(t('settings.skyemuPathUpdated'))
  logStore.addLog(t('logs.skyemuPath', { path }), 'success')
}

function clearCartridgeCache() {
  cartridgeCache.clearAll()
  const msg = t('settings.cartCacheCleared')
  toast.success(msg)
  logStore.addLog(msg, 'success')
}

async function applyVoltage(next, updateState) {
  if (saving.value || !isGbFamily.value) return
  if (!inTauri) {
    toast.error(t('settings.voltageDesktopOnly'))
    return
  }
  saving.value = true
  try {
    const result = await cfbClient.setVoltage(next)
    if (result.error) throw new Error(result.error)
    updateState()
    const msg = t('settings.voltageSet', { v: voltageLabel.value })
    toast.success(msg)
    logStore.addLog(msg, 'success')
  } catch (error) {
    const msg = t('settings.voltageFail', { err: String(error) })
    toast.error(msg)
    logStore.addLog(msg, 'error')
  } finally {
    saving.value = false
  }
}

function toggleVoltageAuto() {
  const nextAuto = !voltageAuto.value
  const next = nextAuto ? 'auto' : manualVoltage.value
  return applyVoltage(next, () => { voltageAuto.value = nextAuto })
}

function toggleManualVoltage() {
  if (voltageAuto.value) return
  const next = manualVoltage.value === '5V' ? '3.3V' : '5V'
  return applyVoltage(next, () => { manualVoltage.value = next })
}
</script>

<template>
  <div
    data-drawer-scroll
    class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-5 py-4 space-y-5 text-zinc-200 [touch-action:pan-y]"
    v-bind="scrollBind"
  >
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.toolchain') }}</h3>
        <button
          data-no-drag
          type="button"
          class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-900 px-2 text-[10px] font-bold text-zinc-300 hover:text-white disabled:opacity-40"
          :disabled="verifying"
          :title="$t('settings.verify')"
          :aria-label="$t('settings.verify')"
          @click="verifyToolchain"
        >
          <LoaderCircle v-if="verifying" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.5" />
          <BadgeCheck v-else class="h-3.5 w-3.5" :stroke-width="2.5" />
          {{ verifying ? $t('settings.verifying') : $t('settings.verify') }}
        </button>
      </div>
      <div class="space-y-3 border-y border-white/10 py-2.5">
        <ToolchainPathField
          :title="$t('settings.cfbPath')"
          :version="cfbVersion"
          :path-label="cfbPathLabel"
          :path="cfbBinPath || ''"
          :pick-title="$t('settings.cfbPathPick')"
          :download-title="$t('settings.cfbDownload')"
          :downloading="downloadingCfb"
          :disabled="!inTauri"
          @pick="pickCfbBin"
          @download="downloadCfb"
        />
        <ToolchainPathField
          :title="$t('settings.rulePath')"
          :version="ruleVersion"
          :path-label="rulePathLabel"
          :path="ruleDataDir || ''"
          :pick-title="$t('settings.rulePathPick')"
          :download-title="$t('settings.ruleDownload')"
          :downloading="downloadingRule"
          :disabled="!inTauri"
          @pick="pickRuleDir"
          @download="downloadRule"
        />
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.skyemu') }}</h3>
      <div class="space-y-2 border-y border-white/10 py-2.5">
        <ToolchainPathField
          :version="skyEmuVersion"
          :path-label="skyEmuPathLabel"
          :path="skyEmuPath || ''"
          :pick-title="$t('settings.skyemuPick')"
          :download-title="$t('settings.skyemuDownload')"
          :downloading="downloading"
          :disabled="!inTauri"
          @pick="pickSkyEmuPath"
          @download="downloadSkyEmu"
        >
          <template #title>
            {{ $t('settings.skyemuPath') }}
            <SettingHint :text="$t('settings.skyemuPathHint')" />
          </template>
        </ToolchainPathField>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.cache') }}</h3>
      <div class="flex min-h-11 items-center justify-between gap-4 border-y border-white/10 py-2.5">
        <div class="min-w-0 space-y-0.5">
          <div class="text-[11px] font-bold text-zinc-300">{{ $t('settings.cartCache') }}</div>
          <div class="text-[9px] text-zinc-600">{{ $t('settings.cartCacheCount', { n: cachedCartridges.length }) }}</div>
        </div>
        <button
          data-no-drag
          type="button"
          class="w-8 h-8 inline-flex items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-500 hover:text-red-400 disabled:opacity-30"
          :disabled="cachedCartridges.length === 0"
          @click="clearCartridgeCache"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.command') }}</h3>
      <div class="space-y-1.5">
        <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">
          {{ $t('settings.language') }}
          <SettingHint :text="$t('settings.languageHint')" />
        </span>
        <UiSelect v-model="language" :options="languageOptions" />
      </div>

      <div v-if="isGbFamily" class="space-y-2">
        <div class="flex items-center justify-between gap-4">
          <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">
            {{ $t('settings.voltage') }}
            <SettingHint :text="$t('settings.voltageHint')" />
          </span>
          <span class="text-[10px] font-bold text-emerald-400 tabular-nums">{{ voltageLabel }}</span>
        </div>

        <div class="border-y border-white/10 divide-y divide-white/10">
          <div class="flex min-h-11 items-center justify-between gap-4 py-2.5">
            <div class="min-w-0 space-y-0.5">
              <div class="text-[11px] font-bold text-zinc-300">{{ $t('settings.voltageAuto') }}</div>
              <div class="text-[9px] leading-snug text-zinc-600">{{ $t('settings.voltageAutoDesc') }}</div>
            </div>
            <UiSwitch
              :model-value="voltageAuto"
              :disabled="saving || !inTauri"
              @update:model-value="toggleVoltageAuto"
            />
          </div>

          <div class="flex min-h-11 items-center justify-between gap-4 py-2.5" :class="voltageAuto ? 'opacity-40' : ''">
            <div class="min-w-0 space-y-0.5">
              <div class="text-[11px] font-bold text-zinc-300">{{ $t('settings.voltageManual') }}</div>
              <div class="text-[9px] leading-snug text-zinc-600">{{ $t('settings.voltageManualDesc') }}</div>
            </div>
            <div class="flex shrink-0 items-center gap-2.5 text-[9px] font-black tabular-nums text-zinc-500">
              <span :class="manualVoltage === '3.3V' && !voltageAuto ? 'text-white' : ''">3.3V</span>
              <UiSwitch
                :model-value="manualVoltage === '5V'"
                :disabled="saving || voltageAuto || !inTauri"
                @update:model-value="toggleManualVoltage"
              />
              <span :class="manualVoltage === '5V' && !voltageAuto ? 'text-white' : ''">5V</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="space-y-1">
      <h3 class="mb-2 text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.ui') }}</h3>
      <div class="border-y border-white/10 divide-y divide-white/10">
        <div class="flex min-h-11 items-center justify-between gap-4 py-2.5 text-xs font-semibold text-zinc-300">
          <span class="flex min-w-0 items-center gap-1">
            {{ $t('settings.cartridgeStage') }}
            <SettingHint :text="$t('settings.cartridgeStageHint')" />
          </span>
          <UiSwitch v-model="cartridgeStage" />
        </div>
        <div class="flex min-h-11 items-center justify-between gap-4 py-2.5 text-xs font-semibold text-zinc-300">
          <span class="flex min-w-0 items-center gap-1">
            {{ $t('settings.cartridgeStickers') }}
            <SettingHint :text="$t('settings.cartridgeStickersHint')" />
          </span>
          <UiSwitch v-model="cartridgeStickers" :disabled="!cartridgeStage" />
        </div>
        <div class="flex min-h-11 items-center justify-between gap-4 py-2.5 text-xs font-semibold text-zinc-300">
          <span class="flex min-w-0 items-center gap-1">
            {{ $t('settings.thermalPaper') }}
            <SettingHint :text="$t('settings.thermalPaperHint')" />
          </span>
          <UiSwitch v-model="thermalPaper" />
        </div>
      </div>
    </section>

    <section class="space-y-1">
      <h3 class="mb-2 text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.burn') }}</h3>
      <div class="border-y border-white/10 divide-y divide-white/10">
        <div class="flex min-h-11 items-center justify-between gap-4 py-2.5 text-xs font-semibold text-zinc-300">
          <span class="flex min-w-0 items-center gap-1">
            {{ $t('settings.chipErase') }}
            <SettingHint :text="$t('settings.chipEraseHint')" />
          </span>
          <UiSwitch v-model="chipErase" />
        </div>
        <div class="flex min-h-11 items-center justify-between gap-4 py-2.5 text-xs font-semibold text-zinc-300">
          <span class="flex min-w-0 flex-col gap-0.5">
            <span>{{ $t('settings.verifyAfter') }}</span>
            <button
              data-no-drag
              type="button"
              class="w-fit text-left text-[9px] font-bold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              @click="emulator.openBookmark(emulator.BOOKMARK_IDS.help)"
            >
              {{ $t('settings.verifyAfterSeeHelp') }}
            </button>
          </span>
          <UiSwitch v-model="verifyAfter" />
        </div>
      </div>
    </section>
  </div>
</template>
