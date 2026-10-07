<template>
  <div class="labels-page">
    <h1 class="page-title">{{ t('labels.title') }}</h1>

    <div class="card body-card">
      <SnippetPanel />
    </div>
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import SnippetPanel from '../editor/panels/SnippetPanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .labels-page {
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
