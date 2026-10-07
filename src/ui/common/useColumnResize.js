import { ref } from 'vue'

/**
 * 列宽拖拽（分隔条）：按下后监听 window 的 pointermove，把增量交给调用方。
 *
 * @param {object} options
 * @param {() => number} options.read 读取当前宽度
 * @param {(width: number) => void} options.apply 写入宽度
 * @param {boolean} [options.invert] true 表示往左拖变宽（右侧面板），false 表示往右拖变宽（左侧列）
 * @param {number} [options.min]
 * @param {number} [options.max]
 */
export function useColumnResize({ read, apply, invert = false, min = 160, max = 760 } = {}) {
  const dragging = ref(false)

  function clamp(value) {
    return Math.min(max, Math.max(min, value))
  }

  function start(event) {
    event.preventDefault()
    dragging.value = true
    const startX = event.clientX
    const startWidth = clamp(read())
    const target = event.currentTarget

    const move = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) * (invert ? -1 : 1)
      apply(clamp(startWidth + delta))
    }
    const stop = () => {
      dragging.value = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      if (target?.releasePointerCapture) {
        try {
          target.releasePointerCapture(event.pointerId)
        } catch (error) {
          // 指针已释放时忽略
        }
      }
    }

    try {
      target.setPointerCapture(event.pointerId)
    } catch (error) {
      // 不支持指针捕获时退化为全局监听
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return { dragging, start }
}
