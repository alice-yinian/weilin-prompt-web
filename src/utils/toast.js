import { reactive } from 'vue'

// 极简 toast 总线：组件通过 useToast() 推送，ToastHost 负责渲染
const state = reactive({ items: [] })
let seq = 0

export function pushToast(message, type = 'info', timeout = 2600) {
  const id = ++seq
  state.items.push({ id, message, type })
  if (timeout > 0) {
    setTimeout(() => removeToast(id), timeout)
  }
  return id
}

export function removeToast(id) {
  const index = state.items.findIndex((item) => item.id === id)
  if (index >= 0) state.items.splice(index, 1)
}

export const toastState = state

export const toast = {
  info(message) {
    return pushToast(message, 'info')
  },
  success(message) {
    return pushToast(message, 'success')
  },
  error(message) {
    return pushToast(message, 'error', 4000)
  }
}
