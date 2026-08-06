<!-- 存档节点（HomePage）：
     2 栏：①当前存档(只显示大小) ②上传存档(.sav，可点选/拖入)。
     视觉与 ROM Payload（DataNode）默认深色卡片一致。
     导出 / 验证 / 烧录 在 ROM 页 SaveControls。 -->
<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartData } from '../../../stores/useCartData'
import { useEmulator } from '../../../stores/useEmulator'
import { useToast } from '../../../stores/useToast'

const cart = useCartData()
const emu = useEmulator()
const toast = useToast()
const { saveFile, cartInfo, saveInfo, opRunning } = storeToRefs(cart)

/** 卡带在位。 */
const hasCart = computed(() => !!cartInfo.value && (cartInfo.value.present || cartInfo.value.capacity_bytes > 0))
/** 拖入了 .sav。 */
const hasSaveFile = computed(() => !!saveFile.value)

/** 当前存档大小：优先 saveInfo(save 操作后)，否则 cartInfo.save_size_bytes(info 时从头 0x149)。 */
const saveSizeText = computed(() => {
  if (saveInfo.value?.size) return formatSize(saveInfo.value.size)
  if (cartInfo.value?.save_size_bytes) return formatSize(cartInfo.value.save_size_bytes)
  return '未知大小'
})

function formatSize(bytes) {
  if (!bytes) return '0B'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

/** 选文件：不依赖 hasCart；阻止窗口拖拽吞掉点击。选中后打开 ROM 页存档操作区。 */
async function onPickSave(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  if (opRunning.value) {
    toast.error('请等待当前操作完成后再选择存档')
    return
  }
  await cart.pickSaveFile()
  if (saveFile.value) {
    // 打开 ROM 页；不切 drawerKind，避免隐藏 ROM 烧录三按钮
    emu.toggleLogs(true, 'rom')
  }
}
</script>

<template>
  <section>
    <div class="mb-2 px-1">
      <span class="text-[9px] font-black uppercase tracking-widest text-zinc-900">Save Data</span>
    </div>

    <!-- 始终展示两栏：上传存档不依赖 hasCart；卡片壳与 ROM Payload 默认样式一致 -->
    <div class="grid grid-cols-2 items-stretch gap-2">
      <div class="rounded-2xl bg-zinc-900 p-4 text-white shadow-md">
        <p class="mb-1 text-[8px] font-black uppercase tracking-widest text-zinc-400">当前存档</p>
        <p v-if="hasCart" class="mono text-xs font-black text-zinc-100">{{ saveSizeText }}</p>
        <div v-else class="flex items-center gap-2">
          <svg
            class="h-4 w-4 shrink-0 text-zinc-500"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect x="3" y="2" width="18" height="15" rx="2" />
            <path d="M3 13h18" />
            <path d="M7 13v4M10 13v4M14 13v4M17 13v4" />
            <rect x="5.5" y="4.5" width="13" height="6" rx="1" />
          </svg>
          <span class="text-xs font-bold text-zinc-500">待插入卡带</span>
        </div>
      </div>
      <button
        data-no-drag
        type="button"
        class="rounded-2xl bg-zinc-900 p-4 text-left text-white shadow-md transition active:scale-[0.99] hover:bg-zinc-800"
        :title="hasSaveFile ? '点击更换存档' : '点击选择 .sav / .srm'"
        @click.stop.prevent="onPickSave"
        @mousedown.stop
        @pointerdown.stop
      >
        <p class="pointer-events-none mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-zinc-400">
          <span
            v-if="hasSaveFile"
            class="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400"
          />
          {{ hasSaveFile ? 'SAVE · 待写入' : '上传存档' }}
        </p>
        <p
          v-if="hasSaveFile"
          class="pointer-events-none mono truncate text-xs font-black text-zinc-100"
          :title="saveFile.path"
        >{{ saveFile.name }}</p>
        <p v-else class="pointer-events-none text-xs font-bold text-zinc-500">点击或拖入 .sav / .srm</p>
      </button>
    </div>
  </section>
</template>
