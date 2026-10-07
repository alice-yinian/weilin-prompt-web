<template>
  <div class="random-panel">
    <div class="row">
      <span class="faint">{{ t('random.count') }}</span>
      <input v-model="count" type="number" min="1" max="200" class="count-input" />
      <div class="spacer"></div>
      <button class="ghost" @click="selected = []">{{ t('random.clear') }}</button>
    </div>

    <div class="tree scroll">
      <div v-for="group in library.groups" :key="group.p_uuid" class="group-block">
        <label class="group-row">
          <input type="checkbox" :checked="isGroupChecked(group)" @change="toggleGroup(group)" />
          <span class="dot" :style="{ background: group.color }"></span>
          <span>{{ group.name }}</span>
        </label>
        <div class="subs">
          <label
            v-for="subgroup in library.subgroupsByGroup[group.p_uuid] || []"
            :key="subgroup.g_uuid"
            class="sub-row"
          >
            <input
              type="checkbox"
              :checked="selected.includes(subgroup.g_uuid)"
              @change="toggleSubgroup(subgroup.g_uuid)"
            />
            <span>{{ subgroup.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="row">
      <button class="primary" :disabled="!selected.length || loading" @click="generate">
        {{ t('random.run') }}
      </button>
      <span class="faint">{{ t('common.count', { n: selected.length }) }}</span>
    </div>
  </div>
</template>

<script setup>
  import { onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useLibraryStore } from '../../../stores/library'
  import { useEditorStore } from '../../../stores/editor'
  import { pickRandomTags } from '../../../core/random/pickRandom'
  import { toast } from '../../../utils/toast'

  const { t } = useI18n()
  const library = useLibraryStore()
  const editor = useEditorStore()

  const selected = ref([])
  const count = ref(5)
  const loading = ref(false)

  onMounted(async () => {
    if (!library.loaded) await library.refresh()
  })

  function isGroupChecked(group) {
    const subs = library.subgroupsByGroup[group.p_uuid] || []
    return subs.length > 0 && subs.every((subgroup) => selected.value.includes(subgroup.g_uuid))
  }

  function toggleGroup(group) {
    const subs = (library.subgroupsByGroup[group.p_uuid] || []).map((subgroup) => subgroup.g_uuid)
    const allSelected = subs.every((id) => selected.value.includes(id))
    if (allSelected) {
      selected.value = selected.value.filter((id) => !subs.includes(id))
    } else {
      selected.value = Array.from(new Set(selected.value.concat(subs)))
    }
  }

  function toggleSubgroup(gUuid) {
    selected.value = selected.value.includes(gUuid)
      ? selected.value.filter((id) => id !== gUuid)
      : selected.value.concat(gUuid)
  }

  async function generate() {
    loading.value = true
    try {
      const pool = []
      for (const gUuid of selected.value) {
        const tags = await library.tagsOf(gUuid)
        for (const tag of tags) pool.push(tag.text)
      }
      const picked = pickRandomTags(pool, Number(count.value) || 1)
      if (!picked.length) {
        toast.error(t('random.noTags'))
        return
      }
      editor.insertManyTags(picked)
      toast.success(t('toast.added'))
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped>
  .random-panel {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-height: 0;
    flex: 1;
  }

  .count-input {
    width: 74px;
  }

  .tree {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px;
    font-size: 12px;
  }

  .group-block + .group-block {
    margin-top: 6px;
    border-top: 1px dashed var(--border);
    padding-top: 6px;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .subs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 4px 0 0 20px;
  }

  .sub-row {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--text-dim);
  }
</style>
