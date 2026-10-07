<template>
  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark">WL</span>
      <div class="brand-text">
        <strong>{{ t('app.name') }}</strong>
        <small class="faint">{{ t('app.subtitle') }}</small>
      </div>
    </div>

    <div class="spacer"></div>

    <select class="lang" :value="settings.locale" @change="onLocaleChange">
      <option value="zh_CN">简体中文</option>
      <option value="en_US">English</option>
    </select>

    <button class="ghost" :title="t('theme.switch')" @click="settings.toggleTheme()">
      {{ settings.theme === 'dark' ? '🌙' : '☀️' }}
      {{ settings.theme === 'dark' ? t('theme.dark') : t('theme.light') }}
    </button>
  </header>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import { useSettingsStore } from '../../stores/settings'

  const { t } = useI18n()
  const settings = useSettingsStore()

  function onLocaleChange(event) {
    settings.setLocaleValue(event.target.value)
  }
</script>

<style scoped>
  .top-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 54px;
    padding: 0 16px;
    background: var(--bg-elev);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
    font-size: 12px;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .brand-text small {
    font-size: 11px;
  }

  .lang {
    width: 110px;
  }
</style>
