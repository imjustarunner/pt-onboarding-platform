<template>
  <div class="container hiring-root">
    <div class="header">
      <div>
        <h2>Applicants</h2>
        <div class="subtle">Prospective candidates (internal)</div>
      </div>
      <div class="header-actions">
        <div v-if="canChooseAgency" class="agency-picker">
          <label class="agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="input agency-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
        <button class="btn btn-primary" @click="openCreate">New applicant</button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="grid">
      <div class="panel list-panel">
        <div class="list-controls">
          <input v-model="q" class="input" placeholder="Search name/email…" @keyup.enter="refresh" />
          <button class="btn btn-secondary" @click="refresh" :disabled="loading">Search</button>
        </div>

        <div v-if="loading" class="loading">Loading applicants…</div>
        <div v-else class="list">
          <button
            v-for="c in candidates"
            :key="c.id"
            class="list-item"
            :class="{ active: selectedId === c.id }"
            @click="selectCandidate(c.id)"
          >
            <div class="name">{{ c.first_name }} {{ c.last_name }}</div>
            <div class="meta">
              <span class="pill">{{ c.stage || 'applied' }}</span>
              <span class="email">{{ c.personal_email || c.email }}</span>
            </div>
          </button>

          <div v-if="candidates.length === 0" class="empty">No applicants found.</div>
        </div>
      </div>

      <div class="panel detail-panel">
        <div v-if="!selectedId" class="empty">Select an applicant to view details.</div>

        <div v-else>
          <div v-if="detailLoading" class="loading">Loading profile…</div>

          <template v-else>
            <div class="detail-header">
              <div>
                <h3 class="detail-name">{{ candidateName }}</h3>
                <div class="detail-meta">
                  <span class="pill">{{ detail.profile?.stage || 'applied' }}</span>
                  <span class="muted">{{ detail.user?.personal_email || detail.user?.email }}</span>
                </div>
              </div>
              <div class="detail-actions">
                <button class="btn btn-secondary" @click="generatePreScreenReport" :disabled="generatingPreScreen || !selectedId">
                  <span v-if="generatingPreScreen" class="spinner" aria-hidden="true"></span>
                  {{ generatingPreScreen ? 'Generating…' : 'Generate Pre-Screen Report' }}
                </button>
                <button class="btn btn-primary" @click="promote" :disabled="promoting || !selectedId">
                  {{ promoting ? 'Promoting…' : 'Mark hired (start setup)' }}
                </button>
              </div>
            </div>

            <div v-if="promoteResult?.passwordlessTokenLink" class="info-banner">
              <div><strong>Setup link:</strong></div>
              <div class="mono">{{ promoteResult.passwordlessTokenLink }}</div>
            </div>

            <div class="tabs">
              <button class="tab" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">Profile</button>
              <button class="tab" :class="{ active: tab === 'resume' }" @click="tab = 'resume'">Resume</button>
              <button class="tab" :class="{ active: tab === 'resumeSummary' }" @click="tab = 'resumeSummary'">Resume Summary</button>
              <button class="tab" :class="{ active: tab === 'notes' }" @click="tab = 'notes'">Notes</button>
              <button class="tab" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">Tasks</button>
              <button class="tab" :class="{ active: tab === 'prescreen' }" @click="tab = 'prescreen'">Pre-Screen</button>
            </div>

            <!-- Profile -->
            <div v-if="tab === 'profile'" class="tab-body">
              <div class="kv">
                <div class="k">Stage</div>
                <div class="v">{{ detail.profile?.stage || 'applied' }}</div>
              </div>
              <div v-if="canChooseAgency" class="kv">
                <div class="k">Agency</div>
                <div class="v">
                  <div class="row-actions">
                    <select v-model="transferToAgencyId" class="input">
                      <option value="">Move to…</option>
                      <option
                        v-for="a in agencyChoices"
                        :key="a.id"
                        :value="String(a.id)"
                        :disabled="Number(a.id) === Number(effectiveAgencyId)"
                      >
                        {{ a.name }}
                      </option>
                    </select>
                    <button
                      class="btn btn-secondary"
                      @click="transferAgency"
                      :disabled="transferringAgency || !transferToAgencyId"
                    >
                      {{ transferringAgency ? 'Moving…' : 'Move' }}
                    </button>
                  </div>
                  <div class="muted small" style="margin-top:6px;">
                    Moves this applicant to another agency and reassigns their hiring tasks to that agency.
                  </div>
                </div>
              </div>
              <div class="kv">
                <div class="k">Applied role</div>
                <div class="v">{{ detail.profile?.applied_role || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Source</div>
                <div class="v">{{ detail.profile?.source || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Phone</div>
                <div class="v">{{ detail.user?.phone_number || '—' }}</div>
              </div>
            </div>

            <!-- Resume -->
            <div v-if="tab === 'resume'" class="tab-body">
              <div class="resume-actions">
                <input type="file" ref="resumeFile" @change="onResumeFileChange" />
                <input v-model="resumeTitle" class="input" placeholder="Title (optional)" />
                <button class="btn btn-primary" @click="uploadResume" :disabled="resumeUploading || !resumeSelectedFile">
                  {{ resumeUploading ? 'Uploading…' : 'Upload resume' }}
                </button>
              </div>
              <div v-if="resumeError" class="error-banner">{{ resumeError }}</div>
              <div v-if="resumesLoading" class="loading">Loading resumes…</div>
              <div v-else>
                <div v-if="resumes.length === 0" class="empty">No resumes uploaded yet.</div>
                <div v-else class="resume-list">
                  <div v-for="r in resumes" :key="r.id" class="resume-row">
                    <div>
                      <div class="name">{{ r.title || 'Resume' }}</div>
                      <div class="resume-meta">
                        <span class="muted small">{{ r.originalName || '' }}</span>
                        <span
                          v-if="resumeParseLabel(r)"
                          class="resume-badge"
                          :class="resumeParseClass(r)"
                          :title="resumeParseTitle(r)"
                        >
                          {{ resumeParseLabel(r) }}
                        </span>
                      </div>
                    </div>
                    <div class="row-actions">
                      <button class="btn btn-secondary" @click="viewResume(r)">View</button>
                      <button class="btn btn-danger" @click="deleteResume(r)">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Resume Summary -->
            <div v-if="tab === 'resumeSummary'" class="tab-body">
              <div class="info-banner">
                <strong>Internal-only.</strong> This is an AI-structured summary from the uploaded resume text. Verify against the source PDF.
              </div>
              <div class="row-actions" style="margin-bottom:10px;">
                <button class="btn btn-primary" @click="generateResumeSummary" :disabled="resumeSummaryGenerating">
                  {{ resumeSummaryGenerating ? 'Generating…' : 'Generate from resume' }}
                </button>
              </div>
              <div v-if="resumeSummaryError" class="error-banner">{{ resumeSummaryError }}</div>
              <div v-if="resumeSummaryLoading" class="loading">Loading…</div>
              <div v-else-if="!resumeSummary" class="empty">
                No resume summary yet. Upload a resume (text-based PDF) and click “Generate from resume”.
              </div>
              <div v-else class="summary-grid">
                <div class="summary-card">
                  <div class="summary-title">Credentialing hints</div>
                  <div class="muted small">Suggested only; verify.</div>
                  <div class="kv">
                    <div class="k">Likely licensure status</div>
                    <div class="v">{{ resumeSummary?.summary?.credentialingHints?.likelyLicensureStatus || 'unknown' }}</div>
                  </div>
                  <div class="kv">
                    <div class="k">States mentioned</div>
                    <div class="v">{{ (resumeSummary?.summary?.credentialingHints?.statesMentioned || []).join(', ') || '—' }}</div>
                  </div>
                  <div class="kv">
                    <div class="k">Needs supervision</div>
                    <div class="v">
                      {{ resumeSummary?.summary?.credentialingHints?.needsSupervision === null || resumeSummary?.summary?.credentialingHints?.needsSupervision === undefined
                        ? '—'
                        : (resumeSummary?.summary?.credentialingHints?.needsSupervision ? 'Yes' : 'No') }}
                    </div>
                  </div>
                  <div v-if="resumeSummary?.summary?.credentialingHints?.notesForCredentialingTeam" class="muted small" style="margin-top:6px;">
                    {{ resumeSummary.summary.credentialingHints.notesForCredentialingTeam }}
                  </div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">Work history</div>
                  <div v-if="(resumeSummary?.summary?.workHistory || []).length === 0" class="empty">No work history extracted.</div>
                  <div v-else class="summary-list">
                    <div v-for="(w, idx) in resumeSummary.summary.workHistory" :key="idx" class="summary-item">
                      <div class="name">{{ w.title || 'Role' }} <span class="muted small">at</span> {{ w.employer || '—' }}</div>
                      <div class="muted small">{{ [w.startDate, w.endDate].filter(Boolean).join(' – ') || '—' }} <span v-if="w.location">• {{ w.location }}</span></div>
                      <div v-if="w.summary" class="small">{{ w.summary }}</div>
                    </div>
                  </div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">Education</div>
                  <div v-if="(resumeSummary?.summary?.education || []).length === 0" class="empty">No education extracted.</div>
                  <div v-else class="summary-list">
                    <div v-for="(ed, idx) in resumeSummary.summary.education" :key="idx" class="summary-item">
                      <div class="name">{{ ed.school || '—' }}</div>
                      <div class="muted small">{{ [ed.degree, ed.field].filter(Boolean).join(' • ') || '—' }}</div>
                      <div class="muted small">{{ [ed.startDate, ed.endDate].filter(Boolean).join(' – ') || '—' }}</div>
                      <div v-if="ed.notes" class="small">{{ ed.notes }}</div>
                    </div>
                  </div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">Licenses & certifications</div>
                  <div v-if="(resumeSummary?.summary?.licensesAndCertifications || []).length === 0" class="empty">No licenses/certs extracted.</div>
                  <div v-else class="summary-list">
                    <div v-for="(lic, idx) in resumeSummary.summary.licensesAndCertifications" :key="idx" class="summary-item">
                      <div class="name">{{ lic.name || '—' }}</div>
                      <div class="muted small">
                        {{ [lic.state, lic.status].filter(Boolean).join(' • ') || '—' }}
                        <span v-if="lic.licenseNumber">• #{{ lic.licenseNumber }}</span>
                      </div>
                      <div class="muted small">
                        {{ [lic.issuedDate ? ('Issued: ' + lic.issuedDate) : null, lic.expirationDate ? ('Expires: ' + lic.expirationDate) : null].filter(Boolean).join(' • ') || '—' }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="summary-card">
                  <div class="summary-title">Skills</div>
                  <div class="small">{{ (resumeSummary?.summary?.skills || []).join(', ') || '—' }}</div>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="tab === 'notes'" class="tab-body">
              <div class="note-compose">
                <textarea v-model="noteMessage" class="textarea" placeholder="Add a note…" rows="3" />
                <button class="btn btn-primary" @click="addNote" :disabled="noteSaving || !noteMessage.trim()">
                  {{ noteSaving ? 'Saving…' : 'Add note' }}
                </button>
              </div>
              <div class="note-list">
                <div v-for="n in detail.notes || []" :key="n.id" class="note">
                  <div class="note-head">
                    <div class="note-author">{{ noteAuthor(n) }}</div>
                    <div class="note-time">{{ formatTime(n.created_at) }}</div>
                  </div>
                  <div class="note-body">{{ n.message }}</div>
                </div>
                <div v-if="(detail.notes || []).length === 0" class="empty">No notes yet.</div>
              </div>
            </div>

            <!-- Tasks -->
            <div v-if="tab === 'tasks'" class="tab-body">
              <div class="task-compose">
                <input v-model="taskTitle" class="input" placeholder="Task title (e.g., Call applicant)" />
                <textarea v-model="taskDescription" class="textarea" placeholder="Details (optional)" rows="2" />
                <div class="task-row">
                  <select v-model="taskAssigneeId" class="input">
                    <option value="">Assign to…</option>
                    <option v-for="u in assignees" :key="u.id" :value="u.id">
                      {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
                    </option>
                  </select>
                  <input v-model="taskDueDate" class="input" type="date" />
                  <button class="btn btn-primary" @click="createTask" :disabled="taskSaving || !taskTitle.trim() || !taskAssigneeId">
                    {{ taskSaving ? 'Creating…' : 'Create task' }}
                  </button>
                </div>
              </div>

              <div v-if="tasksLoading" class="loading">Loading tasks…</div>
              <div v-else class="task-list">
                <div v-for="t in tasks" :key="t.id" class="task">
                  <div class="task-title">{{ t.title }}</div>
                  <div class="muted small">{{ t.description }}</div>
                  <div class="muted small">Due: {{ t.due_date ? formatDate(t.due_date) : '—' }}</div>
                </div>
                <div v-if="tasks.length === 0" class="empty">No hiring tasks yet.</div>
              </div>
            </div>

            <!-- Pre-Screen -->
            <div v-if="tab === 'prescreen'" class="tab-body">
              <div class="info-banner">
                <strong>AI-Generated Summary.</strong> Information may be inaccurate. Verify all details manually. Do not use as the sole basis for employment decisions.
              </div>

              <div class="kv">
                <div class="k">LinkedIn URL</div>
                <div class="v">
                  <input v-model="preScreenLinkedInUrl" class="input" placeholder="https://www.linkedin.com/in/..." />
                </div>
              </div>
              <div class="kv">
                <div class="k">Resume text</div>
                <div class="v">
                  <div class="muted small">
                    Uses the latest uploaded resume (text is extracted server-side). If the resume is a scanned PDF/image, extraction may be empty until we add OCR.
                  </div>
                </div>
              </div>

              <div class="kv">
                <div class="k">Latest status</div>
                <div class="v">{{ detail.latestPreScreen?.status || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Created</div>
                <div class="v">{{ detail.latestPreScreen?.created_at ? formatTime(detail.latestPreScreen.created_at) : '—' }}</div>
              </div>

              <div v-if="detail.latestPreScreen?.report_json?.grounding?.searchEntryPoint?.renderedContent" class="search-suggestions">
                <div class="muted small" style="margin-bottom:6px;">Search suggestions (from Google Search grounding):</div>
                <div v-html="detail.latestPreScreen.report_json.grounding.searchEntryPoint.renderedContent"></div>
              </div>

              <div class="research-box">
                <div v-if="preScreenHtml" class="markdown" v-html="preScreenHtml"></div>
                <div v-else class="muted small">No pre-screen report yet. Click “Generate Pre-Screen Report”.</div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="closeCreate">
      <div class="modal">
        <div class="modal-header">
          <h3>New applicant</h3>
          <button class="btn-close" @click="closeCreate" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <input v-model="createForm.firstName" class="input" placeholder="First name" />
            <input v-model="createForm.lastName" class="input" placeholder="Last name (required)" />
            <input v-model="createForm.personalEmail" class="input" placeholder="Personal email (required)" />
            <input v-model="createForm.phoneNumber" class="input" placeholder="Phone (optional)" />
            <input v-model="createForm.appliedRole" class="input" placeholder="Applied role (optional)" />
            <input v-model="createForm.source" class="input" placeholder="Source (optional)" />
          </div>
          <div v-if="createError" class="error-banner">{{ createError }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeCreate">Cancel</button>
          <button class="btn btn-primary" @click="createApplicant" :disabled="createSaving">
            {{ createSaving ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const candidates = ref([]);
const q = ref('');

const selectedId = ref(null);
const detailLoading = ref(false);
const detail = ref({ user: null, profile: null, notes: [], latestResearch: null, latestPreScreen: null });

const tab = ref('profile');

const agencyChoices = computed(() => {
  // Super admin: can browse all agencies. Others: only assigned agencies.
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);

  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const canChooseAgency = computed(() => (agencyChoices.value || []).length > 1);
const selectedAgencyId = ref('');
const agencyStorageKey = computed(() => `hiring_selected_agency_v1_${authStore.user?.id || 'anon'}`);

const effectiveAgencyId = computed(() => {
  // First: explicit selection on this page.
  const chosen = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (chosen) return chosen;

  // Prefer explicit agency context (brand/selector)
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const fromStore = a?.id || null;
  if (fromStore) return fromStore;

  // Fallback: some sessions only have agencyId/agencyIds on the user object.
  const fromUser = authStore.user?.agencyId || null;
  if (fromUser) return fromUser;

  const ids = Array.isArray(authStore.user?.agencyIds) ? authStore.user.agencyIds : [];
  if (ids.length > 0) return ids[0];

  const agencies = Array.isArray(authStore.user?.agencies) ? authStore.user.agencies : [];
  if (agencies.length > 0 && agencies[0]?.id) return agencies[0].id;

  return null;
});

watch(
  () => selectedAgencyId.value,
  (v) => {
    try {
      const raw = String(v || '').trim();
      if (!raw) return;
      localStorage.setItem(agencyStorageKey.value, raw);
    } catch {
      // ignore
    }
  }
);

const candidateName = computed(() => {
  const u = detail.value.user;
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
});

const transferToAgencyId = ref('');
const transferringAgency = ref(false);
const transferAgency = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  const toId = transferToAgencyId.value ? parseInt(String(transferToAgencyId.value), 10) : null;
  if (!toId) return;
  if (Number(toId) === Number(effectiveAgencyId.value)) return;

  const toAgency = (agencyChoices.value || []).find((a) => Number(a?.id) === Number(toId));
  const name = toAgency?.name || `Agency ${toId}`;
  // eslint-disable-next-line no-alert
  const ok = confirm(`Move this applicant to ${name}? This will also move their hiring tasks to the new agency.`);
  if (!ok) return;

  try {
    transferringAgency.value = true;
    await api.post(
      `/hiring/candidates/${selectedId.value}/transfer-agency`,
      { toAgencyId: toId },
      { params: { agencyId: effectiveAgencyId.value } }
    );

    // Switch the page context to the new agency so the applicant remains visible.
    selectedAgencyId.value = String(toId);
    transferToAgencyId.value = '';
    await refresh();
    await selectCandidate(Number(selectedId.value));
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to move applicant');
  } finally {
    transferringAgency.value = false;
  }
};

marked.setOptions({ gfm: true, breaks: true });
const preScreenHtml = computed(() => {
  const md = String(detail.value?.latestPreScreen?.report_text || '').trim();
  if (!md) return '';
  const raw = marked.parse(md);
  return DOMPurify.sanitize(String(raw || ''));
});

const refresh = async () => {
  if (!effectiveAgencyId.value) {
    error.value = 'No agency selected. Please pick an agency in the header selector, then refresh.';
    candidates.value = [];
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get('/hiring/candidates', {
      params: { agencyId: effectiveAgencyId.value, status: 'PROSPECTIVE', q: q.value || undefined }
    });
    candidates.value = r.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load applicants';
  } finally {
    loading.value = false;
  }
};

const selectCandidate = async (id) => {
  if (!id) return;
  if (!effectiveAgencyId.value) {
    error.value = 'No agency selected. Please pick an agency in the header selector.';
    return;
  }
  selectedId.value = id;
  tab.value = 'profile';
  promoteResult.value = null;
  preScreenLinkedInUrl.value = '';
  await loadDetail();
  await loadResumes();
  await loadResumeSummary();
  await loadAssignees();
  await loadTasks();
};

const loadDetail = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    detailLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}`, { params: { agencyId: effectiveAgencyId.value } });
    detail.value = r.data || { user: null, profile: null, notes: [], latestResearch: null, latestPreScreen: null };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load candidate';
  } finally {
    detailLoading.value = false;
  }
};

// Resume summary (structured)
const resumeSummaryLoading = ref(false);
const resumeSummaryGenerating = ref(false);
const resumeSummaryError = ref('');
const resumeSummary = ref(null);

const loadResumeSummary = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    resumeSummaryLoading.value = true;
    resumeSummaryError.value = '';
    const r = await api.get(`/hiring/candidates/${selectedId.value}/resume-summary`, { params: { agencyId: effectiveAgencyId.value } });
    resumeSummary.value = r.data?.summary || null;
  } catch (e) {
    resumeSummaryError.value = e.response?.data?.error?.message || 'Failed to load resume summary';
    resumeSummary.value = null;
  } finally {
    resumeSummaryLoading.value = false;
  }
};

const generateResumeSummary = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    resumeSummaryGenerating.value = true;
    resumeSummaryError.value = '';
    const r = await api.post(`/hiring/candidates/${selectedId.value}/resume-summary`, {}, { params: { agencyId: effectiveAgencyId.value } });
    resumeSummary.value = r.data?.summary || null;
    tab.value = 'resumeSummary';
  } catch (e) {
    resumeSummaryError.value = e.response?.data?.error?.message || 'Failed to generate resume summary';
    alert(resumeSummaryError.value);
  } finally {
    resumeSummaryGenerating.value = false;
  }
};

// Notes
const noteMessage = ref('');
const noteSaving = ref(false);
const addNote = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  const msg = String(noteMessage.value || '').trim();
  if (!msg) return;
  try {
    noteSaving.value = true;
    await api.post(`/hiring/candidates/${selectedId.value}/notes`, { message: msg }, { params: { agencyId: effectiveAgencyId.value } });
    noteMessage.value = '';
    await loadDetail();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to add note');
  } finally {
    noteSaving.value = false;
  }
};

// Pre-Screen (AI research)
const generatingPreScreen = ref(false);
const preScreenLinkedInUrl = ref('');
const generatePreScreenReport = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    generatingPreScreen.value = true;
    const body = {
      candidateName: candidateName.value,
      linkedInUrl: String(preScreenLinkedInUrl.value || '').trim().slice(0, 800)
    };
    const r = await api.post(`/hiring/candidates/${selectedId.value}/prescreen`, body, { params: { agencyId: effectiveAgencyId.value } });
    // Optimistic update + refresh for canonical latest report.
    detail.value.latestPreScreen = r.data || null;
    await loadDetail();
    tab.value = 'prescreen';
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to generate pre-screen report');
  } finally {
    generatingPreScreen.value = false;
  }
};

// Promote
const promoting = ref(false);
const promoteResult = ref(null);
const promote = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    promoting.value = true;
    const r = await api.post(`/hiring/candidates/${selectedId.value}/promote`, {}, { params: { agencyId: effectiveAgencyId.value } });
    promoteResult.value = r.data || null;
    await refresh();
    await loadDetail();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to promote candidate');
  } finally {
    promoting.value = false;
  }
};

// Resumes
const resumesLoading = ref(false);
const resumes = ref([]);
const resumeError = ref('');
const resumeFile = ref(null);
const resumeSelectedFile = ref(null);
const resumeUploading = ref(false);
const resumeTitle = ref('');

const onResumeFileChange = (e) => {
  resumeSelectedFile.value = e?.target?.files?.[0] || null;
};

const loadResumes = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    resumesLoading.value = true;
    resumeError.value = '';
    const r = await api.get(`/hiring/candidates/${selectedId.value}/resumes`, { params: { agencyId: effectiveAgencyId.value } });
    resumes.value = r.data || [];
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to load resumes';
  } finally {
    resumesLoading.value = false;
  }
};

const uploadResume = async () => {
  if (!selectedId.value || !effectiveAgencyId.value || !resumeSelectedFile.value) return;
  try {
    resumeUploading.value = true;
    resumeError.value = '';
    const fd = new FormData();
    fd.append('file', resumeSelectedFile.value);
    if (resumeTitle.value) fd.append('title', resumeTitle.value);
    fd.append('agencyId', String(effectiveAgencyId.value));
    await api.post(`/hiring/candidates/${selectedId.value}/resumes/upload`, fd);
    resumeSelectedFile.value = null;
    resumeTitle.value = '';
    if (resumeFile.value) resumeFile.value.value = '';
    await loadResumes();
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to upload resume';
  } finally {
    resumeUploading.value = false;
  }
};

const viewResume = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return;
  try {
    const resp = await api.get(`/hiring/candidates/${selectedId.value}/resumes/${r.id}/view`, { params: { agencyId: effectiveAgencyId.value } });
    const url = resp.data?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else alert('No URL returned');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to open resume');
  }
};

const deleteResume = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return;
  const name = r?.title || r?.originalName || 'this resume';
  // eslint-disable-next-line no-alert
  const ok = confirm(`Delete ${name}? This will remove the file and cannot be undone.`);
  if (!ok) return;
  try {
    await api.delete(`/hiring/candidates/${selectedId.value}/resumes/${r.id}`, { params: { agencyId: effectiveAgencyId.value } });
    await loadResumes();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete resume');
  }
};

const resumeParseLabel = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'completed') return 'Text extracted';
  if (status === 'no_text') return 'No text (needs OCR)';
  if (status === 'failed') return 'Extract failed';
  if (status === 'pending') return 'Extracting…';
  return 'Extract status: ' + status;
};

const resumeParseClass = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (status === 'completed') return 'ok';
  if (status === 'no_text') return 'warn';
  if (status === 'failed') return 'bad';
  if (status === 'pending') return 'muted';
  return 'muted';
};

const resumeParseTitle = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  const method = String(r?.resumeParseMethod || '').trim();
  const err = String(r?.resumeParseErrorText || '').trim();
  const parts = [];
  if (status) parts.push(`status: ${status}`);
  if (method) parts.push(`method: ${method}`);
  if (err) parts.push(`error: ${err}`);
  return parts.join('\n');
};

// Tasks
const assignees = ref([]);
const tasks = ref([]);
const tasksLoading = ref(false);
const taskSaving = ref(false);
const taskTitle = ref('');
const taskDescription = ref('');
const taskAssigneeId = ref('');
const taskDueDate = ref('');

const loadAssignees = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    const r = await api.get('/hiring/assignees', { params: { agencyId: effectiveAgencyId.value } });
    assignees.value = r.data || [];
    // Default assignee to current user when possible.
    if (!taskAssigneeId.value && authStore.user?.id) {
      const mine = assignees.value.find((u) => u.id === authStore.user.id);
      if (mine) taskAssigneeId.value = String(mine.id);
    }
  } catch {
    // best effort
    assignees.value = [];
  }
};

const loadTasks = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    tasksLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}/tasks`, { params: { agencyId: effectiveAgencyId.value } });
    tasks.value = r.data || [];
  } catch {
    tasks.value = [];
  } finally {
    tasksLoading.value = false;
  }
};

const createTask = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  if (!taskTitle.value.trim() || !taskAssigneeId.value) return;
  try {
    taskSaving.value = true;
    const body = {
      title: taskTitle.value.trim(),
      description: String(taskDescription.value || '').trim() || null,
      assignedToUserId: parseInt(taskAssigneeId.value, 10),
      agencyId: effectiveAgencyId.value,
      kind: 'call',
      dueDate: taskDueDate.value ? new Date(taskDueDate.value).toISOString() : null
    };
    await api.post(`/hiring/candidates/${selectedId.value}/tasks`, body);
    taskTitle.value = '';
    taskDescription.value = '';
    taskDueDate.value = '';
    await loadTasks();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to create task');
  } finally {
    taskSaving.value = false;
  }
};

// Create modal
const showCreate = ref(false);
const createSaving = ref(false);
const createError = ref('');
const createForm = ref({
  firstName: '',
  lastName: '',
  personalEmail: '',
  phoneNumber: '',
  appliedRole: '',
  source: ''
});

const openCreate = () => {
  createError.value = '';
  createSaving.value = false;
  createForm.value = { firstName: '', lastName: '', personalEmail: '', phoneNumber: '', appliedRole: '', source: '' };
  showCreate.value = true;
};
const closeCreate = () => {
  showCreate.value = false;
};

const createApplicant = async () => {
  if (!effectiveAgencyId.value) {
    createError.value = 'No agency selected. Please pick an agency in the header selector and try again.';
    return;
  }
  try {
    createSaving.value = true;
    createError.value = '';
    const body = {
      agencyId: effectiveAgencyId.value,
      firstName: createForm.value.firstName,
      lastName: createForm.value.lastName,
      personalEmail: createForm.value.personalEmail,
      phoneNumber: createForm.value.phoneNumber || null,
      appliedRole: createForm.value.appliedRole || null,
      source: createForm.value.source || null
    };
    const r = await api.post('/hiring/candidates', body);
    const newId = r.data?.user?.id;
    closeCreate();
    await refresh();
    if (newId) await selectCandidate(newId);
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create applicant';
    // In production, some errors are easy to miss in a modal; surface them loudly too.
    try {
      // eslint-disable-next-line no-alert
      alert(createError.value);
    } catch {
      // ignore
    }
  } finally {
    createSaving.value = false;
  }
};

// Formatting helpers
const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso || '';
  }
};
const formatDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso || '';
  }
};
const noteAuthor = (n) => {
  const name = [n.author_first_name, n.author_last_name].filter(Boolean).join(' ').trim();
  return name || n.author_email || `User ${n.author_user_id || ''}`.trim();
};

watch(effectiveAgencyId, async (next) => {
  if (!next) return;
  await refresh();
  selectedId.value = null;
  detail.value = { user: null, profile: null, notes: [], latestResearch: null, latestPreScreen: null };
});

onMounted(async () => {
  // Ensure we have agency lists for the selector.
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    if (role === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // ignore; best effort
  }

  // Restore last selected agency for this user (prevents “I came back and it’s gone” confusion).
  try {
    const raw = localStorage.getItem(agencyStorageKey.value);
    const restored = raw ? parseInt(String(raw), 10) : null;
    if (restored && (agencyChoices.value || []).some((a) => Number(a?.id) === restored)) {
      selectedAgencyId.value = String(restored);
    }
  } catch {
    // ignore
  }

  // Default selection to current agency (or first available).
  if (!selectedAgencyId.value) {
    if (effectiveAgencyId.value) {
      selectedAgencyId.value = String(effectiveAgencyId.value);
    } else if ((agencyChoices.value || []).length > 0) {
      selectedAgencyId.value = String(agencyChoices.value[0].id);
    }
  }
  await refresh();
});
</script>

<style scoped>
.hiring-root {
  padding-top: 16px;
  padding-bottom: 40px;
}
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.subtle {
  color: #6b7280;
  font-size: 13px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
}
.panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  min-height: 520px;
}
.list-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.input, .textarea, select.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
}
.textarea {
  resize: vertical;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  text-align: left;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.list-item.active {
  border-color: #2563eb;
  background: #eff6ff;
}
.name {
  font-weight: 600;
}
.meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  flex-wrap: wrap;
}
.email {
  color: #6b7280;
  font-size: 13px;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
  font-size: 12px;
  color: #374151;
}
.resume-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  flex-wrap: wrap;
}
.resume-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}
.resume-badge.ok {
  background: #dcfce7;
  color: #166534;
  border-color: #86efac;
}
.resume-badge.warn {
  background: #ffedd5;
  color: #9a3412;
  border-color: #fdba74;
}
.resume-badge.bad {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}
.resume-badge.muted {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  align-items: flex-start;
}
.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.detail-name {
  margin: 0;
}
.detail-meta {
  margin-top: 4px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.muted {
  color: #6b7280;
}
.small {
  font-size: 12px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
}
.tab {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}
.tab.active {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.tab-body {
  padding-top: 6px;
}
.kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e7eb;
}
.k {
  color: #6b7280;
  font-size: 13px;
}
.v {
  font-size: 14px;
}
.note-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.note {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
}
.note-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.note-author {
  font-weight: 600;
  font-size: 13px;
}
.note-time {
  color: #6b7280;
  font-size: 12px;
}
.resume-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.resume-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.resume-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.task-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.task-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}
.task {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  padding: 10px;
  margin-bottom: 8px;
}
.task-title {
  font-weight: 600;
}
.research-box {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  color: #111827;
  padding: 10px;
}
.markdown {
  font-size: 14px;
  line-height: 1.55;
  color: #111827;
}
.markdown :deep(h2) {
  font-size: 16px;
  margin: 14px 0 8px;
}
.markdown :deep(h3) {
  font-size: 15px;
  margin: 12px 0 6px;
}
.markdown :deep(p) {
  margin: 8px 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}
.markdown :deep(code) {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 0.95em;
}
.markdown :deep(pre) {
  background: #f3f4f6;
  border-radius: 10px;
  padding: 10px;
  overflow: auto;
}
.markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
}
.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}
.markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #ffffff;
}
.summary-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary-item {
  border-top: 1px solid #f3f4f6;
  padding-top: 10px;
}
.summary-item:first-child {
  border-top: none;
  padding-top: 0;
}
.loading {
  color: #6b7280;
  padding: 12px 0;
}
.empty {
  color: #6b7280;
  padding: 16px 0;
}
.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.info-banner {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  color: #155e75;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(107, 114, 128, 0.35);
  border-top-color: rgba(107, 114, 128, 0.9);
  border-radius: 999px;
  margin-right: 6px;
  vertical-align: -2px;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.search-suggestions {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  word-break: break-all;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}
.modal {
  width: 720px;
  max-width: 100%;
  background: white;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.btn-close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}
.modal-body {
  padding: 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .panel {
    min-height: auto;
  }
  .resume-actions {
    grid-template-columns: 1fr;
  }
  .task-row {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

