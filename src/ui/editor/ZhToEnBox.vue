<template>
  <div class="zh-to-en row wrap">
    <span class="label faint">{{ t('editor.zhToEnTitle') }}</span>
    <input
      v-model="text"
      class="input"
      :placeholder="t('editor.zhToEnPlaceholder')"
      :disabled="busy"
      @keydown.enter.prevent="run"
    />
    <button class="ghost" :disabled="busy || !text.trim()" @click="run">
      {{ busy ? t('translate.translating') : t('editor.zhToEnButton') }}
    </button>
    <span v-if="lastResult" class="result faint">{{ lastResult }}</span>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useEditorStore } from '../../stores/editor'
  import { toast } from '../../utils/toast'

  const { t } = useI18n()
  const editor = useEditorStore()

  const text = ref('')
  const busy = ref(false)
  const lastResult = ref('')

  // 中文 → 英文标签：词库反查表优先（不发请求），缺失的走所选翻译服务
  async function run() {
    const value = text.value.trim()
    if (!value) {
      toast.info(t('editor.zhToEnEmpty'))
      return
    }
    busy.value = true
    try {
      const { rows, inserted } = await editor.insertChineseAsTags(value)
      if (inserted.length) {
        lastResult.value = inserted.join(' / ')
        toast.success(t('editor.zhToEnDone', { text: inserted.join(', ') }))
        text.value = ''
        return
      }
      const reason = rows.find((row) => row.error)?.error || ''
      if (reason === 'not-configured') toast.error(t('translate.apiNotConfigured'))
      else toast.error(t('editor.zhToEnFailed', { msg: reason }))
    } catch (error) {
      toast.error(t('editor.zhToEnFailed', { msg: error.message || String(error) }))
    } finally {
      busy.value = false
    }
  }
</script>

<style scoped>
  .zh-to-en {
    gap: 6px;
    padding: 6px 8px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    font-size: 12px;
  }

  .label {
    white-space: nowrap;
  }

  .input {
    flex: 1;
    min-width: 160px;
    padding: 3px 8px;
  }

  .result {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
