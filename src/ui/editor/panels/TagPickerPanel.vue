<template>
  <div class="tag-picker">
    <div class="picker-head">
      <input
        v-model="query"
        class="search"
        :placeholder="t('snippetInsert.searchPlaceholder')"
        @input="onSearch"
      />
    </div>

    <div v-if="!library.hasData" class="empty-state faint">
      <p>{{ t('editor.noDataHint') }}</p>
      <button class="primary" @click="router.push('/data')">{{ t('editor.goImport') }}</button>
    </div>

    <template v-else>
      <div v-if="query.trim()" class="result-area scroll">
        <AutocompleteList :items="results" @select="insert" />
        <p v-if="results.length" class="faint limit-hint">
          {{ t('autocomplete.limitReached', { n: settings.autocompleteLimit }) }}
        </p>
      </div>

      <div v-else class="browse-area">
        <div class="group-list scroll">
          <div v-for="group in library.groups" :key="group.p_uuid" class="group-block">
            <div class="group-name" @click="toggleGroup(group.p_uuid)">
              <span>{{ collapsed.includes(group.p_uuid) ? '▸' : '▾' }}</span>
              <span class="dot" :style="{ background: group.color }"></span>
              <span>{{ group.name }}</span>
            </div>
            <div v-if="!collapsed.includes(group.p_uuid)" class="sub-list">
              <div
                v-for="subgroup in library.subgroupsByGroup[group.p_uuid] || []"
                :key="subgroup.g_uuid"
                class="sub-item"
                :class="{ active: subgroup.g_uuid === activeSubgroupId }"
                @click="selectSubgroup(subgroup)"
              >
                {{ subgroup.name }}
              </div>
            </div>
          </div>
        </div>

        <div class="tag-list scroll">
          <div class="row tag-list-head">
            <span class="faint">{{ t('common.count', { n: currentTags.length }) }}</span>
            <div class="spacer"></div>
            <button class="ghost" :disabled="!currentTags.length" @click="insertAll">
              {{ t('snippetInsert.insert') }} ×{{ currentTags.length }}
            </button>
          </div>
          <button
            v-for="tag in currentTags"
            :key="tag.t_uuid"
            class="tag-item"
            :style="{ borderLeftColor: tag.color }"
            @click="insert({ text: tag.text })"
            @mouseenter="schedulePreview(tag, $event)"
            @mousemove="movePreview($event)"
            @mouseleave="hidePreview"
          >
            <img v-if="imageUrls[tag.t_uuid]" class="thumb" :src="imageUrls[tag.t_uuid]" alt="" />
            <span class="tag-body">
              <span class="tag-text">{{ tag.text }}</span>
              <span class="tag-desc faint">{{ tag.desc }}</span>
            </span>
          </button>
          <p v-if="!currentTags.length" class="faint">{{ t('common.empty') }}</p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <img v-if="previewUrl" class="preview-float" :src="previewUrl" :style="previewStyle" alt="" />
    </Teleport>
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import AutocompleteList from '../AutocompleteList.vue'
  import { useLibraryStore } from '../../../stores/library'
  import { useEditorStore } from '../../../stores/editor'
  import { useSettingsStore } from '../../../stores/settings'
  import { getTagImages } from '../../../data/repos/blobs'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const router = useRouter()
  const library = useLibraryStore()
  const editor = useEditorStore()
  const settings = useSettingsStore()

  const query = ref('')
  const results = ref([])
  const collapsed = ref([])
  const activeSubgroupId = ref('')
  const imageUrls = ref({})
  const previewUrl = ref('')
  const previewStyle = ref({})
  let timer = null
  let previewTimer = null

  const currentTags = computed(() => library.tagsOfCached(activeSubgroupId.value))

  onMounted(async () => {
    if (!library.loaded) await library.refresh()
    const firstGroup = library.groups[0]
    if (firstGroup) {
      const firstSub = (library.subgroupsByGroup[firstGroup.p_uuid] || [])[0]
      if (firstSub) await selectSubgroup(firstSub)
    }
  })

  onBeforeUnmount(() => {
    revokeImageUrls()
  })

  function revokeImageUrls() {
    for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url)
    imageUrls.value = {}
  }

  // 缩略图：只为当前二级分组的标签建 objectURL，切分组时全部回收
  async function loadImages(tags) {
    revokeImageUrls()
    if (!tags.length) return
    const map = await getTagImages(tags.map((tag) => tag.t_uuid))
    const urls = {}
    for (const [t_uuid, blob] of map.entries()) urls[t_uuid] = URL.createObjectURL(blob)
    imageUrls.value = urls
  }

  watch(currentTags, (tags) => {
    loadImages(tags)
  })

  function toggleGroup(pUuid) {
    collapsed.value = collapsed.value.includes(pUuid)
      ? collapsed.value.filter((value) => value !== pUuid)
      : collapsed.value.concat(pUuid)
  }

  async function selectSubgroup(subgroup) {
    activeSubgroupId.value = subgroup.g_uuid
    const tags = await library.tagsOf(subgroup.g_uuid)
    await loadImages(tags)
  }

  function onSearch() {
    clearTimeout(timer)
    const value = query.value.trim()
    if (!value) {
      results.value = []
      return
    }
    timer = setTimeout(async () => {
      results.value = await library.autocomplete(value, settings.autocompleteLimit)
    }, 150)
  }

  function normalize(text) {
    return settings.underscoreToSpace ? text.replace(/_/g, ' ') : text
  }

  function insert(item) {
    editor.insertTag(normalize(item.text))
    toast.success(t('toast.added'))
  }

  async function insertAll() {
    editor.insertManyTags(currentTags.value.map((tag) => normalize(tag.text)))
    toast.success(t('toast.added'))
  }

  // 悬停 300ms 看大图（跟随鼠标，超出视口回贴）
  function schedulePreview(tag, event) {
    clearTimeout(previewTimer)
    const url = imageUrls.value[tag.t_uuid]
    if (!url) return
    previewTimer = setTimeout(() => {
      previewUrl.value = url
      movePreview(event)
    }, 300)
  }

  function movePreview(event) {
    if (!previewUrl.value || !event) return
    const size = 320
    const margin = 12
    const x = Math.min(event.clientX + 16, window.innerWidth - size - margin)
    const y = Math.min(event.clientY + 16, window.innerHeight - size - margin)
    previewStyle.value = {
      left: `${Math.max(margin, x)}px`,
      top: `${Math.max(margin, y)}px`,
      maxWidth: `${size}px`,
      maxHeight: `${size}px`
    }
  }

  function hidePreview() {
    clearTimeout(previewTimer)
    previewUrl.value = ''
  }
</script>

<style scoped>
  .tag-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .search {
    width: 100%;
  }

  .browse-area {
    display: flex;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }

  .group-list {
    width: 44%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px;
    font-size: 12px;
  }

  .group-name {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .sub-list {
    margin-left: 14px;
  }

  .sub-item {
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--text-dim);
  }

  .sub-item:hover {
    background: var(--bg-elev-2);
  }

  .sub-item.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .tag-list {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tag-list-head {
    position: sticky;
    top: 0;
    background: var(--bg-elev);
    padding-bottom: 4px;
    z-index: 1;
  }

  .tag-item {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    background: var(--bg-elev-2);
    text-align: left;
    font-size: 12px;
    padding: 3px 6px;
  }

  .thumb {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    object-fit: cover;
    border-radius: 3px;
    border: 1px solid var(--border);
  }

  .tag-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .tag-text {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-desc {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-area {
    flex: 1;
    min-height: 0;
  }

  .limit-hint {
    font-size: 11px;
    text-align: right;
    margin: 4px 0 0;
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

<style>
  /* Teleport 到 body 的浮层，不能用 scoped */
  .preview-float {
    position: fixed;
    z-index: 9500;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--bg-elev);
    pointer-events: none;
    object-fit: contain;
  }
</style>
