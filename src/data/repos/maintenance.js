import { openDB, STORES } from '../db'

// 清空本地库（词库/历史/收藏/片段/词典/图片），保留浏览器设置
export async function clearAllData() {
  const db = await openDB()
  const storeNames = [
    STORES.groups,
    STORES.subgroups,
    STORES.tags,
    STORES.history,
    STORES.favorites,
    STORES.labels,
    STORES.dict,
    STORES.blobs
  ].filter(Boolean)

  const tx = db.transaction(storeNames, 'readwrite')
  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()))
  await tx.done
  return true
}
