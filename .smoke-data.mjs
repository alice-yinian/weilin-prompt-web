import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {
  closeDB,
  deleteDatabase,
  getMeta,
  setMeta,
  META_KEYS,
  STORES,
  withTx,
  DEFAULT_COLOR
} from '/root/workdir/www/weilin-prompt-web/src/data/db.js'
import { createGroup, listGroups, updateGroup, deleteGroup, moveGroup } from '/root/workdir/www/weilin-prompt-web/src/data/repos/groups.js'
import { createSubgroup, listSubgroups, deleteSubgroup, moveSubgroup, updateSubgroup } from '/root/workdir/www/weilin-prompt-web/src/data/repos/subgroups.js'
import { createTag, listTags, listAllTags, getTag, updateTag, deleteTags, moveTag, searchTagsByPrefix } from '/root/workdir/www/weilin-prompt-web/src/data/repos/tags.js'
import { addHistory, listHistory, deleteHistory, clearHistory, clearAll } from '/root/workdir/www/weilin-prompt-web/src/data/repos/history.js'
import { addFavorite, listFavorites, updateFavorite, deleteFavorites } from '/root/workdir/www/weilin-prompt-web/src/data/repos/favorites.js'
import { getLabelsPayload, saveLabelsPayload, saveLabelSettings, normalizeLabelItem } from '/root/workdir/www/weilin-prompt-web/src/data/repos/labels.js'
import { dictSize, getDictEntries, getDictEntry, loadDictIndex, invalidateDictIndex, isDictIndexLoaded, searchDict } from '/root/workdir/www/weilin-prompt-web/src/data/repos/dict.js'
import { getTagIndex, buildTagIndex, invalidateTagIndex, isTagIndexBuilt } from '/root/workdir/www/weilin-prompt-web/src/data/memoryIndex.js'
import { importBundle } from '/root/workdir/www/weilin-prompt-web/src/data/bundle/importBundle.js'
import { exportBundle, verifyBundleChecksum, isChecksumAvailable } from '/root/workdir/www/weilin-prompt-web/src/data/bundle/exportBundle.js'

const tagJson = (prompt) => JSON.stringify({ prompt, lora: '', temp_prompt: [], temp_lora: [] })

async function reset() {
  await closeDB()
  await deleteDatabase()
  invalidateTagIndex()
}

const pass = []
function ok(name) { pass.push(name) }

await reset()

// ---- groups ----
const a = await createGroup({ name: 'a' })
const b = await createGroup({ name: 'b' })
const c = await createGroup({ name: 'c' })
assert.equal(a.color, DEFAULT_COLOR)
assert.equal(a.src_id, null)
assert.deepEqual((await listGroups()).map((g) => g.name), ['a', 'b', 'c'])
assert.equal((await updateGroup(a.p_uuid, { name: 'A' })).name, 'A')
assert.equal(await updateGroup('nope', { name: 'x' }), null)
await assert.rejects(() => createGroup({}), /name/)
await assert.rejects(() => updateGroup(a.p_uuid, { name: '' }), /name/)
assert.equal(await moveGroup(c.p_uuid, a.p_uuid, 'before'), true)
assert.deepEqual((await listGroups()).map((g) => g.name), ['c', 'A', 'b'])
assert.equal(await moveGroup(a.p_uuid, b.p_uuid, 'after'), true)
assert.deepEqual((await listGroups()).map((g) => g.name), ['c', 'b', 'A'])
assert.equal(await moveGroup(a.p_uuid, 'nope'), false)
assert.equal(await moveGroup('nope', a.p_uuid), false)
assert.equal(await moveGroup(a.p_uuid, b.p_uuid, 'middle'), false)
assert.equal(await moveGroup(a.p_uuid, a.p_uuid, 'before'), false)
ok('groups CRUD + move')

// 撞值重整
await reset()
const g1 = await createGroup({ name: 'a' })
const g2 = await createGroup({ name: 'b' })
const g3 = await createGroup({ name: 'c' })
await moveGroup(g2.p_uuid, g1.p_uuid, 'before')
await moveGroup(g3.p_uuid, g1.p_uuid, 'before')
let list = await listGroups()
assert.deepEqual(list.map((g) => g.name), ['b', 'c', 'a'])
assert.ok(list[0].create_time < list[1].create_time && list[1].create_time < list[2].create_time)
ok('move collision renormalize')

// ---- subgroups / tags cascade ----
await reset()
const keep = await createGroup({ name: '保留' })
const drop = await createGroup({ name: '删除' })
const dropSub = await createSubgroup({ p_uuid: drop.p_uuid, name: '子A' })
const dropSub2 = await createSubgroup({ p_uuid: drop.p_uuid, name: '子B' })
const keepSub = await createSubgroup({ p_uuid: keep.p_uuid, name: '子C' })
await createTag({ g_uuid: dropSub.g_uuid, text: '1girl' })
await createTag({ g_uuid: dropSub.g_uuid, text: '2girl' })
await createTag({ g_uuid: dropSub2.g_uuid, text: 'cat' })
await createTag({ g_uuid: keepSub.g_uuid, text: 'dog' })
assert.deepEqual(await deleteGroup(drop.p_uuid), { groups: 1, subgroups: 2, tags: 3 })
assert.deepEqual((await listSubgroups()).map((s) => s.name), ['子C'])
assert.deepEqual((await listAllTags()).map((t) => t.text), ['dog'])
assert.deepEqual(await deleteGroup('nope'), { groups: 0, subgroups: 0, tags: 0 })
await assert.rejects(() => createSubgroup({ p_uuid: 'nope', name: 'x' }), /父一级分组/)
await assert.rejects(() => createSubgroup({ p_uuid: keep.p_uuid }), /name/)
ok('subgroup + cascade delete')

// deleteSubgroup cascade
await reset()
const grp = await createGroup({ name: 'g' })
const sg = await createSubgroup({ p_uuid: grp.p_uuid, name: 's' })
await createTag({ g_uuid: sg.g_uuid, text: 'x' })
await createTag({ g_uuid: sg.g_uuid, text: 'y' })
assert.deepEqual(await deleteSubgroup(sg.g_uuid), { subgroups: 1, tags: 2 })
assert.deepEqual(await deleteSubgroup('nope'), { subgroups: 0, tags: 0 })
assert.equal((await listSubgroups(grp.p_uuid)).length, 0)
assert.equal((await listGroups()).length, 1)
ok('deleteSubgroup cascade')

// subgroup update/move
const sg2 = await createSubgroup({ p_uuid: grp.p_uuid, name: 'a2' })
const sg3 = await createSubgroup({ p_uuid: grp.p_uuid, name: 'b2' })
assert.equal((await updateSubgroup(sg2.g_uuid, { color: '#123' })).color, '#123')
assert.equal(await updateSubgroup('nope', { name: 'x' }), null)
assert.equal(await moveSubgroup(sg3.g_uuid, sg2.g_uuid, 'before'), true)
assert.deepEqual((await listSubgroups(grp.p_uuid)).map((s) => s.name), ['b2', 'a2'])
const otherG = await createGroup({ name: 'other' })
const outsider = await createSubgroup({ p_uuid: otherG.p_uuid, name: 'x' })
assert.equal(await moveSubgroup(sg3.g_uuid, outsider.g_uuid, 'before'), false)
assert.deepEqual((await listSubgroups(grp.p_uuid)).map((s) => s.name), ['b2', 'a2'])
ok('subgroup update + move')

// ---- tags ----
await reset()
const tg = await createGroup({ name: 'p' })
const s1 = await createSubgroup({ p_uuid: tg.p_uuid, name: 's1' })
const s2 = await createSubgroup({ p_uuid: tg.p_uuid, name: 's2' })
const t1 = await createTag({ g_uuid: s1.g_uuid, text: 'a' })
const t2 = await createTag({ g_uuid: s1.g_uuid, text: 'b' })
const t3 = await createTag({ g_uuid: s1.g_uuid, text: 'c' })
assert.equal(t1.image_path, null)
assert.equal(t1.image_status, null)
assert.equal(t1.desc, '')
assert.deepEqual((await listTags(s1.g_uuid)).map((t) => t.text), ['c', 'b', 'a'])
assert.equal((await listAllTags()).length, 3)
assert.equal((await getTag(t1.t_uuid)).text, 'a')
assert.equal(await getTag('nope'), null)
assert.equal((await updateTag(t1.t_uuid, { desc: 'A', image_status: 'ready', image_path: 'p' })).image_status, 'ready')
assert.equal(await updateTag('nope', { desc: 'x' }), null)
await assert.rejects(() => createTag({ g_uuid: 'nope', text: 'x' }), /父二级分组/)
await assert.rejects(() => createTag({ g_uuid: s1.g_uuid }), /text/)

assert.equal(await moveTag(t1.t_uuid, t3.t_uuid, 'before'), true)
assert.deepEqual((await listTags(s1.g_uuid)).map((t) => t.text), ['a', 'c', 'b'])
assert.equal(await moveTag(t2.t_uuid, t3.t_uuid, 'after'), true)
assert.deepEqual((await listTags(s1.g_uuid)).map((t) => t.text), ['a', 'c', 'b'])
const outT = await createTag({ g_uuid: s2.g_uuid, text: 'z' })
assert.equal(await moveTag(t1.t_uuid, outT.t_uuid, 'before'), false)
assert.equal(await moveTag('nope', t1.t_uuid, 'before'), false)
assert.deepEqual(await deleteTags([t1.t_uuid, t2.t_uuid, 'nope']), { tags: 2 })
assert.deepEqual(await deleteTags([]), { tags: 0 })
assert.deepEqual((await listTags(s1.g_uuid)).map((t) => t.text), ['c'])

for (const text of ['cat', 'category', 'dog']) await createTag({ g_uuid: s1.g_uuid, text })
const pref = await searchTagsByPrefix('cat')
assert.deepEqual(pref.map((t) => t.text).sort(), ['cat', 'category'])
assert.equal((await searchTagsByPrefix('cat', { limit: 1 })).length, 1)
assert.deepEqual(await searchTagsByPrefix('CAT'), [])
assert.deepEqual(await searchTagsByPrefix(''), [])
ok('tags CRUD + move + prefix search')

// ---- history / favorites ----
await reset()
assert.equal(await addHistory(tagJson('1girl, cat')), true)
assert.equal(await addHistory(tagJson('1girl, cat')), false)
assert.equal(await addHistory(tagJson('x')), true)
assert.equal(await addHistory(''), false)
const hist = await listHistory()
assert.equal(hist.length, 2)
assert.equal(JSON.parse(hist[0].tag).prompt, 'x')
assert.equal(typeof hist[0].id, 'number')
assert.equal(hist[0].src_id, null)
assert.deepEqual(await deleteHistory([hist[0].id, 999999]), { history: 1 })
assert.deepEqual(await deleteHistory([]), { history: 0 })
assert.deepEqual(await clearHistory(), { history: 1 })

const f1 = await addFavorite({ tag: tagJson('a'), name: 'A', color: '#f00' })
const f2 = await addFavorite({ tag: tagJson('a'), name: 'B' })
assert.ok(f2.id > f1.id)
assert.equal((await listFavorites())[0].id, f2.id)
assert.equal((await updateFavorite(f1.id, { name: 'A2', color: '#0f0' })).name, 'A2')
assert.equal(await updateFavorite(999999, { name: 'x' }), null)
await assert.rejects(() => updateFavorite(f1.id, { tag: '' }), /tag/)
await assert.rejects(() => addFavorite({}), /tag/)
assert.deepEqual(await deleteFavorites([f2.id, 999999]), { favorites: 1 })
assert.deepEqual((await listFavorites()).map((f) => f.name), ['A2'])
ok('history + favorites')

// clearAll
const cg = await createGroup({ name: 'g' })
const csg = await createSubgroup({ p_uuid: cg.p_uuid, name: 's' })
await createTag({ g_uuid: csg.g_uuid, text: 't' })
await addHistory(tagJson('t'))
await addFavorite({ tag: tagJson('t'), name: 'f' })
await setMeta(META_KEYS.SETTINGS, { theme: 'dark' })
const counts = await clearAll()
assert.deepEqual(counts, { meta: 1, groups: 1, subgroups: 1, tags: 1, history: 1, favorites: 2, labels: 0, dict: 0, blobs: 0 })
assert.deepEqual(await listGroups(), [])
assert.equal(await getMeta(META_KEYS.SETTINGS, null), null)
ok('clearAll')

// ---- labels ----
await reset()
let payload = await getLabelsPayload()
assert.deepEqual(payload.items, [])
assert.deepEqual(payload.settings, { sortMode: 'manual', sortTimeDesc: true, sortNameAsc: true, selectedId: null })
const saved = await saveLabelsPayload({
  items: [
    { id: 'b', name: '负面', content: 'lowres', order: 2, pinned: true },
    { id: 'a', name: '正面', content: '1girl', order: 1, highlighted: true }
  ],
  settings: { sortMode: 'time', sortTimeDesc: false }
})
assert.equal(saved.items, 2)
payload = await getLabelsPayload()
assert.deepEqual(payload.items.map((i) => i.id), ['a', 'b'])
assert.equal(payload.settings.sortMode, 'time')
assert.equal(payload.settings.sortNameAsc, true)
assert.equal(payload.items[1].pinned, true)
assert.equal((await saveLabelsPayload({ items: [{ id: 'b', name: 'B2' }] })).items, 1)
payload = await getLabelsPayload()
assert.deepEqual(payload.items.map((i) => i.name), ['B2'])
assert.equal(payload.items[0].content, '')
assert.equal((await saveLabelSettings({ sortMode: 'name' })).sortMode, 'name')
const gen = normalizeLabelItem({ name: 'x', content: 'y' }, 3)
assert.equal(gen.pinned, false)
assert.equal(gen.order, 3)
assert.ok(gen.id)
assert.equal(normalizeLabelItem({ id: 12345, updatedAt: 1000 }).id, '12345')
ok('labels')

// ---- dict ----
await reset()
assert.equal(await dictSize(), 0)
const DICT = [
  { tag: '1girl', color_id: 0, translate: '1女孩', hot: 100, aliases: 0 },
  { tag: '1girls', color_id: 0, translate: '多女孩', hot: 10, aliases: 0 },
  { tag: 'black_cat', color_id: 3, translate: '黑猫', hot: 5, aliases: 1 },
  { tag: 'cat', color_id: 3, translate: '猫', hot: 50, aliases: 0 },
  { tag: 'dog', color_id: 4, translate: '狗', hot: 0, aliases: 0 }
]
await withTx(STORES.DICT, 'readwrite', async (tx) => { for (const e of DICT) await tx.store.put(e) })
assert.equal(await dictSize(), 5)
assert.deepEqual((await getDictEntries(['cat', 'nope', '1girl'])).map((e) => e.tag), ['cat', '1girl'])
assert.deepEqual(await getDictEntries([]), [])
assert.equal((await getDictEntry('dog')).translate, '狗')
assert.equal(await getDictEntry(''), null)
assert.equal(isDictIndexLoaded(), false)
const idx = await loadDictIndex()
assert.equal(isDictIndexLoaded(), true)
assert.deepEqual(Object.keys(idx[0]).sort(), ['color_id', 'tag', 'translate'])
assert.equal(await loadDictIndex(), idx)
await withTx(STORES.DICT, 'readwrite', async (tx) => { await tx.store.put({ tag: 'zzz', color_id: 1, translate: 'z', hot: 0, aliases: 0 }) })
assert.equal((await loadDictIndex()).length, 5)
invalidateDictIndex()
assert.equal(isDictIndexLoaded(), false)
assert.equal((await loadDictIndex()).length, 6)
assert.deepEqual((await searchDict('1girl')).map((e) => e.tag), ['1girl', '1girls'])
assert.deepEqual((await searchDict('cat')).map((e) => e.tag), ['cat', 'black_cat'])
assert.deepEqual((await searchDict('猫')).map((e) => e.tag), ['black_cat', 'cat'])
assert.deepEqual((await searchDict('CAT')).map((e) => e.tag), ['cat', 'black_cat'])
assert.deepEqual(await searchDict(''), [])
assert.deepEqual(await searchDict('   '), [])
assert.deepEqual(await searchDict('nothing-matches'), [])
const lim = await searchDict('1girl', 1)
assert.deepEqual(lim.map((e) => e.tag), ['1girl'])
assert.equal(lim[0].hot, 100)
assert.equal((await searchDict('1girl', 0)).length, 2)
ok('dict lazy index + search')

// ---- memory index ----
await reset()
const mg = await createGroup({ name: '人物' })
const msub = await createSubgroup({ p_uuid: mg.p_uuid, name: '对象' })
const mcat = await createTag({ g_uuid: msub.g_uuid, text: 'Cat', desc: '猫', color: '#f00' })
const mgirl = await createTag({ g_uuid: msub.g_uuid, text: '1girl', desc: '1女孩' })
const tindex = await buildTagIndex()
assert.equal(tindex.entries.length, 2)
assert.deepEqual(Object.keys(tindex.entries[0]).sort(), ['color', 'desc', 'g_uuid', 't_uuid', 'text'])
assert.deepEqual(tindex.byText.get('cat'), { t_uuid: mcat.t_uuid, g_uuid: msub.g_uuid, text: 'Cat', desc: '猫', color: '#f00' })
assert.equal(tindex.byText.has('Cat'), false)
assert.equal(isTagIndexBuilt(), true)
assert.equal(await getTagIndex(), tindex)
await createTag({ g_uuid: msub.g_uuid, text: 'dog' })
assert.equal((await getTagIndex()).entries.length, 2)
invalidateTagIndex()
assert.equal(isTagIndexBuilt(), false)
assert.equal((await getTagIndex()).entries.length, 3)
const [x, y, z] = await Promise.all([getTagIndex(), getTagIndex(), getTagIndex()])
assert.equal(x, y); assert.equal(y, z)
// dup text keeps newest
await reset()
const dg = await createGroup({ name: 'p' })
const ds1 = await createSubgroup({ p_uuid: dg.p_uuid, name: 'A' })
const ds2 = await createSubgroup({ p_uuid: dg.p_uuid, name: 'B' })
await createTag({ g_uuid: ds1.g_uuid, text: 'dup' })
const newest = await createTag({ g_uuid: ds2.g_uuid, text: 'dup' })
const di = await buildTagIndex()
assert.equal(di.entries.length, 2)
assert.equal(di.byText.get('dup').t_uuid, newest.t_uuid)
// dict index invalidation via invalidateTagIndex
await withTx(STORES.DICT, 'readwrite', async (tx) => { await tx.store.put({ tag: 'c', color_id: 0, translate: '猫', hot: 0, aliases: 0 }) })
await loadDictIndex()
assert.equal(isDictIndexLoaded(), true)
invalidateTagIndex()
assert.equal(isDictIndexLoaded(), false)
ok('memory index')

// ---- bundle ----
await reset()
const makeBundle = (data = {}, extra = {}) => ({
  format: 'weilin-prompt-bundle', formatVersion: 1, generatedAt: 1759800000000, generator: 'test/1.0.0',
  source: { lang: 'zh_CN', dbFiles: [], hasImages: false }, counts: {},
  data: { groups: [], subgroups: [], tags: [], history: [], favorites: [], dict: [], labels: { items: [], settings: {} }, ...data },
  warnings: [], checksum: null, ...extra
})
await assert.rejects(() => importBundle(null), /数据包内容不是对象/)
await assert.rejects(() => importBundle({ format: 'o', formatVersion: 1 }), /格式不匹配/)
await assert.rejects(() => importBundle({ format: 'weilin-prompt-bundle', formatVersion: 2 }), /版本不支持/)
await assert.rejects(() => importBundle({ format: 'weilin-prompt-bundle', formatVersion: 1, data: 'x' }), /data 字段/)
await assert.rejects(() => importBundle(makeBundle(), { mode: 'nope' }), /不支持的导入模式/)

const empty = await importBundle(makeBundle())
assert.equal(empty.imported.total, 0)
assert.equal(empty.skipped.total, 0)
assert.deepEqual(empty.warnings, [])

const baseData = {
  groups: [
    { p_uuid: 'p1', name: '包内名', color: 'rgba(1, 2, 3, .4)', create_time: 100, src_id: 1 },
    { p_uuid: 'p2', name: '新增组', create_time: 200 }
  ],
  subgroups: [
    { g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 100 },
    { g_uuid: 'g2', p_uuid: 'p2', name: '子2', create_time: 200 }
  ]
}
// overwrite
await withTx(STORES.GROUPS, 'readwrite', async (tx) => { await tx.store.put({ p_uuid: 'p1', name: '库内名', color: '#000', create_time: 50, src_id: 9 }) })
const ow = await importBundle(makeBundle(baseData), { mode: 'overwrite' })
assert.equal(ow.imported.groups, 2)
assert.equal(ow.skipped.groups, 0)
assert.deepEqual((await listGroups()).map((g) => g.name), ['包内名', '新增组'])
assert.equal((await listGroups())[0].src_id, 1)
ok('import overwrite')

// merge
await reset()
await withTx(STORES.GROUPS, 'readwrite', async (tx) => { await tx.store.put({ p_uuid: 'p1', name: '库内名', color: '#000', create_time: 50 }) })
const mg2 = await importBundle(makeBundle(baseData), { mode: 'merge' })
assert.equal(mg2.imported.groups, 1)
assert.equal(mg2.skipped.groups, 1)
assert.deepEqual((await listGroups()).map((g) => g.name), ['库内名', '新增组'])
ok('import merge')

// skip / merge with missing uuid
await reset()
const skipData = { groups: [{ name: '无 uuid 组', create_time: 10 }], tags: [{ g_uuid: 'g1', text: 'orphan' }] }
const skipRes = await importBundle(makeBundle(skipData), { mode: 'skip' })
assert.equal(skipRes.imported.groups, 0)
assert.equal(skipRes.skipped.groups, 1)
assert.match(skipRes.warnings.join('\n'), /缺少 p_uuid/)
assert.deepEqual(await listGroups(), [])
const mergeRes = await importBundle(makeBundle(skipData), { mode: 'merge' })
assert.equal(mergeRes.imported.groups, 1)
assert.match(mergeRes.warnings.join('\n'), /已生成新 uuid/)
assert.equal((await listGroups()).length, 1)
ok('import skip/merge missing uuid')

// parent integrity
await reset()
const orphan = await importBundle(makeBundle({
  groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }],
  subgroups: [{ g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 1 }],
  tags: [{ t_uuid: 't1', g_uuid: 'g1', text: 'ok' }, { t_uuid: 't2', g_uuid: 'missing', text: 'orphan' }]
}))
assert.equal(orphan.imported.tags, 1)
assert.equal(orphan.skipped.tags, 1)
assert.ok(orphan.warnings.some((w) => w.includes('父级 g_uuid=missing 不存在')))
assert.deepEqual((await listAllTags()).map((t) => t.text), ['ok'])
ok('import parent integrity')

// history/favorites dedupe by content
await reset()
await addHistory(tagJson('already'))
const dv = await importBundle(makeBundle({
  history: [{ tag: tagJson('already'), create_time: 111 }, { tag: tagJson('fresh'), create_time: 222 }],
  favorites: [{ tag: tagJson('fav'), name: 'F', color: '#0f0', create_time: 333 }]
}))
assert.equal(dv.imported.history, 1)
assert.equal(dv.skipped.history, 1)
assert.equal(dv.imported.favorites, 1)
assert.equal((await listHistory()).length, 2)
assert.deepEqual((await listFavorites()).map((f) => f.name), ['F'])
ok('import history/favorites dedupe')

// labels modes
await reset()
const labelsPayload = {
  items: [
    { id: 'l1', name: '包内旧', content: 'x', createdAt: 1, updatedAt: 2, order: 0 },
    { id: 'l2', name: '包内新', content: 'y', createdAt: 3, updatedAt: 4, order: 1 }
  ],
  settings: { sortMode: 'name', selectedId: 'l2' }
}
await saveLabelsPayload({ items: [{ id: 'l1', name: '库内', content: 'z', order: 0 }] })
const low = await importBundle(makeBundle({ labels: labelsPayload }), { mode: 'overwrite' })
assert.equal(low.imported.labels, 2)
let lp = await getLabelsPayload()
assert.deepEqual(lp.items.map((i) => i.name), ['包内旧', '包内新'])
assert.equal(lp.settings.sortMode, 'name')
assert.equal(lp.settings.selectedId, 'l2')
await reset()
await saveLabelsPayload({ items: [{ id: 'l1', name: '库内', content: 'z', order: 0 }] })
const lmg = await importBundle(makeBundle({ labels: labelsPayload }), { mode: 'merge' })
assert.equal(lmg.imported.labels, 1)
assert.equal(lmg.skipped.labels, 1)
lp = await getLabelsPayload()
assert.deepEqual(lp.items.map((i) => i.name), ['库内', '包内新'])
ok('import labels modes')

// batching + progress
await reset()
const manyTags = Array.from({ length: 1001 }, (_, i) => ({ t_uuid: `t${String(i).padStart(4, '0')}`, g_uuid: 'g1', text: `tag_${i}`, create_time: 1000 + i }))
const events = []
const batchRes = await importBundle(makeBundle({
  groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }],
  subgroups: [{ g_uuid: 'g1', p_uuid: 'p1', name: '子', create_time: 1 }],
  tags: manyTags
}), { onProgress: (p) => { events.push(p) } })
assert.equal(batchRes.imported.tags, 1001)
const writes = events.filter((e) => e.store === 'tags' && e.phase === 'write')
assert.deepEqual(writes.map((e) => e.done), [1000, 1001])
assert.equal(writes[1].total, 1001)
assert.ok(events.some((e) => e.phase === 'done' && e.store === 'tags'))
assert.equal((await listAllTags()).length, 1001)
ok('import batching + progress')

// lastImport + index invalidation
await reset()
await withTx(STORES.DICT, 'readwrite', async (tx) => { await tx.store.put({ tag: 'cat', color_id: 3, translate: '猫', hot: 0, aliases: 0 }) })
await loadDictIndex()
assert.equal(isDictIndexLoaded(), true)
await importBundle(makeBundle({ groups: [{ p_uuid: 'p1', name: '组', create_time: 1 }] }))
assert.equal(isDictIndexLoaded(), false)
const lastImport = await getMeta(META_KEYS.LAST_IMPORT, null)
assert.equal(lastImport.mode, 'overwrite')
assert.equal(lastImport.imported.groups, 1)
ok('lastImport + index invalidation')

// export + round trip
await reset()
const eg = await createGroup({ name: '人物' })
const es = await createSubgroup({ p_uuid: eg.p_uuid, name: '对象' })
await createTag({ g_uuid: es.g_uuid, text: '1girl', desc: '1女孩' })
await createTag({ g_uuid: es.g_uuid, text: 'cat', desc: '猫' })
await addHistory(tagJson('1girl, cat'))
await addFavorite({ tag: tagJson('1girl'), name: '常用', color: '#f00' })
await saveLabelsPayload({
  items: [{ id: 'l1', name: '正面', content: '1girl', createdAt: 1, updatedAt: 2, order: 0 }],
  settings: { sortMode: 'time' }
})
await withTx(STORES.DICT, 'readwrite', async (tx) => {
  await tx.store.put({ tag: 'cat', color_id: 3, translate: '猫', hot: 5, aliases: 0 })
  await tx.store.put({ tag: '1girl', color_id: 0, translate: '1女孩', hot: 100, aliases: 0 })
})
const first = await exportBundle()
assert.equal(first.format, 'weilin-prompt-bundle')
assert.equal(first.formatVersion, 1)
assert.deepEqual(first.counts, { groups: 1, subgroups: 1, tags: 2, history: 1, favorites: 1, dict: 2, labels: 1, images: 0 })
assert.equal(first.data.groups[0].id, undefined)
assert.equal(first.data.history[0].id, undefined)
assert.deepEqual(Object.keys(first.data.labels), ['items', 'settings'])
console.log('checksum available:', isChecksumAvailable(), first.checksum && first.checksum.groups)
if (isChecksumAvailable()) {
  assert.match(first.checksum.groups, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(await verifyBundleChecksum(first), { available: true, ok: true, mismatched: [] })
} else {
  assert.equal(first.checksum, null)
  assert.match(first.warnings.join('\n'), /Web Crypto/)
  assert.equal((await verifyBundleChecksum(first)).available, false)
}

await reset()
const rt = await importBundle(first, { mode: 'overwrite' })
assert.equal(rt.imported.total, 9)
assert.equal(rt.skipped.total, 0)
const second = await exportBundle()
assert.deepEqual(second.counts, first.counts)
assert.deepEqual(second.data, first.data)
assert.deepEqual(second.checksum, first.checksum)
if (isChecksumAvailable()) assert.equal((await verifyBundleChecksum(second)).ok, true)
ok('export + round-trip')

const noDict = await exportBundle({ includeDict: false })
assert.equal(noDict.counts.dict, 0)
assert.deepEqual(noDict.data.dict, [])
ok('export without dict')

// JSON serializable
const json = JSON.stringify(first)
assert.ok(json.length > 100)
ok('JSON.stringify bundle')

console.log('\nSMOKE OK —', pass.length, 'groups:')
for (const name of pass) console.log(' -', name)
