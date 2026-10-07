<template>
  <div class="panel history-panel">
    <div class="panel-head row wrap">
      <input
        v-model="query"
        class="search-input"
        type="search"
        :placeholder="t('common.search')"
      />
      <span class="spacer" />
      <button :disabled="!selected.length" @click="deleteSelected">
        {{ t('history.deleteSelected') }}
      </button>
      <button class="danger" :disabled="!items.length" @click="clearAll">
        {{ t('history.clearAll') }}
      </button>
    </div>

    <p v-if="loading" class="hint faint">{{ t('common.loading') }}</p>
    <p v-else-if="!items.length" class="hint faint">{{ t('history.empty') }}</p>
    <p v-else-if="!filtered.length" class="hint faint">{{ t('common.empty') }}</p>

    <ul v-else class="scroll list">
      <li v-for="(item, index) in filtered" :key="item.id" class="item">
        <input
          type="checkbox"
          :checked="selected.includes(item.id)"
          :aria-label="summaryOf(item)"
          @change="toggleSelect(item.id)"
        />
        <span class="index faint">{{ index + 1 }}</span>
        <div class="body">
          <div class="time faint">{{ formatTime(item.create_time) }}</div>
          <div class="summary" :title="summaryOf(item)">{{ summaryOf(item) }}</div>
        </div>
        <button class="primary" @click="use(item)">{{ t('history.use') }}</button>
        <button class="ghost remove" :title="t('common.delete')" @click="remove(item.id)">✕</button>
      </li>
    </ul>

    <div v-if="items.length" class="hint faint">{{ t('common.count', { n: filtered.length }) }}</div>
  </div>
</template>

<script setup>
  import { computed, onActivated, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { clearHistory, deleteHistory, listHistory } from '../../../data/repos/history'
  import { useEditorStore } from '../../../stores/editor'
  import { formatTime } from '../../../utils/format'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const editor = useEditorStore()

  const items = ref([])
  const selected = ref([])
  const query = ref('')
  const loading = ref(true)

  const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return items.value
    return items.value.filter((item) => summaryOf(item).toLowerCase().includes(keyword))
  })

  // 历史 tag 是上游格式的 JSON 字符串；解析不了（纯文本历史）时按原文展示
  function summaryOf(item) {
    const raw = String(item?.tag ?? '')
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const text = String(parsed.prompt ?? parsed.text ?? '').replace(/\s+/g, ' ').trim()
        if (text) return text
      }
    } catch {
      // 非 JSON：直接落到原文
    }
    return raw.replace(/\s+/g, ' ').trim()
  }

  async function load() {
    loading.value = true
    try {
      items.value = await listHistory()
      const ids = new Set(items.value.map((item) => item.id))
      selected.value = selected.value.filter((id) => ids.has(id))
    } catch (error) {
      toast.error(String(error?.message || error))
    } finally {
      loading.value = false
    }
  }

  function toggleSelect(id) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((value) => value !== id)
      : selected.value.concat(id)
  }

  function use(item) {
    editor.loadPayload(item.tag)
    toast.success(t('history.use'))
  }

  async function remove(id) {
    try {
      await deleteHistory([id])
      await load()
    } catch (error) {
      toast.error(String(error?.message || error))
    }
  }

  async function deleteSelected() {
    if (!selected.value.length) return
    try {
      await deleteHistory(selected.value)
      selected.value = []
      await load()
    } catch (error) {
      toast.error(String(error?.message || error))
    }
  }

  async function clearAll() {
    if (!window.confirm(t('history.clearConfirm'))) return
    try {
      await clearHistory()
      selected.value = []
      await load()
    } catch (error) {
      toast.error(String(error?.message || error))
    }
  }

  onMounted(load)

  // 编辑器侧栏用 KeepAlive 缓存面板，重新激活时可能已有新历史写入，需重新拉取
  let activatedOnce = false
  onActivated(() => {
    if (activatedOnce) load()
    activatedOnce = true
  })
</script>

<style scoped>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .search-input {
    width: 220px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 60vh;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .index {
    width: 22px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .time {
    font-size: 11px;
  }

  .summary {
    overflow: hidden;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .remove {
    padding: 4px 8px;
  }

  .hint {
    margin: 0;
    font-size: 12px;
  }
</style>
