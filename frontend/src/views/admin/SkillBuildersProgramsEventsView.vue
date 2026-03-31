<template>
  <div class="container sbpe-page">
    <header class="sbpe-header">
      <div>
        <h1>Programs &amp; events</h1>
        <p class="sbpe-sub">
          Company events for the selected agency — current &amp; upcoming (and past below). Open a card to go to the event portal.
          Use <strong>Program enrollments</strong> below for individual-service onboarding (learning classes + intake links) and public
          <code>/enroll</code> URLs.
        </p>
      </div>
      <div class="sbpe-header-actions">
        <div v-if="agencies.length > 1 || isSuperAdmin" class="sbpe-agency-field">
          <label for="sbpe-agency">Agency</label>
          <select id="sbpe-agency" v-model="selectedAgencyId" class="input sbpe-select">
            <option value="">Select an agency…</option>
            <option v-for="a in agencies" :key="`ag-${a.id}`" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="!selectedAgencyIdNum"
          @click="() => { manageEventId.value = null; showStaffEventForm = true; }"
        >
          Create Event
        </button>
      </div>
      <p v-if="!(agencies.length > 1 || isSuperAdmin) && agencies.length === 1" class="sbpe-single-agency muted">
        Showing events for <strong>{{ agencies[0].name }}</strong>
      </p>
    </header>

    <div v-if="!selectedAgencyIdNum" class="muted sbpe-hint">Choose an agency to load events.</div>
    <SkillBuildersEventsDirectoryPanel
      :key="`sbes-${selectedAgencyIdNum}-${directoryRefreshKey}`"
      ref="directoryPanelRef"
      v-else
      :agency-id="selectedAgencyIdNum"
      :portal-slug="selectedAgencyPortalSlug"
      variant="page"
      @openCompanyEvent="handleOpenCompanyEvent"
    />
    <SkillBuildersProgramEnrollmentsGuide
      v-if="selectedAgencyIdNum"
      :agency-id="selectedAgencyIdNum"
      :agency-portal-slug="selectedAgencyPortalSlug"
    />

    <div v-if="showStaffEventForm" class="modal-overlay" @click.self="attemptCloseStaffEventFormWrapped">
      <div class="modal-card" @click.stop>
        <StaffEventForm
          ref="staffEventFormRef"
          :agency-id="selectedAgencyIdNum"
          :initial-event-id="manageEventId"
          @saved="handleStaffEventSaved"
          @close="handleStaffEventFormClose"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import SkillBuildersEventsDirectoryPanel from '../../components/availability/SkillBuildersEventsDirectoryPanel.vue';
import SkillBuildersProgramEnrollmentsGuide from '../../components/availability/SkillBuildersProgramEnrollmentsGuide.vue';
import StaffEventForm from '../../components/admin/StaffEventForm.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || [];
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const selectedAgencyId = ref('');
const showStaffEventForm = ref(false);
const staffEventFormRef = ref(null);
const directoryPanelRef = ref(null);
const directoryRefreshKey = ref(0);
/** When non-null, StaffEventForm opens in edit mode for this event id. */
const manageEventId = ref(null);

const selectedAgencyIdNum = computed(() => {
  const n = Number(selectedAgencyId.value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const selectedAgencyPortalSlug = computed(() => {
  const a = agencies.value.find((x) => String(x.id) === String(selectedAgencyId.value));
  if (!a) return '';
  return String(a.slug || a.portal_url || '').trim();
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

function handleStaffEventSaved() {
  directoryRefreshKey.value += 1;
}

function handleOpenCompanyEvent({ id }) {
  manageEventId.value = Number(id) || null;
  showStaffEventForm.value = true;
}

function handleStaffEventFormClose() {
  showStaffEventForm.value = false;
  manageEventId.value = null;
}

function attemptCloseStaffEventFormWrapped() {
  const form = staffEventFormRef.value;
  if (form && typeof form.requestClose === 'function') {
    form.requestClose();
    return;
  }
  handleStaffEventFormClose();
}

watch(selectedAgencyIdNum, (value) => {
  if (!value) showStaffEventForm.value = false;
});
</script>

<style scoped>
.sbpe-page {
  padding-top: 1rem;
  padding-bottom: 2rem;
}
.sbpe-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 24px;
  margin-bottom: 20px;
}
.sbpe-header h1 {
  margin: 0;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.sbpe-sub {
  margin: 8px 0 0;
  max-width: 640px;
  color: var(--text-secondary, #64748b);
  font-size: 0.95rem;
  line-height: 1.45;
}
.sbpe-agency-field {
  min-width: 240px;
}
.sbpe-header-actions {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.sbpe-agency-field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbpe-select {
  min-width: 260px;
  max-width: 100%;
}
.sbpe-hint {
  padding: 12px 0;
}
.sbpe-single-agency {
  margin: 0;
  font-size: 0.95rem;
  align-self: flex-end;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}
.modal-card {
  width: min(1200px, 98vw);
  max-height: 92vh;
  overflow: auto;
}
</style>
