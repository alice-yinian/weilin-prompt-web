<template>
  <div class="translate-page">
    <h1 class="page-title">{{ t('translate.title') }}</h1>

    <div class="card body-card">
      <TranslatePanel />
    </div>
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import TranslatePanel from '../editor/panels/TranslatePanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .translate-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .body-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
  }
</style>
