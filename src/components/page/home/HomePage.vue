<!-- Home 页面（默认）：中间内容区。ROM / Save 两个数据节点抽象在此页内。 -->
<script setup>
import DataNode from './DataNode.vue'
</script>

<template>
  <div class="space-y-4">
    <DataNode kind="rom" />
    <DataNode kind="save" />
  </div>
</template>
