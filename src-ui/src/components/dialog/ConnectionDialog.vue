<!-- 连接弹窗：列出 cfb detect 到的设备，点击行选择唯一写入目标；已连接时底部显示「断开连接」。Teleport 到 body 保证层级最高。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useConnection, shortPort } from '../../stores/useConnection'

const { t } = useI18n()
const conn = useConnection()
const {
  devices,
  burners,
  selectedPort,
  needsSelection,
  isConnected,
  isConnecting,
  lastError,
  detecting,
  permBlocked,
  fixingPerms,
  repairBlocked,
} = storeToRefs(conn)
const { closeDialog, connect, disconnect, detect, pickDevice, fixSerialPerms } = conn

const busy = computed(() => detecting.value || fixingPerms.value)
const errorText = computed(() => {
  if (!lastError.value) return ''
  if (lastError.value === 'select_required') return t('conn.selectHint')
  if (/bundled cfb executable|未在目录中找到 cfb|cfb.*路径不存在/i.test(lastError.value)) return t('conn.engineMissing')
  return t('conn.reconnectHint')
})
const showRepair = computed(() => permBlocked.value || (!!lastError.value && !needsSelection.value))
const primaryAction = computed(() => {
  if (isConnected.value) return { label: 'conn.disconnect', run: disconnect, disabled: busy.value, disconnect: true }
  if (showRepair.value) return {
    label: fixingPerms.value ? 'conn.repairing' : 'conn.repair',
    run: fixSerialPerms,
    disabled: fixingPerms.value || repairBlocked.value,
  }
  return {
    label: isConnecting.value ? 'conn.detecting' : 'conn.connect',
    run: connect,
    disabled: busy.value || needsSelection.value,
  }
})

function rowClass(d) {
  const selected = selectedPort.value === d.port
  if (selected && d.open === false) return 'border-amber-300 bg-amber-50 cursor-pointer'
  if (selected) return 'border-zinc-300 bg-zinc-50 cursor-pointer'
  if (d.burner) return 'border-green-200 bg-green-50/60 hover:border-green-400 cursor-pointer'
  return 'border-zinc-150 bg-zinc-50 cursor-pointer'
}

async function onPick(d) {
  if (busy.value) return
  await pickDevice(d.port)
}

function deviceMeta(d) {
  return d.open === false ? t('conn.busy') : t('conn.burner')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[9999] flex items-center justify-center">
      <div data-no-drag class="absolute inset-0" @click="closeDialog"></div>

      <div
        data-no-drag
        class="relative w-[300px] max-h-[440px] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden"
      >
        <!-- 标题 -->
        <div class="px-4 py-3 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <span class="text-sm font-bold text-zinc-800">{{ $t('conn.title') }}</span>
          <div class="flex items-center gap-3">
            <button
              data-no-drag
              @click="detect"
              :disabled="busy"
              class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              {{ $t('conn.refresh') }}
            </button>
            <button
              data-no-drag
              aria-label="close"
              @click="closeDialog"
              class="w-5 h-5 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- 设备列表 -->
        <div class="flex-1 overflow-auto p-3 space-y-1.5 min-h-[90px]">
          <div v-if="isConnecting && !burners.length && !devices.length" class="text-xs text-zinc-400 text-center py-7">
            {{ $t('conn.detecting') }}…
          </div>
          <div v-else-if="!burners.length" class="text-xs text-zinc-400 text-center py-7">
            {{ $t('conn.none') }}
          </div>

          <p
            v-if="needsSelection"
            class="text-[10px] text-amber-600 px-1 pb-0.5"
          >
            {{ $t('conn.selectHint') }}
          </p>

          <button
            v-for="d in burners"
            :key="d.port"
            type="button"
            data-no-drag
            class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all"
            :class="rowClass(d)"
            :aria-pressed="selectedPort === d.port"
            @click="onPick(d)"
          >
            <div
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :class="d.open === false ? 'bg-amber-400' : selectedPort === d.port
                ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                : d.burner ? 'bg-green-400' : 'bg-zinc-300'"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-zinc-800 truncate" :title="d.port">
                {{ shortPort(d.port) }}
              </div>
              <div class="text-[10px] text-zinc-400 truncate">
                {{ deviceMeta(d) }}
              </div>
            </div>
          </button>

          <p v-if="errorText || permBlocked" role="status" class="text-[11px] leading-relaxed text-zinc-500 px-1 pt-2">
            {{ errorText || $t('conn.reconnectHint') }}
          </p>
          <details v-if="lastError && lastError !== 'select_required'" class="px-1 text-[10px] text-zinc-400">
            <summary class="cursor-pointer">{{ $t('conn.details') }}</summary>
            <p class="mt-1 break-words select-text">{{ lastError }}</p>
          </details>
        </div>

        <!-- 操作、标签和禁用条件由同一个状态决定。 -->
        <div class="p-3 border-t border-zinc-100 shrink-0">
          <button
            data-no-drag
            type="button"
            :disabled="primaryAction.disabled"
            @click="primaryAction.run()"
            class="w-full py-2 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
            :class="primaryAction.disconnect
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-zinc-900 text-white hover:bg-zinc-700'"
          >
            {{ $t(primaryAction.label) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
