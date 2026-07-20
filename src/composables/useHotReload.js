import { onMounted, onUnmounted } from 'vue'

export function useHotReload() {
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault()
      location.reload()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
