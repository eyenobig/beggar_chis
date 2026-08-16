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
} = storeToRefs(conn)
const { closeDialog, connect, disconnect, detect, pickDevice } = conn

const errorText = computed(() => {
  if (!lastError.value) return ''
  if (lastError.value === 'select_required') return t('conn.selectHint')
  return lastError.value
})

function rowClass(d) {
  const selected = selectedPort.value === d.port
  if (selected) return 'border-green-500 bg-green-50 ring-1 ring-green-400 cursor-pointer'
  if (d.burner) return 'border-green-200 bg-green-50/60 hover:border-green-400 cursor-pointer'
  return 'border-zinc-150 bg-zinc-50 cursor-pointer'
}

async function onPick(d) {
  if (detecting.value) return
  await pickDevice(d.port)
}

function deviceMeta(d) {
  const id = d.vid ? `${d.vid}:${d.pid}` : '—'
  const sn = d.serial ? ` · SN ${d.serial}` : ''
  const busy = d.open === false ? ` · ${t('conn.busy')}` : ''
  return `${id}${sn} · ${d.name}${busy}`
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
              :class="selectedPort === d.port
                ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                : d.burner ? 'bg-green-400' : 'bg-zinc-300'"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-zinc-800 truncate" :title="d.port">
                {{ shortPort(d.port) }}
                <span v-if="d.burner" class="ml-1 text-[9px] font-bold text-green-600">
                  {{ $t('conn.burner') }}
                </span>
                <span
                  v-if="selectedPort === d.port"
                  class="ml-1 text-[9px] font-bold text-green-700"
                >
                  {{ $t('conn.selected') }}
                </span>
              </div>
              <div class="text-[10px] text-zinc-400 truncate">
                {{ deviceMeta(d) }}
              </div>
            </div>
          </button>

          <!-- 错误/排查信息 -->
          <div v-if="errorText" class="text-[10px] text-red-500 break-all px-1 pt-1">
            {{ errorText }}
          </div>
        </div>

        <!-- 底部：已连接显示「断开连接」，否则显示「连接」 -->
        <div class="p-3 border-t border-zinc-100 shrink-0">
          <button
            v-if="isConnected"
            data-no-drag
            @click="disconnect"
            class="w-full py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 active:scale-95 transition-all"
          >
            {{ $t('conn.disconnect') }}
          </button>
          <button
            v-else
            data-no-drag
            :disabled="isConnecting || needsSelection"
            @click="connect"
            class="w-full py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {{ isConnecting ? $t('conn.detecting') + '…' : $t('conn.connect') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
