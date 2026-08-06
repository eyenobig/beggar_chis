<script setup>
import { computed } from 'vue'
import {
  LASER_MASKS,
  SHARD_LAYER_STYLES,
  STAR_LAYER_STYLES,
  normalizeLaminationId,
} from '../../../../assets/cartridge-label/laminations'
import '../../../../assets/cartridge-label/laminations/effects.css'

const props = defineProps({
  /** editorData.lamination：none | glossy | matte | spectrum | star | shards */
  type: { type: String, default: 'none' },
})

const kind = computed(() => normalizeLaminationId(props.type))

const maskedLayers = computed(() => {
  if (kind.value === 'star') {
    return LASER_MASKS.star.map((mask, i) => ({
      mask,
      style: STAR_LAYER_STYLES[i],
    }))
  }
  if (kind.value === 'shards') {
    return LASER_MASKS.shards.map((mask, i) => ({
      mask,
      style: SHARD_LAYER_STYLES[i],
    }))
  }
  return []
})

function maskStyle(url) {
  const value = `url("${url}")`
  return {
    WebkitMaskImage: value,
    maskImage: value,
  }
}

function shardStyle(layer) {
  return {
    filter: layer.style.filter,
    '--sx': layer.style['--sx'],
    '--sy': layer.style['--sy'],
    '--rot': layer.style['--rot'],
  }
}
</script>

<template>
  <div
    v-if="kind && kind !== 'none'"
    class="pointer-events-none absolute inset-0 overflow-hidden cs-static"
    style="--cs-angle: 135deg"
    aria-hidden="true"
  >
    <template v-if="kind === 'glossy'">
      <div class="cs-gloss-base" />
      <div class="cs-gloss" />
    </template>
    <div v-else-if="kind === 'matte'" class="cs-matte" />
    <div v-else-if="kind === 'spectrum'" class="cs-holo" />
    <template v-else-if="maskedLayers.length">
      <div
        v-for="(layer, idx) in maskedLayers"
        :key="kind + '-' + idx"
        class="cs-mask-layer"
        :style="maskStyle(layer.mask)"
      >
        <div class="cs-shard-holo" :style="shardStyle(layer)" />
      </div>
    </template>
  </div>
</template>
