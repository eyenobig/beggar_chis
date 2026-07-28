<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImageUp, Pencil, Plus, X } from '@lucide/vue'
import { useCartData } from '../../../../stores/useCartData'
import { useCartridgeCache } from '../../../../stores/useCartridgeCache'
import { findFlashRomGroup, submitFlashSticker, updateFlashRom } from '../../../../services/flashRom'
import { gameCodeOf, romTitleOf } from './romFields'

const REGION_OPTIONS = ['jp', 'us', 'eu', 'de', 'fr', 'es', 'it', 'cn', 'kr', 'au', 'world']

const cart = useCartData()
const cache = useCartridgeCache()
const { cartInfo } = storeToRefs(cart)
const { activePayload } = storeToRefs(cache)

const matches = ref([])
const loading = ref(false)
const loadError = ref('')
const sliderTrack = ref(null)
const activeStickerId = ref('')
const selectedRomId = ref('')
let loadSequence = 0

const romEditOpen = ref(false)
const regionMenuOpen = ref(false)
const romSaving = ref(false)
const romError = ref('')
const romForm = ref({ title: '', region: 'world', serialCode: '', revision: '', cartridgeImage: '' })

const uploadOpen = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const uploadResult = ref('')
const uploadForm = ref({
  romId: '',
  name: '',
  description: '',
  previewBase64: '',
  previewMimetype: 'image/png',
  fileName: '',
})

const identity = computed(() => gameCodeOf(cartInfo.value) || romTitleOf(cartInfo.value) || '')
const canShow = computed(() => !!cartInfo.value && !!identity.value)

function stickersOf(rom) {
  const raw = rom?.stickers
  return Array.isArray(raw) ? raw : Array.isArray(raw?.docs) ? raw.docs : []
}

const stickerItems = computed(() => matches.value.flatMap((rom) =>
  stickersOf(rom).map((sticker) => ({ rom, sticker })),
))
const selectedRom = computed(() =>
  matches.value.find((rom) => String(rom.id) === String(selectedRomId.value))
  || matches.value.find((rom) => String(rom.id) === String(activePayload.value))
  || matches.value[0]
  || null,
)
const activeSticker = computed(() =>
  stickerItems.value.find((item) => String(item.sticker.id) === String(activeStickerId.value)) || null,
)
const selectedSticker = computed(() => {
  if (activeSticker.value && String(activeSticker.value.rom.id) === String(selectedRom.value?.id)) {
    return activeSticker.value
  }
  return stickerItems.value.find((item) => String(item.rom.id) === String(selectedRom.value?.id)) || null
})
const uploadRom = computed(() =>
  matches.value.find((rom) => String(rom.id) === String(uploadForm.value.romId)) || null,
)

function regionFlagUrl(region) {
  const code = String(region || '').toLowerCase()
  return code && code !== 'world' ? `https://flagcdn.com/24x18/${code}.png` : ''
}

function selectRegion(region) {
  romForm.value.region = region
  regionMenuOpen.value = false
}

function closeRegionMenu(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) regionMenuOpen.value = false
}


function romTag(rom) {
  const index = matches.value.findIndex((item) => String(item.id) === String(rom?.id))
  return `ROM ${Math.max(index, 0) + 1}`
}

function selectRomCartridge(rom) {
  selectedRomId.value = String(rom?.id || '')
  if (rom?.cartridgeImage) cache.remember(cartInfo.value, rom)
  else cache.clearActive()
}

function selectSticker(item) {
  activeStickerId.value = String(item.sticker.id)
  selectRomCartridge(item.rom)
}

async function loadMatches() {
  const sequence = ++loadSequence
  if (!canShow.value) {
    matches.value = []
    activeStickerId.value = ''
    selectedRomId.value = ''
    loadError.value = ''
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const docs = await findFlashRomGroup(cartInfo.value)
    if (sequence !== loadSequence) return
    matches.value = docs
    const initialRom = docs.find((rom) => String(rom.id) === String(activePayload.value)) || docs[0]
    selectedRomId.value = String(initialRom?.id || '')
    const firstSticker = stickerItems.value.find((item) => String(item.rom.id) === String(initialRom?.id))
      || stickerItems.value[0]
    activeStickerId.value = String(firstSticker?.sticker?.id || '')
    if (initialRom?.cartridgeImage) cache.remember(cartInfo.value, initialRom)
  } catch (error) {
    if (sequence === loadSequence) loadError.value = String(error?.message || error)
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

watch(
  () => [cartInfo.value?.kind, gameCodeOf(cartInfo.value), romTitleOf(cartInfo.value), cartInfo.value?.revision],
  loadMatches,
  { immediate: true },
)

function scrollSlider(direction) {
  sliderTrack.value?.scrollBy({ left: direction * 220, behavior: 'smooth' })
}

function openRomEdit() {
  const rom = selectedRom.value
  if (!rom) return
  romForm.value = {
    title: rom.title || '',
    region: rom.region || 'world',
    serialCode: rom.serialCode || '',
    revision: rom.revision || '',
    cartridgeImage: rom.cartridgeImage || '',
  }
  romError.value = ''
  regionMenuOpen.value = false
  uploadOpen.value = false
  romEditOpen.value = true
}

async function saveRomEdit() {
  const rom = selectedRom.value
  if (!rom) return
  romError.value = ''
  if (!romForm.value.title.trim()) {
    romError.value = '请填写 ROM 标题。'
    return
  }
  romSaving.value = true
  try {
    const saved = await updateFlashRom(rom.id, {
      title: romForm.value.title.trim(),
      region: romForm.value.region,
      serialCode: romForm.value.serialCode.trim(),
      revision: romForm.value.revision.trim(),
      cartridgeImage: romForm.value.cartridgeImage.trim(),
    })
    romEditOpen.value = false
    await loadMatches()
    const refreshed = matches.value.find((item) => String(item.id) === String(saved?.id)) || saved
    if (refreshed?.cartridgeImage) cache.remember(cartInfo.value, refreshed)
  } catch (error) {
    romError.value = String(error?.message || error)
  } finally {
    romSaving.value = false
  }
}

function openStickerUpload() {
  const rom = selectedRom.value
  uploadForm.value = {
    romId: String(rom?.id || ''),
    name: rom?.title || romTitleOf(cartInfo.value) || '',
    description: '',
    previewBase64: '',
    previewMimetype: 'image/png',
    fileName: '',
  }
  uploadError.value = ''
  uploadResult.value = ''
  romEditOpen.value = false
  uploadOpen.value = true
}

function closeEditor() {
  romEditOpen.value = false
  uploadOpen.value = false
  regionMenuOpen.value = false
}

function onStickerFile(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  uploadError.value = ''
  if (!String(file.type).startsWith('image/')) {
    uploadError.value = '请选择图片文件。'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    uploadForm.value.previewBase64 = String(reader.result || '')
    uploadForm.value.previewMimetype = file.type || 'image/png'
    uploadForm.value.fileName = file.name
  }
  reader.onerror = () => { uploadError.value = '读取图片失败。' }
  reader.readAsDataURL(file)
}

async function submitSticker() {
  uploadError.value = ''
  uploadResult.value = ''
  if (!uploadForm.value.romId) {
    uploadError.value = '请选择对应 ROM。'
    return
  }
  if (!uploadForm.value.name.trim()) {
    uploadError.value = '请填写贴纸名称。'
    return
  }
  if (!uploadForm.value.previewBase64) {
    uploadError.value = '请选择需要上传的贴纸图片。'
    return
  }
  uploading.value = true
  try {
    const result = await submitFlashSticker({
      romId: uploadForm.value.romId,
      name: uploadForm.value.name.trim(),
      description: uploadForm.value.description.trim() || undefined,
      visibility: 'public',
      config: {},
      previewBase64: uploadForm.value.previewBase64,
      previewMimetype: uploadForm.value.previewMimetype,
    })
    uploadResult.value = result.status === 'review'
      ? '上传成功，贴纸已进入审核队列。'
      : '上传成功。'
    await loadMatches()
  } catch (error) {
    uploadError.value = String(error?.message || error)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <section v-if="canShow" class="shrink-0 bg-transparent px-2 py-1.5">
    <div class="flex items-center gap-1">
      <button data-no-drag type="button" class="shelf-control" aria-label="上一组贴纸" @click="scrollSlider(-1)">
        <ChevronLeft class="h-4 w-4" :stroke-width="2.5" />
      </button>

      <div ref="sliderTrack" class="no-scrollbar flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-2 py-3">
        <button
          v-for="item in stickerItems"
          :key="`${item.rom.id}:${item.sticker.id}`"
          data-no-drag
          type="button"
          class="relative flex h-[82px] w-[94px] shrink-0 snap-start flex-col items-center justify-center bg-transparent text-center transition hover:-translate-y-0.5"
          :class="String(activeStickerId) === String(item.sticker.id) ? 'opacity-100' : 'opacity-75 hover:opacity-100'"
          :title="`${item.sticker.name || item.rom.title} → ${item.rom.title}`"
          @click="selectSticker(item)"
        >
          <span
            v-if="String(activeStickerId) === String(item.sticker.id)"
            class="pointer-events-none absolute left-1/2 top-[35px] z-0 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_#18181b,0_0_0_7px_rgba(255,255,255,0.92),0_0_18px_8px_rgba(24,24,27,0.38)]"
            aria-hidden="true"
          />
          <span class="absolute right-0.5 top-0 z-20 flex h-[18px] w-6 items-center justify-center" :title="item.rom.region || 'world'">
            <img v-if="regionFlagUrl(item.rom.region)" :src="regionFlagUrl(item.rom.region)" :alt="item.rom.region" class="h-[14px] w-[19px] rounded-[2px] object-cover" />
            <span v-else class="text-sm leading-none">🌐</span>
          </span>
          <img
            :src="item.sticker.image"
            :alt="item.sticker.name || item.rom.title"
            class="relative z-10 max-h-[48px] max-w-[84px] object-contain drop-shadow-[0_4px_4px_rgba(0,0,0,0.24)]"
          />
          <span class="relative z-20 mt-1 rounded border border-black bg-white px-1.5 py-px text-[7px] font-black leading-none text-black shadow-[1px_1px_0_#18181b]">
            {{ romTag(item.rom) }}
          </span>

        </button>

        <div v-if="!loading && stickerItems.length === 0" class="flex h-[82px] min-w-[150px] items-center text-[9px] text-zinc-600">
          暂无已通过贴纸
        </div>
      </div>

      <button data-no-drag type="button" class="shelf-control" aria-label="下一组贴纸" @click="scrollSlider(1)">
        <ChevronRight class="h-4 w-4" :stroke-width="2.5" />
      </button>

      <button
        data-no-drag
        type="button"
        :disabled="!selectedRom"
        class="shelf-control ml-1 disabled:cursor-not-allowed disabled:opacity-35"
        title="编辑对应 ROM 与卡带"
        @click="openRomEdit"
      >
        <Pencil class="h-3.5 w-3.5" :stroke-width="2.5" />
      </button>

      <button data-no-drag type="button" class="shelf-control ml-1" title="上传新贴纸" @click="openStickerUpload">
        <Plus class="h-4 w-4" :stroke-width="2.5" />
      </button>
    </div>

    <p v-if="loadError" class="mt-1 px-7 text-[8px] text-red-400">{{ loadError }}</p>
  </section>

  <Teleport to="body">
    <div v-if="romEditOpen || uploadOpen" data-no-drag class="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div class="pointer-events-auto w-[380px] space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-4">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-black text-zinc-200">ROM 与贴纸</span>
          <button data-no-drag type="button" class="text-zinc-500 hover:text-white" aria-label="关闭" @click="closeEditor"><X class="h-4 w-4" /></button>
        </div>

        <div class="grid grid-cols-2 rounded-lg bg-zinc-900 p-1">
          <button
            data-no-drag
            type="button"
            class="rounded-md px-3 py-1.5 text-[9px] font-black transition"
            :class="romEditOpen ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-white'"
            @click="openRomEdit"
          >
            ROM
          </button>
          <button
            data-no-drag
            type="button"
            class="rounded-md px-3 py-1.5 text-[9px] font-black transition"
            :class="uploadOpen ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-white'"
            @click="openStickerUpload"
          >
            贴纸
          </button>
        </div>

        <div v-if="romEditOpen" class="space-y-3">
          <div class="text-[8px] font-bold text-zinc-500">编辑 ROM #{{ selectedRom?.id }}</div>
          <input v-model="romForm.title" data-no-drag class="field" placeholder="ROM 标题 *" />
          <div class="grid grid-cols-3 gap-2">
            <div class="relative" @focusout="closeRegionMenu">
              <button data-no-drag type="button" class="field flex w-full items-center gap-2 text-left" :aria-expanded="regionMenuOpen" @click="regionMenuOpen = !regionMenuOpen">
                <img v-if="regionFlagUrl(romForm.region)" :src="regionFlagUrl(romForm.region)" :alt="romForm.region" class="h-[12px] w-[17px] shrink-0 rounded-[2px] object-cover" />
                <span v-else class="text-xs leading-none">🌐</span>
                <span class="min-w-0 flex-1 truncate">{{ romForm.region.toUpperCase() }}</span>
                <ChevronDown class="h-3 w-3 shrink-0 transition-transform" :class="regionMenuOpen ? 'rotate-180' : ''" />
              </button>
              <div v-if="regionMenuOpen" data-no-drag class="absolute left-0 top-[calc(100%+4px)] z-30 w-full overflow-hidden rounded-lg border border-white/15 bg-zinc-900 py-1 shadow-xl">
                <button
                  v-for="region in REGION_OPTIONS"
                  :key="region"
                  data-no-drag
                  type="button"
                  class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[9px] text-zinc-300 hover:bg-white/10 hover:text-white"
                  @click="selectRegion(region)"
                >
                  <img v-if="regionFlagUrl(region)" :src="regionFlagUrl(region)" :alt="region" class="h-[12px] w-[17px] shrink-0 rounded-[2px] object-cover" />
                  <span v-else class="w-[17px] text-center text-xs leading-none">🌐</span>
                  <span class="flex-1">{{ region.toUpperCase() }}</span>
                  <Check v-if="romForm.region === region" class="h-3 w-3" />
                </button>
              </div>
            </div>
            <input v-model="romForm.serialCode" data-no-drag class="field font-mono" placeholder="序列号" />
            <input v-model="romForm.revision" data-no-drag class="field" placeholder="Revision" />
          </div>
          <div class="flex min-h-24 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2">
            <img v-if="selectedSticker?.sticker.image" :src="selectedSticker.sticker.image" :alt="selectedSticker.sticker.name || '当前贴纸'" class="max-h-32 max-w-full object-contain" />
            <span v-else class="text-[9px] text-zinc-600">当前 ROM 暂无对应贴纸</span>
          </div>
          <p v-if="romError" class="text-[8px] text-red-400">{{ romError }}</p>
          <div class="flex justify-end gap-2">
            <button data-no-drag type="button" class="px-2.5 py-1.5 text-[9px] font-bold text-zinc-500 hover:text-white" @click="closeEditor">取消</button>
            <button data-no-drag type="button" :disabled="romSaving" class="rounded-md bg-emerald-500 px-3 py-1.5 text-[9px] font-black text-white disabled:opacity-40" @click="saveRomEdit">{{ romSaving ? '保存中…' : '保存修改' }}</button>
          </div>
        </div>

        <div v-else class="space-y-3">
          <div class="text-[8px] font-bold text-zinc-500">上传 ROM 贴纸</div>
          <div class="relative">
            <img v-if="regionFlagUrl(uploadRom?.region)" :src="regionFlagUrl(uploadRom?.region)" :alt="uploadRom?.region" class="pointer-events-none absolute left-2 top-1/2 z-10 h-[12px] w-[17px] -translate-y-1/2 rounded-[2px] object-cover" />
            <span v-else class="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-xs">🌐</span>
            <select v-model="uploadForm.romId" data-no-drag class="field pl-8">
              <option v-for="rom in matches" :key="rom.id" :value="String(rom.id)">{{ rom.title || `ROM #${rom.id}` }}</option>
            </select>
          </div>
          <input v-model="uploadForm.name" data-no-drag class="field" placeholder="贴纸名称 *" />
          <textarea v-model="uploadForm.description" data-no-drag rows="2" class="field resize-none" placeholder="不同 ROM ID、版本或来源备注" />

          <label data-no-drag class="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 bg-zinc-900 px-3 py-2 text-[9px] font-bold text-zinc-400 hover:border-white/40 hover:text-white">
            <ImageUp class="h-4 w-4" />
            <span class="min-w-0 flex-1 truncate">{{ uploadForm.fileName || '选择贴纸图片' }}</span>
            <input type="file" accept="image/*" class="hidden" @change="onStickerFile" />
          </label>
          <img v-if="uploadForm.previewBase64" :src="uploadForm.previewBase64" alt="贴纸上传预览" class="mx-auto max-h-24 max-w-full object-contain" />

          <p v-if="uploadError" class="text-[8px] text-red-400">{{ uploadError }}</p>
          <p v-if="uploadResult" class="text-[8px] text-emerald-400">{{ uploadResult }}</p>
          <div class="flex justify-end gap-2">
            <button data-no-drag type="button" class="px-2.5 py-1.5 text-[9px] font-bold text-zinc-500 hover:text-white" @click="closeEditor">关闭</button>
            <button data-no-drag type="button" :disabled="uploading" class="rounded-md bg-emerald-500 px-3 py-1.5 text-[9px] font-black text-white disabled:opacity-40" @click="submitSticker">{{ uploading ? '上传中…' : '上传并提交' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.shelf-control {
  display: flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid #18181b;
  border-radius: 6px;
  background: white;
  color: #18181b;
  box-shadow: 2px 2px 0 #18181b;
  transition: transform 100ms ease, box-shadow 100ms ease;
}
.shelf-control:active:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: none;
}
.field {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #18181b;
  padding: 8px;
  color: #d4d4d8;
  font-size: 9px;
  outline: none;
}
</style>