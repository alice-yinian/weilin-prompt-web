<template>
  <Dialog v-model="visible" :title="t('favorites.add')" width="420px">
    <div class="field">
      <label>Tag</label>
      <input v-model="text" />
    </div>
    <div class="field">
      <label>{{ t('snippetInsert.title') }}</label>
      <input v-model="desc" placeholder="中文释义" />
    </div>
    <div class="field">
      <label>{{ t('nav.tags') }}</label>
      <select v-model="groupUuid">
        <option value="">{{ t('common.required') }}</option>
        <option v-for="group in library.groups" :key="group.p_uuid" :value="group.p_uuid">
          {{ group.name }}
        </option>
      </select>
    </div>
    <div class="field">
      <label>{{ t('nav.tags') }} · 二级分组</label>
      <select v-model="subgroupUuid" :disabled="!groupUuid">
        <option value="">{{ t('common.required') }}</option>
        <option
          v-for="subgroup in subgroupsOfGroup"
          :key="subgroup.g_uuid"
          :value="subgroup.g_uuid"
        >
          {{ subgroup.name }}
        </option>
      </select>
    </div>
    <div class="field">
      <label>{{ t('common.color') }}</label>
      <input v-model="color" class="color-text" />
    </div>

    <template #footer>
      <button @click="visible = false">{{ t('common.cancel') }}</button>
      <button class="primary" :disabled="!canSave" @click="save">{{ t('common.save') }}</button>
    </template>
  </Dialog>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Dialog from '../common/Dialog.vue'
  import { useLibraryStore } from '../../stores/library'
  import { useSettingsStore } from '../../stores/settings'
  import { createTag } from '../../data/repos/tags'
  import { toast } from '../../utils/toast'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    text: { type: String, default: '' },
    desc: { type: String, default: '' }
  })

  const emit = defineEmits(['update:modelValue'])

  const { t } = useI18n()
  const library = useLibraryStore()
  const settings = useSettingsStore()

  const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const text = ref(props.text)
  const desc = ref(props.desc)
  const groupUuid = ref('')
  const subgroupUuid = ref('')
  const color = ref(settings.defaultColor)

  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      text.value = props.text
      desc.value = props.desc
      color.value = settings.defaultColor
      groupUuid.value = library.groups[0]?.p_uuid || ''
      subgroupUuid.value = ''
    }
  )

  const subgroupsOfGroup = computed(() => library.subgroupsByGroup[groupUuid.value] || [])

  const canSave = computed(() => !!text.value.trim() && !!subgroupUuid.value)

  async function save() {
    if (!canSave.value) return
    try {
      await createTag({
        g_uuid: subgroupUuid.value,
        text: text.value.trim(),
        desc: desc.value.trim(),
        color: color.value
      })
      await library.refresh()
      toast.success(t('toast.added'))
      visible.value = false
    } catch (error) {
      toast.error(t('favorites.saveFailed', { msg: error.message || String(error) }))
    }
  }
</script>

<style scoped>
  .color-text {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
</style>
