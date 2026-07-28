<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { BadgeCheck, FolderOpen, Download, LoaderCircle, Trash2 } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { clearDirectBinaryCache, cfbClient, inTauri } from '../../../services/cfb'
import { SUPPORTED } from '../../../i18n'
import { useSkyEmuDownload } from '../../../composables/useSkyEmuDownload'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import { useCartridgeCache } from '../../../stores/useCartridgeCache'
import { useToast } from '../../../stores/useToast'
import SettingHint from '../../settings/SettingHint.vue'
import UiSelect from '../../ui/UiSelect.vue'
import UiSwitch from '../../ui/UiSwitch.vue'

const { t } = useI18n()
const settings = useCfbSettings()
const emulator = useEmulator()
const logStore = useLogStore()
const toast = useToast()
const cartridgeCache = useCartridgeCache()
const { downloading, downloadSkyEmu } = useSkyEmuDownload()
const { records: cachedCartridges } = storeToRefs(cartridgeCache)
const { currentPlatform, skyEmuPath } = storeToRefs(emulator)
const {
  language,
  voltageAuto,
  manualVoltage,
  chipErase,
  verifyAfter,
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
  if (!inTauri || verifying.value || !cfbBinPath.value) return
  verifying.value = true
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
    toast.error('请在桌面客户端中设置 SkyEmu 路径')
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
  toast.success('SkyEmu 路径已更新')
  logStore.addLog(`SkyEmu 路径: ${path}`, 'success')
}

function clearCartridgeCache() {
  cartridgeCache.clearAll()
  const msg = '卡带缓存已清除'
  toast.success(msg)
  logStore.addLog(msg, 'success')
}

async function applyVoltage(next, updateState) {
  if (saving.value || !isGbFamily.value) return
  if (!inTauri) {
    toast.error('请在桌面客户端中切换电压')
    return
  }
  saving.value = true
  try {
    const result = await cfbClient.setVoltage(next)
    if (result.error) throw new Error(result.error)
    updateState()
    const msg = `GB/GBC 电压已设为 ${voltageLabel.value}`
    toast.success(msg)
    logStore.addLog(msg, 'success')
  } catch (error) {
    const msg = `电压切换失败: ${String(error)}`
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
  <div class="flex-1 min-h-0 overflow-auto no-scrollbar px-5 py-4 space-y-5 text-zinc-200">
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.toolchain') }}</h3>
        <button
          data-no-drag
          type="button"
          class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-900 px-2 text-[10px] font-bold text-zinc-300 hover:text-white disabled:opacity-40"
          :disabled="!inTauri || verifying || !cfbBinPath"
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
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-zinc-300">{{ $t('settings.cfbPath') }}</div>
          <div class="flex items-center gap-2">
            <div
              class="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2.5 py-2 text-[10px] font-medium"
              :class="cfbBinPath ? 'text-zinc-200' : 'text-zinc-600'"
              :title="cfbBinPath || undefined"
            >
              {{ cfbPathLabel }}
            </div>
            <button
              data-no-drag
              type="button"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40"
              :disabled="!inTauri"
              :title="$t('settings.cfbPathPick')"
              :aria-label="$t('settings.cfbPathPick')"
              @click="pickCfbBin"
            >
              <FolderOpen class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-zinc-300">{{ $t('settings.rulePath') }}</div>
          <div class="flex items-center gap-2">
            <div
              class="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2.5 py-2 text-[10px] font-medium"
              :class="ruleDataDir ? 'text-zinc-200' : 'text-zinc-600'"
              :title="ruleDataDir || undefined"
            >
              {{ rulePathLabel }}
            </div>
            <button
              data-no-drag
              type="button"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40"
              :disabled="!inTauri"
              :title="$t('settings.rulePathPick')"
              :aria-label="$t('settings.rulePathPick')"
              @click="pickRuleDir"
            >
              <FolderOpen class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('settings.skyemu') }}</h3>
      <div class="space-y-2 border-y border-white/10 py-2.5">
        <div class="flex items-center gap-1 text-[11px] font-bold text-zinc-300">
          {{ $t('settings.skyemuPath') }}
          <SettingHint :text="$t('settings.skyemuPathHint')" />
        </div>
        <div class="flex items-center gap-2">
          <div
            class="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-zinc-900 px-2.5 py-2 text-[10px] font-medium"
            :class="skyEmuPath ? 'text-zinc-200' : 'text-zinc-600'"
            :title="skyEmuPath || undefined"
          >
            {{ skyEmuPathLabel }}
          </div>
          <button
            data-no-drag
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-40"
            :disabled="!inTauri"
            :title="$t('settings.skyemuPick')"
            :aria-label="$t('settings.skyemuPick')"
            @click="pickSkyEmuPath"
          >
            <FolderOpen class="h-3.5 w-3.5" />
          </button>
          <button
            data-no-drag
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
            :disabled="!inTauri || downloading"
            :title="$t('settings.skyemuDownload')"
            :aria-label="$t('settings.skyemuDownload')"
            @click="downloadSkyEmu"
          >
            <LoaderCircle v-if="downloading" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.5" />
            <Download v-else class="h-3.5 w-3.5" :stroke-width="2.5" />
          </button>
        </div>
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
          <span class="flex min-w-0 items-center gap-1">
            {{ $t('settings.verifyAfter') }}
            <SettingHint :text="$t('settings.verifyAfterHint')" />
          </span>
          <UiSwitch v-model="verifyAfter" />
        </div>
      </div>
    </section>
  </div>
</template>
