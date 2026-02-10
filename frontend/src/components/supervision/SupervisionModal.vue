<template>
  <div class="supervision-modal supervision-panel" role="region" aria-labelledby="supervision-modal-title">
    <div class="supervision-modal-header">
      <button
        v-if="selectedSupervisee"
        type="button"
        class="supervision-modal-back"
        aria-label="Back to supervisees"
        @click="selectedSupervisee = null"
      >
        Back to supervisees
      </button>
      <h2 id="supervision-modal-title">
        {{ selectedSupervisee ? selectedSuperviseeDisplayName : 'Supervision' }}
      </h2>
    </div>
    <div class="supervision-modal-body">
        <!-- Step 1: List of supervisees -->
        <template v-if="!selectedSupervisee">
          <div v-if="loading" class="supervision-loading">Loading supervisees…</div>
          <div v-else-if="error" class="supervision-error">{{ error }}</div>
          <div v-else-if="supervisees.length === 0" class="supervision-empty">
            <p>No supervisees assigned. Contact an administrator to assign supervisees.</p>
          </div>
          <div v-else class="supervision-grid">
            <button
              v-for="s in supervisees"
              :key="superviseeKey(s)"
              type="button"
              class="supervision-card"
              @click="selectedSupervisee = s"
            >
              <div class="supervision-card-avatar" :class="{ 'has-photo': s.supervisee_profile_photo_url }">
                <img v-if="s.supervisee_profile_photo_url" :src="toUploadsUrl(s.supervisee_profile_photo_url)" :alt="superviseeDisplayName(s)" class="supervision-card-avatar-img" />
                <span v-else class="supervision-card-avatar-initial">{{ avatarInitial(s) }}</span>
              </div>
              <div class="supervision-card-info">
                <span class="supervision-card-name">{{ superviseeDisplayName(s) }}</span>
                <span class="supervision-card-meta">{{ s.supervisee_email || s.agency_name || '' }}</span>
              </div>
            </button>
          </div>
        </template>

        <!-- Step 2: Supervisee detail (hero card + at-a-glance + sections) -->
        <template v-else>
          <div class="supervision-detail">
            <section class="supervision-hero">
              <div class="supervision-hero-avatar" :class="{ 'has-photo': selectedSupervisee?.supervisee_profile_photo_url }">
                <img v-if="selectedSupervisee?.supervisee_profile_photo_url" :src="toUploadsUrl(selectedSupervisee.supervisee_profile_photo_url)" :alt="selectedSuperviseeDisplayName" class="supervision-hero-avatar-img" />
                <span v-else class="supervision-hero-avatar-initial">{{ selectedSupervisee ? avatarInitial(selectedSupervisee) : '' }}</span>
              </div>
              <div class="supervision-hero-info">
                <h2 class="supervision-hero-name">{{ selectedSuperviseeDisplayName }}</h2>
                <p v-if="selectedSupervisee?.supervisee_email" class="supervision-hero-meta">{{ selectedSupervisee.supervisee_email }}</p>
                <p v-if="selectedSupervisee?.agency_name" class="supervision-hero-meta">{{ selectedSupervisee.agency_name }}</p>
              </div>
            </section>
            <section class="supervision-detail-section at-a-glance-card">
              <h3>At a glance</h3>
              <div v-if="summaryLoading" class="supervision-placeholder">Loading snapshot…</div>
              <div v-else-if="summaryError" class="supervision-error-inline">{{ summaryError }}</div>
              <div v-else-if="summary" class="supervision-summary-grid">
                <div class="summary-cell">
                  <span class="summary-label">Last pay period</span>
                  <span class="summary-value">{{ summary.lastPaycheck ? `${summary.lastPaycheck.periodStart} → ${summary.lastPaycheck.periodEnd}` : '—' }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">Incomplete notes (last period)</span>
                  <span class="summary-value">{{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.totalUnits ?? 0) }} units</span>
                  <span class="summary-meta">No Note {{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.noNoteUnits ?? 0) }} · Draft {{ fmtNum(summary.unpaidNotes?.lastPayPeriod?.draftUnits ?? 0) }}</span>
                </div>
                <div class="summary-cell" v-if="showRatio && summary.directIndirect?.last">
                  <span class="summary-label">Direct/Indirect ratio</span>
                  <span class="summary-value" :class="`pill-${summary.directIndirect.last.kind}`">Last: {{ fmtPct(summary.directIndirect.last.ratio) }}</span>
                  <span class="summary-value" v-if="summary.directIndirect.avg90" :class="`pill-${summary.directIndirect.avg90.kind}`">90-day: {{ fmtPct(summary.directIndirect.avg90.ratio) }}</span>
                </div>
                <div class="summary-cell" v-if="summary.supervision?.enabled && summary.supervision?.isPrelicensed">
                  <span class="summary-label">Supervision hours (prelicensed)</span>
                  <span class="summary-value">{{ fmtNum(summary.supervision.totalHours) }} total</span>
                  <span class="summary-meta">Individual {{ fmtNum(summary.supervision.individualHours) }}/{{ fmtNum(summary.supervision.requiredIndividualHours) }} · Group {{ fmtNum(summary.supervision.groupHours) }}/{{ fmtNum(summary.supervision.requiredGroupHours) }}</span>
                </div>
                <div class="summary-cell" v-if="supervisionSessionHours != null">
                  <span class="summary-label">Supervision session hours</span>
                  <span class="summary-value">{{ fmtNum(supervisionSessionHours) }} hrs</span>
                  <span class="summary-meta" v-if="supervisionSessionCount != null">{{ supervisionSessionCount }} session(s)</span>
                </div>
                <div class="summary-cell" v-if="compliance24Plus.length > 0">
                  <span class="summary-label">Clients with 24+ sessions</span>
                  <span class="summary-value">{{ compliance24Plus.join(', ') }}</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">PTO</span>
                  <span class="summary-meta">Sick: {{ fmtNum(summary.pto?.balances?.sickHours ?? 0) }} hrs · Training: {{ fmtNum(summary.pto?.balances?.trainingHours ?? 0) }} hrs</span>
                </div>
                <div class="summary-cell">
                  <span class="summary-label">Supervisor</span>
                  <span class="summary-value">{{ summary.supervisor?.name || '—' }}</span>
                </div>
              </div>
            </section>
            <section class="supervision-detail-section">
              <h3>School / program portals</h3>
              <p class="supervision-placeholder" style="margin-bottom: 0.5rem;">You have read-only access to each school or program this supervisee is affiliated with.</p>
              <div v-if="affiliatedPortalsLoading" class="supervision-placeholder">Loading…</div>
              <div v-else-if="affiliatedPortalsError" class="supervision-error-inline">{{ affiliatedPortalsError }}</div>
              <div v-else-if="affiliatedPortals.length === 0" class="supervision-placeholder">No school or program portals for this supervisee.</div>
              <div v-else class="supervision-portal-buttons">
                <a
                  v-for="portal in affiliatedPortals"
                  :key="portal.id"
                  :href="`/${portal.slug}/dashboard`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary btn-sm"
                >
                  {{ portal.name }} portal
                </a>
              </div>
            </section>
            <section class="supervision-detail-section">
              <h3>Clients (caseload)</h3>
              <div v-if="clientsLoading" class="supervision-placeholder">Loading clients…</div>
              <div v-else-if="clientsError" class="supervision-error-inline">{{ clientsError }}</div>
              <div v-else-if="clientsList?.length" class="supervision-readonly-summary">
                <p><strong>{{ clientsList.length }}</strong> client(s) assigned. Read-only.</p>
                <ul class="supervision-client-links">
                  <li v-for="client in clientsList" :key="client.id || `${client.initials || ''}-${client.identifier_code || ''}`">
                    <a
                      v-if="clientPortalHref(client)"
                      :href="clientPortalHref(client)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="summary-meta"
                    >
                      {{ clientDisplayLabel(client) }}
                    </a>
                    <span v-else class="summary-meta">{{ clientDisplayLabel(client) }}</span>
                    <span v-if="clientSchoolName(client)" class="summary-meta"> — {{ clientSchoolName(client) }}</span>
                  </li>
                </ul>
              </div>
              <p v-else class="supervision-placeholder">No clients assigned for this agency.</p>
            </section>
            <section class="supervision-detail-section">
              <h3>Compliance list (not current)</h3>
              <div v-if="compliancePendingLoading" class="supervision-placeholder">Loading compliance list…</div>
              <div v-else-if="compliancePendingError" class="supervision-error-inline">{{ compliancePendingError }}</div>
              <div v-else-if="compliancePendingList.length === 0" class="supervision-placeholder">
                No pending compliance clients.
              </div>
              <div v-else class="compliance-grid">
                <button
                  v-for="row in compliancePendingList"
                  :key="`${row.client_id}-${row.organization_id}`"
                  type="button"
                  class="compliance-card"
                  @click="openComplianceClient(row)"
                >
                  <div class="compliance-card-title">
                    {{ complianceClientDisplayLabel(row) }}
                  </div>
                  <div class="compliance-card-meta">{{ row.organization_name || '—' }}</div>
                  <div class="compliance-card-meta">Pending {{ Number(row.days_since_assigned || 0) }}d</div>
                  <div class="compliance-card-missing">
                    {{ (row.missing_checklist || []).join(', ') || 'Checklist up to date' }}
                  </div>
                </button>
              </div>
            </section>
            <section class="supervision-detail-section">
              <h3>Schedules</h3>
              <div v-if="scheduleLoading" class="supervision-placeholder">Loading schedule…</div>
              <div v-else-if="scheduleError" class="supervision-error-inline">{{ scheduleError }}</div>
              <div v-else-if="scheduleSummary" class="supervision-readonly-summary">
                <p>Schedule summary for current week. View-only.</p>
                <p v-if="(scheduleSummary.officeEvents?.length || 0) + (scheduleSummary.supervisionSessions?.length || 0) > 0" class="summary-meta">
                  {{ scheduleSummary.officeEvents?.length || 0 }} office event(s), {{ scheduleSummary.supervisionSessions?.length || 0 }} supervision session(s).
                </p>
                <div v-if="affiliatedPortals.length > 0" class="supervision-portal-buttons" style="margin-top: 0.5rem;">
                  <a
                    v-for="portal in affiliatedPortals"
                    :key="`schedule-${portal.id}`"
                    :href="`/${portal.slug}/dashboard`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-secondary btn-sm"
                  >
                    Open {{ portal.name }} schedule view
                  </a>
                </div>
              </div>
              <p v-else class="supervision-placeholder">No schedule data for this week.</p>
            </section>
            <section class="supervision-detail-section">
              <h3>Checklist &amp; current training</h3>
              <div v-if="checklistLoading" class="supervision-placeholder">Loading checklist…</div>
              <div v-else-if="checklistError" class="supervision-error-inline">{{ checklistError }}</div>
              <div v-else-if="checklistData" class="supervision-checklist-readonly">
                <div v-if="checklistData.trainingItems?.length" class="checklist-group">
                  <strong>Current training (modules)</strong>
                  <ul>
                    <li v-for="item in checklistData.trainingItems" :key="item.id">{{ item.title }} — {{ item.is_completed ? 'Complete' : 'Incomplete' }}</li>
                  </ul>
                </div>
                <div v-if="checklistData.documentItems?.length" class="checklist-group">
                  <strong>Documents</strong>
                  <ul>
                    <li v-for="item in checklistData.documentItems" :key="item.id">{{ item.title }} — {{ item.is_completed ? 'Complete' : 'Incomplete' }}</li>
                  </ul>
                </div>
                <div v-if="checklistData.trainingFocusesWithItems?.length" class="checklist-group">
                  <strong>Training focus items</strong>
                  <ul>
                    <li v-for="f in checklistData.trainingFocusesWithItems" :key="f.trainingFocusId">
                      {{ f.trainingFocusName }}: {{ (f.modules || []).flatMap(m => m.checklistItems || []).length }} item(s)
                    </li>
                  </ul>
                </div>
                <p v-if="!checklistData.trainingItems?.length && !checklistData.documentItems?.length && !checklistData.trainingFocusesWithItems?.length" class="supervision-placeholder">No checklist items.</p>
              </div>
            </section>
            <!-- Documents: upload-only assign. When the main document process/feature is fixed in the main document section, update this flow to stay in sync. -->
            <section class="supervision-detail-section">
              <h3>Documents</h3>
              <p class="summary-meta" style="margin-bottom: 0.5rem;">Read-only status. You cannot open or view document content unless you assigned it. You can assign new documents for signature or review below.</p>
              <div v-if="documentsLoading" class="supervision-placeholder">Loading documents…</div>
              <div v-else-if="documentsError" class="supervision-error-inline">{{ documentsError }}</div>
              <ul v-else-if="documentsList?.length" class="supervision-docs-list">
                <li v-for="doc in documentsList" :key="doc.id">
                  <span>{{ doc.task_title || doc.document_title || `Document ${doc.id}` }}</span>
                  <span class="summary-meta"> — {{ formatTaskStatusLabel(doc.task_status) }}</span>
                </li>
              </ul>
              <p v-else class="supervision-placeholder">No documents.</p>
              <div style="margin-top: 0.75rem;">
                <button type="button" class="btn btn-primary btn-sm" @click="showUploadDocumentDialog = true">Assign document (upload PDF, choose type &amp; review/signature)</button>
              </div>
            </section>
            <section class="supervision-detail-section">
              <h3>Training</h3>
              <div v-if="checklistData?.trainingItems?.length || checklistData?.trainingFocusesWithItems?.length" class="summary-meta" style="margin-bottom: 0.5rem;">
                Training progress is shown in the checklist above.
              </div>
              <div>
                <button type="button" class="btn btn-primary btn-sm" @click="showModulePicker = true">
                  Assign module to this supervisee
                </button>
              </div>
            </section>

            <!-- Module picker for assign training -->
            <div v-if="showModulePicker" class="supervision-modal-overlay" style="z-index: 10000;" @click.self="showModulePicker = false">
              <div class="supervision-modal" style="max-width: 400px;">
                <div class="supervision-modal-header">
                  <h2>Assign module</h2>
                  <button type="button" class="supervision-modal-close" aria-label="Close" @click="showModulePicker = false">&times;</button>
                </div>
                <div class="supervision-modal-body">
                  <div class="form-group">
                    <label>Select module</label>
                    <select v-model="selectedModuleForAssign" class="input" style="width: 100%;">
                      <option value="">— Select module —</option>
                      <option v-for="m in assignableModules" :key="m.id" :value="m.id">{{ m.title }}</option>
                    </select>
                  </div>
                  <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button type="button" class="btn btn-secondary" @click="showModulePicker = false">Cancel</button>
                    <button type="button" class="btn btn-primary" :disabled="!selectedModuleForAssign" @click="openModuleAssignmentDialog">
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <ModuleAssignmentDialog
              v-if="showModuleAssignmentDialog && selectedModuleForAssignObj"
              :module="selectedModuleForAssignObj"
              :pre-selected-user-id="selectedSupervisee?.supervisee_id"
              @close="showModuleAssignmentDialog = false; selectedModuleForAssign = ''"
              @assigned="showModuleAssignmentDialog = false; selectedModuleForAssign = ''; fetchChecklist()"
            />
            <!-- Assign document: upload-only. Sync with main document section when that feature is fixed. -->
            <UserSpecificDocumentUploadDialog
              v-if="showUploadDocumentDialog && selectedSupervisee?.supervisee_id"
              :user-id="selectedSupervisee.supervisee_id"
              @close="showUploadDocumentDialog = false"
              @uploaded="onDocumentUploaded"
            />
            <section class="supervision-detail-section">
              <h3>Chat &amp; Schedule meeting</h3>
              <div class="supervision-actions-row">
                <a :href="chatsLink" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">Chat with supervisee</a>
              </div>
              <div class="schedule-meeting-form" style="margin-top: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem;">Schedule supervision meeting</h4>
                <form @submit.prevent="submitScheduleMeeting" class="supervision-form">
                  <div class="form-row">
                    <div class="form-group">
                      <label>Start *</label>
                      <input v-model="scheduleStartAt" type="datetime-local" required class="input" />
                    </div>
                    <div class="form-group">
                      <label>End *</label>
                      <input v-model="scheduleEndAt" type="datetime-local" required class="input" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Modality (optional)</label>
                    <input v-model="scheduleModality" type="text" class="input" placeholder="e.g. In-person, Video" />
                  </div>
                  <div class="form-group">
                    <label>Notes (optional)</label>
                    <textarea v-model="scheduleNotes" rows="2" class="input"></textarea>
                  </div>
                  <div v-if="scheduleError" class="supervision-error-inline" style="margin-bottom: 0.5rem;">{{ scheduleError }}</div>
                  <button type="submit" class="btn btn-primary btn-sm" :disabled="scheduleSaving">Schedule meeting</button>
                </form>
              </div>
              <div v-if="upcomingSessions.length > 0" class="upcoming-sessions" style="margin-top: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem;">Upcoming sessions (this week)</h4>
                <ul class="supervision-docs-list">
                  <li v-for="s in upcomingSessions" :key="s.id">
                    {{ formatSessionDate(s.startAt) }} – {{ formatSessionDate(s.endAt) }}
                    <span v-if="s.modality" class="summary-meta"> ({{ s.modality }})</span>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import ModuleAssignmentDialog from '../admin/ModuleAssignmentDialog.vue';
import UserSpecificDocumentUploadDialog from '../documents/UserSpecificDocumentUploadDialog.vue';

const route = useRoute();

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(true);
const error = ref('');
const supervisees = ref([]);
const selectedSupervisee = ref(null);
const summary = ref(null);
const summaryLoading = ref(false);
const summaryError = ref('');
const supervisionSessionHours = ref(null);
const supervisionSessionCount = ref(null);
const compliance24Plus = ref([]);
const scheduleSummary = ref(null);
const scheduleLoading = ref(false);
const scheduleError = ref('');
const checklistData = ref(null);
const checklistLoading = ref(false);
const checklistError = ref('');
const documentsList = ref([]);
const documentsLoading = ref(false);
const documentsError = ref('');
const clientsList = ref([]);
const clientsLoading = ref(false);
const clientsError = ref('');
const compliancePendingList = ref([]);
const compliancePendingLoading = ref(false);
const compliancePendingError = ref('');
const affiliatedPortals = ref([]);
const affiliatedPortalsLoading = ref(false);
const affiliatedPortalsError = ref('');
const showModulePicker = ref(false);
const showUploadDocumentDialog = ref(false);
const selectedModuleForAssign = ref('');
const assignableModules = ref([]);
const showModuleAssignmentDialog = ref(false);
const scheduleStartAt = ref('');
const scheduleEndAt = ref('');
const scheduleModality = ref('');
const scheduleNotes = ref('');
const scheduleSaving = ref(false);

// Link to user's own dashboard; chat drawer will open a thread with the supervisee via openChatWith/agencyId (avoids admin-only chats page).
const chatsLink = computed(() => {
  const slug = route.params?.organizationSlug || '';
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  const params = new URLSearchParams();
  if (s?.supervisee_id) params.set('openChatWith', String(s.supervisee_id));
  if (agencyId) params.set('agencyId', String(agencyId));
  if (selectedSuperviseeDisplayName.value) params.set('openChatWithName', selectedSuperviseeDisplayName.value);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
});


const upcomingSessions = computed(() => {
  const list = scheduleSummary.value?.supervisionSessions || [];
  const now = new Date();
  return list
    .filter((s) => s.role === 'supervisee' && new Date(s.startAt || 0) >= now)
    .slice(0, 10);
});

function formatSessionDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

async function submitScheduleMeeting() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) return;
  const startAt = scheduleStartAt.value?.trim();
  const endAt = scheduleEndAt.value?.trim();
  if (!startAt || !endAt) {
    scheduleError.value = 'Start and end are required.';
    return;
  }
  scheduleSaving.value = true;
  scheduleError.value = '';
  try {
    await api.post('/supervision/sessions', {
      agencyId,
      supervisorUserId: authStore.user?.id,
      superviseeUserId: s.supervisee_id,
      startAt: startAt.replace('T', ' ').slice(0, 19),
      endAt: endAt.replace('T', ' ').slice(0, 19),
      modality: scheduleModality.value?.trim() || null,
      notes: scheduleNotes.value?.trim() || null
    });
    scheduleStartAt.value = '';
    scheduleEndAt.value = '';
    scheduleModality.value = '';
    scheduleNotes.value = '';
    await fetchScheduleSummary();
    await fetchSuperviseeExtras();
  } catch (err) {
    scheduleError.value = err?.response?.data?.error?.message || 'Failed to schedule meeting.';
  } finally {
    scheduleSaving.value = false;
  }
}

const selectedModuleForAssignObj = computed(() => {
  const id = selectedModuleForAssign.value ? parseInt(selectedModuleForAssign.value, 10) : null;
  if (!id) return null;
  return (assignableModules.value || []).find((m) => Number(m.id) === id) || null;
});

const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  return a?.id ?? null;
});

const selectedSuperviseeAgencyId = computed(() => {
  const selectedAgencyId = selectedSupervisee.value?.agency_id;
  return selectedAgencyId || currentAgencyId.value || null;
});

const affiliatedPortalsByOrgId = computed(() => {
  const map = new Map();
  for (const portal of affiliatedPortals.value || []) {
    const orgId = Number(portal?.id || 0);
    if (orgId) map.set(orgId, portal);
  }
  return map;
});

function portalSlugForOrgId(orgId) {
  const oid = Number(orgId || 0);
  if (oid && affiliatedPortalsByOrgId.value.has(oid)) {
    return affiliatedPortalsByOrgId.value.get(oid)?.slug || '';
  }
  return (affiliatedPortals.value?.[0]?.slug || '').trim();
}

function portalNameForOrgId(orgId) {
  const oid = Number(orgId || 0);
  if (oid && affiliatedPortalsByOrgId.value.has(oid)) {
    return String(affiliatedPortalsByOrgId.value.get(oid)?.name || '').trim();
  }
  return '';
}

function clientDisplayLabel(client) {
  const initials = String(client?.initials || '').trim();
  const fullName = String(client?.full_name || '').trim();
  const code = String(client?.identifier_code || '').trim();
  if (initials) return initials;
  if (fullName) return fullName;
  if (code) return code;
  return `Client ${client?.id || ''}`.trim();
}

function clientSchoolName(client) {
  const direct = String(client?.organization_name || '').trim();
  if (direct) return direct;
  return portalNameForOrgId(client?.organization_id);
}

function complianceClientDisplayLabel(row) {
  const initials = String(row?.client_initials || '').trim();
  const fullName = String(row?.client_full_name || '').trim();
  const code = String(row?.client_identifier_code || '').trim();
  if (initials) return initials;
  if (fullName) return fullName;
  if (code) return code;
  return 'Client';
}

function formatTaskStatusLabel(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Pending';
  const normalized = raw.toLowerCase();
  const map = {
    completed: 'Complete',
    pending: 'Pending',
    pending_review: 'Pending review',
    pending_signature: 'Pending signature',
    in_progress: 'In progress',
    rejected: 'Rejected',
    declined: 'Declined'
  };
  if (map[normalized]) return map[normalized];
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function clientPortalHref(client) {
  const slug = String(client?.organization_slug || portalSlugForOrgId(client?.organization_id) || '').trim();
  const clientId = Number(client?.id || 0);
  if (!slug || !clientId) return '';
  return `/${slug}/dashboard?sp=roster&clientId=${clientId}`;
}

function complianceClientHref(row) {
  const slug = String(portalSlugForOrgId(row?.organization_id) || '').trim();
  const clientId = Number(row?.client_id || 0);
  if (!slug || !clientId) return '';
  return `/${slug}/dashboard?sp=roster&clientId=${clientId}`;
}

function openComplianceClient(row) {
  const href = complianceClientHref(row);
  if (!href) return;
  window.open(href, '_blank', 'noopener');
}

function superviseeDisplayName(s) {
  const first = (s.supervisee_first_name || '').trim();
  const last = (s.supervisee_last_name || '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return s.supervisee_email || `User ${s.supervisee_id}`;
}

const selectedSuperviseeDisplayName = computed(() => {
  const s = selectedSupervisee.value;
  return s ? superviseeDisplayName(s) : '';
});

function avatarInitial(s) {
  const first = (s.supervisee_first_name || '').trim().slice(0, 1);
  const last = (s.supervisee_last_name || '').trim().slice(0, 1);
  if (first && last) return (first + last).toUpperCase();
  if (first) return first.toUpperCase();
  if (s.supervisee_email) return s.supervisee_email.slice(0, 1).toUpperCase();
  return '?';
}

function superviseeKey(s) {
  return `${s.supervisee_id}-${s.agency_id || ''}-${s.id || ''}`;
}

async function fetchSupervisees() {
  const userId = authStore.user?.id;
  if (!userId) {
    error.value = 'Not signed in.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = currentAgencyId.value ? { agencyId: currentAgencyId.value } : {};
    let response = await api.get(`/supervisor-assignments/supervisor/${userId}`, { params });
    let rows = Array.isArray(response.data) ? response.data : [];
    // When opened from a school portal, currentAgency can be a school org; retry unscoped if nothing is returned.
    if (rows.length === 0 && currentAgencyId.value) {
      response = await api.get(`/supervisor-assignments/supervisor/${userId}`);
      rows = Array.isArray(response.data) ? response.data : [];
    }
    supervisees.value = rows;
  } catch (err) {
    console.error('Failed to fetch supervisees:', err);
    error.value = err?.response?.data?.error?.message || 'Failed to load supervisees.';
    supervisees.value = [];
  } finally {
    loading.value = false;
  }
}

const showRatio = computed(() => {
  const s = summary.value?.directIndirect;
  return s && !s.disabled && (s.last || s.avg90);
});

function fmtNum(n) {
  if (n == null || n === '') return '0';
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(n);
}
function fmtPct(ratio) {
  if (ratio == null) return '—';
  if (!Number.isFinite(ratio)) return '∞';
  return (ratio * 100).toFixed(1) + '%';
}

async function fetchSuperviseeSummary() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) {
    summary.value = null;
    return;
  }
  summaryLoading.value = true;
  summaryError.value = '';
  try {
    const response = await api.get(`/payroll/supervisee/${s.supervisee_id}/dashboard-summary`, { params: { agencyId } });
    summary.value = response.data;
  } catch (err) {
    console.error('Failed to fetch supervisee summary:', err);
    summaryError.value = err?.response?.data?.error?.message || 'Failed to load snapshot.';
    summary.value = null;
  } finally {
    summaryLoading.value = false;
  }
}

async function fetchSuperviseeExtras() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) return;
  supervisionSessionHours.value = null;
  supervisionSessionCount.value = null;
  compliance24Plus.value = [];
  try {
    const [hoursRes, complianceRes] = await Promise.all([
      api.get(`/supervision/supervisee/${s.supervisee_id}/hours-summary`, { params: { agencyId } }).catch(() => ({ data: null })),
      api.get(`/psychotherapy-compliance/supervisee/${s.supervisee_id}/clients-24-plus`, { params: { agencyId } }).catch(() => ({ data: null }))
    ]);
    if (hoursRes?.data?.ok) {
      supervisionSessionHours.value = hoursRes.data.totalHours;
      supervisionSessionCount.value = hoursRes.data.sessionCount;
    }
    if (complianceRes?.data?.clientAbbrevs) {
      compliance24Plus.value = complianceRes.data.clientAbbrevs;
    }
  } catch {
    // ignore
  }
}

async function fetchScheduleSummary() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id) return;
  scheduleLoading.value = true;
  scheduleError.value = '';
  scheduleSummary.value = null;
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const response = await api.get(`/users/${s.supervisee_id}/schedule-summary`, {
      params: { agencyId: agencyId || undefined, weekStart: weekStartStr }
    });
    scheduleSummary.value = response.data;
  } catch (err) {
    scheduleError.value = err?.response?.data?.error?.message || 'Failed to load schedule.';
  } finally {
    scheduleLoading.value = false;
  }
}

async function fetchChecklist() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) return;
  checklistLoading.value = true;
  checklistError.value = '';
  checklistData.value = null;
  try {
    const response = await api.get(`/users/${s.supervisee_id}/unified-checklist`);
    checklistData.value = response.data;
  } catch (err) {
    checklistError.value = err?.response?.data?.error?.message || 'Failed to load checklist.';
  } finally {
    checklistLoading.value = false;
  }
}

async function fetchDocuments() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) return;
  documentsLoading.value = true;
  documentsError.value = '';
  documentsList.value = [];
  try {
    const response = await api.get(`/user-documents/user/${s.supervisee_id}`);
    documentsList.value = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    documentsError.value = err?.response?.data?.error?.message || 'Failed to load documents.';
  } finally {
    documentsLoading.value = false;
  }
}

async function fetchClients() {
  const s = selectedSupervisee.value;
  const agencyId = selectedSuperviseeAgencyId.value;
  if (!s?.supervisee_id || !agencyId) {
    clientsList.value = [];
    return;
  }
  clientsLoading.value = true;
  clientsError.value = '';
  clientsList.value = [];
  try {
    const response = await api.get(`/clients/for-user/${s.supervisee_id}`, { params: { agencyId } });
    clientsList.value = Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    clientsError.value = err?.response?.data?.error?.message || 'Failed to load clients.';
    clientsList.value = [];
  } finally {
    clientsLoading.value = false;
  }
}

async function fetchCompliancePending() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) {
    compliancePendingList.value = [];
    return;
  }
  compliancePendingLoading.value = true;
  compliancePendingError.value = '';
  compliancePendingList.value = [];
  try {
    const response = await api.get('/compliance-corner/pending-clients', {
      params: { providerUserId: s.supervisee_id }
    });
    compliancePendingList.value = Array.isArray(response.data?.results) ? response.data.results : [];
  } catch (err) {
    compliancePendingError.value = err?.response?.data?.error?.message || 'Failed to load compliance list.';
  } finally {
    compliancePendingLoading.value = false;
  }
}

async function fetchAffiliatedPortals() {
  const s = selectedSupervisee.value;
  if (!s?.supervisee_id) {
    affiliatedPortals.value = [];
    return;
  }
  affiliatedPortalsLoading.value = true;
  affiliatedPortalsError.value = '';
  affiliatedPortals.value = [];
  try {
    const response = await api.get(`/users/${s.supervisee_id}/affiliated-portals`);
    affiliatedPortals.value = Array.isArray(response.data?.portals) ? response.data.portals : [];
  } catch (err) {
    affiliatedPortalsError.value = err?.response?.data?.error?.message || 'Failed to load portals.';
    affiliatedPortals.value = [];
  } finally {
    affiliatedPortalsLoading.value = false;
  }
}

function onDocumentUploaded() {
  showUploadDocumentDialog.value = false;
  fetchDocuments();
}

async function fetchAssignableModules() {
  try {
    const response = await api.get('/modules');
    assignableModules.value = Array.isArray(response.data) ? response.data : [];
  } catch {
    assignableModules.value = [];
  }
}

function openModuleAssignmentDialog() {
  if (!selectedModuleForAssignObj.value) return;
  showModulePicker.value = false;
  showModuleAssignmentDialog.value = true;
}

watch(showModulePicker, (v) => {
  if (v) fetchAssignableModules();
});

watch(selectedSupervisee, (v) => {
  summary.value = null;
  summaryError.value = '';
  supervisionSessionHours.value = null;
  supervisionSessionCount.value = null;
  compliance24Plus.value = [];
  scheduleSummary.value = null;
  scheduleError.value = '';
  checklistData.value = null;
  checklistError.value = '';
  documentsList.value = [];
  documentsError.value = '';
  clientsList.value = [];
  clientsError.value = '';
  compliancePendingList.value = [];
  compliancePendingError.value = '';
  affiliatedPortals.value = [];
  affiliatedPortalsError.value = '';
  showModulePicker.value = false;
  showModuleAssignmentDialog.value = false;
  showUploadDocumentDialog.value = false;
  selectedModuleForAssign.value = '';
  if (v) {
    fetchSuperviseeSummary();
    fetchSuperviseeExtras();
    fetchScheduleSummary();
    fetchChecklist();
    fetchDocuments();
    fetchClients();
    fetchCompliancePending();
    fetchAffiliatedPortals();
  } else {
    summaryLoading.value = false;
  }
});

onMounted(() => {
  fetchSupervisees();
});
</script>

<style scoped>
.supervision-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.supervision-modal {
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  width: 90vw;
  max-width: 720px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.supervision-panel {
  width: 100%;
  max-width: none;
  max-height: none;
  min-height: 60vh;
  box-shadow: none;
  border: 1px solid var(--border, #e5e7eb);
}
.compliance-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.compliance-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}
.compliance-card-title {
  font-weight: 900;
}
.compliance-card-meta {
  font-size: 12px;
  color: var(--text-secondary);
}
.compliance-card-missing {
  margin-top: 6px;
  font-size: 12px;
  color: #b91c1c;
  font-weight: 700;
}
.supervision-modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}
.supervision-modal-back {
  background: none;
  border: none;
  font-size: 0.9rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  padding: 0.25rem 0;
}
.supervision-modal-back:hover {
  color: var(--text, #111);
}
.supervision-modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  flex: 1;
}
.supervision-modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  padding: 0.25rem;
}
.supervision-modal-close:hover {
  color: var(--text, #111);
}
.supervision-modal-body {
  padding: 1.25rem;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.supervision-loading,
.supervision-error,
.supervision-empty {
  padding: 1rem 0;
  color: var(--text-secondary, #6b7280);
}
.supervision-error {
  color: var(--danger, #b91c1c);
}
.supervision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.supervision-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: var(--bg-alt, #f9fafb);
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.supervision-card:hover {
  background: #fff;
  border-color: var(--primary, #2563eb);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);
}
.supervision-card-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #1d4ed8 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
  flex-shrink: 0;
  overflow: hidden;
}
.supervision-card-avatar.has-photo {
  background: transparent;
}
.supervision-card-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.supervision-card-avatar-initial {
  line-height: 1;
}
.supervision-card-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.supervision-card-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text, #111);
}
.supervision-card-meta {
  font-size: 0.85rem;
  color: var(--text-secondary, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.supervision-client-links {
  margin: 0.35rem 0 0;
  padding-left: 1.15rem;
}
.supervision-client-links li {
  margin: 0.2rem 0;
}

/* Supervisee detail hero (photo + name) */
.supervision-hero {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem 1.25rem;
  border-radius: 14px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid var(--border, #e2e8f0);
  margin-bottom: 0.25rem;
}
.supervision-hero-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary, #2563eb) 0%, #1d4ed8 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 2rem;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25);
}
.supervision-hero-avatar.has-photo {
  background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}
.supervision-hero-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.supervision-hero-avatar-initial {
  line-height: 1;
}
.supervision-hero-info {
  flex: 1;
  min-width: 0;
}
.supervision-hero-name {
  margin: 0 0 0.35rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text, #111);
  letter-spacing: -0.02em;
}
.supervision-hero-meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #64748b);
}
.supervision-hero-meta + .supervision-hero-meta {
  margin-top: 0.15rem;
}
.supervision-detail {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.supervision-detail-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text, #111);
}
.supervision-placeholder {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #6b7280);
}
.supervision-error-inline {
  color: var(--danger, #b91c1c);
  font-size: 0.9rem;
}
.supervision-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem 1rem;
}
.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.summary-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary, #6b7280);
}
.summary-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text, #111);
}
.summary-value.pill-green { color: #166534; }
.summary-value.pill-yellow { color: #92400e; }
.summary-value.pill-red { color: #991b1b; }
.summary-meta {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
.supervision-checklist-readonly .checklist-group {
  margin-bottom: 0.75rem;
}
.supervision-checklist-readonly .checklist-group ul {
  margin: 0.25rem 0 0 1rem;
  padding: 0;
}
.supervision-docs-list {
  margin: 0;
  padding-left: 1.25rem;
}
.supervision-docs-list li {
  margin-bottom: 0.25rem;
}
.supervision-actions-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.supervision-portal-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.supervision-form .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.supervision-form .form-group {
  margin-bottom: 0.75rem;
}
.supervision-form .form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}
.supervision-form .input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
}
</style>
