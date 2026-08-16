<script setup>
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Download, ExternalLink, LoaderCircle, RefreshCw } from '@lucide/vue'
import { useDragScroll } from '../../../composables/useDragScroll'
import { inTauri } from '../../../services/cfb'
import { useAppUpdater } from '../../../stores/useAppUpdater'
import { useToast } from '../../../stores/useToast'

const { scrollBind } = useDragScroll()
const { t } = useI18n()
const toast = useToast()
const appUpdater = useAppUpdater()
const {
  currentVersion: appVersion,
  availableVersion: availableAppVersion,
  status: updateStatus,
  error: updateError,
  progressPct: updateProgressPct,
  isChecking: updateChecking,
  isDownloading: updateDownloading,
  updateAvailable,
  installBlocked: updateInstallBlocked,
} = storeToRefs(appUpdater)

const CLIENT_REPO_URL = 'https://github.com/eyenobig/beggar_chis'
const CFB_REPO_URL = 'https://github.com/eyenobig/chis-burner-cmd'

const clientVersion = ref('—')

onMounted(async () => {
  appUpdater.init({ auto: false })

  // 客户端版本（Tauri 打包版本号）；纯 vite 下拿不到，保持「—」。
  if (inTauri) {
    try {
      clientVersion.value = await getVersion()
    } catch {
      clientVersion.value = '—'
    }
  }
})

async function openRepo(url) {
  try {
    if (inTauri) await openUrl(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function onUpdateAction() {
  if (!inTauri) {
    toast.error(t('help.updateDesktopOnly'))
    return
  }
  if (updateAvailable.value) {
    if (updateInstallBlocked.value) {
      toast.error(t('help.updateBlocked'))
      return
    }
    toast.info(t('help.updateDownloading'))
    const ok = await appUpdater.downloadAndInstall()
    if (!ok && updateError.value) toast.error(updateError.value)
    return
  }
  toast.info(t('help.updateChecking'))
  await appUpdater.checkForUpdates()
  if (updateStatus.value === 'upToDate') {
    toast.success(t('help.updateUpToDate'))
  } else if (updateStatus.value === 'available') {
    toast.success(t('help.updateFound', { version: availableAppVersion.value }))
    // 发现新版本直接进入下载安装（一键更新）；烧录任务运行中则提示稍后再试。
    if (updateInstallBlocked.value) {
      toast.error(t('help.updateBlocked'))
      return
    }
    toast.info(t('help.updateDownloading'))
    const ok = await appUpdater.downloadAndInstall()
    if (!ok && updateError.value) toast.error(updateError.value)
  } else if (updateStatus.value === 'error') {
    toast.error(updateError.value || t('help.updateFailed'))
  }
}
</script>

<template>
  <div
    data-drawer-scroll
    class="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-5 py-4 space-y-5 text-zinc-200 [touch-action:pan-y]"
    v-bind="scrollBind"
  >
    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('help.verifyTitle') }}</h3>
      <p class="text-[10px] leading-relaxed text-zinc-500">{{ $t('help.verifyBody') }}</p>
      <ul class="space-y-2 border-y border-white/10 py-2.5 text-[10px] leading-relaxed text-zinc-500">
        <li>
          <span class="font-bold text-zinc-300">{{ $t('help.verifyBurnLabel') }}</span>
          — {{ $t('help.verifyBurnDesc') }}
        </li>
        <li>
          <span class="font-bold text-zinc-300">{{ $t('help.verifySaveLabel') }}</span>
          — {{ $t('help.verifySaveDesc') }}
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">{{ $t('help.updateTitle') }}</h3>
        <button
          data-no-drag
          type="button"
          class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-900 px-2 text-[10px] font-bold text-zinc-300 hover:text-white disabled:opacity-40"
          :disabled="!inTauri || updateChecking || updateDownloading || (updateAvailable && updateInstallBlocked)"
          :title="updateAvailable && updateInstallBlocked ? $t('help.updateBlocked') : ''"
          @click="onUpdateAction"
        >
          <LoaderCircle v-if="updateChecking || updateDownloading" class="h-3.5 w-3.5 animate-spin" :stroke-width="2.5" />
          <Download v-else-if="updateAvailable" class="h-3.5 w-3.5" :stroke-width="2.5" />
          <RefreshCw v-else class="h-3.5 w-3.5" :stroke-width="2.5" />
          {{
            updateAvailable
              ? $t('help.updateInstall')
              : (updateChecking ? $t('help.updateChecking') : $t('help.updateCheck'))
          }}
        </button>
      </div>
      <div class="space-y-2 border-y border-white/10 py-2.5 text-[10px]">
        <div class="flex items-center justify-between gap-3">
          <span class="text-zinc-500">{{ $t('help.updateCurrent') }}</span>
          <span class="font-bold text-zinc-300">{{ appVersion || clientVersion || '-' }}</span>
        </div>
        <div v-if="updateAvailable" class="flex items-center justify-between gap-3">
          <span class="text-emerald-400">{{ $t('help.updateAvailable') }}</span>
          <span class="font-black text-emerald-300">{{ availableAppVersion }}</span>
        </div>
        <div v-else-if="updateStatus === 'upToDate'" class="text-emerald-400">{{ $t('help.updateUpToDate') }}</div>
        <div v-else-if="updateStatus === 'blocked'" class="text-amber-400">{{ $t('help.updateBlocked') }}</div>
        <div v-if="updateDownloading" class="space-y-1">
          <div class="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div class="h-full bg-emerald-500 transition-all" :style="{ width: updateProgressPct + '%' }"></div>
          </div>
          <div class="text-right text-zinc-500">{{ updateProgressPct }}%</div>
        </div>
        <div v-if="updateError" class="break-words text-red-400">{{ updateError }}</div>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">About</h3>

      <div class="space-y-2.5">
        <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-zinc-300">客户端</div>
            <div class="text-[9px] text-zinc-600">Chis Flasher / 烧丐</div>
          </div>
          <span class="text-[11px] font-black text-emerald-400 tabular-nums">{{ clientVersion }}</span>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">GitHub</h3>
      <div class="space-y-2.5">
        <button
          data-no-drag
          type="button"
          class="flex w-full items-center justify-between gap-3 border-b border-white/10 pb-2.5 text-left transition hover:opacity-90"
          @click="openRepo(CLIENT_REPO_URL)"
        >
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-zinc-300">客户端仓库</div>
            <div class="truncate text-[9px] text-zinc-600">{{ CLIENT_REPO_URL }}</div>
          </div>
          <ExternalLink class="h-3.5 w-3.5 shrink-0 text-zinc-500" :stroke-width="2.25" />
        </button>
        <button
          data-no-drag
          type="button"
          class="flex w-full items-center justify-between gap-3 border-b border-white/10 pb-2.5 text-left transition hover:opacity-90"
          @click="openRepo(CFB_REPO_URL)"
        >
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-zinc-300">烧录引擎仓库</div>
            <div class="truncate text-[9px] text-zinc-600">{{ CFB_REPO_URL }}</div>
          </div>
          <ExternalLink class="h-3.5 w-3.5 shrink-0 text-zinc-500" :stroke-width="2.25" />
        </button>
      </div>
    </section>

    <p class="text-[10px] leading-relaxed text-zinc-600">
      烧录引擎通过 NDJSON 与客户端通信；工具链版本见设置页。
    </p>
  </div>
</template>
