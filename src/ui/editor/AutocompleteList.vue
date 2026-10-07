<template>
  <div class="ac-list scroll">
    <div v-if="!items.length" class="ac-empty faint">{{ t('autocomplete.empty') }}</div>
    <button
      v-for="(item, index) in items"
      :key="item.text + index"
      class="ac-item"
      :class="{ active: index === activeIndex }"
      @mouseenter="$emit('hover', index)"
      @click="$emit('select', item)"
    >
      <span class="ac-color" :style="{ background: item.color || 'transparent' }"></span>
      <span class="ac-text">{{ item.text }}</span>
      <span class="ac-desc faint">{{ item.desc }}</span>
      <span v-if="item.source === 'dict'" class="ac-badge faint">{{ t('autocomplete.fromDict') }}</span>
    </button>
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'

  defineProps({
    items: { type: Array, default: () => [] },
    activeIndex: { type: Number, default: 0 }
  })

  defineEmits(['select', 'hover'])

  const { t } = useI18n()
</script>

<style scoped>
  .ac-list {
    max-height: 260px;
    overflow: auto;
    background: var(--bg-elev);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 4px;
  }

  .ac-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    font-size: 13px;
  }

  .ac-item.active {
    background: var(--accent-soft);
  }

  .ac-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ac-text {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text);
  }

  .ac-desc {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ac-badge {
    font-size: 11px;
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 4px;
  }

  .ac-empty {
    padding: 10px;
    text-align: center;
  }
</style>
