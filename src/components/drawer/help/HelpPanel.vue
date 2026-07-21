<script setup>
import { onMounted, ref } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { cfbClient, inTauri } from '../../../services/cfb'

const clientVersion = ref('—')
const cfbVersion = ref('—')
const loading = ref(true)

onMounted(async () => {
  // 客户端版本（Tauri 打包版本号）；纯 vite 下拿不到，保持「—」。
  if (inTauri) {
    try {
      clientVersion.value = await getVersion()
    } catch {
      clientVersion.value = '—'
    }
  }

  // cfb sidecar 版本：从 NDJSON version 事件取 version 字段。
  // 非 Tauri（纯 vite）下 cfbClient 会抛错，显示「未知」。
  if (inTauri) {
    try {
      const result = await cfbClient.version((event) => {
        if (event?.type === 'version' && event.version) cfbVersion.value = event.version
      })
      if (result?.error || cfbVersion.value === '—') cfbVersion.value = '未知'
    } catch {
      cfbVersion.value = '未知'
    }
  } else {
    cfbVersion.value = '未知'
  }
  loading.value = false
})
</script>

<template>
  <div class="flex-1 min-h-0 overflow-auto no-scrollbar px-5 py-4 space-y-5 text-zinc-200">
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

        <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-zinc-300">烧录引擎</div>
            <div class="text-[9px] text-zinc-600">chis-burner-cmd / cfb</div>
          </div>
          <span
            class="text-[11px] font-black tabular-nums"
            :class="cfbVersion === '未知' ? 'text-zinc-500' : 'text-emerald-400'"
          >{{ loading ? '…' : cfbVersion }}</span>
        </div>
      </div>
    </section>

    <p class="text-[10px] leading-relaxed text-zinc-600">
      烧录引擎通过 NDJSON 与客户端通信，版本号由内置 cfb sidecar 上报。
    </p>
  </div>
</template>
