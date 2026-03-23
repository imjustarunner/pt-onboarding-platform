<template>
  <div class="container sbav-page">
    <header class="sbav-header">
      <div>
        <h1>Availability</h1>
        <p class="sbav-sub">
          Submit and confirm your Skill Builder weekly availability (minimum 6 hours/week; confirm every two weeks).
        </p>
      </div>
      <div v-if="agencies.length > 1 || isSuperAdmin" class="sbav-agency-field">
        <label for="sbav-agency">Agency</label>
        <select id="sbav-agency" v-model="selectedAgencyId" class="input sbav-select">
          <option value="">Default (context)</option>
          <option v-for="a in agencies" :key="`ag-${a.id}`" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>
      <p v-else-if="agencies.length === 1" class="sbav-single-agency muted">
        Agency: <strong>{{ agencies[0].name }}</strong>
      </p>
    </header>

    <SkillBuilderAvailabilityModal layout="page" :agency-id="agencyIdForModal" :lock-open="false" />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import SkillBuilderAvailabilityModal from '../../components/availability/SkillBuilderAvailabilityModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || [];
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const selectedAgencyId = ref('');

const agencyIdForModal = computed(() => {
  const n = Number(selectedAgencyId.value || 0);
  if (Number.isFinite(n) && n > 0) return n;
  const cur = agencyStore.currentAgency;
  const curN = cur?.id != null ? Number(cur.id) : 0;
  if (Number.isFinite(curN) && curN > 0) return curN;
  if (agencies.value.length === 1) return Number(agencies.value[0].id) || null;
  return null;
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
.sbav-page {
  padding-top: 1rem;
  padding-bottom: 2rem;
}
.sbav-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 24px;
  margin-bottom: 20px;
}
.sbav-header h1 {
  margin: 0;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.sbav-sub {
  margin: 8px 0 0;
  max-width: 640px;
  color: var(--text-secondary, #64748b);
  font-size: 0.95rem;
  line-height: 1.45;
}
.sbav-agency-field {
  min-width: 240px;
}
.sbav-agency-field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbav-select {
  width: 100%;
}
.sbav-single-agency {
  margin: 0;
  font-size: 0.95rem;
}
</style>
