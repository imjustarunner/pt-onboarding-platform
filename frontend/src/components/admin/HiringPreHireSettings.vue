<template>
  <div class="hps-root">
    <div class="hps-header">
      <h2 class="hps-title">Hiring &amp; Pre-Hire</h2>
      <p class="hps-subtitle">
        Configure defaults for the pre-hire workflow. Settings here drive the <strong>Mark Hired</strong> modal
        and control what candidates see when they first receive access.
      </p>
    </div>

    <div v-if="pageLoading" class="hps-loading">Loading settings…</div>
    <div v-else-if="pageError" class="error-banner">{{ pageError }}</div>

    <template v-else>
      <!-- Default Pre-Hire Package -->
      <div class="hps-section">
        <div class="hps-section-header">
          <div class="hps-section-title">Default Pre-Hire Package</div>
          <div class="hps-section-sub">
            Assigned automatically when "Send to candidate" is clicked. Must be a package with type <em>pre_hire</em>.
            Configure packages in <strong>Settings → Packages</strong>.
          </div>
        </div>
        <div class="hps-field">
          <label class="hps-label">Package</label>
          <div class="hps-value-row">
            <select v-model="form.default_prehire_package_id" class="input">
              <option :value="null">None — assign manually per hire</option>
              <option v-for="p in preHirePackages" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div v-if="preHirePackages.length === 0" class="hps-help hps-help-warn">
            No pre_hire packages found. Create one in Settings → Packages first.
          </div>
        </div>
      </div>

      <!-- Default Onboarding Package -->
      <div class="hps-section">
        <div class="hps-section-header">
          <div class="hps-section-title">Default Onboarding Package</div>
          <div class="hps-section-sub">
            Assigned automatically when a candidate is promoted to Onboarding. Must be a package with type <em>onboarding</em>.
          </div>
        </div>
        <div class="hps-field">
          <label class="hps-label">Package</label>
          <select v-model="form.default_onboarding_package_id" class="input">
            <option :value="null">None — assign manually</option>
            <option v-for="p in onboardingPackages" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <!-- Default Contract Template -->
      <div class="hps-section">
        <div class="hps-section-header">
          <div class="hps-section-title">Default Contract Template</div>
          <div class="hps-section-sub">
            Pre-loaded in the Mark Hired modal. Requires both candidate signature and internal countersignatures.
            Templates are managed in Documents Library.
          </div>
        </div>
        <div class="hps-field">
          <label class="hps-label">Contract template</label>
          <select v-model="form.default_contract_template_id" class="input">
            <option :value="null">None — attach manually per hire</option>
            <option v-for="t in signatureTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
      </div>

      <!-- Candidate Access Token -->
      <div class="hps-section">
        <div class="hps-section-header">
          <div class="hps-section-title">Candidate Access Token</div>
          <div class="hps-section-sub">
            Control how long the pre-hire setup link is valid and the default invitation message.
          </div>
        </div>
        <div class="hps-field-group">
          <div class="hps-field">
            <label class="hps-label">Token expiry</label>
            <select v-model.number="form.token_expiry_hours" class="input" style="max-width:200px;">
              <option :value="72">3 days</option>
              <option :value="168">7 days (default)</option>
              <option :value="336">14 days</option>
              <option :value="720">30 days</option>
            </select>
          </div>
          <div class="hps-field">
            <label class="hps-label">Email subject</label>
            <input v-model="form.invite_email_subject" class="input" placeholder="Welcome — please complete your pre-hire documents" />
          </div>
          <div class="hps-field">
            <label class="hps-label">Email body</label>
            <textarea v-model="form.invite_email_body" class="textarea" rows="5"
              placeholder="Hi {{firstName}}, we're excited to have you join our team! Click below to complete your pre-hire paperwork." />
            <div class="hps-help">Supports: <code>{{firstName}}</code>, <code>{{lastName}}</code>, <code>{{orgName}}</code>, <code>{{role}}</code></div>
          </div>
        </div>
      </div>

      <!-- Job Role → Onboarding Package Mapping -->
      <div class="hps-section">
        <div class="hps-section-header">
          <div class="hps-section-title">Onboarding Package by Job Role</div>
          <div class="hps-section-sub">
            Map specific job roles to onboarding packages. When a candidate with a matching applied role is promoted to Onboarding,
            this package is pre-selected automatically. Overrides the agency-wide default for that role.
          </div>
        </div>

        <div v-if="form.role_package_mappings.length > 0" class="hps-role-list">
          <div v-for="(mapping, idx) in form.role_package_mappings" :key="idx" class="hps-role-row">
            <div class="hps-role-tag">{{ mapping.role }}</div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span class="hps-role-pkg">
              {{ (packages.find(p => String(p.id) === String(mapping.packageId)) || {}).name || '(package not found)' }}
            </span>
            <button class="hps-role-remove" @click="removeRoleMapping(idx)" title="Remove">✕</button>
          </div>
        </div>
        <p v-else class="hps-empty">No role mappings defined. Add one below to automatically assign packages by job role.</p>

        <div class="hps-role-add-row">
          <input
            v-model="newRoleMapping.role"
            class="input hps-role-input"
            placeholder="Job role (e.g. Marketing Coordinator)"
          />
          <select v-model="newRoleMapping.packageId" class="input hps-role-pkg-select">
            <option :value="null">— Select package —</option>
            <option v-for="p in onboardingPackages" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" @click="addRoleMapping" :disabled="!newRoleMapping.role.trim() || !newRoleMapping.packageId">
            Add mapping
          </button>
        </div>
      </div>

      <div class="hps-save-row">
        <button class="btn btn-primary" :disabled="saving" @click="saveSettings">
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
        <span v-if="saveMsg" class="save-msg" :class="{ 'save-msg-error': saveError }">{{ saveMsg }}</span>
      </div>

      <!-- Internal Signer Roles -->
      <div class="hps-section hps-section-signers">
        <div class="hps-section-header">
          <div class="hps-section-title">Internal Signer Roles</div>
          <div class="hps-section-sub">
            Define which staff roles must countersign contracts after the candidate completes their signature.
            Common roles: Hiring Manager, Owner/Director.
          </div>
        </div>

        <div v-if="signerRoles.length === 0" class="hps-empty">
          No signer roles defined yet. Add one below.
        </div>

        <div v-else class="signer-list">
          <div v-for="role in signerRoles" :key="role.id" class="signer-row">
            <div class="signer-row-info">
              <div class="signer-label">{{ role.role_label }}</div>
              <div class="signer-user">
                <span v-if="role.first_name">
                  Default: {{ role.first_name }} {{ role.last_name }}
                </span>
                <span v-else class="muted">No default user</span>
              </div>
            </div>
            <div class="signer-row-actions">
              <button class="btn btn-secondary btn-xs" @click="startEditRole(role)">Edit</button>
              <button class="btn btn-danger btn-xs" @click="deleteRole(role)" :disabled="deletingRoleId === role.id">
                {{ deletingRoleId === role.id ? '…' : 'Remove' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Add / edit role form -->
        <div class="signer-add-form">
          <div class="hps-section-title" style="margin-bottom:10px;">
            {{ editingRole ? 'Edit role' : 'Add signer role' }}
          </div>
          <div class="signer-form-row">
            <div class="hps-field" style="flex:1;">
              <label class="hps-label">Role label</label>
              <input v-model="roleForm.roleLabel" class="input" placeholder="e.g. Hiring Manager" />
            </div>
            <div class="hps-field" style="flex:1;">
              <label class="hps-label">Default user (optional)</label>
              <select v-model.number="roleForm.defaultUserId" class="input">
                <option :value="null">None — select per hire</option>
                <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
              </select>
            </div>
          </div>
          <div class="signer-form-actions">
            <button class="btn btn-secondary" v-if="editingRole" @click="cancelEditRole">Cancel</button>
            <button class="btn btn-primary" :disabled="savingRole" @click="saveRole">
              {{ savingRole ? 'Saving…' : (editingRole ? 'Update role' : 'Add role') }}
            </button>
            <span v-if="roleError" class="save-msg save-msg-error">{{ roleError }}</span>
          </div>
        </div>
      </div>

      <!-- What's working now -->
      <div class="hps-now-section">
        <div class="hps-now-title">What's live</div>
        <ul class="hps-now-list">
          <li><span class="now-check">✓</span><span><strong>Mark Hired modal</strong> — now auto-loads pre_hire tagged templates and your signer roles.</span></li>
          <li><span class="now-check">✓</span><span><strong>Pre-Hire tab</strong> — People Ops → Pre-Hire shows all PENDING_SETUP, PREHIRE_OPEN, and PREHIRE_REVIEW candidates.</span></li>
          <li><span class="now-check">✓</span><span><strong>Internal signer to-dos</strong> — countersign tasks are created for each signer when "Send to candidate" is clicked.</span></li>
          <li><span class="now-check">✓</span><span><strong>Document stage tags</strong> — tag templates as <em>pre_hire</em> in Documents Library so they auto-load in the modal.</span></li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  scopedAgencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const agencyId = computed(() => {
  const scoped = Number(props.scopedAgencyId || 0);
  if (Number.isFinite(scoped) && scoped > 0) return scoped;
  return agencyStore.currentAgency?.id || null;
});

// ─── Page load ────────────────────────────────────────────────────────────────
const pageLoading = ref(true);
const pageError = ref('');

const form = ref({
  default_prehire_package_id: null,
  default_onboarding_package_id: null,
  default_contract_template_id: null,
  token_expiry_hours: 168,
  invite_email_subject: '',
  invite_email_body: '',
  role_package_mappings: []
});

// Role→package mapping helpers
const newRoleMapping = ref({ role: '', packageId: null });
const addRoleMapping = () => {
  if (!newRoleMapping.value.role.trim()) return;
  const existing = form.value.role_package_mappings.findIndex(
    (m) => m.role.toLowerCase() === newRoleMapping.value.role.toLowerCase()
  );
  if (existing >= 0) {
    form.value.role_package_mappings[existing] = { ...newRoleMapping.value };
  } else {
    form.value.role_package_mappings.push({ ...newRoleMapping.value });
  }
  newRoleMapping.value = { role: '', packageId: null };
};
const removeRoleMapping = (idx) => {
  form.value.role_package_mappings.splice(idx, 1);
};

const packages = ref([]);
const templates = ref([]);
const signerRoles = ref([]);
const staffUsers = ref([]);

const preHirePackages = computed(() => packages.value.filter(p => p.package_type === 'pre_hire'));
const onboardingPackages = computed(() => packages.value.filter(p => p.package_type === 'onboarding'));
const signatureTemplates = computed(() => templates.value.filter(t => (t.document_action_type || 'signature') === 'signature'));

const parseTemplateList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.templates)) return payload.templates;
  return [];
};

const loadAll = async () => {
  if (!agencyId.value) {
    pageLoading.value = false;
    pageError.value = 'Select a tenant above to configure hiring settings.';
    return;
  }
  pageLoading.value = true;
  pageError.value = '';
  try {
    const params = { agencyId: agencyId.value };
    const [settingsRes, pkgsRes, tmplRes, rolesRes, usersRes] = await Promise.all([
      api.get('/hiring/settings', { params }),
      api.get('/onboarding-packages', { params: { ...params, includeInactive: 'true' } }),
      api.get('/document-templates', { params: { limit: 1000 } }),
      api.get('/hiring/signer-roles', { params }),
      api.get('/users').catch(() => ({ data: [] }))
    ]);

    const s = settingsRes.data?.settings || {};
    form.value = {
      default_prehire_package_id: s.default_prehire_package_id ?? null,
      default_onboarding_package_id: s.default_onboarding_package_id ?? null,
      default_contract_template_id: s.default_contract_template_id ?? null,
      token_expiry_hours: s.token_expiry_hours ?? 168,
      invite_email_subject: s.invite_email_subject ?? '',
      invite_email_body: s.invite_email_body ?? '',
      role_package_mappings: Array.isArray(s.role_package_mappings) ? s.role_package_mappings : []
    };

    const pkgList = Array.isArray(pkgsRes.data) ? pkgsRes.data : [];
    packages.value = pkgList.filter(p => p.is_active !== false);
    templates.value = parseTemplateList(tmplRes.data).filter(t => t.is_active !== false && t.is_active !== 0);
    signerRoles.value = rolesRes.data || [];

    const STAFF_ROLES = ['admin', 'support', 'staff', 'super_admin'];
    staffUsers.value = (usersRes.data || [])
      .filter(u => STAFF_ROLES.includes(u.role) && u.status === 'ACTIVE_EMPLOYEE')
      .sort((a, b) => `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`));
  } catch (e) {
    console.error('HiringPreHireSettings loadAll failed:', e);
    pageError.value = e.response?.data?.error?.message || e.message || 'Failed to load settings.';
  } finally {
    pageLoading.value = false;
  }
};

// ─── Save settings ────────────────────────────────────────────────────────────
const saving = ref(false);
const saveMsg = ref('');
const saveError = ref(false);

const saveSettings = async () => {
  saving.value = true;
  saveMsg.value = '';
  saveError.value = false;
  try {
    const params = agencyId.value ? { agencyId: agencyId.value } : {};
    await api.put('/hiring/settings', form.value, { params });
    saveMsg.value = 'Settings saved.';
  } catch (e) {
    saveMsg.value = e.response?.data?.error?.message || 'Failed to save.';
    saveError.value = true;
  } finally {
    saving.value = false;
    setTimeout(() => { saveMsg.value = ''; }, 3000);
  }
};

// ─── Signer roles ─────────────────────────────────────────────────────────────
const editingRole = ref(null);
const roleForm = ref({ roleLabel: '', defaultUserId: null });
const savingRole = ref(false);
const roleError = ref('');
const deletingRoleId = ref(null);

const startEditRole = (role) => {
  editingRole.value = role;
  roleForm.value = { roleLabel: role.role_label, defaultUserId: role.default_user_id ?? null };
};

const cancelEditRole = () => {
  editingRole.value = null;
  roleForm.value = { roleLabel: '', defaultUserId: null };
  roleError.value = '';
};

const saveRole = async () => {
  if (!roleForm.value.roleLabel.trim()) {
    roleError.value = 'Role label is required.';
    return;
  }
  savingRole.value = true;
  roleError.value = '';
  try {
    const params = agencyId.value ? { agencyId: agencyId.value } : {};
    const body = { roleLabel: roleForm.value.roleLabel, defaultUserId: roleForm.value.defaultUserId, sortOrder: editingRole.value?.sort_order ?? signerRoles.value.length };
    if (editingRole.value) {
      const res = await api.put(`/hiring/signer-roles/${editingRole.value.id}`, body, { params });
      const idx = signerRoles.value.findIndex(r => r.id === editingRole.value.id);
      if (idx >= 0) signerRoles.value[idx] = res.data;
    } else {
      const res = await api.post('/hiring/signer-roles', body, { params });
      signerRoles.value.push(res.data);
    }
    cancelEditRole();
  } catch (e) {
    roleError.value = e.response?.data?.error?.message || 'Failed to save role.';
  } finally {
    savingRole.value = false;
  }
};

const deleteRole = async (role) => {
  if (!confirm(`Remove signer role "${role.role_label}"?`)) return;
  deletingRoleId.value = role.id;
  try {
    const params = agencyId.value ? { agencyId: agencyId.value } : {};
    await api.delete(`/hiring/signer-roles/${role.id}`, { params });
    signerRoles.value = signerRoles.value.filter(r => r.id !== role.id);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete role.');
  } finally {
    deletingRoleId.value = null;
  }
};

onMounted(() => {
  if (agencyId.value) void loadAll();
});

watch(agencyId, (id, prev) => {
  if (id && id !== prev) void loadAll();
});
</script>

<style scoped>
.hps-root { max-width: 720px; }

.hps-header { margin-bottom: 24px; }
.hps-title { font-size: 20px; font-weight: 700; margin: 0 0 6px; color: #111827; }
.hps-subtitle { font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0; }

.hps-loading { color: #9ca3af; font-size: 14px; padding: 20px 0; }

.error-banner {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;
  color: #dc2626; padding: 10px 14px; font-size: 14px; margin-bottom: 16px;
}

.hps-section {
  background: white; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 18px 20px; margin-bottom: 16px;
}

.hps-section-signers { margin-top: 4px; }

.hps-section-header { margin-bottom: 14px; }
.hps-section-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.hps-section-sub { font-size: 13px; color: #6b7280; line-height: 1.55; }

.hps-field-group { display: flex; flex-direction: column; gap: 14px; }
.hps-field { margin-bottom: 4px; }
.hps-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.hps-value-row { display: flex; align-items: center; gap: 10px; }

.hps-help { font-size: 12px; color: #9ca3af; margin-top: 5px; }
.hps-help-warn { color: #b45309; }

.hps-empty { font-size: 13px; color: #9ca3af; padding: 6px 0 12px; }

.hps-save-row {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px; margin-top: -4px;
}

.save-msg { font-size: 13px; color: #16a34a; }
.save-msg-error { color: #dc2626; }

/* Signer roles */
.signer-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }

.signer-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
  gap: 12px;
}

.signer-label { font-size: 14px; font-weight: 600; color: #111827; }
.signer-user { font-size: 12px; color: #6b7280; margin-top: 2px; }
.signer-row-actions { display: flex; gap: 6px; flex-shrink: 0; }

.signer-add-form {
  background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px;
  padding: 14px 16px; margin-top: 12px;
}

.signer-form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.signer-form-actions { display: flex; align-items: center; gap: 8px; }

/* What's live */
.hps-now-section {
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px;
}
.hps-now-title { font-size: 14px; font-weight: 700; color: #166534; margin-bottom: 12px; }
.hps-now-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.hps-now-list li { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: #374151; line-height: 1.5; }
.now-check { color: #16a34a; font-weight: 700; flex-shrink: 0; }
.muted { color: #9ca3af; }

/* Role → Package mapping */
.hps-role-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.hps-role-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px;
}
.hps-role-tag { background: #e0e7ff; color: #3730a3; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
.hps-role-pkg { flex: 1; color: #374151; font-weight: 500; }
.hps-role-remove { background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; }
.hps-role-remove:hover { background: #fee2e2; color: #dc2626; }
.hps-role-add-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hps-role-input { flex: 1; min-width: 200px; }
.hps-role-pkg-select { flex: 1; min-width: 180px; }
</style>
