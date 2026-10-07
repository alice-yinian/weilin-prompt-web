<template>
  <div class="settings-page">
    <h1 class="page-title">{{ t('settings.title') }}</h1>

    <div class="card">
      <h3>{{ t('settings.language') }}</h3>
      <div class="row">
        <select :value="settings.locale" @change="settings.setLocaleValue($event.target.value)">
          <option value="zh_CN">简体中文</option>
          <option value="en_US">English</option>
        </select>
      </div>
    </div>

    <div class="card">
      <h3>{{ t('settings.theme') }}</h3>
      <div class="row">
        <button :class="{ primary: settings.theme === 'dark' }" @click="settings.setTheme('dark')">
          {{ t('theme.dark') }}
        </button>
        <button :class="{ primary: settings.theme === 'light' }" @click="settings.setTheme('light')">
          {{ t('theme.light') }}
        </button>
      </div>
    </div>

    <div class="card">
      <h3>{{ t('settings.conversions') }}</h3>
      <label v-for="item in conversionItems" :key="item.key" class="check-row">
        <input
          type="checkbox"
          :checked="settings.convertOptions[item.key]"
          @change="settings.updateConvert(item.key, $event.target.checked)"
        />
        <span>{{ t(item.label) }}</span>
      </label>
    </div>

    <div class="card">
      <h3>{{ t('settings.editorOptions') }}</h3>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.bracketEscape"
          @change="settings.setFlag('bracketEscape', $event.target.checked)"
        />
        <span>{{ t('settings.bracketEscape') }}</span>
      </label>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.underscoreToSpace"
          @change="settings.setFlag('underscoreToSpace', $event.target.checked)"
        />
        <span>{{ t('settings.underscoreToSpace') }}</span>
      </label>
      <div class="field">
        <label>{{ t('settings.autocompleteLimit') }}</label>
        <input
          type="number"
          min="1"
          max="200"
          style="width: 120px"
          :value="settings.autocompleteLimit"
          @change="settings.setAutocompleteLimit($event.target.value)"
        />
      </div>
      <div class="field">
        <label>{{ t('settings.defaultColor') }}</label>
        <div class="row">
          <input
            type="color"
            :value="colorHex"
            @input="onColorInput"
          />
          <code class="muted">{{ settings.defaultColor }}</code>
        </div>
      </div>
    </div>

    <div class="card">
      <button class="danger" @click="resetAll">{{ t('settings.resetAll') }}</button>
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useSettingsStore } from '../../stores/settings'
  import { toast } from '../../utils/toast'

  const { t } = useI18n()
  const settings = useSettingsStore()

  const conversionItems = [
    { key: 'comma', label: 'settings.convertComma' },
    { key: 'period', label: 'settings.convertPeriod' },
    { key: 'brackets', label: 'settings.convertBrackets' },
    { key: 'parens', label: 'settings.convertParens' },
    { key: 'angle', label: 'settings.convertAngle' }
  ]

  // rgba(255, 123, 2, .4) -> #ff7b02，便于用原生取色器编辑
  const colorHex = computed(() => {
    const matched = String(settings.defaultColor).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!matched) return '#ff7b02'
    return (
      '#' +
      [matched[1], matched[2], matched[3]]
        .map((value) => Number(value).toString(16).padStart(2, '0'))
        .join('')
    )
  })

  function onColorInput(event) {
    const hex = event.target.value
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    settings.setDefaultColor(`rgba(${r}, ${g}, ${b}, .4)`)
  }

  function resetAll() {
    if (!window.confirm(t('settings.resetConfirm'))) return
    settings.resetAll()
    toast.success(t('settings.saved'))
  }
</script>

<style scoped>
  .settings-page {
    max-width: 720px;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
  }

  h3 {
    margin: 0 0 10px;
    font-size: 14px;
  }

  code {
    font-size: 12px;
  }
</style>
