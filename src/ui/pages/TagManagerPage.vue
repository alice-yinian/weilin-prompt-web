<template>
  <div class="tags-page">
    <h1 class="page-title">{{ t('nav.tags') }}</h1>
    <div class="toolbar row wrap">
      <input
        ref="fileInput"
        class="hidden-input"
        type="file"
        accept=".sql,.json,.txt,.yaml,.yml"
        @change="onFile"
      />
      <button class="primary" @click="fileInput.click()">{{ t('tags.importFile') }}</button>
      <button :disabled="!activeGroup" @click="exportGroupSQL">{{ t('tags.exportGroupSQL') }}</button>
      <button :disabled="!selectedTagIds.length" @click="exportSelectedYAML">
        {{ t('tags.exportSelectedYAML') }}
      </button>
      <span class="spacer" />
      <span class="faint hint">{{ t('tags.importHint') }}</span>
    </div>

    <div class="columns">
      <TreeListPanel
        class="col"
        :title="t('tags.groups')"
        :add-title="t('tags.newGroup')"
        :empty-text="t('tags.emptyGroups')"
        :items="groupItems"
        :active-id="activeGroupUuid"
        @add="openCreateGroup"
        @select="selectGroup"
        @edit="openEditGroup"
        @remove="removeGroup"
        @move="onMoveGroup"
      />

      <TreeListPanel
        class="col"
        :title="t('tags.subgroups')"
        :add-title="t('tags.newSubgroup')"
        :empty-text="subgroupEmptyText"
        :items="subgroupItems"
        :active-id="activeSubgroupUuid"
        @add="openCreateSubgroup"
        @select="selectSubgroup"
        @edit="openEditSubgroup"
        @remove="removeSubgroup"
        @move="onMoveSubgroup"
      />

      <TagListPanel
        :visible="visibleTags"
        :total="tags.length"
        :selected="selectedTagIds"
        :query="tagQuery"
        :has-subgroup="!!activeSubgroupUuid"
        :select-hint="t('tags.selectSubgroupHint')"
        :sortable="!tagQuery.trim()"
        @update:query="tagQuery = $event"
        @add="openCreateTag"
        @select="toggleTagSelection"
        @select-all="onSelectAll"
        @edit="openEditTag"
        @remove="removeTag"
        @move="onMoveTag"
        @delete-selected="deleteSelectedTags"
      />
    </div>

    <NameColorDialog
      v-model="editState.open"
      :title="nodeDialogTitle"
      :name-label="nodeDialogNameLabel"
      :name="editState.name"
      :color="editState.color"
      @save="submitNodeEdit"
    />

    <TagEditDialog
      v-model="tagDialog.open"
      :title="tagDialogTitle"
      :text="tagDialog.text"
      :description="tagDialog.desc"
      :color="tagDialog.color"
      @save="submitTagEdit"
    />

    <ImportDialog
      v-model="importOpen"
      :file-name="importPreview?.fileName || ''"
      :counts="importCounts"
      :target-text="importTargetText"
      :busy="importBusy"
      @confirm="confirmImport"
    />
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { createGroup, deleteGroup, moveGroup, updateGroup } from '../../data/repos/groups'
  import {
    createSubgroup,
    deleteSubgroup,
    listSubgroups,
    moveSubgroup,
    updateSubgroup
  } from '../../data/repos/subgroups'
  import {
    createTag,
    deleteTags,
    listAllTags,
    listTags,
    moveTag,
    updateTag
  } from '../../data/repos/tags'
  import { parseImportFile } from '../../core/exchange/parseImport'
  import { exportTreeSQL } from '../../core/exchange/exportSQL'
  import { tagsToYAML } from '../../core/exchange/exportYAML'
  import { useLibraryStore } from '../../stores/library'
  import { useSettingsStore } from '../../stores/settings'
  import { timestampSuffix } from '../../utils/format'
  import { toast } from '../../utils/toast'
  import ImportDialog from '../tags/ImportDialog.vue'
  import NameColorDialog from '../tags/NameColorDialog.vue'
  import TagEditDialog from '../tags/TagEditDialog.vue'
  import TagListPanel from '../tags/TagListPanel.vue'
  import TreeListPanel from '../tags/TreeListPanel.vue'
  import { writeImport } from '../tags/importWrite'

  const { t } = useI18n()
  const library = useLibraryStore()
  const settings = useSettingsStore()

  const fileInput = ref(null)
  const activeGroupUuid = ref('')
  const activeSubgroupUuid = ref('')
  const tags = ref([])
  const selectedTagIds = ref([])
  const tagQuery = ref('')

  const editState = reactive({ open: false, type: 'group', mode: 'create', target: null, name: '', color: '' })
  const tagDialog = reactive({ open: false, target: null, text: '', desc: '', color: '' })
  const importOpen = ref(false)
  const importBusy = ref(false)
  const importPreview = ref(null)

  const groups = computed(() => library.groups)
  const activeGroup = computed(() => groups.value.find((group) => group.p_uuid === activeGroupUuid.value) || null)
  const subgroups = computed(() =>
    library.subgroups.filter((subgroup) => subgroup.p_uuid === activeGroupUuid.value)
  )
  const activeSubgroup = computed(
    () => subgroups.value.find((subgroup) => subgroup.g_uuid === activeSubgroupUuid.value) || null
  )

  const groupItems = computed(() =>
    groups.value.map((group) => ({
      id: group.p_uuid,
      name: group.name,
      color: group.color,
      meta: t('tags.subgroupCount', { n: countSubgroups(group.p_uuid) })
    }))
  )
  const subgroupItems = computed(() =>
    subgroups.value.map((subgroup) => ({
      id: subgroup.g_uuid,
      name: subgroup.name,
      color: subgroup.color
    }))
  )
  const subgroupEmptyText = computed(() =>
    activeGroupUuid.value ? t('tags.emptySubgroups') : t('tags.selectGroupHint')
  )

  // 命中数按 text 或释义做前端过滤（与上游"包含匹配"一致，忽略大小写）
  const visibleTags = computed(() => {
    const query = tagQuery.value.trim().toLowerCase()
    if (!query) return tags.value
    return tags.value.filter(
      (tag) =>
        String(tag.text ?? '').toLowerCase().includes(query) ||
        String(tag.desc ?? '').toLowerCase().includes(query)
    )
  })

  const nodeDialogTitle = computed(() => {
    if (editState.type === 'group') {
      return editState.mode === 'create' ? t('tags.newGroup') : t('tags.editGroup')
    }
    return editState.mode === 'create' ? t('tags.newSubgroup') : t('tags.editSubgroup')
  })
  const nodeDialogNameLabel = computed(() =>
    editState.type === 'group' ? t('tags.groupName') : t('tags.subgroupName')
  )
  const tagDialogTitle = computed(() => (tagDialog.target ? t('tags.editTag') : t('tags.newTag')))

  const importCounts = computed(() => ({
    groups: importPreview.value?.groups.length || 0,
    subgroups: importPreview.value?.subgroups.length || 0,
    tags: importPreview.value?.tags.length || 0,
    skipped: importPreview.value?.skipped || 0
  }))
  const importTargetText = computed(() => {
    const preview = importPreview.value
    if (!preview) return ''
    if (preview.groups.length || preview.subgroups.length) return t('tags.targetStructure')
    const subgroup = activeSubgroup.value
    return subgroup ? t('tags.targetCurrent', { name: subgroup.name }) : t('tags.needSubgroup')
  })

  onMounted(refreshLibrary)

  function countSubgroups(p_uuid) {
    return library.subgroups.filter((subgroup) => subgroup.p_uuid === p_uuid).length
  }

  // 刷新后要重建选中项：被删掉的选择清空，空选中时自动落到第一个可用项
  async function refreshLibrary() {
    await library.refresh()
    if (activeGroupUuid.value && !library.groups.some((group) => group.p_uuid === activeGroupUuid.value)) {
      activeGroupUuid.value = ''
      activeSubgroupUuid.value = ''
    }
    if (
      activeSubgroupUuid.value &&
      !library.subgroups.some((subgroup) => subgroup.g_uuid === activeSubgroupUuid.value)
    ) {
      activeSubgroupUuid.value = ''
    }
    if (!activeGroupUuid.value && library.groups.length) {
      activeGroupUuid.value = library.groups[0].p_uuid
    }
    if (activeGroupUuid.value && !activeSubgroupUuid.value) {
      const first = library.subgroups.find((subgroup) => subgroup.p_uuid === activeGroupUuid.value)
      activeSubgroupUuid.value = first ? first.g_uuid : ''
    }
    await loadTags()
  }

  async function loadTags() {
    if (!activeSubgroupUuid.value) {
      tags.value = []
      return
    }
    tags.value = await listTags(activeSubgroupUuid.value)
  }

  async function selectGroup(p_uuid) {
    if (p_uuid === activeGroupUuid.value) return
    activeGroupUuid.value = p_uuid
    activeSubgroupUuid.value = ''
    tagQuery.value = ''
    selectedTagIds.value = []
    const first = library.subgroups.find((subgroup) => subgroup.p_uuid === p_uuid)
    if (first) activeSubgroupUuid.value = first.g_uuid
    await loadTags()
  }

  async function selectSubgroup(g_uuid) {
    if (g_uuid === activeSubgroupUuid.value) return
    activeSubgroupUuid.value = g_uuid
    tagQuery.value = ''
    selectedTagIds.value = []
    await loadTags()
  }

  /* ---------- 一级 / 二级分组 ---------- */

  function openCreateGroup() {
    editState.type = 'group'
    editState.mode = 'create'
    editState.target = null
    editState.name = ''
    editState.color = settings.defaultColor
    editState.open = true
  }

  function openEditGroup(item) {
    const record = groups.value.find((group) => group.p_uuid === item.id)
    if (!record) return
    editState.type = 'group'
    editState.mode = 'edit'
    editState.target = record
    editState.name = record.name
    editState.color = record.color
    editState.open = true
  }

  function openCreateSubgroup() {
    if (!activeGroupUuid.value) {
      toast.error(t('tags.selectGroupHint'))
      return
    }
    editState.type = 'subgroup'
    editState.mode = 'create'
    editState.target = null
    editState.name = ''
    editState.color = settings.defaultColor
    editState.open = true
  }

  function openEditSubgroup(item) {
    const record = subgroups.value.find((subgroup) => subgroup.g_uuid === item.id)
    if (!record) return
    editState.type = 'subgroup'
    editState.mode = 'edit'
    editState.target = record
    editState.name = record.name
    editState.color = record.color
    editState.open = true
  }

  async function submitNodeEdit(payload) {
    const { type, mode, target } = editState
    try {
      if (type === 'group') {
        if (mode === 'create') {
          const created = await createGroup(payload)
          await refreshLibrary()
          await selectGroup(created.p_uuid)
        } else {
          await updateGroup(target.p_uuid, payload)
          await refreshLibrary()
        }
      } else if (mode === 'create') {
        const created = await createSubgroup({ p_uuid: activeGroupUuid.value, ...payload })
        await refreshLibrary()
        await selectSubgroup(created.g_uuid)
      } else {
        await updateSubgroup(target.g_uuid, payload)
        await refreshLibrary()
      }
      toast.success(t('toast.saved'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function removeGroup(item) {
    const record = groups.value.find((group) => group.p_uuid === item.id)
    if (!record) return
    const subCount = countSubgroups(item.id)
    const tagCount = await countTagsUnderGroup(item.id)
    const message = t('tags.deleteGroupConfirm', { name: record.name, sub: subCount, tags: tagCount })
    if (!window.confirm(message)) return
    try {
      await deleteGroup(item.id)
      await refreshLibrary()
      toast.success(t('toast.deleted'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function removeSubgroup(item) {
    const record = subgroups.value.find((subgroup) => subgroup.g_uuid === item.id)
    if (!record) return
    const tagCount = (await listTags(item.id)).length
    const message = t('tags.deleteSubgroupConfirm', { name: record.name, tags: tagCount })
    if (!window.confirm(message)) return
    try {
      await deleteSubgroup(item.id)
      await refreshLibrary()
      toast.success(t('toast.deleted'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function countTagsUnderGroup(p_uuid) {
    const ids = new Set(
      library.subgroups.filter((subgroup) => subgroup.p_uuid === p_uuid).map((subgroup) => subgroup.g_uuid)
    )
    if (!ids.size) return 0
    const all = await listAllTags()
    return all.reduce((sum, tag) => (ids.has(tag.g_uuid) ? sum + 1 : sum), 0)
  }

  async function onMoveGroup(id, direction) {
    const list = groups.value
    const index = list.findIndex((group) => group.p_uuid === id)
    const reference = list[index + direction]
    if (!reference) return
    await moveGroup(id, reference.p_uuid, direction < 0 ? 'before' : 'after')
    await library.refresh()
  }

  async function onMoveSubgroup(id, direction) {
    const list = subgroups.value
    const index = list.findIndex((subgroup) => subgroup.g_uuid === id)
    const reference = list[index + direction]
    if (!reference) return
    await moveSubgroup(id, reference.g_uuid, direction < 0 ? 'before' : 'after')
    await library.refresh()
  }

  /* ---------- 标签 ---------- */

  function openCreateTag() {
    if (!activeSubgroupUuid.value) {
      toast.error(t('tags.selectSubgroupHint'))
      return
    }
    tagDialog.target = null
    tagDialog.text = ''
    tagDialog.desc = ''
    tagDialog.color = settings.defaultColor
    tagDialog.open = true
  }

  function openEditTag(tag) {
    tagDialog.target = tag
    tagDialog.text = tag.text
    tagDialog.desc = tag.desc || ''
    tagDialog.color = tag.color
    tagDialog.open = true
  }

  async function submitTagEdit(payload) {
    try {
      if (tagDialog.target) await updateTag(tagDialog.target.t_uuid, payload)
      else await createTag({ g_uuid: activeSubgroupUuid.value, ...payload })
      await library.refresh()
      await loadTags()
      toast.success(t(tagDialog.target ? 'toast.saved' : 'toast.added'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function removeTag(tag) {
    if (!window.confirm(t('tags.deleteTagConfirm', { name: tag.text }))) return
    try {
      await deleteTags([tag.t_uuid])
      selectedTagIds.value = selectedTagIds.value.filter((id) => id !== tag.t_uuid)
      await library.refresh()
      await loadTags()
      toast.success(t('toast.deleted'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function deleteSelectedTags() {
    const ids = selectedTagIds.value
    if (!ids.length) return
    if (!window.confirm(t('tags.deleteSelectedConfirm', { n: ids.length }))) return
    try {
      await deleteTags(ids)
      selectedTagIds.value = []
      await library.refresh()
      await loadTags()
      toast.success(t('toast.deleted'))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  function toggleTagSelection(t_uuid) {
    selectedTagIds.value = selectedTagIds.value.includes(t_uuid)
      ? selectedTagIds.value.filter((id) => id !== t_uuid)
      : selectedTagIds.value.concat(t_uuid)
  }

  function onSelectAll(checked) {
    const visibleIds = visibleTags.value.map((tag) => tag.t_uuid)
    if (checked) {
      selectedTagIds.value = Array.from(new Set(selectedTagIds.value.concat(visibleIds)))
    } else {
      selectedTagIds.value = selectedTagIds.value.filter((id) => !visibleIds.includes(id))
    }
  }

  async function onMoveTag(id, direction) {
    const list = tags.value
    const index = list.findIndex((tag) => tag.t_uuid === id)
    const reference = list[index + direction]
    if (!reference) return
    await moveTag(id, reference.t_uuid, direction < 0 ? 'before' : 'after')
    await library.refresh()
    await loadTags()
  }

  /* ---------- 导入 / 导出 ---------- */

  async function onFile(event) {
    const file = event.target.files?.[0]
    if (fileInput.value) fileInput.value.value = ''
    if (!file) return
    try {
      const result = parseImportFile(file.name, await file.text())
      const preview = {
        fileName: file.name,
        groups: result.groups || [],
        subgroups: result.subgroups || [],
        tags: result.tags || [],
        skipped: result.skipped || 0
      }
      if (!preview.groups.length && !preview.subgroups.length && !preview.tags.length) {
        toast.error(t('tags.importEmpty'))
        return
      }
      // 纯 {text:desc} 形式没有分组信息，只能写进当前选中的二级分组
      if (!preview.groups.length && !preview.subgroups.length && !activeSubgroupUuid.value) {
        toast.error(t('tags.needSubgroup'))
        return
      }
      importPreview.value = preview
      importOpen.value = true
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  async function confirmImport() {
    const preview = importPreview.value
    if (!preview) return
    importBusy.value = true
    try {
      const counts = await writeImport(preview, {
        groups: library.groups,
        subgroups: library.subgroups,
        activeGroupUuid: activeGroupUuid.value,
        activeSubgroupUuid: activeSubgroupUuid.value,
        defaultColor: settings.defaultColor
      })
      importOpen.value = false
      importPreview.value = null
      await refreshLibrary()
      toast.success(t('tags.importDone', counts))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    } finally {
      importBusy.value = false
    }
  }

  async function exportGroupSQL() {
    const group = activeGroup.value
    if (!group) return
    try {
      const subgroupsOfGroup = await listSubgroups(group.p_uuid)
      const rows = []
      for (const subgroup of subgroupsOfGroup) {
        rows.push(...(await listTags(subgroup.g_uuid)))
      }
      const sql = exportTreeSQL({
        groups: [group],
        subgroups: subgroupsOfGroup,
        tags: rows
      })
      const fileName = `weilin-group-${safeFileName(group.name)}-${timestampSuffix()}.sql`
      downloadText(sql, fileName, 'application/sql;charset=utf-8')
      toast.success(t('tags.exported', { name: fileName }))
    } catch (error) {
      toast.error(t('toast.error', { msg: error.message || String(error) }))
    }
  }

  function exportSelectedYAML() {
    const selected = tags.value.filter((tag) => selectedTagIds.value.includes(tag.t_uuid))
    if (!selected.length) {
      toast.error(t('tags.noTagsToExport'))
      return
    }
    const yaml = tagsToYAML(selected.map((tag) => ({ text: tag.text, desc: tag.desc })))
    const fileName = `weilin-tags-${timestampSuffix()}.yaml`
    downloadText(yaml, fileName, 'text/yaml;charset=utf-8')
    toast.success(t('tags.exported', { name: fileName }))
  }

  function safeFileName(name) {
    return (
      String(name ?? '')
        .trim()
        .replace(/[\\/:*?"<>|\s]+/g, '_') || 'tags'
    )
  }

  function downloadText(text, fileName, type) {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
</script>

<style scoped>
  .tags-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .toolbar {
    gap: 8px;
    flex: none;
    padding: 10px 12px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .hint {
    font-size: 12px;
  }

  .hidden-input {
    display: none;
  }

  .columns {
    display: flex;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .col {
    flex: none;
    width: 240px;
  }

  .col + .col {
    width: 220px;
  }
</style>
