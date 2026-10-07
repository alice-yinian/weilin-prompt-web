<template>
  <div class="editor-page" :style="{ '--panel-width': `${settings.panelWidth}px` }">
    <div class="main-col">
      <PromptEditor ref="promptEditorRef" />
    </div>

    <div
      class="splitter"
      :class="{ dragging: resizeDragging }"
      :title="t('editor.panelWidthHint')"
      @pointerdown="startResize"
      @dblclick="resetWidth"
    >
      <span class="splitter-grip"></span>
    </div>

    <aside class="panel-col">
      <div class="tabs row wrap">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ t(tab.label) }}
        </button>
      </div>

      <div class="panel-body">
        <KeepAlive>
          <component :is="currentComponent" />
        </KeepAlive>
      </div>
    </aside>
  </div>
</template>

<script setup>
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import PromptEditor from '../editor/PromptEditor.vue'
  import TagPickerPanel from '../editor/panels/TagPickerPanel.vue'
  import RandomPanel from '../editor/panels/RandomPanel.vue'
  import SnippetPanel from '../editor/panels/SnippetPanel.vue'
  import HistoryPanel from '../editor/panels/HistoryPanel.vue'
  import FavoritesPanel from '../editor/panels/FavoritesPanel.vue'
  import TranslatePanel from '../editor/panels/TranslatePanel.vue'
  import { useEditorStore } from '../../stores/editor'
  import { useLibraryStore } from '../../stores/library'
  import { useSettingsStore } from '../../stores/settings'
  import { useTranslationStore } from '../../stores/translation'
  import { addHistory } from '../../data/repos/history'

  const { t } = useI18n()
  const editor = useEditorStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const translations = useTranslationStore()

  const promptEditorRef = ref(null)
  const activeTab = ref('tags')
  const resizeDragging = ref(false)

  const tabs = [
    { key: 'tags', label: 'editor.panelTags', component: TagPickerPanel },
    { key: 'translate', label: 'editor.panelTranslate', component: TranslatePanel },
    { key: 'random', label: 'editor.panelRandom', component: RandomPanel },
    { key: 'snippets', label: 'editor.panelSnippets', component: SnippetPanel },
    { key: 'history', label: 'editor.panelHistory', component: HistoryPanel },
    { key: 'favorites', label: 'editor.panelFavorites', component: FavoritesPanel }
  ]

  const currentComponent = computed(
    () => tabs.find((tab) => tab.key === activeTab.value)?.component || TagPickerPanel
  )

  onMounted(async () => {
    if (!library.loaded) await library.refresh()
    // 词库释义 + 译文缓存就绪后再刷新一次双语显示
    await library.ensureTagIndex()
    await translations.refresh()
    editor.refreshTranslations()
  })

  // 右侧面板宽度：拖动分隔条调整（双击复位）
  function startResize(event) {
    event.preventDefault()
    resizeDragging.value = true
    const startX = event.clientX
    const startWidth = settings.panelWidth
    const target = event.currentTarget

    const move = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      settings.setPanelWidth(startWidth + delta)
    }
    const stop = () => {
      resizeDragging.value = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      if (target?.releasePointerCapture) {
        try {
          target.releasePointerCapture(event.pointerId)
        } catch (error) {
          // 指针已释放时忽略
        }
      }
    }

    try {
      target.setPointerCapture(event.pointerId)
    } catch (error) {
      // 不支持指针捕获时退化为全局监听
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function resetWidth() {
    settings.setPanelWidth(400)
  }

  onBeforeUnmount(() => {
    resizeDragging.value = false
  })

  // 历史记录自动保存：内容变化 1.5s 后写入，内容与上次保存一致则跳过
  let saveTimer = null
  watch(
    () => editor.promptText,
    (value) => {
      clearTimeout(saveTimer)
      if (!value || !value.trim()) return
      saveTimer = setTimeout(async () => {
        const snapshot = editor.snapshot()
        if (snapshot === editor.lastSavedSnapshot) return
        await addHistory(snapshot)
        editor.lastSavedSnapshot = snapshot
      }, 1500)
    }
  )
</script>

<style scoped>
  .editor-page {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .main-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .splitter {
    width: 8px;
    flex-shrink: 0;
    cursor: col-resize;
    display: grid;
    place-items: center;
    background: transparent;
    touch-action: none;
  }

  .splitter-grip {
    width: 3px;
    height: 46px;
    border-radius: 2px;
    background: var(--border);
    transition: background 0.15s;
  }

  .splitter:hover .splitter-grip,
  .splitter.dragging .splitter-grip {
    background: var(--accent);
  }

  .panel-col {
    width: var(--panel-width, 400px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    min-height: 0;
  }

  .tabs {
    gap: 4px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }

  .tab {
    padding: 3px 9px;
    font-size: 12px;
    background: transparent;
    border-color: transparent;
    color: var(--text-dim);
  }

  .tab.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-top: 10px;
  }
</style>
