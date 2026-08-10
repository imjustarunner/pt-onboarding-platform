<template>
  <div class="ob-panel" :class="{ 'ob-panel--modal': asModal, 'ob-panel--workspace': variant === 'workspace' }">
    <div v-if="asModal" class="ob-panel-header">
      <div>
        <h3 class="ob-title">Client readiness</h3>
        <p class="ob-sub muted">{{ clientLabel }}</p>
      </div>
      <button type="button" class="close" aria-label="Close" @click="$emit('close')">×</button>
    </div>

    <div v-if="loading" class="ob-state">
      <span class="ob-spinner" aria-hidden="true" />
      Loading readiness checklist…
    </div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="checklist">
      <header v-if="variant === 'workspace'" class="ob-hero" :class="checklist.client_type === 'school' ? 'is-school' : 'is-office'">
        <div class="ob-hero-top">
          <div class="ob-hero-title-block">
            <h2 class="ob-hero-title">{{ displayName }}</h2>
            <div class="ob-badges">
              <span class="ob-badge ob-badge-type">{{ typeLabel }}</span>
              <span v-if="checklist.is_paper_packet" class="ob-badge ob-badge-packet">Paper packet</span>
              <span class="ob-badge ob-badge-status">{{ statusLabel }}</span>
              <span class="ob-badge ob-badge-phase" :class="`phase-${checklist.phase}`">{{ phaseLabel }}</span>
            </div>
          </div>
          <div class="ob-progress-ring" :style="{ '--pct': progressPct }">
            <span class="ob-progress-value">{{ progressPct }}%</span>
          </div>
        </div>
        <div class="ob-meta-grid">
          <div v-if="checklist.client_type === 'school'" class="ob-meta-item">
            <span class="ob-meta-label">School</span>
            <span class="ob-meta-value">{{ checklist.client?.organization_name || '—' }}</span>
          </div>
          <div class="ob-meta-item">
            <span class="ob-meta-label">Provider</span>
            <span class="ob-meta-value" :class="{ warn: !checklist.provider_name }">
              {{ checklist.provider_name || 'Not assigned' }}
            </span>
          </div>
          <div v-if="checklist.client_type === 'school'" class="ob-meta-item">
            <span class="ob-meta-label">Service day</span>
            <span class="ob-meta-value" :class="{ warn: !checklist.client?.service_day }">
              {{ checklist.client?.service_day || 'Not set' }}
            </span>
          </div>
          <div class="ob-meta-item">
            <span class="ob-meta-label">Insurance</span>
            <span class="ob-meta-value" :class="{ warn: !checklist.client?.insurance_type_id }">
              {{ checklist.client?.insurance_type_id ? 'Indicated' : 'Not indicated' }}
            </span>
          </div>
          <div v-if="checklist.client?.submission_date" class="ob-meta-item">
            <span class="ob-meta-label">Submitted</span>
            <span class="ob-meta-value">{{ formatDate(checklist.client.submission_date) }}</span>
          </div>
        </div>
        <div class="ob-progress-bar-wrap">
          <div class="ob-progress-bar">
            <span class="ob-progress-fill" :style="{ width: `${progressPct}%` }" />
          </div>
          <span class="ob-progress-caption">{{ checklist.complete_steps }} of {{ checklist.total_steps }} steps complete</span>
        </div>
      </header>

      <div v-else class="ob-phase">
        <span class="ob-phase-pill" :class="`phase-${checklist.phase}`">{{ phaseLabel }}</span>
        <span class="muted">{{ checklist.summary_label }}</span>
      </div>

      <section class="ob-section ob-section-card">
        <button type="button" class="ob-section-toggle" @click="staffOpen = !staffOpen">
          <span class="ob-section-title">
            <span class="ob-section-icon staff">{{ sectionNum.staff }}</span>
            Staff setup
            <span class="ob-section-count">{{ staffDoneCount }}/{{ checklist.staff_items.length }}</span>
          </span>
          <span class="ob-chevron" :class="{ open: staffOpen }">›</span>
        </button>
        <div v-show="staffOpen" class="ob-section-body">
          <p v-if="readonly" class="ob-readonly-hint muted">Staff setup — view only. Contact office staff to request changes.</p>
          <ClientOnboardingStaffSetupPanel
            :client-id="clientId"
            :checklist="checklist"
            :readonly="readonly"
            @updated="onStaffSetupUpdated"
          />
        </div>
      </section>

      <section
        v-if="checklist.roi_staff_item"
        class="ob-section ob-section-card"
        :class="{ 'is-done-section': checklist.roi_staff_item.done }"
      >
        <button type="button" class="ob-section-toggle" @click="roiOpen = !roiOpen">
          <span class="ob-section-title">
            <span class="ob-section-icon roi">{{ sectionNum.roi }}</span>
            School staff ROI
            <span class="ob-section-count">{{ checklist.roi_staff_item.done ? 'Done' : 'Open' }}</span>
          </span>
          <span class="ob-chevron" :class="{ open: roiOpen }">›</span>
        </button>
        <div v-show="roiOpen" class="ob-section-body">
          <p v-if="readonly" class="ob-readonly-hint muted">School ROI permissions — view only.</p>
          <ClientOnboardingRoiStaffPanel
            :client-id="clientId"
            :step-done="checklist.roi_staff_item.done"
            :readonly="readonly"
            @updated="onRoiStaffUpdated"
            @mark-complete="onRoiStaffUpdated"
          />
        </div>
      </section>

      <section
        v-if="checklist.is_paper_packet"
        class="ob-section ob-section-card"
        :class="{ 'is-done-section': checklist.documents_item?.done }"
      >
        <button type="button" class="ob-section-toggle" @click="docsOpen = !docsOpen">
          <span class="ob-section-title">
            <span class="ob-section-icon docs">{{ sectionNum.docs }}</span>
            Documents
            <span class="ob-section-count">{{ docsDoneCount }}/{{ docsTotalCount }}</span>
          </span>
          <span class="ob-chevron" :class="{ open: docsOpen }">›</span>
        </button>
        <div v-show="docsOpen" class="ob-section-body">
          <p v-if="readonly" class="ob-readonly-hint muted">Packet documents — view only.</p>
          <ClientOnboardingDocumentsPanel
            :client-id="clientId"
            :checklist="checklist"
            :can-edit="effectiveCanEditDocs"
            @updated="onDocsUpdated"
          />
        </div>
      </section>

      <section v-if="!hideProviderSection" class="ob-section ob-section-card">
        <button type="button" class="ob-section-toggle" @click="providerOpen = !providerOpen">
          <span class="ob-section-title">
            <span class="ob-section-icon provider">{{ sectionNum.provider }}</span>
            Provider final steps
            <span class="ob-section-count">{{ providerDoneCount }}/{{ checklist.provider_items.length }}</span>
          </span>
          <span class="ob-chevron" :class="{ open: providerOpen }">›</span>
        </button>
        <div v-show="providerOpen" class="ob-section-body">
          <ul class="ob-task-list">
            <li
              v-for="item in checklist.provider_items"
              :key="item.key"
              class="ob-task"
              :class="{ done: item.done, open: !item.done }"
            >
              <span class="ob-task-check" :aria-label="item.done ? 'Complete' : 'Incomplete'">
                <svg v-if="item.done" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
              </span>
              <div class="ob-task-body">
                <div class="ob-task-label">{{ item.label }}</div>
              </div>
            </li>
          </ul>
          <p class="ob-note">
            When all provider steps are complete, the client is marked <strong>Current</strong> automatically.
          </p>
        </div>
      </section>

      <div v-if="canCompleteStaff" class="ob-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="completing || !checklist.can_complete_staff_onboarding"
          @click="completeStaff"
        >
          {{ completing ? 'Saving…' : 'Mark staff readiness complete' }}
        </button>
        <span v-if="!checklist.can_complete_staff_onboarding" class="ob-action-hint muted">
          Finish staff setup, documents, and school ROI (if shown) first.
        </span>
        <span v-if="completeMsg" class="ob-action-success">{{ completeMsg }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import ClientOnboardingRoiStaffPanel from './ClientOnboardingRoiStaffPanel.vue';
import ClientOnboardingStaffSetupPanel from './ClientOnboardingStaffSetupPanel.vue';
import ClientOnboardingDocumentsPanel from './ClientOnboardingDocumentsPanel.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  clientLabel: { type: String, default: '' },
  clientMeta: { type: Object, default: null },
  asModal: { type: Boolean, default: false },
  variant: { type: String, default: 'compact' },
  canEditDocs: { type: Boolean, default: true },
  readonly: { type: Boolean, default: false },
  hideProviderSection: { type: Boolean, default: false },
  hideStaffCompleteAction: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();
const loading = ref(false);
const error = ref('');
const checklist = ref(null);
const completing = ref(false);
const completeMsg = ref('');
const staffOpen = ref(true);
const roiOpen = ref(true);
const docsOpen = ref(true);
const providerOpen = ref(true);

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const effectiveCanEditDocs = computed(() => props.canEditDocs && !props.readonly);
const canCompleteStaff = computed(() =>
  !props.readonly
  && !props.hideStaffCompleteAction
  && ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role.value)
);

const displayName = computed(() => {
  if (props.clientLabel) return props.clientLabel;
  const c = checklist.value?.client;
  return c?.full_name || c?.initials || c?.identifier_code || `Client ${props.clientId}`;
});

const typeLabel = computed(() => (checklist.value?.client_type === 'school' ? 'School client' : 'Office client'));
const statusLabel = computed(() =>
  checklist.value?.client?.client_status_label
  || props.clientMeta?.client_status_label
  || '—'
);
const phaseLabel = computed(() => {
  const p = checklist.value?.phase;
  if (p === 'done') return 'Complete';
  if (p === 'provider') return 'Awaiting provider';
  return 'Staff setup';
});
const progressPct = computed(() => Number(checklist.value?.progress_pct || 0));
const staffDoneCount = computed(() => (checklist.value?.staff_items || []).filter((i) => i.done).length);
const providerDoneCount = computed(() => (checklist.value?.provider_items || []).filter((i) => i.done).length);
const docsDoneCount = computed(() => {
  const items = checklist.value?.document_items || [];
  const sig = checklist.value?.packet_signature;
  let done = 0;
  let total = 0;
  if (sig) {
    total += 1;
    if (sig.done) done += 1;
  }
  const roi = items.find((d) => d.key === 'roi');
  if (roi) {
    total += 1;
    if (roi.done) done += 1;
  }
  return done;
});
const docsTotalCount = computed(() => {
  const items = checklist.value?.document_items || [];
  let total = checklist.value?.packet_signature ? 1 : 0;
  if (items.some((d) => d.key === 'roi')) total += 1;
  return total || items.length;
});
const sectionNum = computed(() => {
  let n = 1;
  const staff = n;
  n += 1;
  const roi = checklist.value?.roi_staff_item ? n++ : null;
  const docs = checklist.value?.is_paper_packet ? n++ : null;
  const provider = n;
  return { staff, roi, docs, provider };
});

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const load = async () => {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/clients/${id}/onboarding-checklist`, { skipGlobalLoading: true });
    checklist.value = r.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load readiness checklist';
    checklist.value = null;
  } finally {
    loading.value = false;
  }
};

const onDocsUpdated = (payload) => {
  if (payload?.checklist) {
    checklist.value = payload.checklist;
  }
  emit('updated', checklist.value);
};

const onRoiStaffUpdated = async (payload) => {
  if (payload?.checklist) {
    checklist.value = payload.checklist;
  } else {
    await load();
  }
  emit('updated', checklist.value);
};

const onStaffSetupUpdated = async () => {
  await load();
  emit('updated', checklist.value);
};

const completeStaff = async () => {
  const id = Number(props.clientId || 0);
  if (!id) return;
  completing.value = true;
  completeMsg.value = '';
  error.value = '';
  try {
    const r = await api.post(`/clients/${id}/onboarding/complete-staff`, {}, { skipGlobalLoading: true });
    checklist.value = r.data?.checklist || checklist.value;
    completeMsg.value = 'Staff readiness complete — provider steps are next.';
    emit('updated', checklist.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not complete staff readiness';
  } finally {
    completing.value = false;
  }
};

watch(() => props.clientId, load, { immediate: true });
</script>

<style scoped>
.ob-panel { padding: 0; }
.ob-panel--modal {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  max-width: 520px;
  width: min(520px, 92vw);
  max-height: 85vh;
  overflow: auto;
  box-shadow: 0 16px 40px rgba(0,0,0,0.18);
}
.ob-panel--workspace { padding: 0; }

.ob-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px;
  color: #64748b;
}
.ob-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #e2e8f0;
  border-top-color: #0891b2;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ob-hero {
  border-radius: 14px;
  padding: 18px 20px;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #f8fafc 0%, #fff 55%);
}
.ob-hero.is-school {
  border-color: #a5f3fc;
  background: linear-gradient(135deg, #ecfeff 0%, #fff 60%);
}
.ob-hero.is-office {
  border-color: #cbd5e1;
  background: linear-gradient(135deg, #f1f5f9 0%, #fff 60%);
}
.ob-hero-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.ob-hero-title { margin: 0 0 8px; font-size: 1.5rem; font-weight: 800; color: #0f172a; }
.ob-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.ob-badge {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 8px;
  border-radius: 999px;
}
.ob-badge-type { background: #cffafe; color: #0e7490; }
.ob-badge-packet { background: #fef3c7; color: #92400e; }
.ob-hero.is-office .ob-badge-type { background: #e2e8f0; color: #334155; }
.ob-badge-status { background: #f1f5f9; color: #475569; }
.ob-badge-phase { background: #e0f2fe; color: #0369a1; }
.ob-badge-phase.phase-provider { background: #fef3c7; color: #92400e; }
.ob-badge-phase.phase-done { background: #dcfce7; color: #166534; }

.ob-progress-ring {
  --pct: 0;
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: conic-gradient(#0891b2 calc(var(--pct) * 1%), #e2e8f0 0);
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.ob-progress-ring::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: #fff;
}
.ob-progress-value {
  position: relative;
  z-index: 1;
  font-size: 0.75rem;
  font-weight: 800;
  color: #0e7490;
}

.ob-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px 16px;
  margin-top: 16px;
}
.ob-meta-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 2px;
}
.ob-meta-value { font-size: 0.9rem; font-weight: 600; color: #0f172a; }
.ob-meta-value.warn { color: #c2410c; }

.ob-progress-bar-wrap { margin-top: 14px; }
.ob-progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.ob-progress-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #0891b2, #22d3ee);
  border-radius: 999px;
  transition: width 0.35s ease;
}
.ob-progress-caption { font-size: 0.78rem; color: #64748b; margin-top: 6px; display: block; }

.ob-phase { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.ob-phase-pill {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
}
.phase-provider { background: #fef3c7; color: #92400e; }
.phase-done { background: #dcfce7; color: #166534; }

.ob-section-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  margin-bottom: 12px;
  overflow: hidden;
}
.ob-section-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
}
.ob-section-toggle:hover { background: #f1f5f9; }
.ob-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 0.95rem;
  color: #0f172a;
}
.ob-section-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
  color: #fff;
}
.ob-section-icon.staff { background: #0891b2; }
.ob-section-icon.roi { background: #0f766e; }
.ob-section-icon.docs { background: #6366f1; }
.ob-section-icon.provider { background: #d97706; }
.ob-area-hint {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
}
.ob-readonly-hint {
  margin: 0 0 10px;
  font-size: 0.8rem;
  font-style: italic;
}
.ob-sig-card {
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.ob-sig-card.done {
  border-color: #86efac;
  background: #f0fdf4;
}
.ob-sig-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  flex: 1;
  min-width: 220px;
}
.ob-sig-title { font-weight: 800; font-size: 0.9rem; color: #0f172a; }
.ob-sig-sub { font-size: 0.78rem; margin-top: 3px; line-height: 1.35; }
.ob-sig-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.ob-sig-pill.open { background: #fee2e2; color: #b91c1c; }
.ob-sig-pill.ok { background: #dcfce7; color: #166534; }
.ob-roi-doc-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #cbd5e1;
}
.ob-doc-check {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
}
.ob-doc-check input { width: 16px; height: 16px; cursor: pointer; }
.small { font-size: 0.82rem; }
.ob-section-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 999px;
}
.ob-chevron {
  font-size: 1.25rem;
  color: #94a3b8;
  transform: rotate(0deg);
  transition: transform 0.2s;
}
.ob-chevron.open { transform: rotate(90deg); }
.ob-section-body { padding: 4px 16px 14px; }

.ob-task-list { list-style: none; padding: 0; margin: 0; }
.ob-task {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}
.ob-task:last-child { border-bottom: none; }
.ob-task-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  margin-top: 1px;
}
.ob-task.done .ob-task-check {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.ob-task.done .ob-task-check svg { width: 14px; height: 14px; }
.ob-task.open .ob-task-check { border-color: #0891b2; background: #ecfeff; }
.ob-task-label { font-size: 0.92rem; font-weight: 600; color: #0f172a; }
.ob-task.done .ob-task-label { color: #64748b; text-decoration: line-through; text-decoration-color: #cbd5e1; }
.ob-task--roi.done .ob-task-label { text-decoration: none; color: #0f172a; }
.ob-task-body--full { flex: 1; min-width: 0; }
.ob-task-detail { font-size: 0.8rem; color: #c2410c; margin-top: 3px; }

.ob-docs { display: flex; flex-direction: column; gap: 8px; }
.ob-doc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.ob-doc-row.status-present { border-color: #86efac; background: #f0fdf4; }
.ob-doc-row.status-missing { border-color: #fecaca; background: #fef2f2; }
.ob-doc-label { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 600; }
.ob-doc-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
.ob-doc-row.status-present .ob-doc-dot { background: #16a34a; }
.ob-doc-row.status-missing .ob-doc-dot { background: #dc2626; }
.ob-doc-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.82rem;
  font-weight: 600;
  background: #fff;
  cursor: pointer;
}
.ob-doc-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: #e2e8f0;
}

.ob-note { font-size: 0.82rem; color: #64748b; margin: 10px 0 0; }
.ob-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}
.ob-action-hint { font-size: 0.82rem; }
.ob-action-success { font-size: 0.85rem; font-weight: 700; color: #15803d; }
.error { color: #b91c1c; margin-bottom: 8px; }
.muted { color: #64748b; }
.ob-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.ob-title { margin: 0; font-size: 1.1rem; }
.ob-sub { margin: 2px 0 0; font-size: 0.85rem; }
.close { border: none; background: none; font-size: 26px; cursor: pointer; line-height: 1; }
</style>
