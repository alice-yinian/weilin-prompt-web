// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { createGroup } from '../../src/data/repos/groups.js'
import { putTranslation, getTranslation } from '../../src/data/repos/translations.js'
import { putTagImage, getTagImage, listTagImageUuids } from '../../src/data/repos/blobs.js'
import { importBundle } from '../../src/data/bundle/importBundle.js'
import { exportBundle } from '../../src/data/bundle/exportBundle.js'
import { readBundleZip, writeBundleZip } from '../../src/data/bundle/zip.js'

beforeEach(resetDatabase)

function blobOf(bytes, type) {
  return new Blob([new Uint8Array(bytes)], { type })
}

async function bytesOf(blob) {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

/** 用等长字节替换改写 zip 内条目名（local header 与 central directory 各出现一次） */
async function replaceBytes(blob, from, to) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const fromBytes = new TextEncoder().encode(from)
  const toBytes = new TextEncoder().encode(to)
  if (fromBytes.length !== toBytes.length) throw new Error('替换前后长度必须一致')
  for (let i = 0; i + fromBytes.length <= bytes.length; i++) {
    let match = true
    for (let j = 0; j < fromBytes.length; j++) {
      if (bytes[i + j] !== fromBytes[j]) {
        match = false
        break
      }
    }
    if (!match) continue
    for (let j = 0; j < fromBytes.length; j++) bytes[i + j] = toBytes[j]
  }
  return new Blob([bytes], { type: 'application/zip' })
}

/** 独立解析 central directory：验证条目名、压缩方式（store=0）与数据大小 */
async function readCentralDirectory(blob) {
  const buffer = await blob.arrayBuffer()
  const view = new DataView(buffer)
  let eocd = -1
  for (let offset = buffer.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0)
  const count = view.getUint16(eocd + 10, true)
  let pointer = view.getUint32(eocd + 16, true)
  const entries = []
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(pointer, true)).toBe(0x02014b50)
    const method = view.getUint16(pointer + 10, true)
    const size = view.getUint32(pointer + 24, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = new TextDecoder().decode(new Uint8Array(buffer, pointer + 46, nameLength))
    entries.push({ name, method, size, localOffset })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return { entries, buffer }
}

async function seedBundle() {
  await createGroup({ name: '人物' })
  await putTranslation('cat', '猫', 'manual')
  await putTagImage('t1', blobOf([137, 80, 78, 71], 'image/png'), { mime: 'image/png', name: 'a.png' })
  await putTagImage('t2', blobOf([255, 216, 255], 'image/jpeg'))
  return exportBundle({ includeBlobs: true })
}

describe('bundle/zip 写入', () => {
  it('拒绝非 bundle 入参', async () => {
    await expect(writeBundleZip(null)).rejects.toThrow('数据包')
    await expect(writeBundleZip({ format: 'other' })).rejects.toThrow('weilin-prompt-bundle')
  })

  it('结构合法：store 方法 0，条目名 data.json + images/tag_images/<uuid>.<ext>', async () => {
    const bundle = await seedBundle()
    const zip = await writeBundleZip(bundle)

    expect(zip.type).toBe('application/zip')
    const { entries } = await readCentralDirectory(zip)
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      'data.json',
      'images/tag_images/t1.png',
      'images/tag_images/t2.jpg'
    ])
    for (const entry of entries) expect(entry.method).toBe(0)
    const dataEntry = entries.find((entry) => entry.name === 'data.json')
    expect(dataEntry.size).toBeGreaterThan(0)
  })

  it('无预览图时只有 data.json；回调按 start→write→done 上报', async () => {
    const bundle = await exportBundle()
    const events = []
    const zip = await writeBundleZip(bundle, { onProgress: (event) => events.push(event) })

    const { entries } = await readCentralDirectory(zip)
    expect(entries.map((entry) => entry.name)).toEqual(['data.json'])

    expect(events[0]).toMatchObject({ phase: 'start', total: 1 })
    expect(events.some((event) => event.phase === 'write' && event.name === 'data.json')).toBe(true)
    expect(events.at(-1)).toMatchObject({ phase: 'done', index: 1, total: 1 })
  })
})

describe('bundle/zip 读取', () => {
  it('拒绝非法入参 / 非法 zip / 缺 data.json', async () => {
    await expect(readBundleZip(null)).rejects.toThrow('File/Blob')
    await expect(readBundleZip(blobOf([1, 2, 3], ''))).rejects.toThrow('不是有效的 zip')

    const eocd = new Uint8Array(22)
    new DataView(eocd.buffer).setUint32(0, 0x06054b50, true)
    await expect(readBundleZip(new Blob([eocd]))).rejects.toThrow('缺少 data.json')
  })

  it('writeBundleZip → readBundleZip：图片、译文与 counts 完整往返', async () => {
    const bundle = await seedBundle()
    const zip = await writeBundleZip(bundle)
    const read = await readBundleZip(zip)

    expect(read.format).toBe('weilin-prompt-bundle')
    expect(read.images).toBeUndefined()

    expect(read.data.blobs.map((item) => item.key).sort()).toEqual(['tag:t1', 'tag:t2'])
    const t1 = read.data.blobs.find((item) => item.key === 'tag:t1')
    expect(t1.mime).toBe('image/png')
    expect(await bytesOf(t1.blob)).toEqual([137, 80, 78, 71])
    const t2 = read.data.blobs.find((item) => item.key === 'tag:t2')
    expect(t2.mime).toBe('image/jpeg')
    expect(await bytesOf(t2.blob)).toEqual([255, 216, 255])
    expect(read.counts.images).toBe(2)

    expect(read.data.translations).toEqual([
      expect.objectContaining({ text: 'cat', textLower: 'cat', translated: '猫', source: 'manual' })
    ])
    expect(read.data.groups).toHaveLength(1)
  })

  it('readBundleZip 的产物可直接导入：图片落库、译文落库', async () => {
    const bundle = await seedBundle()
    const read = await readBundleZip(await writeBundleZip(bundle))

    await resetDatabase()
    const result = await importBundle(read, { mode: 'overwrite' })
    expect(result.imported.blobs).toBe(2)
    expect(result.imported.translations).toBe(1)
    expect((await listTagImageUuids()).sort()).toEqual(['t1', 't2'])
    expect(await bytesOf(await getTagImage('t1'))).toEqual([137, 80, 78, 71])
    expect((await getTranslation('CAT')).translated).toBe('猫')
  })

  it('images/tag_thumbs/* 仅在无原图时作为兜底', async () => {
    await putTagImage('t1', blobOf([1, 2, 3], 'image/png'), { mime: 'image/png' })
    const withOriginal = await exportBundle({ includeBlobs: true })
    const zip = await writeBundleZip(withOriginal)

    // 把 tag_images/t1.png 改写成 tag_thumbs/t1.png：无原图 → 缩略图兜底
    const thumbOnly = await replaceBytes(zip, 'images/tag_images/t1.png', 'images/tag_thumbs/t1.png')
    const readThumb = await readBundleZip(thumbOnly)
    expect(readThumb.data.blobs).toHaveLength(1)
    expect(readThumb.data.blobs[0].key).toBe('tag:t1')
    expect(await bytesOf(readThumb.data.blobs[0].blob)).toEqual([1, 2, 3])
  })

  it('同 uuid 同时存在原图与缩略图时取原图', async () => {
    await putTagImage('t1', blobOf([10, 11], 'image/png'), { mime: 'image/png' })
    await putTagImage('t2', blobOf([20, 21], 'image/png'), { mime: 'image/png' })
    const zip = await writeBundleZip(await exportBundle({ includeBlobs: true }))

    // 把 t2 条目重命名为 t1 的缩略图（等长替换），形成"同 uuid 原图 + 缩略图"
    const both = await replaceBytes(zip, 'images/tag_images/t2.png', 'images/tag_thumbs/t1.png')
    const read = await readBundleZip(both)

    const keys = read.data.blobs.map((item) => item.key)
    expect(keys).toEqual(['tag:t1'])
    expect(await bytesOf(read.data.blobs[0].blob)).toEqual([10, 11])
  })
})
