<template>
  <div class="history-page">
    <h1 class="page-title">{{ t('history.title') }}</h1>
    <HistoryPanel />
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import HistoryPanel from '../editor/panels/HistoryPanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .history-page {
    max-width: 960px;
  }
</style>
