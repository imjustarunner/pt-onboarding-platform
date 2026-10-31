<template>
  <div v-if="canBrowseTeamSchedules(authStore.user)" class="team-schedule-picker" data-tour="my-schedule-view-as">
    <span>View as</span>
    <PersonSearchSelect :model-value="modelValue" :options="options" placeholder="Search team member…" :disabled="loading || !agencyId" @update:model-value="$emit('update:modelValue', $event)" />
    <button v-if="modelValue" type="button" @click="$emit('update:modelValue', 0)">My schedule</button>
    <small v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></small>
    <small v-else-if="!agencyId">Choose an organization to search.</small>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import PersonSearchSelect from './PersonSearchSelect.vue';
import { canBrowseTeamSchedules, directoryScheduleOptions } from '../../utils/teamScheduleAccess.js';
const props = defineProps({ modelValue: { type: Number, default: 0 }, agencyId: Number });
const emit = defineEmits(['update:modelValue', 'select-name']);
const authStore = useAuthStore();
const people = ref([]), loading = ref(false), error = ref('');
let generation = 0;
const options = computed(() => people.value.filter(person => person.id !== Number(authStore.user?.id)));
watch([() => props.modelValue, options], () => emit('select-name', options.value.find(p => p.id === props.modelValue)?.first_name || 'Team member'));
async function load() {
  const run = ++generation; people.value = []; error.value = '';
  if (!props.agencyId || !canBrowseTeamSchedules(authStore.user)) { loading.value = false; return; }
  loading.value = true;
  try {
    const { data } = await api.get('/staff/directory', { params: { agencyId: props.agencyId, activeOnly: true }, skipGlobalLoading: true });
    if (run !== generation) return;
    people.value = directoryScheduleOptions(data.staff, props.agencyId);
    if (props.modelValue && !options.value.some(p => p.id === props.modelValue)) emit('update:modelValue', 0);
  } catch { if (run === generation) error.value = 'Unable to load the staff directory.'; }
  finally { if (run === generation) loading.value = false; }
}
watch([() => props.agencyId, () => authStore.user?.id], () => { emit('update:modelValue', 0); void load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.team-schedule-picker { display:flex; flex-wrap:wrap; gap:8px; align-items:center; min-width:0; font-size:13px; }
.team-schedule-picker > .person-search-select { flex:1 1 200px; max-width:320px; min-width:0; }
button { font:inherit; cursor:pointer; padding:6px 9px; border:1px solid var(--border,#cbd5e1); border-radius:8px; background:var(--bg-card,#fff); color:inherit; }
</style>
