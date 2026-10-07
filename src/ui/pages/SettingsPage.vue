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
      <h3>{{ t('settings.apiTranslation') }}</h3>
      <p class="faint hint">{{ t('settings.providerHint') }}</p>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.apiTranslation.enabled"
          @change="settings.updateApiTranslation({ enabled: $event.target.checked })"
        />
        <span>{{ t('settings.apiEnabled') }}</span>
      </label>
      <div class="field">
        <label>{{ t('settings.translateProvider') }}</label>
        <select
          :value="settings.apiTranslation.provider"
          @change="settings.updateApiTranslation({ provider: $event.target.value })"
        >
          <option v-for="provider in providers" :key="provider.id" :value="provider.id">
            {{ t(provider.labelKey) }}
          </option>
        </select>
      </div>

      <div class="field">
        <label>{{ t('settings.defaultDirection') }}</label>
        <div class="row">
          <button
            :class="{ primary: settings.apiTranslation.direction === 'en2zh' }"
            @click="settings.updateApiTranslation({ direction: 'en2zh' })"
          >
            {{ t('settings.dirEn2Zh') }}
          </button>
          <button
            :class="{ primary: settings.apiTranslation.direction === 'zh2en' }"
            @click="settings.updateApiTranslation({ direction: 'zh2en' })"
          >
            {{ t('settings.dirZh2En') }}
          </button>
        </div>
      </div>

      <template v-if="needsBing">
        <div class="field">
          <label>{{ t('settings.bingKey') }}</label>
          <input
            type="password"
            autocomplete="off"
            :value="settings.apiTranslation.bingKey"
            @change="settings.updateApiTranslation({ bingKey: $event.target.value })"
          />
          <span class="faint hint">{{ t('settings.bingHint') }}</span>
        </div>
        <div class="field">
          <label>{{ t('settings.bingRegion') }}</label>
          <input
            :value="settings.apiTranslation.bingRegion"
            placeholder="global"
            @change="settings.updateApiTranslation({ bingRegion: $event.target.value })"
          />
        </div>
      </template>

      <template v-if="needsOpenAi">
      <div class="field">
        <label>{{ t('settings.apiBaseUrl') }}</label>
        <input
          :value="settings.apiTranslation.baseUrl"
          placeholder="https://api.siliconflow.cn/v1"
          @change="settings.updateApiTranslation({ baseUrl: $event.target.value })"
        />
      </div>
      <div class="field">
        <label>{{ t('settings.apiKey') }}</label>
        <input
          type="password"
          :value="settings.apiTranslation.apiKey"
          autocomplete="off"
          @change="settings.updateApiTranslation({ apiKey: $event.target.value })"
        />
        <span class="faint hint">{{ t('settings.apiKeyHint') }}</span>
      </div>
      <div class="field">
        <label>{{ t('settings.apiModel') }}</label>
        <input
          :value="settings.apiTranslation.model"
          placeholder="Qwen/Qwen2.5-7B-Instruct"
          @change="settings.updateApiTranslation({ model: $event.target.value })"
        />
      </div>
      <div class="row wrap">
        <label class="mini-field">
          <span class="faint">{{ t('settings.apiTemperature') }}</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            :value="settings.apiTranslation.temperature"
            @change="settings.updateApiTranslation({ temperature: Number($event.target.value) })"
          />
        </label>
        <label class="mini-field">
          <span class="faint">{{ t('settings.apiBatchSize') }}</span>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            :value="settings.apiTranslation.batchSize"
            @change="settings.updateApiTranslation({ batchSize: Number($event.target.value) })"
          />
        </label>
      </div>
      <div class="field">
        <label>{{ t('settings.apiProxyPrefix') }}</label>
        <input
          :value="settings.apiTranslation.proxyPrefix"
          placeholder="https://your-gateway.example.com/"
          @change="settings.updateApiTranslation({ proxyPrefix: $event.target.value })"
        />
      </div>
      </template>

      <div class="row wrap">
        <button :disabled="testing" @click="runTestConnection">
          {{ testing ? t('settings.testing') : t('settings.testConnection') }}
        </button>
        <span class="faint hint">{{ t('settings.providerHint') }}</span>
      </div>
    </div>

    <div class="card">
      <h3>{{ t('settings.imageOptions') }}</h3>
      <label class="check-row">
        <input
          type="checkbox"
          :checked="settings.imageCompress"
          @change="settings.setFlag('imageCompress', $event.target.checked)"
        />
        <span>{{ t('settings.imageCompress') }}</span>
      </label>
      <div class="row wrap">
        <label class="mini-field">
          <span class="faint">{{ t('settings.imageMaxSize') }}</span>
          <input
            type="number"
            min="64"
            max="2048"
            step="32"
            :disabled="!settings.imageCompress"
            :value="settings.imageMaxSize"
            @change="settings.setImageMaxSize($event.target.value)"
          />
        </label>
        <label class="mini-field">
          <span class="faint">{{ t('settings.imageQuality') }}</span>
          <input
            type="number"
            min="0.1"
            max="1"
            step="0.05"
            :disabled="!settings.imageCompress"
            :value="settings.imageQuality"
            @change="settings.setImageQuality($event.target.value)"
          />
        </label>
      </div>
      <p class="faint hint">{{ t('settings.imageHint') }}</p>
    </div>

    <div class="card">
      <button class="danger" @click="resetAll">{{ t('settings.resetAll') }}</button>
    </div>
  </div>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useSettingsStore } from '../../stores/settings'
  import { PROVIDERS, testConnection } from '../../core/translate/index.js'
  import { toast } from '../../utils/toast'

  const { t } = useI18n()
  const settings = useSettingsStore()
  const testing = ref(false)

  // 服务清单以 core/translate 的 PROVIDERS 为唯一来源
  const providers = PROVIDERS

  const needsOpenAi = computed(() => settings.apiTranslation.provider === 'openai')
  const needsBing = computed(() => settings.apiTranslation.provider === 'bing')

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

  async function runTestConnection() {
    testing.value = true
    try {
      const result = await testConnection(settings.apiTranslation)
      toast[result.ok ? 'success' : 'error'](
        result.ok
          ? t('settings.testOk', { msg: result.message })
          : t('settings.testFail', { msg: result.message })
      )
    } catch (error) {
      toast.error(t('settings.testFail', { msg: error.message || String(error) }))
    } finally {
      testing.value = false
    }
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

  .hint {
    font-size: 11px;
    margin: 4px 0;
  }

  .mini-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;
  }

  .mini-field input {
    width: 110px;
  }
</style>
