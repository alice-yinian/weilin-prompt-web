<template>
  <div class="snippet-panel">
    <div class="row wrap head">
      <button class="primary" @click="openCreate">{{ t('labels.new') }}</button>
      <button :disabled="!items.length" @click="exportJson">{{ t('labels.exportJson') }}</button>
      <button @click="openImport">{{ t('labels.importJson') }}</button>
      <div class="spacer"></div>
      <select v-model="sortMode" @change="onSortChange">
        <option value="manual">{{ t('labels.sortManual') }}</option>
        <option value="time">{{ t('labels.sortTime') }}</option>
        <option value="name">{{ t('labels.sortName') }}</option>
      </select>
    </div>

    <p v-if="loading" class="faint">{{ t('common.loading') }}</p>
    <p v-else-if="!items.length" class="faint empty">{{ t('labels.empty') }}</p>

    <div v-else class="list scroll">
      <div
        v-for="item in sortedItems"
        :key="item.id"
        class="snippet-item"
        :class="{ highlighted: item.highlighted }"
        :style="item.highlighted ? { borderLeftColor: highlightColor } : null"
        :title="t('labels.use')"
        @click="use(item)"
      >
        <div class="row item-head">
          <span v-if="item.pinned" class="pin">⭐</span>
          <span class="name">{{ item.name }}</span>
          <div class="spacer"></div>
          <span class="faint time">{{ formatTime(item.updatedAt) }}</span>
        </div>

        <p class="preview muted">{{ preview(item.content) }}</p>

        <div class="row wrap actions" @click.stop>
          <button
            class="ghost mini"
            :class="{ active: item.pinned }"
            :title="t('labels.pinned')"
            @click="togglePin(item)"
          >
            ⭐
          </button>
          <button
            class="ghost mini"
            :class="{ active: item.highlighted }"
            :title="t('labels.highlight')"
            @click="toggleHighlight(item)"
          >
            ▍
          </button>
          <button class="ghost mini" :title="t('labels.moveUp')" @click="move(item, -1)">↑</button>
          <button class="ghost mini" :title="t('labels.moveDown')" @click="move(item, 1)">↓</button>
          <button class="ghost mini" @click="openEdit(item)">{{ t('common.edit') }}</button>
          <button class="ghost mini" @click="remove(item)">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>

    <Dialog v-model="formOpen" :title="form.id ? t('common.edit') : t('labels.new')">
      <div class="field">
        <label>{{ t('common.name') }}</label>
        <input v-model="form.name" :placeholder="t('labels.namePlaceholder')" />
      </div>
      <div class="field">
        <label>{{ t('labels.contentPlaceholder') }}</label>
        <textarea
          v-model="form.content"
          rows="6"
          :placeholder="t('labels.contentPlaceholder')"
        ></textarea>
      </div>
      <template #footer>
        <button @click="formOpen = false">{{ t('common.cancel') }}</button>
        <button class="primary" :disabled="!form.name.trim()" @click="saveForm">
          {{ t('common.save') }}
        </button>
      </template>
    </Dialog>

    <Dialog v-model="importOpen" :title="t('labels.importPast')" width="560px">
      <p class="faint hint">{{ t('labels.importPastHint') }}</p>
      <div class="field">
        <label>{{ t('labels.importJson') }}</label>
        <textarea v-model="importText" rows="10" placeholder='{"items":[{"name":"…"}]}'></textarea>
      </div>
      <template #footer>
        <button @click="importOpen = false">{{ t('common.cancel') }}</button>
        <button class="primary" :disabled="!importText.trim()" @click="runImport">
          {{ t('common.import') }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Dialog from '../../common/Dialog.vue'
  import { getLabelsPayload, saveLabelsPayload } from '../../../data/repos/labels'
  import { useEditorStore } from '../../../stores/editor'
  import { useSettingsStore } from '../../../stores/settings'
  import { toast } from '../../../utils/toast'
  import { formatTime, timestampSuffix } from '../../../utils/format'

  const { t } = useI18n()
  const editor = useEditorStore()
  const settings = useSettingsStore()

  const PREVIEW_LIMIT = 70

  const items = ref([])
  const loading = ref(true)
  const sortMode = ref('manual')
  const sortTimeDesc = ref(true)
  const sortNameAsc = ref(true)

  const formOpen = ref(false)
  const form = reactive({ id: null, name: '', content: '' })

  const importOpen = ref(false)
  const importText = ref('')

  const highlightColor = computed(() => settings.defaultColor)

  // 排序规则与上游 main_label_manager.vue 一致：手动模式只看 order；
  // 时间/名称模式下置顶优先，高亮与普通条目同优先级
  const sortedItems = computed(() => {
    const list = items.value.slice()
    if (sortMode.value === 'manual') {
      return list.sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
      )
    }

    const compareName = (a, b) => {
      const result = String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
      return sortNameAsc.value ? result : -result
    }
    const compareTime = (a, b) => {
      const result = (a.createdAt ?? 0) - (b.createdAt ?? 0)
      return sortTimeDesc.value ? -result : result
    }

    return list.sort((a, b) => {
      const weight = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1)
      if (weight !== 0) return weight
      if (sortMode.value === 'name') return compareName(a, b) || compareTime(a, b)
      return compareTime(a, b) || compareName(a, b)
    })
  })

  onMounted(load)

  async function load() {
    loading.value = true
    try {
      const payload = await getLabelsPayload()
      items.value = payload.items
      sortMode.value = payload.settings.sortMode || 'manual'
      sortTimeDesc.value = payload.settings.sortTimeDesc !== false
      sortNameAsc.value = payload.settings.sortNameAsc !== false
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message }))
    } finally {
      loading.value = false
    }
  }

  function currentSettings() {
    return {
      sortMode: sortMode.value,
      sortTimeDesc: sortTimeDesc.value,
      sortNameAsc: sortNameAsc.value,
      selectedId: null
    }
  }

  // labels repo 是"全量覆盖"语义：任何变更都整体写回，排序设置一并持久化
  async function persist() {
    try {
      await saveLabelsPayload({ items: items.value, settings: currentSettings() })
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message }))
    }
  }

  function onSortChange() {
    persist()
  }

  function genId() {
    return `label_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  function preview(content) {
    const text = String(content || '').replace(/\s+/g, ' ').trim()
    if (!text) return '—'
    return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text
  }

  function openCreate() {
    form.id = null
    form.name = ''
    form.content = ''
    formOpen.value = true
  }

  function openEdit(item) {
    form.id = item.id
    form.name = item.name
    form.content = item.content
    formOpen.value = true
  }

  async function saveForm() {
    const name = form.name.trim()
    if (!name) return
    const now = Date.now()

    if (form.id) {
      const item = items.value.find((row) => row.id === form.id)
      if (!item) return
      item.name = name
      item.content = form.content
      item.updatedAt = now
    } else {
      const minOrder = items.value.reduce(
        (min, row) => Math.min(min, Number.isFinite(row.order) ? row.order : 0),
        0
      )
      items.value = items.value.concat({
        id: genId(),
        name,
        content: form.content,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        highlighted: false,
        // 新片段排在手动顺序最上方（与上游一致）
        order: minOrder - 1
      })
      sortMode.value = 'manual'
    }

    formOpen.value = false
    await persist()
    toast.success(t('toast.saved'))
  }

  async function togglePin(item) {
    item.pinned = !item.pinned
    item.updatedAt = Date.now()
    await persist()
  }

  async function toggleHighlight(item) {
    item.highlighted = !item.highlighted
    item.updatedAt = Date.now()
    await persist()
  }

  async function move(item, offset) {
    const list = sortedItems.value.slice()
    const index = list.findIndex((row) => row.id === item.id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= list.length) return
    const [moved] = list.splice(index, 1)
    list.splice(target, 0, moved)
    // 上移/下移即手动排序：把当前视觉顺序写回 order
    list.forEach((row, position) => {
      row.order = position
    })
    sortMode.value = 'manual'
    await persist()
  }

  async function remove(item) {
    if (!window.confirm(t('labels.deleteConfirm', { name: item.name }))) return
    items.value = items.value.filter((row) => row.id !== item.id)
    await persist()
    toast.success(t('toast.deleted'))
  }

  function use(item) {
    const content = String(item.content || '').trim()
    if (!content) return
    editor.insertTag(content)
    toast.success(t('toast.added'))
  }

  function exportJson() {
    const payload = {
      items: items.value,
      settings: currentSettings(),
      exportTime: new Date().toISOString(),
      version: 'v1'
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `weilin_prompt_labels_${timestampSuffix()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t('toast.saved'))
  }

  function openImport() {
    importText.value = ''
    importOpen.value = true
  }

  function normalizeImported(raw, index, maxOrder) {
    const now = Date.now()
    const createdAt = Number.isFinite(raw?.createdAt) ? raw.createdAt : now
    return {
      id: raw?.id != null && String(raw.id) ? String(raw.id) : genId(),
      name: String(raw?.name ?? '').trim() || t('common.unknown'),
      content: typeof raw?.content === 'string' ? raw.content : '',
      createdAt,
      updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : createdAt,
      pinned: Boolean(raw?.pinned),
      highlighted: Boolean(raw?.highlighted),
      order: Number.isFinite(raw?.order) ? raw.order : maxOrder + 1 + index
    }
  }

  async function runImport() {
    try {
      const parsed = JSON.parse(importText.value)
      // 兼容旧格式（纯数组）与新格式 {items, settings}
      const source = Array.isArray(parsed) ? parsed : parsed?.items
      if (!Array.isArray(source)) throw new Error(t('labels.importJson'))

      const existing = new Set(items.value.map((row) => row.id))
      let maxOrder = items.value.reduce(
        (max, row) => Math.max(max, Number.isFinite(row.order) ? row.order : -1),
        -1
      )

      const next = items.value.slice()
      let added = 0
      let skipped = 0

      source.forEach((raw, index) => {
        const id = raw?.id != null ? String(raw.id) : ''
        if (id && existing.has(id)) {
          skipped += 1
          return
        }
        const item = normalizeImported(raw, index, maxOrder)
        if (!Number.isFinite(raw?.order)) maxOrder = Math.max(maxOrder, item.order)
        existing.add(item.id)
        next.push(item)
        added += 1
      })

      items.value = next
      importOpen.value = false
      await persist()
      toast.success(t('labels.importDone', { added, skipped }))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message }))
    }
  }
</script>

<style scoped>
  .snippet-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .head {
    flex-shrink: 0;
  }

  .empty {
    padding: 18px 0;
    text-align: center;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    flex: 1;
  }

  .snippet-item {
    border: 1px solid var(--border);
    border-left: 3px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    padding: 7px 9px;
    cursor: pointer;
  }

  .snippet-item:hover {
    border-color: var(--accent);
  }

  .item-head {
    font-size: 13px;
  }

  .name {
    font-weight: 600;
  }

  .pin {
    font-size: 11px;
  }

  .time {
    font-size: 11px;
  }

  .preview {
    margin: 3px 0 5px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }

  .mini {
    padding: 1px 5px;
    font-size: 12px;
  }

  .mini.active {
    color: var(--accent);
    border-color: var(--accent);
  }

  .hint {
    font-size: 11px;
    margin: 0 0 8px;
  }
</style>
