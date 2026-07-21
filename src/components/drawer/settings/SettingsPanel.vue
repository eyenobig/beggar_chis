<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Trash2 } from '@lucide/vue'
import { cfbClient, inTauri } from '../../../services/cfb'
import { useCfbSettings } from '../../../stores/useCfbSettings'
import { useEmulator } from '../../../stores/useEmulator'
import { useLogStore } from '../../../stores/useLogStore'
import { useCartridgeCache } from '../../../stores/useCartridgeCache'
import SettingHint from '../../settings/SettingHint.vue'

const settings = useCfbSettings()
const emulator = useEmulator()
const logStore = useLogStore()
const cartridgeCache = useCartridgeCache()
const { records: cachedCartridges } = storeToRefs(cartridgeCache)
const { currentPlatform } = storeToRefs(emulator)
const {
  language,
  voltageAuto,
  manualVoltage,
  chipErase,
  unlockPpb,
  verifyAfter,
} = storeToRefs(settings)

const saving = ref(false)
const status = ref('')
const statusError = computed(() => /失败|请在/.test(status.value))
const isGbFamily = computed(() => currentPlatform.value === 'gbc')

const voltageLabel = computed(() => voltageAuto.value ? '\u81ea\u52a8\u8bc6\u522b' : manualVoltage.value)

async function applyVoltage(next, updateState) {
  if (saving.value || !isGbFamily.value) return
  if (!inTauri) {
    status.value = '\u8bf7\u5728\u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u5207\u6362\u7535\u538b'
    return
  }
  saving.value = true
  status.value = ''
  try {
    const result = await cfbClient.setVoltage(next)
    if (result.error) throw new Error(result.error)
    updateState()
    status.value = `GB/GBC \u7535\u538b\u5df2\u8bbe\u4e3a ${voltageLabel.value}`
    logStore.addLog(status.value, 'success')
  } catch (error) {
    status.value = `\u7535\u538b\u5207\u6362\u5931\u8d25: ${String(error)}`
    logStore.addLog(status.value, 'error')
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

function clearCartridgeCache() {
  cartridgeCache.clearAll()
  status.value = '\u5361\u5e26\u7f13\u5b58\u5df2\u6e05\u9664'
  logStore.addLog(status.value, 'success')
}

</script>

<template>
  <div class="flex-1 min-h-0 overflow-auto no-scrollbar px-5 py-4 space-y-5 text-zinc-200">
    <section class="space-y-3">
      <h3 class="text-[11px] font-black uppercase tracking-widest text-zinc-400">Cache</h3>
      <div class="h-10 flex items-center justify-between gap-3 border-y border-white/10">
        <div class="min-w-0">
          <div class="text-[11px] font-bold text-zinc-300">&#x5361;&#x5e26;&#x7f13;&#x5b58;</div>
          <div class="text-[9px] text-zinc-600">{{ cachedCartridges.length }} &#x6761;&#x672c;&#x5730;&#x8bb0;&#x5f55;</div>
        </div>
        <button data-no-drag type="button" class="w-8 h-8 inline-flex items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-500 hover:text-red-400 disabled:opacity-30" :disabled="cachedCartridges.length === 0" aria-label="Clear cartridge cache" title="Clear cartridge cache" @click="clearCartridgeCache">
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
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
          <span class="flex items-center gap-1 text-[11px] font-bold text-zinc-400">GB/GBC &#x7535;&#x538b; <SettingHint text="GBA &#x56fa;&#x5b9a;&#x4f7f;&#x7528; 3.3V&#xff1b;GB/GBC &#x53ef;&#x81ea;&#x52a8;&#x8bc6;&#x522b;&#xff0c;&#x4e5f;&#x53ef;&#x624b;&#x52a8;&#x9009;&#x62e9; 3.3V &#x6216; 5V&#x3002;" /></span>
          <span class="text-[10px] font-bold text-emerald-400">{{ voltageLabel }}</span>
        </div>

        <div class="border-y border-white/10 divide-y divide-white/10">
          <div class="h-11 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[11px] font-bold text-zinc-300">&#x81ea;&#x52a8;&#x8bc6;&#x522b;</div>
              <div class="text-[9px] text-zinc-600">&#x6839;&#x636e;&#x5361;&#x5e26;&#x81ea;&#x52a8;&#x9009;&#x62e9;&#x7535;&#x538b;</div>
            </div>
            <button data-no-drag type="button" role="switch" :aria-checked="voltageAuto" :disabled="saving || !inTauri" class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40" :class="voltageAuto ? 'bg-emerald-400' : 'bg-zinc-700'" aria-label="Automatic voltage detection" @click="toggleVoltageAuto">
              <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" :class="voltageAuto ? 'translate-x-[18px]' : 'translate-x-0.5'" />
            </button>
          </div>

          <div class="h-11 flex items-center justify-between gap-3" :class="voltageAuto ? 'opacity-40' : ''">
            <div class="min-w-0">
              <div class="text-[11px] font-bold text-zinc-300">&#x624b;&#x52a8;&#x7535;&#x538b;</div>
              <div class="text-[9px] text-zinc-600">&#x5173;&#x95ed;&#x81ea;&#x52a8;&#x8bc6;&#x522b;&#x540e;&#x751f;&#x6548;</div>
            </div>
            <div class="flex items-center gap-1.5 text-[9px] font-black text-zinc-500">
              <span :class="manualVoltage === '3.3V' && !voltageAuto ? 'text-white' : ''">3.3V</span>
              <button data-no-drag type="button" role="switch" :aria-checked="manualVoltage === '5V'" :disabled="saving || voltageAuto || !inTauri" class="relative h-5 w-9 shrink-0 rounded-full bg-zinc-700 transition-colors disabled:cursor-default" :class="manualVoltage === '5V' ? '!bg-emerald-400' : ''" aria-label="Toggle 3.3V or 5V" @click="toggleManualVoltage">
                <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" :class="manualVoltage === '5V' ? 'translate-x-[18px]' : 'translate-x-0.5'" />
              </button>
              <span :class="manualVoltage === '5V' && !voltageAuto ? 'text-white' : ''">5V</span>
            </div>
          </div>
        </div>
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
