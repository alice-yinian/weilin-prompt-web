<template>
  <div class="translate-panel">
    <div v-if="!library.hasData" class="empty-state faint">
      <p>{{ t('editor.noDataHint') }}</p>
      <button class="primary" @click="router.push('/data')">{{ t('editor.goImport') }}</button>
    </div>

    <div v-else class="body scroll">
      <section class="block">
        <div class="row wrap">
          <span class="faint">{{ t('translate.direction') }}</span>
          <button
            :class="direction === DIR_EN2ZH ? 'primary' : 'ghost'"
            @click="setDirection(DIR_EN2ZH)"
          >
            {{ t('settings.dirEn2Zh') }}
          </button>
          <button
            :class="direction === DIR_ZH2EN ? 'primary' : 'ghost'"
            @click="setDirection(DIR_ZH2EN)"
          >
            {{ t('settings.dirZh2En') }}
          </button>
        </div>
      </section>

      <section class="block">
        <div class="row wrap">
          <button class="primary" :disabled="busyAll" @click="translateAll">
            {{ t('translate.translateAll') }}
          </button>
          <div class="spacer"></div>
          <button class="ghost" :disabled="!segments.length" @click="copyAll">
            {{ t('translate.copyAll') }}
          </button>
        </div>

        <p v-if="busyAll" class="faint hint">{{ t('common.loading') }}</p>
        <p v-else-if="!segments.length" class="faint hint">{{ t('translate.empty') }}</p>

        <div v-for="(row, index) in segments" :key="`seg-${index}`" class="trans-row">
          <span class="swatch" :style="{ background: colorOf(row) }"></span>
          <span class="from faint">{{ row.original }}</span>
          <span class="arrow">→</span>
          <span class="to">{{ row.translated || '—' }}</span>
        </div>

        <p v-if="segments.length" class="faint hint">{{ t('translate.missing') }}</p>
      </section>

      <section class="block">
        <div class="row wrap sub-head">
          <button :disabled="batchBusy || !missing.length" @click="translateMissing">
            {{ t('translate.batchMissing') }}
          </button>
          <span class="faint">{{ t('translate.missingCount', { n: missing.length }) }}</span>
          <div class="spacer"></div>
          <span v-if="batchBusy && progress" class="faint">
            {{ t('translate.progress', progress) }}
          </span>
        </div>
      </section>

      <section class="block">
        <div class="row wrap sub-head">
          <span class="section-title">{{ t('translate.pickGroup') }}</span>
          <span class="faint">{{ t('common.count', { n: pickedCount }) }}</span>
          <div class="spacer"></div>
          <button class="ghost mini" @click="selectAllSubgroups">{{ t('common.all') }}</button>
          <button class="ghost mini" :disabled="!pickedCount" @click="clearSubgroupSelection">
            {{ t('editor.clearSelection') }}
          </button>
          <button :disabled="groupBusy || !pickedCount" @click="translatePickedGroups">
            {{ t('translate.batchGroup') }}
          </button>
        </div>

        <p class="faint hint">{{ t('translate.batchGroupHint') }}</p>
        <p v-if="groupBusy && groupProgress" class="faint hint">
          {{ t('translate.progress', groupProgress) }}
        </p>

        <div v-for="group in library.groups" :key="group.p_uuid" class="group-block">
          <div class="row group-head" @click="toggleGroup(group.p_uuid)">
            <span class="faint">{{ collapsed.includes(group.p_uuid) ? '▸' : '▾' }}</span>
            <span class="dot" :style="{ background: group.color }"></span>
            <span class="group-name">{{ group.name }}</span>
            <div class="spacer"></div>
            <button class="ghost mini" @click.stop="selectGroupSubgroups(group.p_uuid)">
              {{ t('common.all') }}
            </button>
          </div>
          <div v-if="!collapsed.includes(group.p_uuid)" class="sub-list">
            <label
              v-for="subgroup in library.subgroupsByGroup[group.p_uuid] || []"
              :key="subgroup.g_uuid"
              class="sub-pick"
            >
              <input
                type="checkbox"
                :checked="Boolean(picked[subgroup.g_uuid])"
                @change="toggleSubgroup(subgroup.g_uuid)"
              />
              <span>{{ subgroup.name }}</span>
            </label>
            <p v-if="!(library.subgroupsByGroup[group.p_uuid] || []).length" class="faint hint">
              {{ t('common.empty') }}
            </p>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="row wrap sub-head">
          <span class="section-title">{{ t('editor.translate') }}</span>
          <span class="faint">{{ t('common.count', { n: rows.length }) }}</span>
        </div>

        <p v-if="!rows.length" class="faint hint">{{ t('translate.empty') }}</p>

        <div v-for="row in rows" :key="row.id" class="tag-row">
          <div class="row tag-head">
            <span class="from faint">{{ row.text }}</span>
            <div class="spacer"></div>
            <span v-if="row.source" class="badge">{{ sourceLabel(row.source) }}</span>
          </div>
          <input
            v-model="row.draft"
            class="draft"
            :placeholder="t('translate.translationPlaceholder')"
            @input="row.dirty = true"
          />
          <div class="row wrap actions">
            <button class="ghost mini" :disabled="rowBusyId === row.id" @click="saveRow(row)">
              {{ t('translate.saveTranslation') }}
            </button>
            <button class="ghost mini" :disabled="rowBusyId === row.id" @click="translateRow(row)">
              {{ t('translate.translateSelected') }}
            </button>
            <button class="ghost mini" :disabled="!insertable(row)" @click="insertRow(row)">
              {{ t('snippetInsert.insert') }}
            </button>
            <button
              class="ghost mini"
              :disabled="rowBusyId === row.id || !row.translated"
              @click="clearRow(row)"
            >
              {{ t('editor.clearTranslation') }}
            </button>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="row wrap sub-head">
          <span class="section-title">{{ t('translate.cacheTitle') }}</span>
          <span class="faint">{{ t('translate.cacheCount', { n: cache.count }) }}</span>
          <div class="spacer"></div>
          <button class="ghost mini" @click="exportCache('json')">
            {{ t('translate.exportJson') }}
          </button>
          <button class="ghost mini" @click="exportCache('csv')">
            {{ t('translate.exportCsv') }}
          </button>
          <button class="ghost mini" :disabled="!cache.count" @click="clearCache">
            {{ t('translate.clearCache') }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { useEditorStore } from '../../../stores/editor'
  import { useLibraryStore } from '../../../stores/library'
  import { useSettingsStore } from '../../../stores/settings'
  import { useTranslationStore } from '../../../stores/translation'
  import { extractText } from '../../../core/search/offlineTranslate'
  import { copyWithToast } from '../../../utils/clipboard'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const router = useRouter()
  const editor = useEditorStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const cache = useTranslationStore()

  const segments = ref([])
  const rows = ref([])
  const missing = ref([])
  const busyAll = ref(false)
  const batchBusy = ref(false)
  const rowBusyId = ref('')
  const progress = ref(null)
  const collapsed = ref([])
  const picked = ref({})
  const groupBusy = ref(false)
  const groupProgress = ref(null)

  // 与 core/translate、设置页共用的方向值
  const DIR_EN2ZH = 'en2zh'
  const DIR_ZH2EN = 'zh2en'

  const direction = computed(() => settings.apiTranslation?.direction || DIR_EN2ZH)

  const pickedCount = computed(() => Object.values(picked.value).filter(Boolean).length)

  // 词典 color_id → 颜色，与上游 danbooru_manager.vue 的 colorOptions 对齐
  const DICT_COLORS = [
    '#888888',
    '#FF6666',
    '#66FF66',
    '#6666FF',
    '#FFFF66',
    '#FF66FF',
    '#66FFFF',
    '#FF9966',
    '#FF99CC',
    '#996633'
  ]

  const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' }

  const SOURCE_KEYS = {
    library: 'translate.sourceLibrary',
    cache: 'translate.sourceCache',
    api: 'translate.sourceApi',
    manual: 'translate.sourceManual'
  }

  // 只翻译普通标签：raw token 无文本，查词库没有意义
  const tagCandidates = computed(() => editor.visibleTokens.filter((token) => !token.isRaw))

  // token 的 id/text 变化时重建行，避免遗留已删除标签的译文行
  const tokenKey = computed(() =>
    tagCandidates.value.map((token) => `${token.id}:${token.text}`).join('|')
  )

  onMounted(async () => {
    // 独立页面打开时 library 可能还没加载，hasData 会是空的
    if (!library.loaded) await library.refresh()
    await cache.refresh()
    syncRows()
    await refreshMissing()
  })

  watch(tokenKey, () => {
    syncRows()
    refreshMissing()
  })

  // store 会自动给 token 回填译文（词库/缓存/API），token 变化后行内容也要跟着刷新
  watch(
    () => editor.tokens,
    () => syncRows(),
    { deep: true }
  )

  function colorOf(row) {
    if (row.color) return row.color
    if (row.colorId != null && row.colorId >= 0) return DICT_COLORS[row.colorId] || DICT_COLORS[0]
    return 'transparent'
  }

  function sourceLabel(source) {
    const key = SOURCE_KEYS[source]
    return key ? t(key) : source
  }

  // 词库键不带括号与权重后缀，查表前先剥掉括号层再剥权重（(cat:1.2) → cat）
  function cleanTag(text) {
    let value = String(text || '').trim()
    while (value.length > 1 && BRACKET_PAIRS[value[0]] === value[value.length - 1]) {
      value = value.slice(1, -1).trim()
    }
    return extractText(value)
  }

  async function lookup(text, dir) {
    const key = cleanTag(text)
    if (!key) return { original: text, translated: '', color: null, colorId: null }
    const result = await library.translate(key, dir)
    return {
      original: text,
      translated: result.translated,
      color: result.color,
      colorId: result.colorId
    }
  }

  // 免费接口（有道 / MyMemory）启用即可用；openai 需要地址与模型，bing 需要 Azure 密钥
  function apiReady() {
    return editor.isTranslationConfigured()
  }

  function setDirection(value) {
    if (direction.value === value) return
    settings.updateApiTranslation({ direction: value })
  }

  function toggleGroup(pUuid) {
    collapsed.value = collapsed.value.includes(pUuid)
      ? collapsed.value.filter((id) => id !== pUuid)
      : [...collapsed.value, pUuid]
  }

  function toggleSubgroup(gUuid) {
    picked.value = { ...picked.value, [gUuid]: !picked.value[gUuid] }
  }

  function selectGroupSubgroups(pUuid) {
    const next = { ...picked.value }
    for (const subgroup of library.subgroupsByGroup[pUuid] || []) next[subgroup.g_uuid] = true
    picked.value = next
  }

  function selectAllSubgroups() {
    const next = {}
    for (const group of library.groups) {
      for (const subgroup of library.subgroupsByGroup[group.p_uuid] || []) {
        next[subgroup.g_uuid] = true
      }
    }
    picked.value = next
  }

  function clearSubgroupSelection() {
    picked.value = {}
  }

  async function translatePickedGroups() {
    const selected = Object.keys(picked.value).filter((gUuid) => picked.value[gUuid])
    // 未配置接口时不发请求，避免用户误以为已调用
    if (!apiReady()) {
      toast.error(t('translate.apiNotConfigured'))
      return
    }
    if (!selected.length) {
      toast.info(t('translate.empty'))
      return
    }

    const texts = []
    const seen = new Set()
    for (const gUuid of selected) {
      for (const tag of await library.tagsOf(gUuid)) {
        const text = String(tag?.text || '').trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        texts.push(text)
      }
    }
    if (!texts.length) {
      toast.info(t('translate.noMissing'))
      return
    }

    groupBusy.value = true
    groupProgress.value = { done: 0, total: texts.length }
    try {
      // translateTexts 内部跳过词库/缓存已有的词，只对缺失词发请求
      const results = await editor.translateTexts(texts, {
        onProgress: (info) => {
          groupProgress.value = { done: info.done, total: info.total }
        }
      })
      // source=api 才代表真的发过请求；全部命中词库/缓存说明没有缺失词
      if (!results.some((item) => item.source === 'api')) {
        toast.info(t('translate.noMissing'))
      } else {
        const ok = results.filter((item) => item.translated).length
        toast.success(t('translate.apiDone', { ok, fail: results.length - ok }))
      }
      syncRows()
      await refreshMissing()
    } catch (error) {
      toast.error(t('translate.apiFailed', { msg: error?.message || String(error) }))
    } finally {
      groupBusy.value = false
      groupProgress.value = null
    }
  }

  // 译文来源以 store 为准，用户正在编辑的草稿优先保留，避免输入被覆盖
  function syncRows() {
    const previous = new Map(rows.value.map((row) => [row.id, row]))
    rows.value = tagCandidates.value.map((token) => {
      const info = editor.translationOf(token)
      const translated = info ? String(info.translated || '') : ''
      const source = info ? info.source : ''
      const old = previous.get(token.id)
      const keepDraft = old && old.dirty && old.text === token.text
      return {
        id: token.id,
        text: token.text,
        translated,
        source,
        draft: keepDraft ? old.draft : translated,
        dirty: false
      }
    })
  }

  async function refreshMissing() {
    missing.value = await editor.missingTranslations()
  }

  async function translateAll() {
    // 整段按逗号/换行切分后逐项翻译，结果保持原文顺序
    const parts = editor.promptText
      .split(/[,，\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) {
      toast.info(t('translate.empty'))
      return
    }

    busyAll.value = true
    try {
      const next = []
      for (const part of parts) next.push(await lookup(part, direction.value))
      segments.value = next
    } finally {
      busyAll.value = false
    }
  }

  function copyAll() {
    copyWithToast(
      segments.value.map((row) => row.translated).join(', '),
      t('toast.copied')
    )
  }

  async function translateMissing() {
    if (!missing.value.length) {
      toast.info(t('translate.empty'))
      return
    }
    // 未配置接口时不发请求，避免用户误以为已调用
    if (!apiReady()) {
      toast.error(t('translate.apiNotConfigured'))
      return
    }

    const texts = missing.value.map((item) => item.text)
    batchBusy.value = true
    progress.value = { done: 0, total: texts.length }
    try {
      // 译文去重后可能与入参数量不同，成功/失败以返回结果为准
      const results = await editor.translateTexts(texts, {
        onProgress: (info) => {
          progress.value = { done: info.done, total: info.total }
        }
      })
      const ok = results.filter((item) => item.translated).length
      toast.success(t('translate.apiDone', { ok, fail: results.length - ok }))
      syncRows()
      await refreshMissing()
    } catch (error) {
      toast.error(t('translate.apiFailed', { msg: error?.message || String(error) }))
    } finally {
      batchBusy.value = false
      progress.value = null
    }
  }

  function translationValue(row) {
    return String(row.draft || row.translated || '').trim()
  }

  function insertable(row) {
    return Boolean(translationValue(row))
  }

  function insertRow(row) {
    const value = translationValue(row)
    if (!value) return
    editor.insertTag(value)
    toast.success(t('toast.added'))
  }

  async function saveRow(row) {
    const value = String(row.draft || '').trim()
    rowBusyId.value = row.id
    try {
      // 保存空译文等价于清除，避免留下 source=manual 的空条目
      if (!value) await editor.clearTranslation(row.id)
      else await editor.saveManualTranslation(row.id, value)
      toast.success(t('toast.saved'))
      syncRows()
      await refreshMissing()
    } finally {
      rowBusyId.value = ''
    }
  }

  async function clearRow(row) {
    rowBusyId.value = row.id
    try {
      await editor.clearTranslation(row.id)
      row.draft = ''
      row.dirty = false
      syncRows()
      await refreshMissing()
    } finally {
      rowBusyId.value = ''
    }
  }

  async function translateRow(row) {
    if (!apiReady()) {
      toast.error(t('translate.apiNotConfigured'))
      return
    }

    rowBusyId.value = row.id
    try {
      const results = await editor.translateTexts([row.text])
      const result = results[0]
      if (!result || result.error) {
        const msg = (result && result.error) || 'empty'
        toast.error(t('translate.apiFailed', { msg }))
      } else {
        row.draft = result.translated
        row.dirty = false
        syncRows()
        await refreshMissing()
      }
    } catch (error) {
      toast.error(t('translate.apiFailed', { msg: error?.message || String(error) }))
    } finally {
      rowBusyId.value = ''
    }
  }

  function downloadText(filename, content, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function exportCache(format) {
    const { filename, content, count } = await cache.exportAll(format)
    downloadText(filename, content, format === 'csv' ? 'text/csv' : 'application/json')
    toast.success(t('translate.exportDone', { n: count }))
  }

  async function clearCache() {
    if (!window.confirm(t('translate.clearConfirm'))) return
    // clearAll 内部已重置 count，无需再读一次数据库
    await cache.clearAll()
    toast.success(t('translate.clearDone'))
    syncRows()
    await refreshMissing()
  }
</script>

<style scoped>
  .translate-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    flex: 1;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
  }

  .section-title {
    font-weight: 600;
    font-size: 13px;
  }

  .trans-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    font-size: 12px;
  }

  .tag-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
  }

  .tag-head {
    font-size: 12px;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
    border: 1px solid var(--border-strong);
  }

  .from {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }

  .arrow {
    color: var(--text-faint);
  }

  .to {
    word-break: break-all;
  }

  .draft {
    width: 100%;
    font-size: 12px;
  }

  .badge {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    font-size: 11px;
    color: var(--text-dim);
  }

  .actions {
    gap: 4px;
  }

  .mini {
    padding: 1px 5px;
    font-size: 12px;
  }

  .hint {
    font-size: 11px;
    margin: 2px 0 4px;
  }

  .sub-head {
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
  }

  .group-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .group-head {
    align-items: center;
    gap: 4px;
    padding: 3px 4px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 12px;
  }

  .group-head:hover {
    background: var(--bg-elev-2);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-name {
    font-weight: 600;
  }

  .sub-list {
    display: flex;
    flex-direction: column;
    padding-left: 18px;
  }

  .sub-pick {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    font-size: 12px;
    cursor: pointer;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 0;
    text-align: center;
  }
</style>
