<template>
  <div class="data-page">
    <h1 class="page-title">{{ t('data.title') }}</h1>

    <div class="card">
      <h3>{{ t('data.importTitle') }}</h3>
      <p class="muted">{{ t('data.importHint') }}</p>

      <div class="field">
        <label>{{ t('data.conflictMode') }}</label>
        <select v-model="mode">
          <option value="overwrite">{{ t('data.modeOverwrite') }}</option>
          <option value="merge">{{ t('data.modeMerge') }}</option>
          <option value="skip">{{ t('data.modeSkip') }}</option>
        </select>
      </div>

      <div class="row wrap">
        <input ref="fileInput" type="file" accept=".json,.zip" style="display: none" @change="onFile" />
        <button class="primary" :disabled="importing" @click="fileInput.click()">
          {{ t('data.chooseFile') }}
        </button>
        <span v-if="importing" class="muted">
          {{ t('data.importing', { done: progress.done, total: progress.total }) }}
        </span>
      </div>

      <p v-if="lastImportSummary" class="import-summary">{{ lastImportSummary }}</p>

      <details v-if="warnings.length" class="warnings">
        <summary>{{ t('data.warnings', { n: warnings.length }) }}</summary>
        <ul>
          <li v-for="(warning, index) in warnings.slice(0, 50)" :key="index">{{ warning }}</li>
        </ul>
      </details>
    </div>

    <div class="card">
      <h3>{{ t('data.stats') }}</h3>
      <div class="stat-grid">
        <div class="stat"><span class="faint">{{ t('data.statGroups') }}</span><b>{{ stats.groups }}</b></div>
        <div class="stat"><span class="faint">{{ t('data.statSubgroups') }}</span><b>{{ stats.subgroups }}</b></div>
        <div class="stat"><span class="faint">{{ t('data.statTags') }}</span><b>{{ stats.tags }}</b></div>
        <div class="stat"><span class="faint">{{ t('data.statDict') }}</span><b>{{ stats.dict }}</b></div>
        <div class="stat"><span class="faint">{{ t('data.statHistory') }}</span><b>{{ stats.history }}</b></div>
        <div class="stat"><span class="faint">{{ t('data.statFavorites') }}</span><b>{{ stats.favorites }}</b></div>
      </div>
      <p class="faint">
        {{ lastImportAt ? t('data.lastImport', { time: formatTime(lastImportAt) }) : t('data.never') }}
      </p>
    </div>

    <div class="card">
      <h3>{{ t('data.exportTitle') }}</h3>
      <p class="muted">{{ t('data.exportHint') }}</p>
      <button :disabled="!stats.tags && !stats.dict" @click="doExport">{{ t('data.exportButton') }}</button>
    </div>

    <div class="card">
      <h3>{{ t('data.storageTitle') }}</h3>
      <p class="muted">{{ storageText }}</p>
      <button @click="requestPersist">{{ t('data.persistButton') }}</button>
    </div>

    <div class="card danger-card">
      <h3>{{ t('data.clearTitle') }}</h3>
      <p class="muted">{{ t('data.clearHint') }}</p>
      <button class="danger" @click="clearAll">{{ t('data.clearButton') }}</button>
    </div>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { importBundle } from '../../data/bundle/importBundle'
  import { exportBundle } from '../../data/bundle/exportBundle'
  import { listHistory } from '../../data/repos/history'
  import { listFavorites } from '../../data/repos/favorites'
  import { clearAllData } from '../../data/repos/maintenance'
  import { useLibraryStore } from '../../stores/library'
  import { useEditorStore } from '../../stores/editor'
  import { toast } from '../../utils/toast'
  import { formatBytes, formatTime, timestampSuffix } from '../../utils/format'

  const { t } = useI18n()
  const library = useLibraryStore()
  const editor = useEditorStore()

  const fileInput = ref(null)
  const mode = ref('overwrite')
  const importing = ref(false)
  const progress = reactive({ done: 0, total: 0 })
  const warnings = ref([])
  const lastImportSummary = ref('')
  const lastImportAt = ref(null)
  const stats = ref({ groups: 0, subgroups: 0, tags: 0, dict: 0, history: 0, favorites: 0 })
  const storageInfo = ref({ usage: 0, quota: 0, supported: false })

  const storageText = computed(() => {
    if (!storageInfo.value.supported) return t('data.persistUnsupported')
    return t('data.storageUsage', {
      used: formatBytes(storageInfo.value.usage),
      quota: formatBytes(storageInfo.value.quota)
    })
  })

  onMounted(refreshAll)

  async function refreshAll() {
    const [tags, dict, history, favorites] = await Promise.all([
      library.ensureTagIndex(),
      library.stats(),
      listHistory(),
      listFavorites()
    ])
    stats.value = {
      groups: library.groups.length,
      subgroups: library.subgroups.length,
      tags: tags?.entries?.length ?? 0,
      dict: dict.dict ?? 0,
      history: history.length,
      favorites: favorites.length
    }
    lastImportAt.value = localStorage.getItem('weilin_prompt_web_last_import') || null
    await refreshStorage()
  }

  async function refreshStorage() {
    if (!navigator.storage || !navigator.storage.estimate) {
      storageInfo.value = { usage: 0, quota: 0, supported: false }
      return
    }
    const estimate = await navigator.storage.estimate()
    storageInfo.value = { usage: estimate.usage || 0, quota: estimate.quota || 0, supported: true }
  }

  async function onFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    importing.value = true
    warnings.value = []
    lastImportSummary.value = ''
    try {
      const payload = await readBundleFile(file)
      const result = await importBundle(payload, {
        mode: mode.value,
        onProgress: ({ done, total }) => {
          progress.done = done
          progress.total = total
        }
      })
      warnings.value = result.warnings || []
      lastImportSummary.value = t('data.importDone', {
        imported: result.imported ?? 0,
        skipped: result.skipped ?? 0
      })
      const now = Date.now()
      localStorage.setItem('weilin_prompt_web_last_import', String(now))
      lastImportAt.value = String(now)
      library.reset()
      await library.refresh()
      await refreshAll()
      toast.success(lastImportSummary.value)
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    } finally {
      importing.value = false
      if (fileInput.value) fileInput.value.value = ''
    }
  }

  async function readBundleFile(file) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const { readBundleZip } = await import('../../data/bundle/zip')
      return readBundleZip(file)
    }
    const text = await file.text()
    return JSON.parse(text)
  }

  async function doExport() {
    const bundle = await exportBundle()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `weilin-prompt-bundle-${timestampSuffix()}.json`)
    toast.success(t('data.exported', { name: 'weilin-prompt-bundle' }))
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) {
      toast.info(t('data.persistUnsupported'))
      return
    }
    const granted = await navigator.storage.persist()
    toast[granted ? 'success' : 'error'](granted ? t('data.persistGranted') : t('data.persistDenied'))
    await refreshStorage()
  }

  async function clearAll() {
    if (!window.confirm(t('data.clearConfirm'))) return
    await clearAllData()
    editor.clearAll()
    library.reset()
    await library.refresh()
    await refreshAll()
    toast.success(t('data.cleared'))
  }
</script>

<style scoped>
  .data-page {
    max-width: 760px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 14px;
  }

  .import-summary {
    margin: 10px 0 0;
    color: var(--ok);
  }

  .warnings {
    margin-top: 10px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .warnings ul {
    max-height: 180px;
    overflow: auto;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elev-2);
    font-size: 12px;
  }

  .stat b {
    font-size: 16px;
  }

  .danger-card {
    border-color: var(--danger);
  }
</style>
