<!-- ROM 页：顶栏 / 卡带与 ROM 文件 / 烧录三按钮 + 存档四按钮（并存，紧凑高度） -->
<script setup>
import BurnControls from '../tasks/BurnControls.vue'
import SaveControls from '../tasks/SaveControls.vue'
import RomHeaderBar from './rom/RomHeaderBar.vue'
import RomCartInfoCard from './rom/RomCartInfoCard.vue'
import RomFileCard from './rom/RomFileCard.vue'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-auto no-scrollbar">
    <RomHeaderBar />
    <div class="flex shrink-0 items-stretch gap-2 px-3 py-1.5">
      <RomCartInfoCard />
      <RomFileCard />
    </div>
    <BurnControls />
    <SaveControls />
  </div>
</template>
