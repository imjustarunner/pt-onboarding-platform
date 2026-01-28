<template>
  <div class="program-selector">
    <div v-if="programOptions.length > 0" class="selector-group">
      <label>Program</label>
      <select v-model="selectedProgramId" class="selector" @change="handleProgramChange">
        <option v-for="p in programOptions" :key="p.id" :value="p.id">
          {{ p.name || `Program ${p.id}` }}
        </option>
      </select>
    </div>
    <div v-else class="empty-hint">
      No programs available yet.
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  programs: { type: Array, default: () => [] }
});

const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

const programOptions = computed(() => Array.isArray(props.programs) ? props.programs : []);

const selectedProgramId = ref(agencyStore.currentAgency?.id || (programOptions.value?.[0]?.id ?? null));

const resolveTargetSlug = (program) => {
  const slug = String(program?.slug || program?.portal_url || '').trim();
  return slug || null;
};

const handleProgramChange = async () => {
  const targetId = Number(selectedProgramId.value);
  if (!targetId) return;
  const program = programOptions.value.find((p) => Number(p?.id) === targetId);
  if (!program) return;

  agencyStore.setCurrentAgency(program);

  const slug = resolveTargetSlug(program);
  if (!slug) return;

  // If we are already on a slug-prefixed route, preserve the route name and swap slug.
  if (route.params.organizationSlug) {
    const nextParams = { ...route.params, organizationSlug: slug };
    await router.push({ name: route.name, params: nextParams, query: route.query });
    return;
  }

  // Otherwise, go to the branded guardian portal route.
  await router.push(`/${slug}/guardian`);
};

// Keep selector in sync with the store.
watch(
  () => agencyStore.currentAgency,
  (next) => {
    if (next?.id) selectedProgramId.value = next.id;
  }
);

// If programs load after mount and there is no current selection, pick a default.
watch(
  () => programOptions.value,
  async (next) => {
    if (!Array.isArray(next) || next.length === 0) return;
    const curId = Number(agencyStore.currentAgency?.id || 0);
    const hasCur = curId && next.some((p) => Number(p?.id) === curId);
    if (hasCur) return;
    if (!selectedProgramId.value) selectedProgramId.value = next[0].id;
    await handleProgramChange();
  },
  { deep: true }
);

onMounted(async () => {
  if (!selectedProgramId.value && programOptions.value.length > 0) {
    selectedProgramId.value = programOptions.value[0].id;
    await handleProgramChange();
  }
});
</script>

<style scoped>
.program-selector {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.selector-group {
  min-width: 260px;
}

.selector-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 13px;
}

.selector {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
}

.empty-hint {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

