<template>
  <div class="prompt-editor">
    <div class="editor-head">
      <span class="faint">{{ t('editor.title') }}</span>
      <div class="spacer"></div>
      <span class="faint">{{ t('editor.tokens', { n: editor.tokenCount }) }}</span>
    </div>

    <div class="textarea-wrap">
      <textarea
        ref="textareaRef"
        class="prompt-textarea scroll"
        :value="editor.inputText"
        :placeholder="t('editor.placeholder')"
        spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
        @blur="scheduleCloseAutocomplete"
      ></textarea>

      <div v-if="autocompleteOpen" class="autocomplete-box">
        <AutocompleteList
          :items="autocompleteItems"
          :active-index="activeIndex"
          @select="acceptAutocomplete"
          @hover="activeIndex = $event"
        />
      </div>
    </div>

    <div class="toolbar row wrap">
      <button class="ghost" @click="copyPrompt">{{ t('editor.copyPrompt') }}</button>
      <button class="ghost" @click="editor.insertRaw('newline')">{{ t('editor.insertNewline') }}</button>
      <button class="ghost" @click="editor.insertRaw('tab')">⇥ Tab</button>
      <button class="ghost" @click="editor.selectAll()">{{ t('common.all') }}</button>
      <button
        class="ghost"
        :class="{ active: showHidden }"
        :title="t('editor.showHiddenToggle')"
        @click="showHidden = !showHidden"
      >
        {{ showHidden ? '👁' : '🚫' }} {{ t('editor.hiddenInline') }}
      </button>
      <button class="ghost" :disabled="!editor.hiddenTokens.length" @click="editor.clearHidden()">
        {{ t('editor.clearDisabled') }}
      </button>
      <button
        class="ghost"
        :disabled="batchTranslating"
        :title="t('editor.batchTranslate')"
        @click="translateAllMissing"
      >
        🌐 {{ batchTranslating ? batchProgress || t('translate.translating') : t('editor.batchTranslate') }}
        <span v-if="missingCount">({{ missingCount }})</span>
      </button>
      <div class="spacer"></div>
      <button class="ghost danger" @click="editor.clearAll()">{{ t('editor.clearAll') }}</button>
    </div>

    <div class="chip-area scroll" @dragover.prevent @drop="onDropToEnd">
      <TagChip
        v-for="token in renderTokens"
        :key="token.id"
        :token="token"
        :selected="editor.selection.includes(token.id)"
        :dragging="draggingId === token.id"
        @pick="onPick(token, $event)"
        @toggle-hidden="editor.toggleHidden(token.id)"
        @edit-translation="openTranslationDialog(token)"
        @drag-start="onDragStart(token, $event)"
        @drop="onDrop(token, $event)"
        @drag-end="draggingId = null"
      />
      <span v-if="!renderTokens.length" class="faint empty-hint">{{ t('editor.dragHint') }}</span>
    </div>

    <div v-if="editor.selection.length" class="selection-bar row wrap">
      <span class="faint">{{ t('editor.selectedCount', { n: editor.selection.length }) }}</span>

      <span class="divider"></span>
      <input
        v-model="weightInput"
        class="mini-input"
        type="number"
        step="0.05"
        :title="t('editor.setWeight')"
        @keydown.enter="applyWeightToSelection"
      />
      <button class="ghost" @click="applyWeightToSelection">{{ t('editor.setWeight') }}</button>

      <span class="divider"></span>
      <button class="ghost" @click="bracketSelection('()')">( )</button>
      <button class="ghost" @click="bracketSelection('[]')">[ ]</button>
      <button class="ghost" @click="bracketSelection('{}')">{ }</button>
      <button class="ghost" @click="bracketSelection('<>')">&lt; &gt;</button>

      <span class="divider"></span>
      <button class="ghost" @click="editor.setHiddenForSelection(true)">{{ t('editor.batchHide') }}</button>
      <button class="ghost" @click="editor.setHiddenForSelection(false)">{{ t('editor.batchShow') }}</button>
      <button class="ghost" @click="copySelection">{{ t('editor.batchCopy') }}</button>
      <button class="ghost danger" @click="editor.removeTokens(editor.selection)">{{ t('editor.batchDelete') }}</button>
      <div class="spacer"></div>
      <button class="ghost" @click="editor.clearSelection()">{{ t('editor.clearSelection') }}</button>
    </div>

    <div v-if="editor.selection.length" class="selection-bar row wrap translation-bar">
      <span class="faint">{{ t('translate.to') }}</span>
      <input
        v-model="translationDraft"
        class="translation-input"
        :placeholder="t('editor.translationPlaceholder')"
        @keydown.enter="saveTranslationToSelection"
      />
      <button class="ghost" :disabled="translating" @click="translateSelection">
        {{ translating ? t('translate.progress', { done: 0, total: 1 }) : t('editor.translateSelected') }}
      </button>
      <button class="ghost" :disabled="!translationDraft.trim()" @click="saveTranslationToSelection">
        {{ t('editor.saveTranslation') }}
      </button>
      <button class="ghost" :disabled="editor.selection.length !== 1" @click="openTranslationDialogForSelection">
        {{ t('editor.editTranslation') }}
      </button>
    </div>

    <FavoriteDialog v-model="favoriteOpen" :text="favoriteText" :desc="favoriteDesc" />
    <TranslationDialog v-model="translationDialogOpen" :token="translationToken" />
  </div>
</template>

<script setup>
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import TagChip from './TagChip.vue'
  import AutocompleteList from './AutocompleteList.vue'
  import FavoriteDialog from './FavoriteDialog.vue'
  import TranslationDialog from './TranslationDialog.vue'
  import { useEditorStore } from '../../stores/editor'
  import { useLibraryStore } from '../../stores/library'
  import { useSettingsStore } from '../../stores/settings'
  import { useTranslationStore } from '../../stores/translation'
  import { copyWithToast } from '../../utils/clipboard'
  import { toast } from '../../utils/toast'
  import { stripWeight } from '../../core/prompt/weight'

  const { t } = useI18n()
  const editor = useEditorStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const translations = useTranslationStore()

  const textareaRef = ref(null)
  const autocompleteOpen = ref(false)
  const autocompleteItems = ref([])
  const activeIndex = ref(0)
  const draggingId = ref(null)
  const weightInput = ref('1.2')
  const favoriteOpen = ref(false)
  const favoriteText = ref('')
  const favoriteDesc = ref('')
  const showHidden = ref(true)
  const translationDraft = ref('')
  const translating = ref(false)
  const translationDialogOpen = ref(false)
  const translationToken = ref(null)
  const missingCount = ref(0)
  const batchTranslating = ref(false)
  const batchProgress = ref('')

  let autocompleteTimer = null

  // 隐藏标签就地显示（变暗+划去），仍不参与输出
  const renderTokens = computed(() =>
    showHidden.value ? editor.tokens : editor.tokens.filter((token) => !token.isHidden)
  )

  // 选中单个标签时把它的译文带进输入框
  watch(
    () => editor.selection.join(','),
    () => {
      const selected = editor.selectionTokens().filter((token) => !token.isRaw)
      translationDraft.value = selected.length === 1 ? selected[0].translate || '' : ''
    }
  )

  function onInput(event) {
    editor.setInput(event.target.value)
    scheduleAutocomplete(event.target.value)
  }

  function scheduleAutocomplete(text) {
    clearTimeout(autocompleteTimer)
    autocompleteTimer = setTimeout(() => runAutocomplete(text), 150)
  }

  async function runAutocomplete(text) {
    const segment = lastSegment(text)
    if (!segment || segment.length > 20) {
      autocompleteOpen.value = false
      return
    }
    const items = await library.autocomplete(segment, settings.autocompleteLimit)
    autocompleteItems.value = items
    activeIndex.value = 0
    autocompleteOpen.value = items.length > 0
  }

  function lastSegment(text) {
    const value = String(text ?? '')
    const cut = Math.max(value.lastIndexOf(','), value.lastIndexOf('\n'))
    return value.slice(cut + 1).trim()
  }

  function scheduleCloseAutocomplete() {
    setTimeout(() => {
      autocompleteOpen.value = false
    }, 150)
  }

  function escapeTag(text) {
    if (!settings.bracketEscape) return text
    return text.replace(/\(([^)]+)\)/g, '\\($1\\)')
  }

  function acceptAutocomplete(item) {
    const raw = settings.underscoreToSpace ? item.text.replace(/_/g, ' ') : item.text
    const value = escapeTag(raw)
    const text = editor.inputText
    const cut = Math.max(text.lastIndexOf(','), text.lastIndexOf('\n'))
    const head = cut >= 0 ? text.slice(0, cut + 1) + ' ' : ''
    editor.setInput(`${head}${value}, `)
    autocompleteOpen.value = false
    nextTick(() => textareaRef.value?.focus())
  }

  function onKeydown(event) {
    if (!autocompleteOpen.value) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        editor.syncText()
        toast.success(t('toast.saved'))
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % autocompleteItems.value.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex.value =
        (activeIndex.value - 1 + autocompleteItems.value.length) % autocompleteItems.value.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = autocompleteItems.value[activeIndex.value]
      if (item) acceptAutocomplete(item)
    } else if (event.key === 'Escape') {
      autocompleteOpen.value = false
    }
  }

  function onPick(token, event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      editor.toggleSelection(token.id)
    } else {
      editor.setSelection([token.id])
      const matched = token.text.match(/:(-?\d+(?:\.\d+)?)$/)
      weightInput.value = matched ? matched[1] : '1.2'
    }
  }

  function applyWeightToSelection() {
    if (!editor.selection.length) return
    editor.setWeightOfSelection(weightInput.value)
  }

  function bracketSelection(type) {
    if (!editor.selection.length) return
    const selected = editor.selectionTokens().filter((token) => !token.isRaw)
    for (const token of selected) {
      const wrapped = token.text.startsWith(type[0]) && token.text.endsWith(type[1])
      if (wrapped) editor.removeTokenBracket(token.id, type)
      else editor.addTokenBracket(token.id, type)
    }
  }

  function copyPrompt() {
    copyWithToast(editor.promptText, t('common.copied'))
  }

  function copySelection() {
    const selected = editor.selectionTokens().filter((token) => !token.isRaw && !token.isHidden)
    if (!selected.length) return
    const text = selected.map((token) => `${token.text},`).join(' ')
    copyWithToast(text, t('common.copied'))
  }

  function onDragStart(token, event) {
    draggingId.value = token.id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', token.id)
  }

  function onDrop(token) {
    if (!draggingId.value || draggingId.value === token.id) return
    editor.moveTokenTo(draggingId.value, token.id, 'before')
    draggingId.value = null
  }

  function onDropToEnd(event) {
    const id = draggingId.value || event.dataTransfer?.getData('text/plain')
    if (!id) return
    const last = editor.tokens[editor.tokens.length - 1]
    if (last && last.id !== id) editor.moveTokenTo(id, last.id, 'after')
    draggingId.value = null
  }

  // 未译数量：作者改词/译文缓存变化时刷新，用在「批量翻译」按钮上
  let missingTimer = null
  watch(
    () => [editor.promptText, editor.tokens.length, translations.count],
    () => {
      clearTimeout(missingTimer)
      missingTimer = setTimeout(refreshMissingCount, 300)
    }
  )

  onMounted(async () => {
    await nextTick()
    refreshMissingCount()
  })

  async function refreshMissingCount() {
    missingCount.value = (await editor.missingTranslations()).length
  }

  async function translateAllMissing() {
    const missing = await editor.missingTranslations()
    if (!missing.length) {
      toast.info(t('translate.noMissing'))
      return
    }
    if (!editor.isTranslationConfigured()) {
      toast.error(t('translate.apiNotConfigured'))
      return
    }
    batchTranslating.value = true
    try {
      const rows = await editor.translateTexts(missing.map((item) => item.text), {
        onProgress: ({ done, total }) => {
          batchProgress.value = t('translate.progress', { done, total })
        }
      })
      const ok = rows.filter((row) => row.translated).length
      if (ok) toast.success(t('translate.apiDone', { ok, fail: rows.length - ok }))
      else toast.error(t('translate.apiFailed', { msg: rows[0]?.error || '' }))
      await refreshMissingCount()
    } finally {
      batchTranslating.value = false
      batchProgress.value = ''
    }
  }

  function selectionTextTokens() {
    return editor.selectionTokens().filter((token) => !token.isRaw)
  }

  async function translateSelection() {
    const targets = selectionTextTokens()
    if (!targets.length) return
    translating.value = true
    try {
      const result = await editor.translateSelectedTokens(targets.map((token) => token.id))
      if (result.ok) {
        toast.success(t('translate.apiDone', { ok: result.ok, fail: result.fail }))
        const first = targets[0]
        const refreshed = editor.tokens.find((token) => token.id === first.id)
        if (targets.length === 1) translationDraft.value = refreshed?.translate || translationDraft.value
      } else {
        toast.error(t('translate.apiFailed', { msg: '' }))
      }
    } finally {
      translating.value = false
    }
  }

  async function saveTranslationToSelection() {
    const value = translationDraft.value.trim()
    if (!value) return
    for (const token of selectionTextTokens()) {
      await editor.saveManualTranslation(token.id, value)
    }
    toast.success(t('toast.saved'))
  }

  function openTranslationDialog(token) {
    translationToken.value = token
    translationDialogOpen.value = true
  }

  function openTranslationDialogForSelection() {
    const target = selectionTextTokens()[0]
    if (target) openTranslationDialog(target)
  }

  // 供外部（收藏面板）打开收藏对话框
  function openFavoriteFor(token) {
    favoriteText.value = stripWeight(token?.text || editor.promptText)
    favoriteDesc.value = token?.translate || ''
    favoriteOpen.value = true
  }

  const selectionHasText = computed(() => editor.selectionTokens().some((token) => !token.isRaw))

  defineExpose({ openFavoriteFor, selectionHasText })
</script>

<style scoped>
  .prompt-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .editor-head {
    display: flex;
    align-items: center;
    font-size: 12px;
  }

  .textarea-wrap {
    position: relative;
  }

  .prompt-textarea {
    width: 100%;
    min-height: 170px;
    max-height: 340px;
    resize: vertical;
    line-height: 1.6;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
  }

  .autocomplete-box {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 40;
  }

  .toolbar {
    gap: 6px;
  }

  .toolbar button.active {
    color: var(--accent);
    border-color: var(--accent);
  }

  .selection-bar {
    gap: 5px;
    padding: 6px 8px;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .divider {
    width: 1px;
    height: 18px;
    background: var(--border-strong);
  }

  .mini-input {
    width: 74px;
    padding: 3px 6px;
  }

  .translation-bar .translation-input {
    flex: 1;
    min-width: 140px;
    padding: 3px 8px;
  }

  .chip-area {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-content: flex-start;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-input);
    min-height: 90px;
    max-height: 340px;
    flex: 1;
  }

  .empty-hint {
    font-size: 12px;
    align-self: center;
    margin: 0 auto;
  }
</style>
