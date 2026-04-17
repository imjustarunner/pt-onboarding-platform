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
          <select id="sbpe-agency" v-model="selectedAgencyId" class="input sbpe-select" @change="reloadWithAgencyQuery">
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
    <section v-if="selectedAgencyIdNum" class="sbpe-program-workspace">
      <div class="sbpe-program-workspace-header">
        <div>
          <h2>Program workspace</h2>
          <p class="muted">
            Select a program to open the same full section hub you used from My Dashboard.
          </p>
        </div>
        <div class="sbpe-program-controls">
          <div class="sbpe-program-field">
            <label for="sbpe-program">Program</label>
            <select
              id="sbpe-program"
              v-model="selectedProgramOrgId"
              class="input sbpe-select"
              :disabled="programOrgsLoading || !programOrganizations.length"
            >
              <option value="">
                {{
                  programOrgsLoading
                    ? 'Loading programs…'
                    : (programOrganizations.length ? 'Select a program…' : 'No programs found')
                }}
              </option>
              <option v-for="org in programOrganizations" :key="`prog-${org.id}`" :value="String(org.id)">
                {{ org.name }}
              </option>
            </select>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            :disabled="!selectedProgram"
            @click="showProgramWorkspace = !showProgramWorkspace"
          >
            {{ showProgramWorkspace ? 'Hide workspace' : 'Open workspace' }}
          </button>
        </div>
        <div
          v-if="!programOrgsLoading && !programOrganizations.length && !programOrgsError"
          class="sbpe-program-empty"
        >
          <p class="muted sbpe-program-empty-copy">
            No programs are linked to this agency yet. Add a <strong>program</strong> organization first, then you can create
            Skill Builders events for it.
          </p>
          <button type="button" class="btn btn-primary btn-sm" @click="showCreateProgramModal = true">Add a program</button>
        </div>
      </div>
      <p v-if="programOrgsError" class="sbpe-program-error">{{ programOrgsError }}</p>
      <ProgramHubModal
        v-if="showProgramWorkspace && selectedProgram"
        mode="coordinator"
        :agency-id="selectedAgencyIdNum"
        :organization-id="selectedProgram.id"
        :organization-name="selectedProgram.name"
        :organization-portal-slug="selectedProgram.slug || selectedProgram.portal_url || selectedProgram.portalUrl || ''"
        :inline="true"
      />
    </section>
    <SkillBuildersEventsDirectoryPanel
      :key="`sbes-${selectedAgencyIdNum}-${directoryRefreshKey}`"
      ref="directoryPanelRef"
      v-if="selectedAgencyIdNum"
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

    <SkillBuildersEventEditModal
      v-if="showProgramEventEditor && manageEventId"
      v-model="showProgramEventEditor"
      :agency-id="selectedAgencyIdNum"
      :event-id="manageEventId"
      :portal-slug="selectedAgencyPortalSlug"
      :can-edit-program-week-pattern="true"
      @saved="handleUnifiedEditorSaved"
    />

    <SkillBuildersCreateProgramModal
      v-if="selectedAgencyIdNum"
      v-model="showCreateProgramModal"
      :agency-id="selectedAgencyIdNum"
      :parent-agency-name="selectedAgencyDisplayName"
      @created="handleProgramCreated"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import SkillBuildersEventsDirectoryPanel from '../../components/availability/SkillBuildersEventsDirectoryPanel.vue';
import SkillBuildersProgramEnrollmentsGuide from '../../components/availability/SkillBuildersProgramEnrollmentsGuide.vue';
import ProgramHubModal from '../../components/availability/ProgramHubModal.vue';
import StaffEventForm from '../../components/admin/StaffEventForm.vue';
import SkillBuildersEventEditModal from '../../components/skillBuilders/SkillBuildersEventEditModal.vue';
import SkillBuildersCreateProgramModal from '../../components/availability/SkillBuildersCreateProgramModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = computed(() => {
  const list = isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || [];
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const selectedAgencyId = ref('');
const showStaffEventForm = ref(false);
const showProgramEventEditor = ref(false);
const staffEventFormRef = ref(null);
const directoryPanelRef = ref(null);
const directoryRefreshKey = ref(0);
/** When non-null, StaffEventForm opens in edit mode for this event id. */
const manageEventId = ref(null);
const programOrganizations = ref([]);
const selectedProgramOrgId = ref('');
const showProgramWorkspace = ref(false);
const programOrgsLoading = ref(false);
const programOrgsError = ref('');
const showCreateProgramModal = ref(false);

const selectedAgencyIdNum = computed(() => {
  const n = Number(selectedAgencyId.value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const selectedAgencyPortalSlug = computed(() => {
  const a = agencies.value.find((x) => String(x.id) === String(selectedAgencyId.value));
  if (!a) return '';
  return String(a.slug || a.portal_url || '').trim();
});

const selectedAgencyDisplayName = computed(() => {
  const a = agencies.value.find((x) => String(x.id) === String(selectedAgencyId.value));
  return a ? String(a.name || '').trim() : '';
});
const selectedProgram = computed(() =>
  programOrganizations.value.find((org) => String(org.id) === String(selectedProgramOrgId.value)) || null
);

function syncSelectionFromContext() {
  const list = agencies.value || [];
  const selectedOk =
    String(selectedAgencyId.value || '').trim() &&
    list.some((a) => String(a.id) === String(selectedAgencyId.value));
  if (selectedOk) {
    return;
  }
  const cur = agencyStore.currentAgency;
  const curId = cur?.id != null ? String(cur.id) : '';
  if (curId && list.some((a) => String(a.id) === curId)) {
    selectedAgencyId.value = curId;
    return;
  }
  if (list.length === 1) {
    selectedAgencyId.value = String(list[0].id);
  }
}

function readAgencyIdFromRouteQuery() {
  const raw = route.query?.agencyId;
  if (raw == null || raw === '') return '';
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  return /^\d+$/.test(s) ? s : '';
}

/** After a full reload, `?agencyId=` wins over store context so the page matches the URL. */
function applyAgencyFromRouteQuery() {
  const id = readAgencyIdFromRouteQuery();
  if (!id) return false;
  const list = agencies.value || [];
  if (!list.some((a) => String(a.id) === id)) return false;
  selectedAgencyId.value = id;
  return true;
}

function syncAgencySelection() {
  if (applyAgencyFromRouteQuery()) return;
  syncSelectionFromContext();
}

/** Full reload on agency change so program list + events always mount fresh (temporary workaround). */
function reloadWithAgencyQuery() {
  const id = String(selectedAgencyId.value || '').trim();
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('agencyId', id);
  else url.searchParams.delete('agencyId');
  window.location.assign(url.toString());
}

/**
 * Agency list must sync before the program watcher’s `{ immediate: true }` run. If the program
 * watcher is registered first, it runs with `selectedAgencyIdNum === 0`, bails, and a follow-up
 * load can be skipped in some navigation timings — leaving “No programs found” until the user
 * re-selects the agency (full reload via `?agencyId=`).
 */
watch(agencies, () => syncAgencySelection(), { immediate: true });

watch(
  selectedAgencyIdNum,
  (value) => {
    showCreateProgramModal.value = false;
    if (!value) {
      showStaffEventForm.value = false;
      showProgramEventEditor.value = false;
      manageEventId.value = null;
      programOrganizations.value = [];
      selectedProgramOrgId.value = '';
      showProgramWorkspace.value = false;
      programOrgsError.value = '';
      return;
    }
    loadProgramOrganizations();
  },
  { immediate: true }
);

watch(
  () => agencyStore.currentAgency?.id,
  () => syncAgencySelection()
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
  syncAgencySelection();
});

function handleStaffEventSaved() {
  directoryRefreshKey.value += 1;
}

function handleOpenCompanyEvent({ id }) {
  manageEventId.value = Number(id) || null;
  showProgramEventEditor.value = !!manageEventId.value;
}

function handleUnifiedEditorSaved() {
  directoryRefreshKey.value += 1;
}

async function handleProgramCreated(payload) {
  const id = payload?.id != null ? Number(payload.id) : NaN;
  const prefer = Number.isFinite(id) && id > 0 ? id : null;
  await loadProgramOrganizations(prefer);
  directoryRefreshKey.value += 1;
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

watch(showProgramEventEditor, (open) => {
  if (!open) manageEventId.value = null;
});

watch(selectedProgramOrgId, () => {
  showProgramWorkspace.value = false;
});

async function loadProgramOrganizations(preferredOrgId = null) {
  const aid = selectedAgencyIdNum.value;
  programOrganizations.value = [];
  selectedProgramOrgId.value = '';
  showProgramWorkspace.value = false;
  programOrgsError.value = '';
  if (!aid) return;
  programOrgsLoading.value = true;
  try {
    const res = await api.get('/availability/admin/skill-builders/options', {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    programOrganizations.value = rows
      .filter((o) => {
        const t = String(o?.organizationType || '').toLowerCase();
        return t === 'program' || t === 'learning';
      })
      .map((o) => ({
        id: Number(o.id),
        name: String(o.name || '').trim() || `Program ${o.id}`,
        slug: String(o.slug || '').trim(),
        portal_url: String(o.portal_url || '').trim(),
        portalUrl: String(o.portalUrl || '').trim()
      }))
      .filter((o) => Number.isFinite(o.id) && o.id > 0);
    if (programOrganizations.value.length > 0) {
      const pref = preferredOrgId != null ? Number(preferredOrgId) : NaN;
      if (Number.isFinite(pref) && pref > 0 && programOrganizations.value.some((o) => Number(o.id) === pref)) {
        selectedProgramOrgId.value = String(pref);
      } else {
        selectedProgramOrgId.value = String(programOrganizations.value[0].id);
      }
    }
  } catch (e) {
    programOrgsError.value = e?.response?.data?.error?.message || 'Failed to load programs for this agency';
  } finally {
    programOrgsLoading.value = false;
  }
}
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
.sbpe-program-workspace {
  margin: 10px 0 18px;
  padding: 14px;
  border: 1px solid var(--border, #d8dde4);
  border-radius: 12px;
  background: var(--panel, #fff);
}
.sbpe-program-workspace-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px 16px;
}
.sbpe-program-workspace h2 {
  margin: 0 0 4px;
  font-size: 1.1rem;
}
.sbpe-program-controls {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.sbpe-program-field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbpe-program-error {
  margin: 8px 0 0;
  color: #b91c1c;
  font-size: 0.9rem;
}
.sbpe-program-empty {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px dashed var(--border, #cbd5e1);
  background: var(--muted-bg, #f8fafc);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.sbpe-program-empty-copy {
  margin: 0;
  max-width: 52rem;
  line-height: 1.45;
  font-size: 0.9rem;
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
