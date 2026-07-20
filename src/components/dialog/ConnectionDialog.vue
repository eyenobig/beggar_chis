<!-- 连接弹窗：列出 cfb detect 到的设备，已连接时底部显示「断开连接」。Teleport 到 body 保证层级最高。 -->
<script setup>
import { storeToRefs } from 'pinia'
import { useConnection } from '../../stores/useConnection'

const conn = useConnection()
const { devices, isConnected, isConnecting, lastError } = storeToRefs(conn)
const { closeDialog, connect, disconnect, detect } = conn
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[9999] flex items-center justify-center">
      <div data-no-drag class="absolute inset-0 bg-black/30" @click="closeDialog"></div>

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
          <div v-if="isConnecting && !devices.length" class="text-xs text-zinc-400 text-center py-7">
            {{ $t('conn.detecting') }}…
          </div>
          <div v-else-if="!devices.length" class="text-xs text-zinc-400 text-center py-7">
            {{ $t('conn.none') }}
          </div>

          <div
            v-for="d in devices"
            :key="d.port"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
            :class="d.burner ? 'border-green-200 bg-green-50' : 'border-zinc-150 bg-zinc-50'"
          >
            <div
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :class="d.burner ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-zinc-300'"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-zinc-800 truncate">
                {{ d.port }}
                <span v-if="d.burner" class="ml-1 text-[9px] font-bold text-green-600">
                  {{ $t('conn.burner') }}
                </span>
              </div>
              <div class="text-[10px] text-zinc-400 truncate">
                {{ d.vid ? d.vid + ':' + d.pid : '—' }} · {{ d.name }}
              </div>
            </div>
          </div>

          <!-- 错误/排查信息 -->
          <div v-if="lastError" class="text-[10px] text-red-500 break-all px-1 pt-1">
            {{ lastError }}
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
            :disabled="isConnecting"
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
