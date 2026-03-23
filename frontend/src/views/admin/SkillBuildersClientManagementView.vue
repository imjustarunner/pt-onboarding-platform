<template>
  <div class="container sbcv-page">
    <header class="sbcv-header">
      <div>
        <h1>Client management</h1>
        <p class="sbcv-sub">
          Skill Builders clients, intake, treatment plans, and event assignments for the selected agency.
        </p>
      </div>
      <div v-if="agencies.length > 1 || isSuperAdmin" class="sbcv-agency-field">
        <label for="sbcv-agency">Agency</label>
        <select id="sbcv-agency" v-model="selectedAgencyId" class="input sbcv-select">
          <option value="">Select an agency…</option>
          <option v-for="a in agencies" :key="`ag-${a.id}`" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>
      <p v-else-if="agencies.length === 1" class="sbcv-single-agency muted">
        Showing clients for <strong>{{ agencies[0].name }}</strong>
      </p>
    </header>

    <div v-if="!selectedAgencyIdNum" class="muted sbcv-hint">Choose an agency to load clients.</div>
    <SkillBuildersClientManagementPanel v-else :agency-id="selectedAgencyIdNum" />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import SkillBuildersClientManagementPanel from '../../components/availability/SkillBuildersClientManagementPanel.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || [];
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const selectedAgencyId = ref('');

const selectedAgencyIdNum = computed(() => {
  const n = Number(selectedAgencyId.value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

function syncSelectionFromContext() {
  const cur = agencyStore.currentAgency;
  const curId = cur?.id != null ? String(cur.id) : '';
  if (curId && agencies.value.some((a) => String(a.id) === curId)) {
    selectedAgencyId.value = curId;
    return;
  }
  if (agencies.value.length === 1) {
    selectedAgencyId.value = String(agencies.value[0].id);
  }
}

watch(agencies, () => syncSelectionFromContext(), { immediate: true });

watch(
  () => agencyStore.currentAgency?.id,
  () => syncSelectionFromContext()
);

onMounted(async () => {
  try {
    if (isSuperAdmin.value && (!agencyStore.agencies || agencyStore.agencies.length === 0)) {
      await agencyStore.fetchAgencies();
    } else if (!isSuperAdmin.value && (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0)) {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    /* ignore */
  }
  syncSelectionFromContext();
});
</script>

<style scoped>
.sbcv-page {
  padding-top: 1rem;
  padding-bottom: 2rem;
}
.sbcv-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 24px;
  margin-bottom: 20px;
}
.sbcv-header h1 {
  margin: 0;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.sbcv-sub {
  margin: 8px 0 0;
  max-width: 640px;
  color: var(--text-secondary, #64748b);
  font-size: 0.95rem;
  line-height: 1.45;
}
.sbcv-agency-field {
  min-width: 240px;
}
.sbcv-agency-field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbcv-select {
  width: 100%;
}
.sbcv-single-agency {
  margin: 0;
  font-size: 0.95rem;
}
.sbcv-hint {
  margin-top: 8px;
}
</style>
