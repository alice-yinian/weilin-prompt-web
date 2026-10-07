<template>
  <div class="translate-page">
    <h1 class="page-title">{{ t('translate.title') }}</h1>
    <TranslatePanel />
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import TranslatePanel from '../editor/panels/TranslatePanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .translate-page {
    max-width: 960px;
  }
</style>
