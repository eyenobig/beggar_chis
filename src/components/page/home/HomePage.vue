<!-- Home 页面（默认）：ROM/存档节点（操作在 ROM 页）。卡带视觉由 EmulatorWidget 槽位直接挂载。 -->
<script setup>
import DataNode from './DataNode.vue'
import SaveNode from './SaveNode.vue'
</script>

<template>
  <div class="relative space-y-3">
    <DataNode kind="rom" />
    <SaveNode />
  </div>
</template>
