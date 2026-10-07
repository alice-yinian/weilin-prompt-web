<template>
  <div
    class="chip"
    :class="{
      selected,
      hidden: token.isHidden,
      raw: token.isRaw,
      dragging: dragging
    }"
    :draggable="!token.isRaw"
    :title="tooltip"
    @click="$emit('pick', $event)"
    @dblclick.stop="$emit('toggle-hidden')"
    @dragstart="$emit('drag-start', $event)"
    @dragover.prevent
    @drop="$emit('drop', $event)"
    @dragend="$emit('drag-end')"
  >
    <span v-if="token.isRaw" class="raw-mark">{{ token.isNewline ? '⏎' : '⇥' }}</span>
    <template v-else>
      <span class="text">{{ token.text }}</span>
      <span
        v-if="token.translate"
        class="desc"
        :class="`source-${token.translateSource || 'cache'}`"
        :title="translateTooltip"
        @dblclick.stop="$emit('edit-translation')"
        >{{ token.translate }}</span
      >
      <span v-else class="desc placeholder" @dblclick.stop="$emit('edit-translation')">＋译</span>
    </template>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { getWeight } from '../../core/prompt/weight'

  const props = defineProps({
    token: { type: Object, required: true },
    selected: { type: Boolean, default: false },
    dragging: { type: Boolean, default: false }
  })

  defineEmits(['pick', 'toggle-hidden', 'drag-start', 'drop', 'drag-end', 'edit-translation'])

  const tooltip = computed(() => {
    const token = props.token
    if (token.isRaw) return token.isNewline ? '\\n' : '\\t'
    const weight = getWeight(token.text)
    const parts = [token.text]
    if (token.translate) parts.push(token.translate)
    if (weight !== null) parts.push(`weight: ${weight}`)
    if (token.isHidden) parts.push('hidden')
    return parts.join('\n')
  })

  const translateTooltip = computed(() => '双击编辑译文')
</script>

<style scoped>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev-2);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
    max-width: 100%;
  }

  .chip.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  /* 隐藏标签：就地变暗 + 划去，仍不参与输出 */
  .chip.hidden {
    opacity: 0.45;
  }

  .chip.hidden .text {
    text-decoration: line-through;
  }

  .chip.hidden .desc {
    text-decoration: line-through;
  }

  .chip.raw {
    color: var(--text-dim);
    min-width: 26px;
    justify-content: center;
  }

  .chip.dragging {
    opacity: 0.4;
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
  }

  .desc {
    font-family: inherit;
    font-size: 11px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desc.placeholder {
    color: var(--text-faint);
    opacity: 0.7;
  }

  .desc.source-library {
    color: var(--text-dim);
  }

  .desc.source-api {
    color: #4f9dff;
  }

  .desc.source-manual {
    color: var(--ok);
  }
</style>
