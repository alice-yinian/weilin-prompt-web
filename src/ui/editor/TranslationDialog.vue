<template>
  <Dialog v-model="visible" :title="t('editor.editTranslation')" width="460px">
    <div v-if="token" class="translation-dialog">
      <div class="field">
        <label>{{ t('translate.from') }}</label>
        <code class="origin">{{ token.text }}</code>
      </div>

      <div class="field">
        <label>
          {{ t('translate.to') }}
          <span class="badge" :class="`source-${source}`">{{ sourceLabel }}</span>
        </label>
        <textarea v-model="draft" rows="3" :placeholder="t('editor.translationPlaceholder')" />
      </div>

      <p v-if="!apiReady" class="faint hint">{{ t('translate.apiNotConfigured') }}</p>
    </div>

    <template #footer>
      <button class="danger" :disabled="!draft" @click="clear">{{ t('editor.clearTranslation') }}</button>
      <button :disabled="busy" @click="translate">{{ busy ? t('translate.progress', { done: 0, total: 1 }) : t('editor.translateSelected') }}</button>
      <div class="spacer"></div>
      <button @click="visible = false">{{ t('common.cancel') }}</button>
      <button class="primary" :disabled="!draft.trim()" @click="save">{{ t('common.save') }}</button>
    </template>
  </Dialog>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Dialog from '../common/Dialog.vue'
  import { useEditorStore } from '../../stores/editor'
  import { useSettingsStore } from '../../stores/settings'
  import { toast } from '../../utils/toast'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    token: { type: Object, default: null }
  })

  const emit = defineEmits(['update:modelValue', 'saved'])

  const { t } = useI18n()
  const editor = useEditorStore()
  const settings = useSettingsStore()

  const draft = ref('')
  const busy = ref(false)

  const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const source = computed(() => props.token?.translateSource || 'manual')
  const apiReady = computed(
    () =>
      settings.apiTranslation.enabled &&
      !!settings.apiTranslation.baseUrl &&
      !!settings.apiTranslation.model
  )
  const sourceLabel = computed(() => {
    const map = {
      library: t('translate.sourceLibrary'),
      cache: t('translate.sourceCache'),
      api: t('translate.sourceApi'),
      manual: t('translate.sourceManual')
    }
    return map[source.value] || source.value
  })

  watch(
    () => [props.modelValue, props.token?.id],
    () => {
      if (!props.modelValue) return
      draft.value = props.token?.translate || ''
    }
  )

  async function translate() {
    if (!props.token) return
    if (!settings.apiTranslation.enabled || !settings.apiTranslation.baseUrl || !settings.apiTranslation.model) {
      toast.error(t('translate.apiNotConfigured'))
      return
    }
    busy.value = true
    try {
      const rows = await editor.translateTexts([props.token.text], { force: true })
      const row = rows[0]
      if (row?.translated) {
        draft.value = row.translated
      } else {
        toast.error(t('translate.apiFailed', { msg: row?.error || '' }))
      }
    } finally {
      busy.value = false
    }
  }

  async function save() {
    if (!props.token) return
    await editor.saveManualTranslation(props.token.id, draft.value)
    toast.success(t('toast.saved'))
    emit('saved', draft.value)
    visible.value = false
  }

  async function clear() {
    if (!props.token) return
    editor.clearTranslation(props.token.id)
    draft.value = ''
    toast.success(t('toast.deleted'))
    visible.value = false
  }
</script>

<style scoped>
  .origin {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  textarea {
    width: 100%;
    resize: vertical;
  }

  .badge {
    margin-left: 6px;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 11px;
  }

  .badge.source-library {
    color: var(--text-dim);
  }

  .badge.source-api {
    color: #4f9dff;
    border-color: #4f9dff;
  }

  .badge.source-manual {
    color: var(--ok);
    border-color: var(--ok);
  }

  .hint {
    font-size: 11px;
    margin: 0;
  }
</style>
