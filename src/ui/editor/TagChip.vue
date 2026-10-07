<template>
  <div
    class="chip"
    :class="{
      selected,
      hidden: token.isHidden,
      lora: token.isLoraTag,
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
      <span v-if="token.translate" class="desc">{{ token.translate }}</span>
      <span v-if="token.isHidden" class="hidden-mark">🚫</span>
    </template>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { getWeight } from '../../core/prompt/weight'
  import { parseLoraTag } from '../../core/prompt/loraTag'

  const props = defineProps({
    token: { type: Object, required: true },
    selected: { type: Boolean, default: false },
    dragging: { type: Boolean, default: false }
  })

  defineEmits(['pick', 'toggle-hidden', 'drag-start', 'drop', 'drag-end'])

  const tooltip = computed(() => {
    const token = props.token
    if (token.isRaw) return token.isNewline ? '\\n' : '\\t'
    if (token.isLoraTag) {
      const parsed = parseLoraTag(token.text)
      if (parsed) {
        return `${parsed.name}\nmodel: ${parsed.modelWeight}\ntext: ${parsed.textWeight}\ntrigger: ${parsed.triggerWeight}`
      }
    }
    const weight = getWeight(token.text)
    const parts = [token.text]
    if (token.translate) parts.push(token.translate)
    if (weight !== null) parts.push(`weight: ${weight}`)
    return parts.join('\n')
  })
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

  .chip.hidden {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .chip.lora {
    border-color: #7c5cff;
    background: rgba(124, 92, 255, 0.14);
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
    color: var(--text-faint);
    font-family: inherit;
    font-size: 11px;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hidden-mark {
    font-size: 10px;
  }
</style>
