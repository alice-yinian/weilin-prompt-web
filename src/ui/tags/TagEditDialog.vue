<template>
  <Dialog
    :model-value="modelValue"
    :title="title"
    width="420px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="field">
      <label>{{ t('tags.text') }}</label>
      <input
        ref="textInput"
        v-model="text"
        class="mono"
        :placeholder="t('tags.textPlaceholder')"
        @keyup.enter="submit"
      />
    </div>

    <div class="field">
      <label>{{ t('tags.description') }}</label>
      <input v-model="description" :placeholder="t('tags.descriptionPlaceholder')" />
    </div>

    <div class="field">
      <label>{{ t('common.color') }}</label>
      <div class="row">
        <input v-model="hex" type="color" />
        <input v-model.number="alpha" class="alpha" type="range" min="0" max="1" step="0.05" />
        <span class="faint percent">{{ Math.round(alpha * 100) }}%</span>
        <span class="preview" :style="{ background: toRgba(hex, alpha) }" />
      </div>
    </div>

    <template #footer>
      <button @click="close">{{ t('common.cancel') }}</button>
      <button class="primary" :disabled="!text.trim()" @click="submit">
        {{ t('common.save') }}
      </button>
    </template>
  </Dialog>
</template>

<script setup>
  import { nextTick, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Dialog from '../common/Dialog.vue'
  import { alphaOf, toHex, toRgba } from './color'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    text: { type: String, default: '' },
    description: { type: String, default: '' },
    color: { type: String, default: '' }
  })

  const emit = defineEmits(['update:modelValue', 'save'])

  const { t } = useI18n()

  const textInput = ref(null)
  const text = ref('')
  const description = ref('')
  const hex = ref(toHex(''))
  const alpha = ref(0.4)

  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      text.value = props.text || ''
      description.value = props.description || ''
      hex.value = toHex(props.color)
      alpha.value = alphaOf(props.color)
      nextTick(() => textInput.value?.focus())
    },
    { immediate: true }
  )

  function close() {
    emit('update:modelValue', false)
  }

  function submit() {
    const value = text.value.trim()
    if (!value) return
    emit('save', { text: value, desc: description.value.trim(), color: toRgba(hex.value, alpha.value) })
    close()
  }
</script>

<style scoped>
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .alpha {
    flex: 1;
    padding: 0;
  }

  .percent {
    width: 38px;
    font-size: 12px;
    text-align: right;
  }

  .preview {
    width: 28px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
  }
</style>
