import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

let nextTaskId = 1

export const useTaskProgress = defineStore('task-progress', () => {
  const drawerOpen = ref(false)
  const tasks = ref([])
  const runningCount = computed(() => tasks.value.filter((task) => task.status === 'running').length)
  const romOperationRunning = computed(() =>
    tasks.value.some((task) => task.status === 'running' && ['burn', 'erase', 'dump'].includes(task.kind)),
  )

  function startTask({ kind, title, detail = '', phase = '' }) {
    const task = {
      id: nextTaskId++,
      kind,
      title,
      detail,
      /** 'erase' | 'write' | 'verify' | 'dump' | '' — 驱动进度条三色 */
      phase: phase || '',
      status: 'running',
      done: 0,
      total: 0,
      startedAt: Date.now(),
      finishedAt: null,
    }
    tasks.value.unshift(task)
    tasks.value = tasks.value.slice(0, 40)
    drawerOpen.value = true
    return task.id
  }

  function updateTask(id, patch) {
    const task = tasks.value.find((item) => item.id === id)
    if (task) Object.assign(task, patch)
  }

  function updateProgress(id, done, total, phase) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    const nextDone = Number(done) || 0
    const nextTotal = Number(total) || 0
    if (task.done === nextDone && task.total === nextTotal && (!phase || task.phase === phase)) return
    const patch = { done: nextDone, total: nextTotal }
    if (phase && task.phase !== phase) patch.phase = phase
    Object.assign(task, patch)
  }

  /** 烧录/擦除成功启动或阶段切换时清空进度条（避免残留上一阶段 %）。 */
  function resetProgress(id, phase) {
    const patch = { done: 0, total: 0 }
    if (phase != null) patch.phase = phase
    updateTask(id, patch)
  }

  function setPhase(id, phase) {
    if (!phase) return
    const task = tasks.value.find((item) => item.id === id)
    if (!task || task.phase === phase) return
    task.phase = phase
  }

  function completeTask(id, detail) {
    const task = tasks.value.find((item) => item.id === id)
    const patch = { status: 'success', finishedAt: Date.now() }
    if (task?.total > 0) patch.done = task.total
    if (detail) patch.detail = detail
    updateTask(id, patch)
  }

  function failTask(id, error) {
    updateTask(id, {
      status: 'error',
      detail: String(error || 'Unknown error'),
      finishedAt: Date.now(),
    })
  }

  function clearCompleted() {
    tasks.value = tasks.value.filter((task) => task.status === 'running')
  }

  return {
    drawerOpen,
    tasks,
    runningCount,
    romOperationRunning,
    startTask,
    updateTask,
    updateProgress,
    resetProgress,
    setPhase,
    completeTask,
    failTask,
    clearCompleted,
  }
})
