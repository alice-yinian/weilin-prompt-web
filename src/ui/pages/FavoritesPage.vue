<template>
  <div class="favorites-page">
    <h1 class="page-title">{{ t('favorites.title') }}</h1>
    <FavoritesPanel />
  </div>
</template>

<script setup>
  import { useI18n } from 'vue-i18n'
  import FavoritesPanel from '../editor/panels/FavoritesPanel.vue'

  const { t } = useI18n()
</script>

<style scoped>
  .favorites-page {
    max-width: 960px;
  }
</style>
