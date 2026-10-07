import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from '../../../src/core/image/compress.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 假 OffscreenCanvas：记录尺寸、绘制参数与编码参数，产出请求的 mime */
function installCanvasMock({ context = true, blob = true } = {}) {
  const canvases = []
  class FakeOffscreenCanvas {
    constructor(width, height) {
      this.width = width
      this.height = height
      this.drawn = null
      this.convertOptions = null
      canvases.push(this)
    }

    getContext(kind) {
      if (!context) return null
      this.contextKind = kind
      return {
        drawImage: (bitmap, ...rect) => {
          this.drawn = { bitmap, rect }
        }
      }
    }

    convertToBlob(options) {
      this.convertOptions = options
      if (!blob) return Promise.resolve(null)
      return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: options.type }))
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  return canvases
}

function pngFile(name = 'a.png') {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

describe('compressImage', () => {
  it('maxSize<=0 直接返回原图与源尺寸', async () => {
    const source = { width: 1024, height: 768, type: 'image/png' }
    const result = await compressImage(source, { maxSize: 0 })
    expect(result.blob).toBe(source)
    expect(result).toMatchObject({ width: 1024, height: 768, mime: 'image/png' })
  })

  it('环境不支持 createImageBitmap 时回退原图（宽高未知记为 0）', async () => {
    const file = pngFile()
    const result = await compressImage(file, { maxSize: 512 })
    expect(result.blob).toBe(file)
    expect(result.mime).toBe('image/png')
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })

  it('解码失败时回退原图', async () => {
    const decode = vi.fn(() => Promise.reject(new Error('boom')))
    vi.stubGlobal('createImageBitmap', decode)
    const file = pngFile()
    const result = await compressImage(file)
    expect(decode).toHaveBeenCalledWith(file)
    expect(result.blob).toBe(file)
    expect(result.mime).toBe('image/png')
  })

  it('长边缩到 maxSize 并按 webp/quality 编码', async () => {
    const bitmap = { width: 1024, height: 512, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const canvases = installCanvasMock()

    const file = pngFile()
    const result = await compressImage(file, { maxSize: 512, quality: 0.6 })

    expect(result.blob).not.toBe(file)
    expect(result).toMatchObject({ width: 512, height: 256, mime: 'image/webp' })
    expect(canvases).toHaveLength(1)
    expect(canvases[0]).toMatchObject({ width: 512, height: 256, contextKind: '2d' })
    expect(canvases[0].convertOptions).toEqual({ type: 'image/webp', quality: 0.6 })
    expect(canvases[0].drawn.rect).toEqual([0, 0, 512, 256])
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('小图不放大，但按请求的 mime 重新编码', async () => {
    const bitmap = { width: 200, height: 100, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const canvases = installCanvasMock()

    const result = await compressImage(pngFile(), { maxSize: 512, mime: 'image/jpeg', quality: 0.9 })

    expect(result).toMatchObject({ width: 200, height: 100, mime: 'image/jpeg' })
    expect(canvases[0].convertOptions).toEqual({ type: 'image/jpeg', quality: 0.9 })
  })

  it('默认参数：maxSize 512 / quality 0.85 / webp', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1024, height: 1024, close: vi.fn() })))
    const canvases = installCanvasMock()

    const result = await compressImage(pngFile())

    expect(result).toMatchObject({ width: 512, height: 512, mime: 'image/webp' })
    expect(canvases[0].convertOptions).toEqual({ type: 'image/webp', quality: 0.85 })
  })

  it('无 OffscreenCanvas 时回退 <canvas> + toBlob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 400, close: vi.fn() })))
    const nativeCreate = document.createElement.bind(document)
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: vi.fn((callback, type, quality) => {
        canvas.args = { type, quality }
        callback(new Blob([new Uint8Array([9])], { type }))
      })
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? canvas : nativeCreate(tag)
    )

    const result = await compressImage(pngFile(), { maxSize: 400 })

    expect(result).toMatchObject({ width: 400, height: 200, mime: 'image/webp' })
    expect(canvas).toMatchObject({ width: 400, height: 200 })
    expect(canvas.args).toEqual({ type: 'image/webp', quality: 0.85 })
  })

  it('画布拿不到 2d 上下文时回退原图并保留已解码尺寸', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1024, height: 512, close: vi.fn() })))
    const canvases = installCanvasMock({ context: false })
    const file = pngFile()

    const result = await compressImage(file, { maxSize: 512 })

    expect(result).toMatchObject({ width: 1024, height: 512, mime: 'image/png' })
    expect(result.blob).toBe(file)
    expect(canvases).toHaveLength(1)
  })

  it('编码失败（转换返回空）时回退原图', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1024, height: 512, close: vi.fn() })))
    installCanvasMock({ blob: false })
    const file = pngFile()

    const result = await compressImage(file)

    expect(result.blob).toBe(file)
    expect(result.width).toBe(1024)
  })

  it('source 为空时抛 TypeError', async () => {
    await expect(compressImage(null)).rejects.toThrow(TypeError)
  })
})
