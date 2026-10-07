import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listGroups } from '../data/repos/groups'
import { listSubgroups } from '../data/repos/subgroups'
import { listTags, listAllTags } from '../data/repos/tags'
import { buildTagIndex, getTagIndex, invalidateTagIndex } from '../data/memoryIndex'
import { loadDictIndex, dictSize } from '../data/repos/dict'
import { searchEntries } from '../core/search/autocomplete'
import { createTranslationLookup, translatePhrase } from '../core/search/offlineTranslate'
import { useSettingsStore } from './settings'

const EMPTY_STATS = {
  groups: 0,
  subgroups: 0,
  tags: 0,
  dict: 0,
  history: 0,
  favorites: 0
}

// 词库数据：分组/二级分组/标签的内存缓存 + 词库索引（补全与翻译都走它）
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
    loaded.value = true
  }

  async function ensureTagIndex() {
    return getTagIndex() || buildTagIndex(await listAllTags())
  }

  async function ensureDictIndex() {
    if (dictReady.value) return getTagIndex()
    await loadDictIndex()
    dictReady.value = true
    return getTagIndex()
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

  async function autocomplete(query, limit) {
    const index = await ensureTagIndex()
    if (!index) return []
    if ((index.entries?.length ?? 0) > 0 && !dictReady.value) {
      // 词典懒加载：首次补全时顺带灌入，命中不足时才有意义
      await ensureDictIndex()
    }
    const dictEntries = dictReady.value ? (getTagIndex()?.dictEntries ?? []) : []
    return searchEntries(query, { tags: index.entries, dict: dictEntries }, limit ?? settings.autocompleteLimit)
  }

  async function translate(phrase) {
    const index = await ensureTagIndex()
    await ensureDictIndex()
    const maps = createTranslationLookup({
      tags: index?.entries ?? [],
      dict: getTagIndex()?.dictEntries ?? []
    })
    return translatePhrase(phrase, { maps })
  }

  async function stats() {
    const index = await ensureTagIndex()
    return {
      ...EMPTY_STATS,
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
