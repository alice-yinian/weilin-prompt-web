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

  const hasData = computed(() => groups.value.length > 0)

  const subgroupsByGroup = computed(() => {
    const map = {}
    for (const subgroup of subgroups.value) {
      if (!map[subgroup.p_uuid]) map[subgroup.p_uuid] = []
      map[subgroup.p_uuid].push(subgroup)
    }
    return map
  })

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
    return getTagIndex()
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

  async function translate(phrase) {
    const [index, dictEntries] = await Promise.all([ensureTagIndex(), ensureDictIndex()])
    const maps = createTranslationLookup({ tags: index.entries, dict: dictEntries })
    return translatePhrase(phrase, { maps })
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
