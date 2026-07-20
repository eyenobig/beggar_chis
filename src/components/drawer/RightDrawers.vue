<!-- 右侧抽屉编排：书签 + 各右抽屉（均基于 BaseDrawer）。 -->
<script setup>
import Bookmarks from './Bookmarks.vue'
import LogsDrawer from './logs/LogsDrawer.vue'
import ShopDrawer from './shop/ShopDrawer.vue'
import HelpDrawer from './help/HelpDrawer.vue'
import SettingsDrawer from './settings/SettingsDrawer.vue'
</script>

<template>
  <div class="contents">
    <Bookmarks />
    <LogsDrawer />
    <ShopDrawer />
    <HelpDrawer />
    <SettingsDrawer />
  </div>
</template>
