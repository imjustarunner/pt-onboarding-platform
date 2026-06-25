<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal mhm-modal">
      <!-- Header -->
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Mark hired — start pre-hire</h3>
          <div class="modal-subtitle">Review the pre-hire package before sending access to the candidate.</div>
        </div>
        <button class="btn-close" @click="$emit('close')" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <!-- Candidate summary -->
        <div class="section-label">Candidate</div>
        <div class="candidate-card">
          <div class="candidate-name">{{ candidateName }}</div>
          <div class="candidate-meta">
            <span>{{ candidate?.personal_email || candidate?.email || '—' }}</span>
            <span v-if="appliedRole" class="sep">·</span>
            <span v-if="appliedRole">{{ appliedRole }}</span>
          </div>
        </div>

        <!-- Documents -->
        <div class="section-label section-label-spaced">
          Pre-hire documents
          <span class="section-hint">
            Pre-hire tagged templates are pre-selected. Add or remove as needed.
          </span>
        </div>

        <div v-if="docsLoading" class="loading-sm">Loading document library…</div>
        <div v-else-if="docsError" class="error-sm">{{ docsError }}</div>
        <div v-else>
          <div v-if="templates.length === 0" class="empty-sm">
            No active document templates found. Add templates in Settings → Documents Library first.
          </div>
          <div v-else>
            <!-- Stage filter -->
            <div class="doc-filter-row">
              <button
                v-for="f in DOC_FILTERS"
                :key="f.value"
                class="doc-filter-btn"
                :class="{ active: docFilter === f.value }"
                @click="docFilter = f.value"
              >{{ f.label }}</button>
            </div>

            <div class="doc-list">
              <div v-if="filteredTemplates.length === 0" class="empty-sm" style="padding:10px;">
                No templates match this filter.
              </div>
              <label
                v-for="t in filteredTemplates"
                :key="t.id"
                class="doc-row"
                :class="{ selected: isSelected(t.id) }"
              >
                <input
                  type="checkbox"
                  :checked="isSelected(t.id)"
                  @change="toggleDoc(t)"
                  class="doc-check"
                />
                <div class="doc-info">
                  <div class="doc-name">
                    {{ t.name }}
                    <span v-if="t.document_stage === 'pre_hire'" class="stage-badge">pre-hire</span>
                  </div>
                  <div class="doc-meta">
                    <span class="doc-type-pill" :class="actionTypeClass(t)">
                      {{ t.document_action_type === 'review' ? 'Review only' : 'Signature required' }}
                    </span>
                    <span v-if="t.template_type" class="doc-kind">{{ t.template_type.toUpperCase() }}</span>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Contract -->
        <div class="section-label section-label-spaced">
          Contract
          <span class="section-hint">
            {{ settings?.default_contract_template_id ? 'Default contract pre-loaded from settings.' : 'Select from your Documents Library.' }}
          </span>
        </div>
        <div class="hps-field">
          <select v-model.number="contractTemplateId" class="input">
            <option :value="null">No contract — skip</option>
            <option v-for="t in signatureTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div v-if="contractTemplateId && !isSelected(contractTemplateId)" class="stage-banner stage-banner-info" style="margin-top:8px;padding:8px 12px;">
          <span>Contract will also be added to the document list above.</span>
        </div>

        <!-- Internal signers -->
        <div class="section-label section-label-spaced">
          Internal signers
          <span class="section-hint">Will each receive a countersignature to-do after the candidate signs.</span>
        </div>

        <div v-if="signerRolesLoading" class="loading-sm">Loading signer roles…</div>
        <div v-else-if="signerRoles.length === 0" class="empty-sm">
          No signer roles configured.
          <router-link to="/admin/settings?tab=hiring-prehire" class="link-text">Configure in Settings → Hiring &amp; Pre-Hire</router-link>
        </div>
        <div v-else class="signer-list">
          <div v-for="role in signerAssignments" :key="role.id" class="signer-row">
            <div class="signer-label">{{ role.roleLabel }}</div>
            <select v-model.number="role.userId" class="input signer-select">
              <option :value="null">Skip this signer</option>
              <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
            </select>
          </div>
          <!-- Ad-hoc signer -->
          <div class="signer-row signer-adhoc">
            <div class="signer-label muted">+ Add signer</div>
            <select v-model.number="adhocSignerUserId" class="input signer-select">
              <option :value="null">None</option>
              <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
            </select>
          </div>
        </div>

        <!-- Candidate message -->
        <div class="section-label section-label-spaced">
          Candidate message
          <span class="section-hint">The candidate will receive this with their access link.</span>
        </div>
        <div class="msg-block">
          <div class="msg-row">
            <span class="msg-label">Subject</span>
            <input v-model="msgSubject" class="input msg-input" />
          </div>
          <div class="msg-row msg-row-body">
            <span class="msg-label">Message</span>
            <textarea v-model="msgBody" class="textarea msg-textarea" rows="4" />
          </div>
        </div>

        <!-- Summary -->
        <div v-if="allSelectedDocs.length > 0" class="summary-row">
          <strong>{{ allSelectedDocs.length }}</strong> document{{ allSelectedDocs.length !== 1 ? 's' : '' }} ·
          <strong>{{ activeSignerCount }}</strong> internal signer{{ activeSignerCount !== 1 ? 's' : '' }}
          will receive countersignature to-dos.
        </div>
        <div v-else class="summary-row summary-row-warn">
          No documents selected. The candidate will receive only a setup link.
        </div>

        <div v-if="sendError" class="error-sm" style="margin-top:8px;">{{ sendError }}</div>

        <!-- Success -->
        <div v-if="tokenLink" class="info-banner info-banner-success">
          <div><strong>Pre-hire initiated successfully.</strong></div>
          <div style="margin-top:6px;">Setup link (expires in {{ tokenExpiryLabel }}):</div>
          <div class="mono">{{ tokenLink }}</div>
          <div class="link-note">Emailed to the candidate. Copy above as backup.</div>
        </div>
      </div>

      <div class="modal-actions">
        <button v-if="!tokenLink" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button v-if="tokenLink" class="btn btn-secondary" @click="$emit('close')">Close</button>
        <button
          v-if="!tokenLink"
          class="btn btn-primary"
          :disabled="sending"
          @click="send"
        >
          <span v-if="sending" class="spinner" aria-hidden="true"></span>
          {{ sending ? 'Sending…' : 'Send to candidate' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  show: { type: Boolean, default: false },
  candidate: { type: Object, default: null },
  agencyId: { type: [String, Number], default: null },
  appliedRole: { type: String, default: '' }
});

const emit = defineEmits(['close', 'hired']);

const candidateName = computed(() => {
  const u = props.candidate;
  if (!u) return '—';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
});

// ─── Document templates ──────────────────────────────────────────────────────
const DOC_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pre_hire', label: 'Pre-hire tagged' },
  { value: 'signature', label: 'Signature' },
  { value: 'review', label: 'Review' }
];

const templates = ref([]);
const docsLoading = ref(false);
const docsError = ref('');
const selectedDocs = ref([]);
const docFilter = ref('all');

const filteredTemplates = computed(() => {
  if (docFilter.value === 'pre_hire') return templates.value.filter(t => t.document_stage === 'pre_hire');
  if (docFilter.value === 'signature') return templates.value.filter(t => (t.document_action_type || 'signature') === 'signature');
  if (docFilter.value === 'review') return templates.value.filter(t => t.document_action_type === 'review');
  return templates.value;
});

const signatureTemplates = computed(() => templates.value.filter(t => (t.document_action_type || 'signature') === 'signature'));

const isSelected = (id) => selectedDocs.value.some(d => d.id === id);
const toggleDoc = (t) => {
  const idx = selectedDocs.value.findIndex(d => d.id === t.id);
  if (idx >= 0) selectedDocs.value.splice(idx, 1);
  else selectedDocs.value.push(t);
};
const actionTypeClass = (t) => t.document_action_type === 'review' ? 'pill-review' : 'pill-sign';

// ─── Contract template ───────────────────────────────────────────────────────
const contractTemplateId = ref(null);

// Ensure contract is always in selectedDocs when set
watch(contractTemplateId, (newId, oldId) => {
  if (oldId) {
    const tmpl = templates.value.find(t => t.id === oldId);
    if (tmpl && !templates.value.find(t => t.document_stage === 'pre_hire' && t.id === oldId)) {
      const idx = selectedDocs.value.findIndex(d => d.id === oldId);
      if (idx >= 0) selectedDocs.value.splice(idx, 1);
    }
  }
  if (newId) {
    const tmpl = templates.value.find(t => t.id === newId);
    if (tmpl && !isSelected(newId)) selectedDocs.value.push(tmpl);
  }
});

const allSelectedDocs = computed(() => {
  const ids = new Set();
  const result = [];
  if (contractTemplateId.value) {
    const t = templates.value.find(t => t.id === contractTemplateId.value);
    if (t) { ids.add(t.id); result.push(t); }
  }
  for (const d of selectedDocs.value) {
    if (!ids.has(d.id)) { ids.add(d.id); result.push(d); }
  }
  return result;
});

// ─── Settings ────────────────────────────────────────────────────────────────
const settings = ref(null);

// ─── Signer roles ─────────────────────────────────────────────────────────────
const signerRoles = ref([]);
const signerAssignments = ref([]);
const signerRolesLoading = ref(false);
const staffUsers = ref([]);
const adhocSignerUserId = ref(null);

const activeSignerCount = computed(() => {
  let count = signerAssignments.value.filter(s => s.userId).length;
  if (adhocSignerUserId.value) count++;
  return count;
});

const buildSignerAssignments = (roles) => {
  signerAssignments.value = roles.map(r => ({
    id: r.id,
    roleLabel: r.role_label,
    userId: r.default_user_id ?? null,
    fieldKey: null
  }));
};

// ─── Token settings ───────────────────────────────────────────────────────────
const tokenExpiryHours = ref(168);
const tokenExpiryLabel = computed(() => {
  const h = tokenExpiryHours.value;
  if (h <= 72) return '3 days';
  if (h <= 168) return '7 days';
  if (h <= 336) return '14 days';
  return '30 days';
});

// ─── Message defaults ─────────────────────────────────────────────────────────
const msgSubject = ref('');
const msgBody = ref('');

const setDefaultMessage = () => {
  const name = props.candidate?.first_name || 'there';
  msgSubject.value = settings.value?.invite_email_subject
    || 'Welcome — please complete your pre-hire documents';
  msgBody.value = settings.value?.invite_email_body
    || `Hi ${name},\n\nWe're excited to have you join our team! Please follow the link below to complete your pre-hire paperwork. This link will expire in ${tokenExpiryLabel.value}.\n\nIf you have any questions, reach out to us directly.\n\nThank you!`;
};

// ─── Load everything on open ──────────────────────────────────────────────────
const loadModal = async () => {
  selectedDocs.value = [];
  contractTemplateId.value = null;
  sendError.value = '';
  tokenLink.value = '';
  docFilter.value = 'all';

  docsLoading.value = true;
  signerRolesLoading.value = true;

  const agencyParam = props.agencyId ? { agencyId: props.agencyId } : {};

  try {
    const [settingsRes, tmplRes, rolesRes, usersRes] = await Promise.all([
      api.get('/hiring/settings', { params: agencyParam }),
      api.get('/document-templates', { params: { limit: 1000 } }),
      api.get('/hiring/signer-roles', { params: agencyParam }),
      api.get('/users')
    ]);

    settings.value = settingsRes.data?.settings || {};
    tokenExpiryHours.value = settings.value.token_expiry_hours ?? 168;

    templates.value = (() => {
      const payload = tmplRes.data;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.templates)
            ? payload.templates
            : [];
      return list.filter(t => t.is_active !== false && t.is_active !== 0);
    })();

    // Auto-select pre_hire tagged templates
    selectedDocs.value = templates.value.filter(t => t.document_stage === 'pre_hire');

    // Pre-load default contract
    if (settings.value.default_contract_template_id) {
      contractTemplateId.value = settings.value.default_contract_template_id;
    }

    signerRoles.value = rolesRes.data || [];
    buildSignerAssignments(signerRoles.value);

    const STAFF_ROLES = ['admin', 'support', 'staff', 'super_admin'];
    staffUsers.value = (usersRes.data || [])
      .filter(u => STAFF_ROLES.includes(u.role))
      .sort((a, b) => `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`));

    setDefaultMessage();
  } catch (e) {
    docsError.value = e.response?.data?.error?.message || 'Failed to load modal data.';
  } finally {
    docsLoading.value = false;
    signerRolesLoading.value = false;
  }
};

watch(() => props.show, (val) => { if (val) loadModal(); });

// ─── Send ──────────────────────────────────────────────────────────────────────
const sending = ref(false);
const sendError = ref('');
const tokenLink = ref('');

const send = async () => {
  if (!props.candidate?.id || !props.agencyId) return;

  const docIds = allSelectedDocs.value.map(d => d.id);
  const allSigners = [
    ...signerAssignments.value.filter(s => s.userId).map(s => ({
      userId: s.userId,
      roleLabel: s.roleLabel,
      fieldKey: s.fieldKey
    }))
  ];
  if (adhocSignerUserId.value) {
    allSigners.push({ userId: adhocSignerUserId.value, roleLabel: 'Additional Signer', fieldKey: null });
  }

  sending.value = true;
  sendError.value = '';
  try {
    const r = await api.post(
      `/hiring/candidates/${props.candidate.id}/send-prehire`,
      {
        documentTemplateIds: docIds,
        signerAssignments: allSigners,
        msgSubject: msgSubject.value,
        msgBody: msgBody.value
      },
      { params: { agencyId: props.agencyId } }
    );
    tokenLink.value = r.data?.passwordlessTokenLink || '';
    emit('hired', r.data);
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to send pre-hire package.';
  } finally {
    sending.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 60;
}

.mhm-modal {
  width: 700px; max-width: 100%; max-height: 90vh;
  display: flex; flex-direction: column;
  background: white; border-radius: 14px; border: 1px solid #e5e7eb; overflow: hidden;
}

.modal-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 18px 14px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
}
.modal-title { font-size: 17px; font-weight: 700; margin: 0 0 2px; }
.modal-subtitle { font-size: 13px; color: #6b7280; }
.btn-close { border: none; background: transparent; font-size: 22px; cursor: pointer; color: #6b7280; }

.modal-body { padding: 18px; overflow-y: auto; flex: 1; }

.modal-actions {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px; padding: 12px 18px; border-top: 1px solid #e5e7eb; flex-shrink: 0;
}

/* Candidate card */
.candidate-card {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px;
}
.candidate-name { font-size: 15px; font-weight: 600; color: #111827; }
.candidate-meta { font-size: 13px; color: #6b7280; margin-top: 2px; display: flex; gap: 6px; }
.sep { color: #d1d5db; }

/* Section labels */
.section-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: #374151; margin-bottom: 8px;
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.section-label-spaced { margin-top: 20px; }
.section-hint { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 12px; color: #9ca3af; }

/* Doc filter */
.doc-filter-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.doc-filter-btn {
  font-size: 12px; padding: 4px 10px; border-radius: 20px;
  border: 1px solid #e5e7eb; background: #f9fafb; cursor: pointer; color: #374151;
  transition: all 0.12s;
}
.doc-filter-btn.active { background: #1d4ed8; color: white; border-color: #1d4ed8; }
.doc-filter-btn:hover:not(.active) { background: #f3f4f6; }

/* Doc list */
.doc-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 200px; overflow-y: auto;
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 6px;
}
.doc-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.12s;
  border: 1px solid transparent;
}
.doc-row:hover { background: #f3f4f6; }
.doc-row.selected { background: #eff6ff; border-color: #bfdbfe; }
.doc-check { margin-top: 2px; cursor: pointer; }
.doc-info { flex: 1; min-width: 0; }
.doc-name { font-size: 14px; font-weight: 500; color: #111827; display: flex; align-items: center; gap: 6px; }
.doc-meta { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
.doc-kind { font-size: 11px; color: #9ca3af; }
.doc-type-pill { font-size: 11px; padding: 2px 7px; border-radius: 20px; font-weight: 600; }
.pill-sign { background: #dbeafe; color: #1e40af; }
.pill-review { background: #f3f4f6; color: #374151; }
.stage-badge { font-size: 10px; background: #dcfce7; color: #166534; border-radius: 20px; padding: 1px 7px; font-weight: 600; }

/* Signer list */
.signer-list { display: flex; flex-direction: column; gap: 8px; }
.signer-row { display: flex; align-items: center; gap: 10px; }
.signer-label { font-size: 13px; font-weight: 600; color: #374151; width: 140px; flex-shrink: 0; }
.signer-select { flex: 1; }
.signer-adhoc { opacity: 0.7; }

/* Stage banner info */
.stage-banner-info { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 13px; color: #0369a1; }

/* Message block */
.msg-block { display: flex; flex-direction: column; gap: 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
.msg-row { display: flex; gap: 10px; align-items: center; }
.msg-row-body { align-items: flex-start; }
.msg-label { font-size: 12px; font-weight: 600; color: #6b7280; width: 60px; flex-shrink: 0; padding-top: 7px; }
.msg-input { flex: 1; }
.msg-textarea { flex: 1; resize: vertical; }

/* Summary */
.summary-row {
  margin-top: 12px; font-size: 13px; color: #374151;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 12px;
}
.summary-row-warn { background: #fff7ed; border-color: #fed7aa; color: #92400e; }

/* Info banner */
.info-banner { margin-top: 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 14px; font-size: 13px; }
.info-banner-success { background: #f0fdf4; border-color: #bbf7d0; }
.mono { font-family: monospace; font-size: 12px; margin-top: 4px; word-break: break-all; }
.link-note { font-size: 12px; color: #6b7280; margin-top: 6px; }

/* Misc */
.loading-sm { font-size: 13px; color: #6b7280; padding: 8px 0; }
.error-sm { font-size: 13px; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; }
.empty-sm { font-size: 13px; color: #9ca3af; padding: 4px 0; }
.link-text { color: #2563eb; }
.muted { color: #9ca3af; }
.hps-field { margin-bottom: 0; }

.spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.4); border-top-color: white;
  border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
