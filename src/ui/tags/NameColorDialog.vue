<template>
  <Dialog
    :model-value="modelValue"
    :title="title"
    width="420px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="field">
      <label>{{ nameLabel }}</label>
      <input
        ref="nameInput"
        v-model="name"
        :placeholder="nameLabel"
        @keyup.enter="submit"
      />
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
      <button class="primary" :disabled="!name.trim()" @click="submit">
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
    // 名称字段的说明文字（分组名称 / 二级分组名称）
    nameLabel: { type: String, default: '' },
    // 打开时的初始值
    name: { type: String, default: '' },
    color: { type: String, default: '' }
  })

  const emit = defineEmits(['update:modelValue', 'save'])

  const { t } = useI18n()

  const nameInput = ref(null)
  const name = ref('')
  const hex = ref(toHex(''))
  const alpha = ref(0.4)

  // 每次打开都用当前记录重置草稿：编辑不同条目时不会残留上一次的输入
  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      name.value = props.name || ''
      hex.value = toHex(props.color)
      alpha.value = alphaOf(props.color)
      nextTick(() => nameInput.value?.focus())
    },
    { immediate: true }
  )

  function close() {
    emit('update:modelValue', false)
  }

  function submit() {
    const value = name.value.trim()
    if (!value) return
    emit('save', { name: value, color: toRgba(hex.value, alpha.value) })
    close()
  }
</script>

<style scoped>
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
