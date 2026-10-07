/**
 * 标签预览图压缩：纯浏览器实现、零依赖。
 * createImageBitmap 解码 + OffscreenCanvas（回退 <canvas>）缩放：最长边缩到 maxSize，小图不放大。
 * 任何一步不可用（旧浏览器 / jsdom / 解码失败 / 编码失败）都回退为原图 —— 上传功能不能因为压缩失败而不可用。
 */

const DEFAULT_MAX_SIZE = 512
const DEFAULT_QUALITY = 0.85
const DEFAULT_MIME = 'image/webp'

/** 源自带尺寸时取之（ImageBitmap / HTMLImageElement / Canvas 等）；Blob/File 读不到，返回 0 */
function sizeOf(source) {
  return {
    width: Math.round(Number(source?.width)) || 0,
    height: Math.round(Number(source?.height)) || 0
  }
}

function mimeOf(source, fallbackMime) {
  return typeof source?.type === 'string' && source.type ? source.type : fallbackMime
}

function closeBitmap(bitmap) {
  if (bitmap && typeof bitmap.close === 'function') bitmap.close()
}

async function decode(source) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    return await createImageBitmap(source)
  } catch (error) {
    return null
  }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height)
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return null
}

/** OffscreenCanvas 与 <canvas> 各有一套导出 API，统一成 Promise<Blob|null> */
function canvasToBlob(canvas, mime, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: mime, quality }).catch(() => null)
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), mime, quality)
    } catch (error) {
      resolve(null)
    }
  })
}

/**
 * 压缩图片。返回 {blob, width, height, mime}。
 * @param {Blob|File|ImageBitmap} source 图片源
 * @param {{maxSize?: number, quality?: number, mime?: string}} [options] maxSize<=0 表示不压缩
 */
export async function compressImage(
  source,
  { maxSize = DEFAULT_MAX_SIZE, quality = DEFAULT_QUALITY, mime = DEFAULT_MIME } = {}
) {
  if (!source) throw new TypeError('compressImage: source 必填')
  const sourceMime = mimeOf(source, mime)
  const sourceSize = sizeOf(source)

  if (!(Number(maxSize) > 0)) {
    return { blob: source, width: sourceSize.width, height: sourceSize.height, mime: sourceMime }
  }

  const bitmap = await decode(source)
  // 解不出原尺寸就只能交还原图；宽高未知时为 0
  if (!bitmap) {
    return { blob: source, width: sourceSize.width, height: sourceSize.height, mime: sourceMime }
  }

  const srcWidth = Math.round(Number(bitmap.width)) || 0
  const srcHeight = Math.round(Number(bitmap.height)) || 0
  const original = { blob: source, width: srcWidth, height: srcHeight, mime: sourceMime }
  const longest = Math.max(srcWidth, srcHeight)
  if (!longest) {
    closeBitmap(bitmap)
    return original
  }

  const scale = Math.min(1, maxSize / longest)
  const width = Math.max(1, Math.round(srcWidth * scale))
  const height = Math.max(1, Math.round(srcHeight * scale))

  try {
    const canvas = createCanvas(width, height)
    const context = canvas ? canvas.getContext('2d') : null
    if (!context) return original
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, mime, quality)
    if (!blob) return original
    // 浏览器可能不支持请求的 mime 而回退到 png，以实际产物为准
    return { blob, width, height, mime: blob.type || mime }
  } catch (error) {
    return original
  } finally {
    closeBitmap(bitmap)
  }
}

export { DEFAULT_MAX_SIZE, DEFAULT_QUALITY, DEFAULT_MIME }
