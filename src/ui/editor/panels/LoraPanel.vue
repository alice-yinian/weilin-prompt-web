<template>
  <div class="lora-panel">
    <div class="add-form">
      <div class="field">
        <label>{{ t('lora.name') }}</label>
        <input v-model="form.name" :placeholder="t('lora.namePlaceholder')" />
      </div>
      <div class="row wrap">
        <label class="mini-field">
          <span class="faint">{{ t('lora.modelWeight') }}</span>
          <input v-model="form.modelWeight" type="number" step="0.05" />
        </label>
        <label class="mini-field">
          <span class="faint">{{ t('lora.textWeight') }}</span>
          <input v-model="form.textWeight" type="number" step="0.05" />
        </label>
        <label class="mini-field">
          <span class="faint">{{ t('lora.triggerWeight') }}</span>
          <input v-model="form.triggerWeight" type="number" step="0.05" />
        </label>
      </div>
      <div class="row">
        <button class="primary" :disabled="!canAdd" @click="add">{{ t('lora.add') }}</button>
        <span class="faint hint">{{ t('lora.hint') }}</span>
      </div>
    </div>

    <div class="list scroll">
      <div v-for="item in loraItems" :key="item.token.id" class="lora-item" :class="{ hidden: item.token.isHidden }">
        <div class="row">
          <span class="name">{{ item.token.text }}</span>
          <div class="spacer"></div>
          <button class="ghost" :title="t('editor.batchHide')" @click="editor.toggleHidden(item.token.id)">
            {{ item.token.isHidden ? '🚫' : '👁' }}
          </button>
          <button class="ghost danger" @click="editor.removeToken(item.token.id)">✕</button>
        </div>
        <div class="row wrap">
          <label class="mini-field">
            <span class="faint">{{ t('lora.modelWeight') }}</span>
            <input
              type="number"
              step="0.05"
              :value="item.parsed.modelWeight"
              @change="update(item.token.id, 'modelWeight', $event.target.value)"
            />
          </label>
          <label class="mini-field">
            <span class="faint">{{ t('lora.textWeight') }}</span>
            <input
              type="number"
              step="0.05"
              :value="item.parsed.textWeight"
              @change="update(item.token.id, 'textWeight', $event.target.value)"
            />
          </label>
          <label class="mini-field">
            <span class="faint">{{ t('lora.triggerWeight') }}</span>
            <input
              type="number"
              step="0.05"
              :value="item.parsed.triggerWeight"
              @change="update(item.token.id, 'triggerWeight', $event.target.value)"
            />
          </label>
          <span v-if="item.parsed.legacy" class="faint legacy">{{ t('lora.legacyHint') }}</span>
        </div>
      </div>

      <p v-if="!loraItems.length" class="faint">{{ t('lora.empty') }}</p>
    </div>
  </div>
</template>

<script setup>
  import { computed, reactive } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useEditorStore } from '../../../stores/editor'
  import { parseLoraTag } from '../../../core/prompt/loraTag'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const editor = useEditorStore()

  const form = reactive({ name: '', modelWeight: 1, textWeight: 1, triggerWeight: 1 })

  const canAdd = computed(() => !!form.name.trim() && !form.name.includes(':'))

  const loraItems = computed(() =>
    editor.loraTokens.map((token) => ({ token, parsed: parseLoraTag(token.text) || {} }))
  )

  function add() {
    if (!canAdd.value) {
      toast.error(t('lora.invalidName'))
      return
    }
    editor.addLoraTag({
      name: form.name.trim(),
      modelWeight: form.modelWeight,
      textWeight: form.textWeight,
      triggerWeight: form.triggerWeight
    })
    form.name = ''
    toast.success(t('toast.added'))
  }

  function update(id, key, value) {
    editor.updateLoraToken(id, { [key]: value })
  }
</script>

<style scoped>
  .lora-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
  }

  .add-form {
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }

  .mini-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
  }

  .mini-field input {
    width: 74px;
    padding: 3px 6px;
  }

  .hint {
    font-size: 11px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .lora-item {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 7px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-elev-2);
  }

  .lora-item.hidden {
    opacity: 0.55;
  }

  .name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legacy {
    font-size: 11px;
    align-self: flex-end;
  }
</style>
