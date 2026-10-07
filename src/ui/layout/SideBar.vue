<template>
  <nav class="side-bar">
    <RouterLink v-for="item in items" :key="item.name" :to="item.to" class="nav-item">
      <span class="icon">{{ item.icon }}</span>
      <span>{{ t(item.label) }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
  import { RouterLink } from 'vue-router'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const items = [
    { name: 'editor', to: '/editor', icon: '✎', label: 'nav.editor' },
    { name: 'tags', to: '/tags', icon: '🏷', label: 'nav.tags' },
    { name: 'history', to: '/history', icon: '🕘', label: 'nav.history' },
    { name: 'favorites', to: '/favorites', icon: '★', label: 'nav.favorites' },
    { name: 'labels', to: '/labels', icon: '❏', label: 'nav.labels' },
    { name: 'translate', to: '/translate', icon: '文', label: 'nav.translate' },
    { name: 'data', to: '/data', icon: '⇅', label: 'nav.data' },
    { name: 'settings', to: '/settings', icon: '⚙', label: 'nav.settings' },
    { name: 'about', to: '/about', icon: '?', label: 'nav.about' }
  ]
</script>

<style scoped>
  .side-bar {
    width: 190px;
    flex-shrink: 0;
    padding: 10px 8px;
    background: var(--bg-elev);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    text-decoration: none;
    font-size: 13px;
  }

  .nav-item:hover {
    background: var(--bg-elev-2);
    color: var(--text);
  }

  .nav-item.router-link-active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .icon {
    width: 16px;
    text-align: center;
  }
</style>
