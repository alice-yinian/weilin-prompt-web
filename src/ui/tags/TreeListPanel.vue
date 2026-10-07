<template>
  <section class="tree-panel">
    <header class="panel-head row">
      <span class="panel-title">{{ title }}</span>
      <span class="spacer" />
      <button class="primary" :title="addTitle" @click="$emit('add')">＋</button>
    </header>

    <p v-if="!items.length" class="hint faint">{{ emptyText }}</p>
    <ul v-else class="scroll list">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="item row"
        :class="{ active: item.id === activeId }"
        @click="$emit('select', item.id)"
      >
        <span class="swatch" :style="{ background: item.color }" />
        <div class="body">
          <div class="name">{{ item.name }}</div>
          <div v-if="item.meta" class="meta faint">{{ item.meta }}</div>
        </div>
        <div class="ops row">
          <button
            class="ghost"
            :disabled="index === 0"
            :title="t('tags.moveUp')"
            @click.stop="$emit('move', item.id, -1)"
          >
            ↑
          </button>
          <button
            class="ghost"
            :disabled="index === items.length - 1"
            :title="t('tags.moveDown')"
            @click.stop="$emit('move', item.id, 1)"
          >
            ↓
          </button>
          <button class="ghost" :title="t('common.edit')" @click.stop="$emit('edit', item)">✎</button>
          <button class="ghost" :title="t('common.delete')" @click.stop="$emit('remove', item)">✕</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'

  defineProps({
    // 面板标题与新建按钮的悬浮说明
    title: { type: String, default: '' },
    addTitle: { type: String, default: '' },
    emptyText: { type: String, default: '' },
    // [{ id, name, color, meta? }]
    items: { type: Array, default: () => [] },
    activeId: { type: String, default: '' }
  })

  defineEmits(['add', 'select', 'edit', 'remove', 'move'])

  const { t } = useI18n()
</script>

<style scoped>
  .tree-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .panel-head {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    font-size: 13px;
    font-weight: 600;
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
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    /* 名称过长时换行而不是撑破列宽 */
    align-items: flex-start;
  }

  .item:hover {
    background: var(--bg-elev-2);
  }

  .item.active {
    background: var(--accent-soft);
  }

  .swatch {
    width: 10px;
    height: 10px;
    flex: none;
    margin-top: 4px;
    border-radius: 2px;
    border: 1px solid var(--border-strong);
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-size: 13px;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.35;
  }

  .meta {
    font-size: 11px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .ops {
    flex: none;
    gap: 0;
    white-space: nowrap;
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
