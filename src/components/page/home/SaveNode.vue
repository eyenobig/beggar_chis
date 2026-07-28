<!-- 存档节点（HomePage）：
     2 栏：①当前存档(只显示大小) ②上传存档(.sav，可点选/拖入)。
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
  <section class="relative z-10">
    <div class="mb-2 px-1">
      <span class="text-[9px] font-black uppercase tracking-widest text-zinc-900">Save Data</span>
    </div>

    <!-- 始终展示两栏：上传存档不依赖 hasCart，避免「看不见/点不了」 -->
    <div class="grid grid-cols-2 items-stretch gap-2">
      <div class="rounded-2xl bg-zinc-50 border border-zinc-200 p-3 shadow-sm">
        <p class="text-[8px] font-black uppercase tracking-widest mb-1 text-zinc-500">当前存档</p>
        <p v-if="hasCart" class="text-sm font-black mono text-zinc-900">{{ saveSizeText }}</p>
        <p v-else class="text-xs font-bold text-zinc-400">待插入卡带</p>
      </div>
      <button
        data-no-drag
        type="button"
        class="relative z-20 rounded-2xl bg-zinc-50 border border-zinc-200 p-3 shadow-sm text-left transition hover:bg-zinc-100 cursor-pointer"
        :title="hasSaveFile ? '点击更换存档' : '点击选择 .sav / .srm'"
        @click.stop.prevent="onPickSave"
        @mousedown.stop
        @pointerdown.stop
      >
        <p class="text-[8px] font-black uppercase tracking-widest mb-1 text-zinc-500 pointer-events-none">上传存档</p>
        <template v-if="hasSaveFile">
          <p class="text-sm font-black mono text-zinc-900 truncate pointer-events-none" :title="saveFile.path">{{ saveFile.name }}</p>
        </template>
        <p v-else class="text-xs font-bold text-zinc-400 pointer-events-none">点击或拖入 .sav / .srm</p>
      </button>
    </div>
  </section>
</template>
