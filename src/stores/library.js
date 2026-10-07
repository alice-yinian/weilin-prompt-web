import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listGroups } from '../data/repos/groups'
import { listSubgroups } from '../data/repos/subgroups'
import { listTags } from '../data/repos/tags'
import { getTagIndex, invalidateTagIndex } from '../data/memoryIndex'
import { dictSize, loadDictIndex, isDictIndexLoaded } from '../data/repos/dict'
import { searchEntries } from '../core/search/autocomplete'
import { createTranslationLookup, translatePhrase } from '../core/search/offlineTranslate'
import { useSettingsStore } from './settings'

// 词库数据：分组/二级分组/标签的展示缓存；补全与翻译走内存索引（tags 全量 + 词典懒加载）
export const useLibraryStore = defineStore('library', () => {
  const settings = useSettingsStore()

  const groups = ref([])
  const subgroups = ref([])
  const tagsBySubgroup = ref({})
  const loaded = ref(false)
  const dictReady = ref(false)
  // 词库文本(小写) → {desc, color}，供编辑器双语显示同步查表
  const descMap = ref(new Map())
  // 中文释义(小写) → {text, color}，供「中 → 英」方向同步反查
  const descReverseMap = ref(new Map())

  const hasData = computed(() => groups.value.length > 0)

  const subgroupsByGroup = computed(() => {
    const map = {}
    for (const subgroup of subgroups.value) {
      if (!map[subgroup.p_uuid]) map[subgroup.p_uuid] = []
      map[subgroup.p_uuid].push(subgroup)
    }
    return map
  })

  function syncDescMap(index) {
    const map = new Map()
    const reverse = new Map()
    for (const entry of index?.entries || []) {
      const key = String(entry.text || '').trim().toLowerCase()
      if (!key) continue
      map.set(key, { desc: entry.desc || '', color: entry.color || '' })
      const descKey = String(entry.desc || '').trim().toLowerCase()
      // 同释义多条时保留最先出现的（与内存索引顺序一致）
      if (descKey && !reverse.has(descKey)) {
        reverse.set(descKey, { text: entry.text, color: entry.color || '' })
      }
    }
    descMap.value = map
    descReverseMap.value = reverse
    return map
  }

  async function refresh() {
    const [groupRows, subgroupRows] = await Promise.all([listGroups(), listSubgroups()])
    groups.value = groupRows
    subgroups.value = subgroupRows
    tagsBySubgroup.value = {}
    invalidateTagIndex()
    dictReady.value = isDictIndexLoaded()
    loaded.value = true
  }

  async function ensureTagIndex() {
    const index = await getTagIndex()
    if (descMap.value.size === 0 && index?.entries?.length) syncDescMap(index)
    return index
  }

  // 同步查词库释义（索引未就绪时返回空，由 ensureTagIndex 兜底）
  function descOf(text) {
    const key = String(text || '').trim().toLowerCase()
    return key ? descMap.value.get(key) || null : null
  }

  // 同步反查：中文释义 → 英文标签
  function reverseDescOf(text) {
    const key = String(text || '').trim().toLowerCase()
    return key ? descReverseMap.value.get(key) || null : null
  }

  async function ensureDictIndex() {
    const entries = await loadDictIndex()
    dictReady.value = true
    return entries
  }

  async function tagsOf(g_uuid) {
    if (!g_uuid) return []
    if (!tagsBySubgroup.value[g_uuid]) {
      tagsBySubgroup.value = { ...tagsBySubgroup.value, [g_uuid]: await listTags(g_uuid) }
    }
    return tagsBySubgroup.value[g_uuid]
  }

  function tagsOfCached(g_uuid) {
    return tagsBySubgroup.value[g_uuid] || []
  }

  // 先在词库内匹配：命中不足时才用词典补足。
  // 词典有 14 万条，首次加载较慢，因此第一次改为“后台开始加载 + 本次先返回词库结果”，
  // 避免输入稀有词时界面卡住等词典加载。
  async function autocomplete(query, limit) {
    const index = await getTagIndex()
    const max = limit ?? settings.autocompleteLimit
    const tagOnly = searchEntries(query, { tags: index.entries, dict: [] }, max)
    if (tagOnly.length >= max) return tagOnly
    if (isDictIndexLoaded()) {
      const dictEntries = await loadDictIndex()
      return searchEntries(query, { tags: index.entries, dict: dictEntries }, max)
    }
    ensureDictIndex()
    return tagOnly
  }

  /**
   * 离线翻译：默认英→中（词库 desc / 词典 translate），direction='zh2en' 时反查中文 → 英文标签
   */
  async function translate(phrase, direction = 'en2zh') {
    const [index, dictEntries] = await Promise.all([ensureTagIndex(), ensureDictIndex()])
    const maps = createTranslationLookup({ tags: index.entries, dict: dictEntries })
    return translatePhrase(phrase, { maps, direction })
  }

  async function stats() {
    const index = await ensureTagIndex()
    return {
      groups: groups.value.length,
      subgroups: subgroups.value.length,
      tags: index?.entries?.length ?? 0,
      dict: await dictSize()
    }
  }

  function reset() {
    groups.value = []
    subgroups.value = []
    tagsBySubgroup.value = {}
    descMap.value = new Map()
    descReverseMap.value = new Map()
    dictReady.value = false
    invalidateTagIndex()
    loaded.value = false
  }

  return {
    groups,
    subgroups,
    subgroupsByGroup,
    tagsBySubgroup,
    loaded,
    dictReady,
    hasData,
    descMap,
    descReverseMap,
    descOf,
    reverseDescOf,
    refresh,
    ensureTagIndex,
    ensureDictIndex,
    tagsOf,
    tagsOfCached,
    autocomplete,
    translate,
    stats,
    reset
  }
})
