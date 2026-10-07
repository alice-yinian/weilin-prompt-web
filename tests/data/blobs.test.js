// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase } from './helpers.js'
import { STORES, withTx } from '../../src/data/db.js'
import {
  tagImageKey,
  putTagImage,
  getTagImage,
  getTagImages,
  deleteTagImage,
  listTagImageUuids,
  tagImageCount,
  clearTagImages
} from '../../src/data/repos/blobs.js'

beforeEach(resetDatabase)

function blobOf(bytes, type) {
  return new Blob([new Uint8Array(bytes)], { type })
}

async function bytesOf(blob) {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

describe('repos/blobs 标签预览图', () => {
  it('tagImageKey 约定为 tag:<t_uuid>', () => {
    expect(tagImageKey('abc')).toBe('tag:abc')
  })

  it('put/get：mime 缺省取 blob.type，未命中返回 null', async () => {
    const blob = blobOf([1, 2, 3], 'image/png')
    const record = await putTagImage('t1', blob)

    expect(record).toMatchObject({ key: 'tag:t1', mime: 'image/png', name: '' })
    expect(record.updatedAt).toBeGreaterThan(0)

    expect(await bytesOf(await getTagImage('t1'))).toEqual([1, 2, 3])
    expect(await getTagImage('nope')).toBeNull()
    expect(await getTagImage('')).toBeNull()
  })

  it('put：显式 mime/name 覆盖默认值', async () => {
    const record = await putTagImage('t2', blobOf([9], 'image/png'), {
      mime: 'image/jpeg',
      name: 'cover.jpg'
    })
    expect(record).toMatchObject({ mime: 'image/jpeg', name: 'cover.jpg' })
  })

  it('put：缺少 uuid/blob 抛错', async () => {
    await expect(putTagImage('', blobOf([1], 'image/png'))).rejects.toThrow('t_uuid')
    await expect(putTagImage('t1', null)).rejects.toThrow('blob')
    await expect(putTagImage('t1', { size: 3 })).rejects.toThrow('blob')
  })

  it('getTagImages 返回 Map，未命中的 uuid 不出现', async () => {
    await putTagImage('t1', blobOf([1], 'image/png'))
    await putTagImage('t2', blobOf([2], 'image/png'))

    const map = await getTagImages(['t2', 'missing', 't1'])
    expect([...map.keys()].sort()).toEqual(['t1', 't2'])
    expect(await bytesOf(map.get('t1'))).toEqual([1])
    expect(map.has('missing')).toBe(false)
    expect((await getTagImages([])).size).toBe(0)
  })

  it('listTagImageUuids 升序且忽略非 tag: 前缀的 blob；tagImageCount 一致', async () => {
    await putTagImage('b', blobOf([1], 'image/png'))
    await putTagImage('a', blobOf([2], 'image/png'))
    await withTx(STORES.BLOBS, 'readwrite', (tx) =>
      tx.store.put({ key: 'other:1', blob: blobOf([3], ''), mime: '', name: '', updatedAt: 1 })
    )

    expect(await listTagImageUuids()).toEqual(['a', 'b'])
    expect(await tagImageCount()).toBe(2)
  })

  it('deleteTagImage：命中 true，未命中 false', async () => {
    await putTagImage('t1', blobOf([1], 'image/png'))
    expect(await deleteTagImage('t1')).toBe(true)
    expect(await deleteTagImage('t1')).toBe(false)
    expect(await deleteTagImage('')).toBe(false)
  })

  it('clearTagImages 只删 tag: 前缀，返回删除条数', async () => {
    await putTagImage('t1', blobOf([1], 'image/png'))
    await putTagImage('t2', blobOf([2], 'image/png'))
    await withTx(STORES.BLOBS, 'readwrite', (tx) =>
      tx.store.put({ key: 'other:1', blob: blobOf([3], ''), mime: '', name: '', updatedAt: 1 })
    )

    expect(await clearTagImages()).toBe(2)
    expect(await tagImageCount()).toBe(0)
    // 其他 blob 保留
    const kept = await withTx(STORES.BLOBS, 'readonly', (tx) => tx.store.get('other:1'))
    expect(kept).toBeTruthy()
  })
})
