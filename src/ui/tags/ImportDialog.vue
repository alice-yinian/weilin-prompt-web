<template>
  <Dialog
    :model-value="modelValue"
    :title="t('tags.importPreview')"
    width="460px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="file faint">{{ fileName }}</p>

    <ul class="counts">
      <li v-if="counts.groups">
        <span>{{ t('tags.groups') }}</span><b>{{ counts.groups }}</b>
      </li>
      <li v-if="counts.subgroups">
        <span>{{ t('tags.subgroups') }}</span><b>{{ counts.subgroups }}</b>
      </li>
      <li>
        <span>{{ t('tags.tags') }}</span><b>{{ counts.tags }}</b>
      </li>
      <li v-if="counts.skipped">
        <span>{{ t('tags.previewSkipped') }}</span><b>{{ counts.skipped }}</b>
      </li>
    </ul>

    <div class="field">
      <label>{{ t('tags.previewTarget') }}</label>
      <p class="muted target">{{ targetText }}</p>
    </div>

    <template #footer>
      <button :disabled="busy" @click="$emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </button>
      <button
        class="primary"
        :disabled="busy || (!counts.tags && !counts.groups && !counts.subgroups)"
        @click="$emit('confirm')"
      >
        {{ busy ? t('common.loading') : t('common.confirm') }}
      </button>
    </template>
  </Dialog>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import Dialog from '../common/Dialog.vue'

  defineProps({
    modelValue: { type: Boolean, default: false },
    fileName: { type: String, default: '' },
    // { groups, subgroups, tags, skipped }
    counts: {
      type: Object,
      default: () => ({ groups: 0, subgroups: 0, tags: 0, skipped: 0 })
    },
    // 解析结果会写到哪儿（当前二级分组 / 按文件结构）
    targetText: { type: String, default: '' },
    busy: { type: Boolean, default: false }
  })

  defineEmits(['update:modelValue', 'confirm'])

  const { t } = useI18n()
</script>

<style scoped>
  .file {
    margin: 0 0 10px;
    font-size: 12px;
    word-break: break-all;
  }

  .counts {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }

  .counts li {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px dashed var(--border);
    font-size: 13px;
  }

  .target {
    margin: 0;
    font-size: 13px;
  }
</style>
