<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal" role="dialog" aria-labelledby="na-create-client-title">
      <header class="na-modal-head">
        <h3 id="na-create-client-title">Create minimal client</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>
      <p class="na-modal-hint">
        Clients belong to a <strong>program / portal</strong> under the tenant (clinical, school, coaching, etc.) —
        not the tenant root itself. You can add more program affiliations later on the chart.
      </p>
      <form class="na-modal-form" @submit.prevent="submit">
        <label class="na-label">
          Tenant
          <select v-model="form.agencyId" class="na-input" required @change="onTenantChange">
            <option disabled value="">Select tenant…</option>
            <option v-for="t in tenantOptions" :key="t.id" :value="String(t.id)">
              {{ t.name }}
            </option>
          </select>
        </label>
        <label class="na-label">
          Program / portal
          <select v-model="form.organizationId" class="na-input" required :disabled="loadingOrgs || !form.agencyId">
            <option disabled value="">
              {{ loadingOrgs ? 'Loading programs…' : 'Select program…' }}
            </option>
            <option v-for="o in programOptions" :key="o.id" :value="String(o.id)">
              {{ o.label }}
            </option>
          </select>
        </label>
        <p v-if="orgHint" class="na-field-hint">{{ orgHint }}</p>
        <label class="na-label">
          Full name
          <input v-model="form.fullName" class="na-input" type="text" required maxlength="200" />
        </label>
        <label class="na-label">
          Initials
          <input v-model="form.initials" class="na-input" type="text" required maxlength="16" />
        </label>
        <label class="na-label">
          Submission date
          <input v-model="form.submissionDate" class="na-input" type="date" required />
        </label>
        <p v-if="derivedClientTypeLabel" class="na-field-hint">
          Client type will be set to <strong>{{ derivedClientTypeLabel }}</strong> from the selected program.
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <button type="submit" class="na-btn-primary" :disabled="saving || !canSubmit">
            {{ saving ? 'Creating…' : 'Create client' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import {
  noteAidTenantOptions,
  normalizeNoteAidClientRow
} from '../../utils/noteAidTreatmentHelpers.js';

const ALLOWED_ORG_TYPES = new Set([
  'school',
  'program',
  'learning',
  'clinical',
  'life_coach',
  'consultant'
]);

const props = defineProps({
  open: { type: Boolean, default: false },
  defaultAgencyId: { type: [Number, String, null], default: null },
  defaultInitials: { type: String, default: '' },
  defaultName: { type: String, default: '' }
});

const emit = defineEmits(['close', 'created']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const saving = ref(false);
const loadingOrgs = ref(false);
const error = ref('');
const orgHint = ref('');
const linkedOrganizations = ref([]);

const form = reactive({
  agencyId: '',
  organizationId: '',
  fullName: '',
  initials: '',
  submissionDate: new Date().toISOString().slice(0, 10)
});

const tenantOptions = computed(() =>
  noteAidTenantOptions(agencyStore, { role: authStore.user?.role })
);

const agencyLookup = computed(() => {
  const map = {};
  for (const t of tenantOptions.value) map[t.id] = t.name;
  for (const a of agencyStore.agencies || []) {
    const id = Number(a?.id || 0);
    if (id && !map[id]) map[id] = a.name || a.organization_name || `Tenant #${id}`;
  }
  return map;
});

function orgTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'life_coach') return 'Coaching';
  if (t === 'consultant') return 'Consulting';
  if (t === 'clinical') return 'Clinical';
  if (t === 'learning') return 'Learning';
  if (t === 'school') return 'School';
  if (t === 'program') return 'Program';
  return t || 'Program';
}

function clientTypeFromOrgType(orgType) {
  const t = String(orgType || '').toLowerCase();
  if (t === 'school') return 'school';
  if (t === 'learning') return 'learning';
  if (t === 'clinical' || t === 'program') return 'clinical';
  // life_coach / consultant: chart still uses clinical-ish baseline for Note Aid today
  return 'clinical';
}

const programOptions = computed(() =>
  (linkedOrganizations.value || [])
    .filter((o) => ALLOWED_ORG_TYPES.has(String(o.organization_type || '').toLowerCase()))
    .map((o) => ({
      id: Number(o.id),
      organization_type: String(o.organization_type || '').toLowerCase(),
      label: `${o.name || `Org #${o.id}`} (${orgTypeLabel(o.organization_type)})`
    }))
    .filter((o) => o.id > 0)
);

const selectedProgram = computed(() =>
  programOptions.value.find((o) => String(o.id) === String(form.organizationId)) || null
);

const derivedClientType = computed(() =>
  clientTypeFromOrgType(selectedProgram.value?.organization_type)
);

const derivedClientTypeLabel = computed(() => {
  if (!selectedProgram.value) return '';
  const t = derivedClientType.value;
  if (t === 'school') return 'School';
  if (t === 'learning') return 'Learning';
  return 'Clinical';
});

const canSubmit = computed(() =>
  Number(form.agencyId) > 0
  && Number(form.organizationId) > 0
  && String(form.fullName || '').trim()
  && String(form.initials || '').trim()
);

function pickDefaultOrganizationId(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const clinical = list.find((o) => String(o.organization_type || '').toLowerCase() === 'clinical');
  if (clinical) return String(clinical.id);
  const program = list.find((o) => String(o.organization_type || '').toLowerCase() === 'program');
  if (program) return String(program.id);
  if (list[0]?.id) return String(list[0].id);
  return '';
}

async function loadProgramsForTenant(agencyId) {
  linkedOrganizations.value = [];
  form.organizationId = '';
  orgHint.value = '';
  const aid = Number(agencyId || 0);
  if (!aid) return;

  loadingOrgs.value = true;
  try {
    const tenantMeta =
      (agencyStore.userAgencies || []).find((a) => Number(a.id) === aid)
      || (agencyStore.agencies || []).find((a) => Number(a.id) === aid)
      || null;
    const tenantType = String(
      tenantMeta?.organization_type || tenantMeta?.organizationType || ''
    ).toLowerCase();

    let rows = [];
    try {
      const resp = await api.get(`/agencies/${aid}/affiliated-organizations`, {
        skipGlobalLoading: true
      });
      rows = Array.isArray(resp.data) ? resp.data : [];
    } catch {
      rows = [];
    }

    rows = rows.filter((o) => String(o?.organization_type || '').toLowerCase() !== 'agency');

    // Solo practitioner: tenant root is the client organization.
    if (
      (tenantType === 'life_coach' || tenantType === 'consultant')
      && !rows.some((o) => Number(o?.id) === aid)
    ) {
      rows = [
        {
          id: aid,
          name: tenantMeta?.name || 'Practice',
          organization_type: tenantType
        },
        ...rows
      ];
    }

    const eligible = rows.filter((o) =>
      ALLOWED_ORG_TYPES.has(String(o?.organization_type || '').toLowerCase())
    );
    linkedOrganizations.value = eligible;

    if (!eligible.length) {
      orgHint.value =
        'No clinical/school/learning/coaching program is linked under this tenant yet. '
        + 'Create or affiliate a Clinical (or other) program org first, then try again.';
    } else {
      form.organizationId = pickDefaultOrganizationId(eligible);
    }
  } finally {
    loadingOrgs.value = false;
  }
}

function onTenantChange() {
  loadProgramsForTenant(form.agencyId);
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    error.value = '';
    orgHint.value = '';
    await agencyStore.fetchUserAgencies();
    if (
      String(authStore.user?.role || '').toLowerCase() === 'super_admin'
      && !tenantOptions.value.length
    ) {
      await agencyStore.fetchAgencies();
    }
    form.agencyId = String(
      props.defaultAgencyId
      || agencyStore.currentAgency?.id
      || tenantOptions.value[0]?.id
      || ''
    );
    form.fullName = String(props.defaultName || '').trim();
    form.initials = String(props.defaultInitials || '').trim().toUpperCase();
    form.submissionDate = new Date().toISOString().slice(0, 10);
    await loadProgramsForTenant(form.agencyId);
  }
);

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    const agencyId = Number(form.agencyId || 0);
    const organizationId = Number(form.organizationId || 0);
    if (!agencyId) throw new Error('Select a tenant');
    if (!organizationId) throw new Error('Select a program / portal');
    const payload = {
      organization_id: organizationId,
      agency_id: agencyId,
      full_name: String(form.fullName || '').trim(),
      initials: String(form.initials || '').trim().toUpperCase(),
      submission_date: form.submissionDate,
      client_type: derivedClientType.value || 'clinical',
      source: 'NOTE_AID_MINIMAL',
      provider_id: Number(authStore.user?.id || 0) || undefined
    };
    const res = await api.post('/clients', payload);
    const row = res?.data?.client || res?.data || null;
    const normalized = normalizeNoteAidClientRow(row, agencyLookup.value);
    if (!normalized?.id) throw new Error('Client created but response was incomplete');
    emit('created', normalized);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not create client';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(480px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.na-modal-head h3 {
  margin: 0;
  font-size: 1.05rem;
}
.na-modal-hint {
  margin: 8px 0 14px;
  color: #64748b;
  font-size: 0.85rem;
}
.na-modal-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.na-field-hint {
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
}
.na-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
</style>
