<script setup>
import { useWindowDrag } from '../composables/useWindowDrag'
import { useContextMenu } from '../composables/useContextMenu'
import { useHotReload } from '../composables/useHotReload'

const { onDragMouseDown } = useWindowDrag()
const { showMenu } = useContextMenu()
useHotReload()
</script>

<template>
  <main
    id="pet-stage"
    @mousedown="onDragMouseDown"
    @contextmenu="showMenu"
  >
    <slot />
  </main>
</template>
