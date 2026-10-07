<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-mask" @click.self="close">
      <div class="dialog" :style="{ width: width, maxWidth: '92vw' }">
        <header class="dialog-head">
          <strong>{{ title }}</strong>
          <button class="ghost" @click="close">✕</button>
        </header>
        <div class="dialog-body scroll">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="dialog-foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: String, default: '480px' }
  })

  const emit = defineEmits(['update:modelValue'])

  function close() {
    emit('update:modelValue', false)
  }
</script>

<style scoped>
  .dialog-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    z-index: 9000;
  }

  .dialog {
    background: var(--bg-elev);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    max-height: 86vh;
  }

  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .dialog-body {
    padding: 14px;
    overflow: auto;
  }

  .dialog-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
  }
</style>
