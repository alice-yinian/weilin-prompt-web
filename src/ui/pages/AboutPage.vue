<template>
  <div class="about">
    <h1 class="page-title">{{ t('about.title') }}</h1>

    <div class="card">
      <h3>{{ t('app.name') }}</h3>
      <p class="muted">{{ t('app.subtitle') }}</p>
      <ul class="facts">
        <li>
          <span class="faint">{{ t('about.version') }}</span>
          <b>{{ version }}</b>
        </li>
        <li>
          <span class="faint">{{ t('about.license') }}</span>
          <b>GPL-2.0</b>
        </li>
        <li>
          <span class="faint">{{ t('about.upstream') }}</span>
          <a href="https://github.com/weilin9999/WeiLin-Comfyui-Tools" target="_blank" rel="noreferrer">
            weilin9999/WeiLin-Comfyui-Tools
          </a>
        </li>
        <li>
          <span class="faint">{{ t('about.dataSource') }}</span>
          <a href="https://github.com/weilin9999/WeiLin-Comfyui-Tools-Prompt" target="_blank" rel="noreferrer">
            WeiLin-Comfyui-Tools-Prompt (MIT)
          </a>
        </li>
      </ul>
    </div>

    <div class="card">
      <h3>{{ t('about.differences') }}</h3>
      <ul class="facts">
        <li>{{ t('about.diffList.static') }}</li>
        <li>{{ t('about.diffList.lora') }}</li>
        <li>{{ t('about.diffList.removed') }}</li>
      </ul>
      <p class="muted">{{ t('about.importHint') }}</p>
    </div>
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import { APP_VERSION } from '../../utils/version'

  const { t } = useI18n()
  const version = APP_VERSION
</script>

<style scoped>
  .about {
    max-width: 720px;
  }

  .facts {
    margin: 8px 0 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .facts li {
    line-height: 1.6;
  }

  .facts span.faint {
    display: inline-block;
    min-width: 120px;
  }

  a {
    color: var(--accent);
  }
</style>
