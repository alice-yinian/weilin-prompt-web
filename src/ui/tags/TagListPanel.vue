<template>
  <section class="tag-panel">
    <header class="panel-head row">
      <input
        :value="query"
        class="search"
        :placeholder="t('tags.searchPlaceholder')"
        :disabled="!hasSubgroup"
        @input="$emit('update:query', $event.target.value)"
      />
      <button class="primary" :disabled="!hasSubgroup" :title="t('tags.newTag')" @click="$emit('add')">
        ＋
      </button>
    </header>

    <p v-if="!hasSubgroup" class="hint faint">{{ selectHint }}</p>

    <template v-else>
      <div class="row bar">
        <label class="row check">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="someSelected"
            :disabled="!visible.length"
            @change="$emit('select-all', $event.target.checked)"
          />
          {{ t('tags.selectAll') }}
        </label>
        <span v-if="query.trim()" class="faint">
          {{ t('tags.searchResult', { n: visible.length, total }) }}
        </span>
        <span v-else class="faint">{{ t('common.count', { n: total }) }}</span>
        <span class="spacer" />
        <span class="faint">{{ t('tags.selectedCount', { n: selected.length }) }}</span>
        <button class="danger" :disabled="!selected.length" @click="$emit('delete-selected')">
          {{ t('tags.deleteSelected') }}
        </button>
      </div>

      <p v-if="!visible.length" class="hint faint">
        {{ query.trim() ? t('tags.noResults') : t('tags.emptyTags') }}
      </p>
      <ul v-else class="scroll list">
        <li
          v-for="(tag, index) in visible"
          :key="tag.t_uuid"
          class="item row"
          :class="{ active: selected.includes(tag.t_uuid) }"
          :style="{ borderLeftColor: tag.color }"
        >
          <input
            type="checkbox"
            :checked="selected.includes(tag.t_uuid)"
            :aria-label="tag.text"
            @change="$emit('select', tag.t_uuid)"
          />
          <div class="body" @click="$emit('edit', tag)">
            <div class="text mono">{{ tag.text }}</div>
            <div v-if="tag.desc" class="desc faint">{{ tag.desc }}</div>
          </div>
          <div class="ops row">
            <button
              class="ghost"
              :disabled="!sortable || index === 0"
              :title="t('tags.moveUp')"
              @click="$emit('move', tag.t_uuid, -1)"
            >
              ↑
            </button>
            <button
              class="ghost"
              :disabled="!sortable || index === visible.length - 1"
              :title="t('tags.moveDown')"
              @click="$emit('move', tag.t_uuid, 1)"
            >
              ↓
            </button>
            <button class="ghost" :title="t('common.edit')" @click="$emit('edit', tag)">✎</button>
            <button class="ghost" :title="t('common.delete')" @click="$emit('remove', tag)">✕</button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup>
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps({
    // 过滤后的标签（展示顺序即库内顺序）
    visible: { type: Array, default: () => [] },
    // 当前二级分组下的标签总数（未过滤）
    total: { type: Number, default: 0 },
    // 已选 t_uuid
    selected: { type: Array, default: () => [] },
    query: { type: String, default: '' },
    hasSubgroup: { type: Boolean, default: false },
    selectHint: { type: String, default: '' },
    // 搜索过滤时上下移动的参照项不在可见列表里，禁用避免混乱
    sortable: { type: Boolean, default: true }
  })

  defineEmits(['update:query', 'add', 'select', 'select-all', 'edit', 'remove', 'move', 'delete-selected'])

  const { t } = useI18n()

  const allSelected = computed(
    () => props.visible.length > 0 && props.visible.every((tag) => props.selected.includes(tag.t_uuid))
  )
  const someSelected = computed(() => !allSelected.value && props.visible.some((tag) => props.selected.includes(tag.t_uuid)))
</script>

<style scoped>
  .tag-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .panel-head {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }

  .search {
    width: 100%;
  }

  .bar {
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .check {
    gap: 5px;
    cursor: pointer;
  }

  .list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
  }

  .item {
    gap: 8px;
    padding: 5px 8px;
    border-left: 4px solid transparent;
    border-radius: var(--radius-sm);
  }

  .item:hover {
    background: var(--bg-elev-2);
  }

  .item.active {
    background: var(--accent-soft);
  }

  .body {
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desc {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ops {
    flex: none;
  }

  .ops button {
    padding: 2px 5px;
    line-height: 1.4;
  }

  .hint {
    margin: 10px;
    font-size: 12px;
  }
</style>
