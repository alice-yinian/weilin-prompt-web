import { ALL_STORES, withTx } from '../db.js'

/**
 * 清空全部仓库（设置/数据页的"清空全部数据"用），返回各仓库删除条数。
 * 只清数据，不重建内存索引：调用方需要自行 invalidateTagIndex()。
 */
export async function clearAllData() {
  return withTx([...ALL_STORES], 'readwrite', async (tx) => {
    const counts = {}
    for (const name of ALL_STORES) {
      const store = tx.objectStore(name)
      counts[name] = await store.count()
      await store.clear()
    }
    return counts
  })
}
