<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-host">
      <div v-for="item in toastState.items" :key="item.id" class="toast" :class="item.type" @click="removeToast(item.id)">
        {{ item.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
  import { removeToast, toastState } from '../../utils/toast'
</script>

<style scoped>
  .toast-host {
    position: fixed;
    right: 18px;
    bottom: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9999;
  }

  .toast {
    padding: 9px 14px;
    border-radius: var(--radius);
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow);
    font-size: 13px;
    cursor: pointer;
    max-width: 380px;
  }

  .toast.success {
    border-color: var(--ok);
  }

  .toast.error {
    border-color: var(--danger);
    color: var(--danger);
  }

  .toast-enter-active,
  .toast-leave-active {
    transition: all 0.2s ease;
  }

  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    transform: translateY(8px);
  }
</style>
