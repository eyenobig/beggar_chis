<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Download, FolderOpen, RefreshCw } from '@lucide/vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { inTauri, runCfb } from '../../../composables/useCfb'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import SettingHint from '../../settings/SettingHint.vue'

const settings = useCfbSettings()
const emulator = useEmulator()
const logStore = useLogStore()
const { currentPlatform } = storeToRefs(emulator)
const {
  language,
  voltage,
  chipErase,
  unlockPpb,
  verifyAfter,
  emulatorPath,
  emulatorInstallDir,
} = storeToRefs(settings)

const saving = ref(false)
const installingEmulator = ref(false)
const status = ref('')
const statusError = computed(() => /失败|请在/.test(status.value))
const isGbFamily = computed(() => currentPlatform.value === 'gbc')

async function setVoltage(target) {
  if (saving.value || !isGbFamily.value) return
  const next = voltage.value === target ? 'auto' : target
  if (!inTauri) {
    status.value = '请在桌面客户端中切换电压'
    return
  }
  saving.value = true
  status.value = ''
  try {
    const result = await runCfb(next === 'auto' ? ['voltage', '--clear'] : ['voltage', next])
    if (result.error) throw new Error(result.error)
    voltage.value = next
    const label = next === 'auto' ? '自动' : next
    status.value = `GB/GBC 电压已设为 ${label}`
    logStore.addLog(status.value, 'success')
  } catch (error) {
    status.value = `电压切换失败：${String(error)}`
    logStore.addLog(status.value, 'error')
  } finally {
    saving.value = false
  }
}

async function pickEmulator() {
  if (!inTauri) {
    status.value = '请在桌面客户端中选择 SkyEmu 路径'
    return
  }
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'SkyEmu', extensions: ['exe'] }],
    })
    if (typeof selected === 'string') emulatorPath.value = selected
  } catch (error) {
    status.value = `路径选择失败：${String(error)}`
  }
}

async function installEmulator() {
  if (!inTauri) {
    status.value = '请在桌面客户端中安装 SkyEmu'
    return
  }
  const selected = await open({ multiple: false, directory: true })
  if (typeof selected !== 'string') return
  emulatorInstallDir.value = selected
  installingEmulator.value = true
  status.value = '正在下载并解压 SkyEmu...'
  try {
    emulatorPath.value = await invoke('install_skyemu', { destination: selected })
    status.value = 'SkyEmu 已安装并设置启动路径'
  } catch (error) {
    status.value = `安装失败：${String(error)}`
  } finally {
    installingEmulator.value = false
  }
}

</script>

<template>
  <div class="flex-1 min-h-0 overflow-auto no-scrollbar px-5 py-4 space-y-5 text-zinc-200">
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">Emulator</h3>
        <span class="text-[10px] text-zinc-600">DirectPlayV0.6</span>
      </div>

      <label class="block space-y-1.5">
        <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">SkyEmu 启动路径 <SettingHint text="手动选择 SkyEmu.exe，或使用右侧下载按钮安装。" /></span>
        <div class="flex gap-2">
          <input v-model="emulatorPath" data-no-drag class="min-w-0 flex-1 h-8 rounded-md bg-zinc-950/60 border border-white/10 px-2.5 text-xs text-white outline-none focus:border-white/25" placeholder="SkyEmu.exe" />
          <button data-no-drag type="button" :disabled="!inTauri" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white disabled:opacity-40" aria-label="Choose SkyEmu executable" @click="pickEmulator">
            <FolderOpen class="w-3.5 h-3.5" />
          </button>
          <button data-no-drag type="button" :disabled="installingEmulator || !inTauri" class="inline-flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50" aria-label="Install SkyEmu" title="选择目录并安装 SkyEmu" @click="installEmulator">
            <RefreshCw v-if="installingEmulator" class="w-3.5 h-3.5 animate-spin" />
            <Download v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </label>

      <div v-if="emulatorInstallDir" class="text-[10px] text-zinc-600 truncate" :title="emulatorInstallDir">安装目录：{{ emulatorInstallDir }}</div>
    </section>

    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">Command</h3>
      <label class="block space-y-1.5">
        <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">语言 <SettingHint text="设置 chis-burner-cmd 的输出语言。" /></span>
        <select v-model="language" data-no-drag class="w-full h-8 rounded-md bg-zinc-950/60 border border-white/10 px-2 text-xs text-white outline-none">
          <option value="auto">跟随系统</option>
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </label>

      <div v-if="isGbFamily" class="space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">GB/GBC 电压 <SettingHint text="两个开关均关闭时自动选择电压；GBA 始终使用 3.3V。" /></span>
          <span class="text-[10px] font-bold text-emerald-400">{{ voltage === 'auto' ? '自动' : voltage }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="option in ['3.3V', '5V']" :key="option" data-no-drag type="button" role="switch" :aria-checked="voltage === option" :disabled="saving || !inTauri" class="h-9 flex items-center justify-between gap-2 rounded-md border px-2.5 text-[11px] font-bold transition-colors disabled:opacity-50" :class="voltage === option ? 'border-emerald-400/60 bg-emerald-400/10 text-white' : 'border-white/10 bg-zinc-950/60 text-zinc-400 hover:text-white'" @click="setVoltage(option)">
            <span>{{ option }}</span>
            <span class="relative h-4 w-7 shrink-0 rounded-full transition-colors" :class="voltage === option ? 'bg-emerald-400' : 'bg-zinc-700'">
              <span class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform" :class="voltage === option ? 'translate-x-3.5' : 'translate-x-0.5'" />
            </span>
          </button>
        </div>
        <p class="text-[10px] text-zinc-600">两个开关关闭时使用自动电压</p>
      </div>
    </section>

    <section class="space-y-2.5">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">Burn</h3>
      <label class="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-300">
        <span class="flex items-center gap-1">全片擦除模式 <SettingHint text="烧录前擦除整颗 Flash。" /></span>
        <input v-model="chipErase" data-no-drag type="checkbox" class="h-4 w-4 accent-emerald-400" />
      </label>
      <label class="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-300">
        <span class="flex items-center gap-1">烧录前解锁 PPB <SettingHint text="烧录前解除持久保护位。" /></span>
        <input v-model="unlockPpb" data-no-drag type="checkbox" class="h-4 w-4 accent-emerald-400" />
      </label>
      <label class="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-300">
        <span class="flex items-center gap-1">烧录后校验 <SettingHint text="烧录完成后读取数据并进行一致性检查。" /></span>
        <input v-model="verifyAfter" data-no-drag type="checkbox" class="h-4 w-4 accent-emerald-400" />
      </label>
    </section>

    <div v-if="status" class="text-[11px] break-all" :class="statusError ? 'text-red-400' : 'text-emerald-400'">
      {{ status }}
    </div>
  </div>
</template>
