<template>
  <section class="tag-panel">
    <header class="panel-head row">
      <input
        :value="query"
        class="search"
        :placeholder="t('tags.searchPlaceholder')"
        :disabled="!hasSubgroup"
        @input="$emit('update:query', $event.target.value)"
      />
      <button class="primary" :disabled="!hasSubgroup" :title="t('tags.newTag')" @click="$emit('add')">
        ＋
      </button>
    </header>

    <p v-if="!hasSubgroup" class="hint faint">{{ selectHint }}</p>

    <template v-else>
      <div class="row bar">
        <label class="row check">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="someSelected"
            :disabled="!visible.length"
            @change="$emit('select-all', $event.target.checked)"
          />
          {{ t('tags.selectAll') }}
        </label>
        <span v-if="query.trim()" class="faint">
          {{ t('tags.searchResult', { n: visible.length, total }) }}
        </span>
        <span v-else class="faint">{{ t('common.count', { n: total }) }}</span>
        <span class="spacer" />
        <span class="faint">{{ t('tags.selectedCount', { n: selected.length }) }}</span>
        <button class="danger" :disabled="!selected.length" @click="$emit('delete-selected')">
          {{ t('tags.deleteSelected') }}
        </button>
      </div>

      <p v-if="!visible.length" class="hint faint">
        {{ query.trim() ? t('tags.noResults') : t('tags.emptyTags') }}
      </p>
      <ul v-else class="scroll list">
        <li
          v-for="(tag, index) in visible"
          :key="tag.t_uuid"
          class="item row"
          :class="{ active: selected.includes(tag.t_uuid), 'drop-active': dropTarget === tag.t_uuid }"
          :style="{ borderLeftColor: tag.color }"
          @dragover.prevent="onDragOver(tag, $event)"
          @dragleave="onDragLeave(tag)"
          @drop.prevent="onDrop(tag, $event)"
        >
          <input
            type="checkbox"
            :checked="selected.includes(tag.t_uuid)"
            :aria-label="tag.text"
            @change="$emit('select', tag.t_uuid)"
          />
          <div
            class="thumb"
            :title="imageUrls[tag.t_uuid] ? t('tags.replaceImage') : t('tags.uploadImage')"
            @click.stop="openImagePicker(tag.t_uuid)"
            @mouseenter="startPreview(tag, $event)"
            @mousemove="movePreview($event)"
            @mouseleave="endPreview"
            @contextmenu.prevent.stop="onRemoveImage(tag)"
          >
            <img
              v-if="imageUrls[tag.t_uuid]"
              class="thumb-img"
              :src="imageUrls[tag.t_uuid]"
              :alt="tag.text"
            />
            <span v-else class="thumb-empty">🖼</span>
            <span v-if="dropTarget === tag.t_uuid && !imageUrls[tag.t_uuid]" class="thumb-drop">
              {{ t('tags.dropImageHint') }}
            </span>
            <button
              v-if="imageUrls[tag.t_uuid]"
              class="thumb-remove"
              :title="t('tags.removeImage')"
              @click.stop="onRemoveImage(tag)"
            >
              ✕
            </button>
          </div>
          <div class="body" @click="$emit('edit', tag)">
            <div class="text mono">{{ tag.text }}</div>
            <div v-if="tag.desc" class="desc faint">{{ tag.desc }}</div>
          </div>
          <div class="ops row">
            <button
              class="ghost"
              :disabled="!sortable || index === 0"
              :title="t('tags.moveUp')"
              @click="$emit('move', tag.t_uuid, -1)"
            >
              ↑
            </button>
            <button
              class="ghost"
              :disabled="!sortable || index === visible.length - 1"
              :title="t('tags.moveDown')"
              @click="$emit('move', tag.t_uuid, 1)"
            >
              ↓
            </button>
            <button class="ghost" :title="t('common.edit')" @click="$emit('edit', tag)">✎</button>
            <button class="ghost" :title="t('common.delete')" @click="$emit('remove', tag)">✕</button>
          </div>
        </li>
      </ul>
    </template>

    <input
      ref="imageInput"
      class="hidden-input"
      type="file"
      accept="image/*"
      @change="onImagePicked"
    />

    <Teleport to="body">
      <div
        v-if="preview.show"
        class="image-preview"
        :style="{ left: `${preview.x}px`, top: `${preview.y}px` }"
      >
        <img :src="preview.url" alt="" @load="onPreviewLoad" />
      </div>
    </Teleport>
  </section>
</template>

<script setup>
  import { computed, onUnmounted, reactive, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps({
    // 过滤后的标签（展示顺序即库内顺序）
    visible: { type: Array, default: () => [] },
    // 当前二级分组下的标签总数（未过滤）
    total: { type: Number, default: 0 },
    // 已选 t_uuid
    selected: { type: Array, default: () => [] },
    query: { type: String, default: '' },
    hasSubgroup: { type: Boolean, default: false },
    selectHint: { type: String, default: '' },
    // 搜索过滤时上下移动的参照项不在可见列表里，禁用避免混乱
    sortable: { type: Boolean, default: true },
    // t_uuid → 缩略图 objectURL（由父组件创建/回收）
    imageUrls: { type: Object, default: () => ({}) }
  })

  const emit = defineEmits([
    'update:query',
    'add',
    'select',
    'select-all',
    'edit',
    'remove',
    'move',
    'delete-selected',
    'upload-image',
    'remove-image'
  ])

  const { t } = useI18n()

  const allSelected = computed(
    () => props.visible.length > 0 && props.visible.every((tag) => props.selected.includes(tag.t_uuid))
  )
  const someSelected = computed(() => !allSelected.value && props.visible.some((tag) => props.selected.includes(tag.t_uuid)))

  const imageInput = ref(null)
  const pickTarget = ref('')
  const dropTarget = ref('')

  const preview = reactive({ show: false, url: '', x: 0, y: 0, width: 0, height: 0 })
  const pointer = { x: 0, y: 0 }
  let previewTimer = 0

  const PREVIEW_DELAY = 300
  const PREVIEW_OFFSET = 16
  const PREVIEW_PAD = 8

  function openImagePicker(t_uuid) {
    pickTarget.value = t_uuid
    if (imageInput.value) imageInput.value.value = ''
    imageInput.value?.click()
  }

  function onImagePicked(event) {
    const file = event.target.files?.[0]
    if (imageInput.value) imageInput.value.value = ''
    if (file) emit('upload-image', { t_uuid: pickTarget.value, file })
  }

  function onRemoveImage(tag) {
    if (!props.imageUrls[tag.t_uuid]) return
    emit('remove-image', tag.t_uuid)
  }

  /* ---------- 拖拽上传 ---------- */

  function onDragOver(tag, event) {
    if (!event.dataTransfer?.types?.includes('Files')) return
    dropTarget.value = tag.t_uuid
  }

  function onDragLeave(tag) {
    if (dropTarget.value === tag.t_uuid) dropTarget.value = ''
  }

  function onDrop(tag, event) {
    dropTarget.value = ''
    const file = event.dataTransfer?.files?.[0]
    // 只认图片，避免把任意文件丢进去
    if (file && file.type.startsWith('image/')) emit('upload-image', { t_uuid: tag.t_uuid, file })
  }

  /* ---------- 悬停大图 ---------- */

  function startPreview(tag, event) {
    const url = props.imageUrls[tag.t_uuid]
    if (!url) return
    pointer.x = event.clientX
    pointer.y = event.clientY
    window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(() => {
      preview.url = url
      preview.width = 0
      preview.height = 0
      preview.show = true
      placePreview()
    }, PREVIEW_DELAY)
  }

  function movePreview(event) {
    pointer.x = event.clientX
    pointer.y = event.clientY
    if (preview.show) placePreview()
  }

  function endPreview() {
    window.clearTimeout(previewTimer)
    preview.show = false
    preview.url = ''
  }

  function onPreviewLoad(event) {
    const img = event.target
    preview.width = img.clientWidth || img.naturalWidth || 0
    preview.height = img.clientHeight || img.naturalHeight || 0
    placePreview()
  }

  // 跟随鼠标，贴边时回推到视口内
  function placePreview() {
    const maxX = window.innerWidth - preview.width - PREVIEW_PAD
    const maxY = window.innerHeight - preview.height - PREVIEW_PAD
    preview.x = Math.max(PREVIEW_PAD, Math.min(pointer.x + PREVIEW_OFFSET, maxX))
    preview.y = Math.max(PREVIEW_PAD, Math.min(pointer.y + PREVIEW_OFFSET, maxY))
  }

  onUnmounted(() => window.clearTimeout(previewTimer))

  // 换分组/换图后 objectURL 会被回收，残留的预览会变成破图，这里主动收起
  watch(
    () => props.imageUrls,
    (urls) => {
      if (preview.show && !Object.values(urls).includes(preview.url)) endPreview()
    },
    { deep: true }
  )
</script>

<style scoped>
  .tag-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .panel-head {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }

  .search {
    width: 100%;
  }

  .bar {
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .check {
    gap: 5px;
    cursor: pointer;
  }

  .list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
  }

  .item {
    gap: 8px;
    padding: 5px 8px;
    border-left: 4px solid transparent;
    border-radius: var(--radius-sm);
  }

  .item:hover {
    background: var(--bg-elev-2);
  }

  .item.active {
    background: var(--accent-soft);
  }

  .item.drop-active {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .thumb {
    position: relative;
    flex: none;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-empty {
    font-size: 20px;
    opacity: 0.35;
  }

  .thumb-drop {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    color: var(--fg);
    background: var(--accent-soft);
  }

  .thumb-remove {
    position: absolute;
    top: 1px;
    right: 1px;
    padding: 0 4px;
    font-size: 11px;
    line-height: 1.4;
    opacity: 0;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-radius: var(--radius-sm);
  }

  .thumb:hover .thumb-remove {
    opacity: 1;
  }

  .hidden-input {
    display: none;
  }

  .image-preview {
    position: fixed;
    z-index: 2000;
    pointer-events: none;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .image-preview img {
    display: block;
    max-width: 92vw;
    max-height: 92vh;
  }

  .body {
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desc {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ops {
    flex: none;
  }

  .ops button {
    padding: 2px 5px;
    line-height: 1.4;
  }

  .hint {
    margin: 10px;
    font-size: 12px;
  }
</style>
