<template>
  <div class="translate-panel">
    <div v-if="!library.hasData" class="empty-state faint">
      <p>{{ t('editor.noDataHint') }}</p>
      <button class="primary" @click="router.push('/data')">{{ t('editor.goImport') }}</button>
    </div>

    <template v-else>
      <div class="row wrap head">
        <button class="primary" :disabled="busy" @click="translateAll">
          {{ t('translate.translateAll') }}
        </button>
        <div class="spacer"></div>
        <button class="ghost" :disabled="!segments.length" @click="copyAll">
          {{ t('common.copy') }}
        </button>
      </div>

      <div class="body scroll">
        <p v-if="busy" class="faint">{{ t('common.loading') }}</p>
        <p v-else-if="!segments.length" class="faint">{{ t('translate.empty') }}</p>

        <div v-for="(row, index) in segments" :key="`seg-${index}`" class="trans-row">
          <span class="swatch" :style="{ background: colorOf(row) }"></span>
          <span class="from faint">{{ row.original }}</span>
          <span class="arrow">→</span>
          <span class="to">{{ row.translated || '—' }}</span>
        </div>

        <p v-if="segments.length" class="faint hint">{{ t('translate.missing') }}</p>

        <div class="row wrap sub-head">
          <button :disabled="busy || !tagCandidates.length" @click="translateTags">
            {{ t('editor.translate') }}
          </button>
          <span class="faint">{{ t('common.count', { n: tagCandidates.length }) }}</span>
        </div>

        <p v-if="!tagRows.length" class="faint">{{ t('translate.empty') }}</p>

        <div v-for="(row, index) in tagRows" :key="`tag-${index}`" class="trans-row">
          <span class="swatch" :style="{ background: colorOf(row) }"></span>
          <span class="from faint">{{ row.original }}</span>
          <span class="arrow">→</span>
          <span class="to">{{ row.translated || '—' }}</span>
          <div class="spacer"></div>
          <button class="ghost mini" :disabled="!row.translated" @click="insert(row)">
            {{ t('snippetInsert.insert') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { useEditorStore } from '../../../stores/editor'
  import { useLibraryStore } from '../../../stores/library'
  import { extractText } from '../../../core/search/offlineTranslate'
  import { copyWithToast } from '../../../utils/clipboard'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const router = useRouter()
  const editor = useEditorStore()
  const library = useLibraryStore()

  const segments = ref([])
  const tagRows = ref([])
  const busy = ref(false)

  // 词典 color_id → 颜色，与上游 danbooru_manager.vue 的 colorOptions 对齐
  const DICT_COLORS = [
    '#888888',
    '#FF6666',
    '#66FF66',
    '#6666FF',
    '#FFFF66',
    '#FF66FF',
    '#66FFFF',
    '#FF9966',
    '#FF99CC',
    '#996633'
  ]

  const BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' }

  // 独立页面打开时 library 可能还没加载，hasData 会是空的
  onMounted(async () => {
    if (!library.loaded) await library.refresh()
  })

  // 只翻译普通标签：raw token 无文本，LoRA 标签是 <wlr:…> 结构，查词库没有意义
  const tagCandidates = computed(() =>
    editor.visibleTokens.filter((token) => !token.isRaw && !token.isLoraTag)
  )

  function colorOf(row) {
    if (row.color) return row.color
    if (row.colorId != null && row.colorId >= 0) return DICT_COLORS[row.colorId] || DICT_COLORS[0]
    return 'transparent'
  }

  // 词库键不带括号与权重后缀，查表前先剥掉括号层再剥权重（(cat:1.2) → cat）
  function cleanTag(text) {
    let value = String(text || '').trim()
    while (value.length > 1 && BRACKET_PAIRS[value[0]] === value[value.length - 1]) {
      value = value.slice(1, -1).trim()
    }
    return extractText(value)
  }

  async function lookup(text) {
    const key = cleanTag(text)
    if (!key) return { original: text, translated: '', color: null, colorId: null }
    const result = await library.translate(key)
    return {
      original: text,
      translated: result.translated,
      color: result.color,
      colorId: result.colorId
    }
  }

  async function translateAll() {
    // 整段按逗号/换行切分后逐项翻译，结果保持原文顺序
    const parts = editor.promptText
      .split(/[,，\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) {
      toast.info(t('translate.empty'))
      return
    }

    busy.value = true
    try {
      const rows = []
      for (const part of parts) rows.push(await lookup(part))
      segments.value = rows
    } finally {
      busy.value = false
    }
  }

  async function translateTags() {
    if (!tagCandidates.value.length) {
      toast.info(t('translate.empty'))
      return
    }

    busy.value = true
    try {
      const rows = []
      for (const token of tagCandidates.value) rows.push(await lookup(token.text))
      tagRows.value = rows
    } finally {
      busy.value = false
    }
  }

  function copyAll() {
    copyWithToast(
      segments.value.map((row) => row.translated).join(', '),
      t('toast.copied')
    )
  }

  function insert(row) {
    if (!row.translated) return
    editor.insertTag(row.translated)
    toast.success(t('toast.added'))
  }
</script>

<style scoped>
  .translate-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .head {
    flex-shrink: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    flex: 1;
  }

  .trans-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    font-size: 12px;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
    border: 1px solid var(--border-strong);
  }

  .from {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all;
  }

  .arrow {
    color: var(--text-faint);
  }

  .to {
    word-break: break-all;
  }

  .mini {
    padding: 1px 5px;
    font-size: 12px;
  }

  .hint {
    font-size: 11px;
    margin: 2px 0 4px;
  }

  .sub-head {
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 0;
    text-align: center;
  }
</style>
