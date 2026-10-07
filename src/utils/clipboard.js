import { toast } from './toast'

// 剪贴板写入：优先 navigator.clipboard，非安全上下文（file:// 等）回退到 execCommand
export async function copyText(text) {
  const value = String(text ?? '')
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (error) {
    // 继续走回退方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (error) {
    return false
  }
}

export async function copyWithToast(text, successMessage) {
  const ok = await copyText(text)
  if (ok) toast.success(successMessage)
  else toast.error('复制失败')
  return ok
}
