<template>
  <div class="panel favorites-panel">
    <div class="panel-head row wrap">
      <button class="primary" :disabled="!editor.tokens.length" @click="openAdd">
        {{ t('favorites.add') }}
      </button>
      <span class="spacer" />
      <button :disabled="!selected.length" @click="deleteSelected">
        {{ t('favorites.deleteSelected') }}
      </button>
    </div>

    <p v-if="loading" class="hint faint">{{ t('common.loading') }}</p>
    <p v-else-if="!items.length" class="hint faint">{{ t('favorites.empty') }}</p>

    <ul v-else class="scroll list">
      <li v-for="item in items" :key="item.id" class="item">
        <input
          type="checkbox"
          :checked="selected.includes(item.id)"
          :aria-label="displayName(item)"
          @change="toggleSelect(item.id)"
        />
        <input
          class="swatch"
          type="color"
          :value="hexOf(item.color)"
          :title="t('favorites.colorHint')"
          @change="changeColor(item, $event.target.value)"
        />
        <div class="body">
          <div class="name">{{ displayName(item) }}</div>
          <div class="summary" :title="summaryOf(item)">{{ summaryOf(item) }}</div>
        </div>
        <button class="primary" @click="insert(item)">{{ t('favorites.use') }}</button>
        <button @click="openEdit(item)">{{ t('common.edit') }}</button>
      </li>
    </ul>

    <div v-if="items.length" class="hint faint">{{ t('common.count', { n: items.length }) }}</div>

    <!-- 添加当前提示词为收藏 -->
    <Dialog v-model="addOpen" :title="t('favorites.add')">
      <div class="field">
        <label>{{ t('common.name') }}</label>
        <input v-model="addDraft.name" :placeholder="t('favorites.namePlaceholder')" />
      </div>
      <div class="field">
        <label>{{ t('common.color') }}</label>
        <input v-model="addDraft.hex" type="color" />
      </div>
      <template #footer>
        <button @click="addOpen = false">{{ t('common.cancel') }}</button>
        <button class="primary" @click="confirmAdd">{{ t('common.confirm') }}</button>
      </template>
    </Dialog>

    <!-- 编辑名称 / 颜色 -->
    <Dialog v-model="editOpen" :title="t('common.edit')">
      <div class="field">
        <label>{{ t('common.name') }}</label>
        <input v-model="editDraft.name" :placeholder="t('favorites.namePlaceholder')" />
      </div>
      <div class="field">
        <label>{{ t('common.color') }}</label>
        <input v-model="editDraft.hex" type="color" />
      </div>
      <template #footer>
        <button @click="editOpen = false">{{ t('common.cancel') }}</button>
        <button class="primary" @click="confirmEdit">{{ t('common.save') }}</button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
  import { onActivated, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import {
    addFavorite,
    deleteFavorites,
    listFavorites,
    updateFavorite
  } from '../../../data/repos/favorites'
  import Dialog from '../../common/Dialog.vue'
  import { useEditorStore } from '../../../stores/editor'
  import { useSettingsStore } from '../../../stores/settings'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const editor = useEditorStore()
  const settings = useSettingsStore()

  const items = ref([])
  const selected = ref([])
  const loading = ref(true)
  const addOpen = ref(false)
  const editOpen = ref(false)
  const addDraft = reactive({ name: '', hex: '#ff7b02' })
  const editDraft = reactive({ id: null, name: '', hex: '#ff7b02' })

  // 收藏 tag 是上游格式的 JSON 字符串；解析不了（纯文本收藏）时按原文展示
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

  function displayName(item) {
    const name = String(item?.name ?? '').trim()
    return name || summaryOf(item).slice(0, 20)
  }

  function parseRgba(value) {
    const matched = String(value ?? '').match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
    )
    if (!matched) return null
    return {
      r: Number(matched[1]),
      g: Number(matched[2]),
      b: Number(matched[3]),
      a: matched[4] === undefined ? 1 : Number(matched[4])
    }
  }

  function hexOf(color) {
    const rgba = parseRgba(color) || parseRgba(settings.defaultColor)
    if (!rgba) return '#ff7b02'
    return (
      '#' +
      [rgba.r, rgba.g, rgba.b]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
    )
  }

  // 取色器只给 RGB，透明度沿用原颜色（新建时用设置里的默认色）
  function alphaOf(color) {
    const rgba = parseRgba(color)
    return rgba ? rgba.a : 0.4
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  async function load() {
    loading.value = true
    try {
      items.value = await listFavorites()
      const ids = new Set(items.value.map((item) => item.id))
      selected.value = selected.value.filter((id) => ids.has(id))
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: String(error?.message || error) }))
    } finally {
      loading.value = false
    }
  }

  function toggleSelect(id) {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((value) => value !== id)
      : selected.value.concat(id)
  }

  // 编辑器没内容时收藏无意义，直接禁用入口按钮；这里再兜一次底
  function openAdd() {
    if (!editor.tokens.length) return
    addDraft.name = ''
    addDraft.hex = hexOf(settings.defaultColor)
    addOpen.value = true
  }

  async function confirmAdd() {
    try {
      const tag = JSON.stringify(editor.buildHistoryPayload())
      await addFavorite({
        tag,
        name: addDraft.name.trim(),
        color: hexToRgba(addDraft.hex, alphaOf(settings.defaultColor) || 0.4)
      })
      addOpen.value = false
      await load()
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: String(error?.message || error) }))
    }
  }

  function openEdit(item) {
    editDraft.id = item.id
    editDraft.name = String(item.name ?? '')
    editDraft.hex = hexOf(item.color)
    editOpen.value = true
  }

  async function confirmEdit() {
    const current = items.value.find((item) => item.id === editDraft.id)
    try {
      await updateFavorite(editDraft.id, {
        name: editDraft.name.trim(),
        color: hexToRgba(editDraft.hex, alphaOf(current?.color) || 0.4)
      })
      editOpen.value = false
      await load()
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: String(error?.message || error) }))
    }
  }

  async function changeColor(item, hex) {
    try {
      await updateFavorite(item.id, { color: hexToRgba(hex, alphaOf(item.color) || 0.4) })
      await load()
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: String(error?.message || error) }))
    }
  }

  function insert(item) {
    const raw = String(item?.tag ?? '').trim()
    if (raw.startsWith('{') || raw.startsWith('[')) {
      editor.loadPayload(raw)
    } else {
      editor.insertTag(raw)
    }
    toast.success(t('favorites.use'))
  }

  async function deleteSelected() {
    if (!selected.value.length) return
    try {
      await deleteFavorites(selected.value)
      selected.value = []
      await load()
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: String(error?.message || error) }))
    }
  }

  onMounted(load)

  // 编辑器侧栏用 KeepAlive 缓存面板，重新激活时可能其他入口已改动收藏，需重新拉取
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

  .swatch {
    flex: none;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .summary {
    overflow: hidden;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .hint {
    margin: 0;
    font-size: 12px;
  }
</style>
