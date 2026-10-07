<template>
  <div class="labels-page">
    <h1 class="page-title">{{ t('labels.title') }}</h1>
    <SnippetPanel />
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import SnippetPanel from '../editor/panels/SnippetPanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .labels-page {
    max-width: 960px;
  }
</style>
