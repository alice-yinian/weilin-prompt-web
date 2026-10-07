<template>
  <div class="app-shell">
    <TopBar />
    <div class="app-body">
      <SideBar />
      <main class="app-content">
        <RouterView />
      </main>
    </div>
    <ToastHost />
  </div>
</template>

<script setup>
  import { RouterView } from 'vue-router'
  import TopBar from './ui/layout/TopBar.vue'
  import SideBar from './ui/layout/SideBar.vue'
  import ToastHost from './ui/common/ToastHost.vue'
</script>

<style scoped>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  .app-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .app-content {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 16px;
  }
</style>
