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
      <button class="ghost" :disabled="!editor.hiddenTokens.length" @click="editor.clearHidden()">
        {{ t('editor.clearDisabled') }}
      </button>
      <div class="spacer"></div>
      <button class="ghost danger" @click="editor.clearAll()">{{ t('editor.clearAll') }}</button>
    </div>

    <div v-if="editor.selection.length" class="selection-bar row wrap">
      <span class="faint">{{ t('editor.selectedCount', { n: editor.selection.length }) }}</span>

      <span class="divider"></span>
      <input
        v-model="weightInput"
        class="weight-input"
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

    <div class="chip-area scroll" @dragover.prevent @drop="onDropToEnd">
      <TagChip
        v-for="token in editor.visibleTokens"
        :key="token.id"
        :token="token"
        :selected="editor.selection.includes(token.id)"
        :dragging="draggingId === token.id"
        @pick="onPick(token, $event)"
        @toggle-hidden="editor.toggleHidden(token.id)"
        @drag-start="onDragStart(token, $event)"
        @drop="onDrop(token, $event)"
        @drag-end="draggingId = null"
      />
      <span v-if="!editor.visibleTokens.length" class="faint empty-hint">
        {{ t('editor.dragHint') }}
      </span>
    </div>

    <div class="hidden-zone">
      <div class="row">
        <span class="faint">{{ t('editor.hiddenZone') }}</span>
        <span class="faint">· {{ t('editor.hiddenHint') }}</span>
      </div>
      <div class="chip-area scroll">
        <TagChip
          v-for="token in editor.hiddenTokens"
          :key="token.id"
          :token="token"
          :selected="editor.selection.includes(token.id)"
          @pick="onPick(token, $event)"
          @toggle-hidden="editor.toggleHidden(token.id)"
        />
        <span v-if="!editor.hiddenTokens.length" class="faint">{{ t('editor.noHidden') }}</span>
      </div>
    </div>

    <FavoriteDialog
      v-model="favoriteOpen"
      :text="favoriteText"
      :desc="favoriteDesc"
    />
  </div>
</template>

<script setup>
  import { computed, nextTick, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import TagChip from './TagChip.vue'
  import AutocompleteList from './AutocompleteList.vue'
  import FavoriteDialog from './FavoriteDialog.vue'
  import { useEditorStore } from '../../stores/editor'
  import { useLibraryStore } from '../../stores/library'
  import { useSettingsStore } from '../../stores/settings'
  import { copyWithToast } from '../../utils/clipboard'
  import { toast } from '../../utils/toast'
  import { stripWeight } from '../../core/prompt/weight'
  import { isLoraTag } from '../../core/prompt/loraTag'

  const { t } = useI18n()
  const editor = useEditorStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()

  const textareaRef = ref(null)
  const autocompleteOpen = ref(false)
  const autocompleteItems = ref([])
  const activeIndex = ref(0)
  const draggingId = ref(null)
  const weightInput = ref('1.2')
  const favoriteOpen = ref(false)
  const favoriteText = ref('')
  const favoriteDesc = ref('')

  let autocompleteTimer = null

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
      weightInput.value = String(
        (() => {
          const matched = token.text.match(/:(-?\d+(?:\.\d+)?)$/)
          return matched ? matched[1] : 1.2
        })()
      )
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
    const text = selected
      .map((token) => (token.isLoraTag ? `${token.text},` : isLoraTag(token.text) ? token.text : `${token.text},`))
      .join(' ')
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

  // 供外部（收藏/翻译面板）打开收藏对话框
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

  .weight-input {
    width: 74px;
    padding: 3px 6px;
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
    min-height: 74px;
    max-height: 240px;
  }

  .hidden-zone {
    border-top: 1px dashed var(--border);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }

  .hidden-zone .chip-area {
    min-height: 46px;
    max-height: 120px;
  }

  .empty-hint {
    font-size: 12px;
    align-self: center;
    margin: 0 auto;
  }
</style>
