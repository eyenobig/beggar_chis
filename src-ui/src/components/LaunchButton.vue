<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { LoaderCircle, Play, Download } from '@lucide/vue'
import { useSkyEmuDownload } from '../composables/useSkyEmuDownload'

const { t } = useI18n()
const { downloading, canLaunch, emulatorSupported, downloadSkyEmu, launchSkyEmu } =
  useSkyEmuDownload()

const blocked = computed(() => !emulatorSupported.value)
const disabled = computed(() => downloading.value || blocked.value)
const reason = computed(() => (blocked.value ? t('launch.gbcUnsupported') : undefined))

function onClick() {
  if (disabled.value) return
  if (canLaunch.value) return launchSkyEmu()
  return downloadSkyEmu()
}
</script>

<template>
  <!-- 紧跟存档区：细线后立刻是按钮；底仅留圆角余量（Toast 在卡外下沿） -->
  <div class="relative z-10 shrink-0 border-t border-zinc-100 bg-white px-4 pt-2 pb-3">
    <button
      type="button"
      data-no-drag
      class="flex h-12 w-full items-center justify-center gap-2 rounded-xl border transition-all"
      :class="disabled
        ? blocked && !downloading
          ? 'cursor-not-allowed bg-zinc-200 text-zinc-400 border-zinc-200'
          : 'cursor-wait bg-zinc-800 text-white border-zinc-800 opacity-90'
        : 'cursor-pointer bg-zinc-900 text-white border-zinc-900 hover:bg-black active:scale-[0.99]'"
      :disabled="disabled"
      :title="reason"
      :aria-disabled="blocked || undefined"
      :aria-label="reason"
      @click="onClick"
    >
      <LoaderCircle
        v-if="downloading"
        class="h-4 w-4 animate-spin"
        :stroke-width="2.5"
      />
      <Play
        v-else-if="canLaunch"
        class="h-4 w-4"
        :stroke-width="2.5"
      />
      <Download
        v-else
        class="h-4 w-4"
        :stroke-width="2.5"
      />
      <span class="text-[10px] font-black uppercase tracking-[0.2em]">
        {{ downloading ? '下载中…' : canLaunch ? '启动' : '下载Skyemu' }}
      </span>
    </button>
  </div>
</template>
