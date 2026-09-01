<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal" role="dialog" aria-labelledby="na-todo-import-title">
      <header class="na-modal-head">
        <h3 id="na-todo-import-title">Add ToDo List</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>
      <p class="hint">
        Paste your day list (one line per item or date / name / action blocks). Consultation / 99415 items are skipped. New items append under your current queue. Choose the tenant and program once for the whole batch.
      </p>

      <label class="na-label">
        Tenant
        <select v-model="form.agencyId" class="na-input" @change="onTenantChange">
          <option disabled value="">Select tenant…</option>
          <option v-for="t in tenantOptions" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
        </select>
      </label>
      <label class="na-label">
        Program / portal
        <select v-model="form.organizationId" class="na-input" :disabled="loadingOrgs || !form.agencyId">
          <option disabled value="">{{ loadingOrgs ? 'Loading…' : 'Select program…' }}</option>
          <option v-for="o in programOptions" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
        </select>
      </label>

      <label class="na-label">
        Paste ToDo list
        <textarea
          v-model="pasteText"
          class="na-textarea"
          rows="12"
          placeholder="4/9/26&#10;She Bar&#10;Create a Progress Note…"
        />
      </label>

      <p v-if="preview.skipped.length" class="muted">
        Will skip {{ preview.skipped.length }} consultation item{{ preview.skipped.length === 1 ? '' : 's' }}.
      </p>
      <p v-if="preview.items.length" class="muted">
        Will queue {{ preview.items.length }} item{{ preview.items.length === 1 ? '' : 's' }}
        (appended under your current queue).
      </p>
      <p
        v-if="pasteText.trim() && !preview.items.length && !preview.skipped.length"
        class="error"
      >
        Could not parse any ToDo lines. Use either one line per item
        (“4/9/26 Name Create a Progress Note…”) or a 3-line block (date / name / action).
      </p>
      <p
        v-else-if="pasteText.trim() && !preview.items.length && preview.skipped.length"
        class="error"
      >
        Every parsed line was Consultation / 99415 (skipped). Add at least one progress, intake, or treatment-plan item.
      </p>
      <p v-if="error" class="error">{{ error }}</p>

      <div class="na-modal-actions">
        <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="na-btn-primary"
          :disabled="saving || !canSubmit"
          @click="submit"
        >
          {{ saving ? 'Building queue…' : 'Build work queue' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { noteAidTenantOptions } from '../../utils/noteAidTreatmentHelpers.js';
import {
  deriveInitialsFromName,
  matchTodoClientFromSearchRows,
  parseNoteAidTodoList
} from '../../utils/noteAidWorkQueue.js';

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
  defaultAgencyId: { type: [Number, String, null], default: null }
});

const emit = defineEmits(['close', 'built']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const pasteText = ref('');
const saving = ref(false);
const loadingOrgs = ref(false);
const error = ref('');
const linkedOrganizations = ref([]);

const form = reactive({
  agencyId: '',
  organizationId: ''
});

const tenantOptions = computed(() =>
  noteAidTenantOptions(agencyStore, { role: authStore.user?.role })
);

const programOptions = computed(() =>
  (linkedOrganizations.value || [])
    .filter((o) => ALLOWED_ORG_TYPES.has(String(o.organization_type || '').toLowerCase()))
    .map((o) => ({
      id: o.id,
      label: `${o.name || o.organization_name || 'Program'} (${o.organization_type || 'org'})`
    }))
);

const preview = computed(() => parseNoteAidTodoList(pasteText.value));

const canSubmit = computed(
  () =>
    !!Number(form.agencyId)
    && !!Number(form.organizationId)
    && preview.value.items.length > 0
);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    error.value = '';
    pasteText.value = '';
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
    await loadProgramsForTenant(form.agencyId);
  }
);

async function loadProgramsForTenant(agencyId) {
  loadingOrgs.value = true;
  linkedOrganizations.value = [];
  form.organizationId = '';
  try {
    const aid = Number(agencyId || 0);
    if (!aid) return;
    const res = await api.get(`/agencies/${aid}/affiliated-organizations`, {
      skipGlobalLoading: true
    });
    linkedOrganizations.value = res?.data?.organizations || res?.data || [];
    const clinical = linkedOrganizations.value.find(
      (o) => String(o.organization_type || '').toLowerCase() === 'clinical'
    );
    const first = clinical || linkedOrganizations.value[0];
    if (first?.id) form.organizationId = String(first.id);
  } catch {
    linkedOrganizations.value = [];
  } finally {
    loadingOrgs.value = false;
  }
}

function onTenantChange() {
  loadProgramsForTenant(form.agencyId);
}

async function findOrCreateClient(item, agencyId, organizationId) {
  const name = String(item.clientName || '').trim();
  const initials = deriveInitialsFromName(name);
  try {
    const searchRes = await api.get('/clients', {
      params: {
        agency_id: agencyId,
        search: name,
        limit: 20
      },
      skipGlobalLoading: true
    });
    const rows = searchRes?.data?.clients || searchRes?.data || [];
    const match = matchTodoClientFromSearchRows(name, rows);
    if (match?.id) {
      return { clientId: Number(match.id), clientName: match.full_name || name, created: false };
    }
  } catch {
    // create below
  }

  const createRes = await api.post(
    '/clients',
    {
      organization_id: organizationId,
      agency_id: agencyId,
      full_name: name,
      initials,
      submission_date: item.date || new Date().toISOString().slice(0, 10),
      client_type: 'clinical',
      source: 'NOTE_AID_MINIMAL'
    },
    { skipGlobalLoading: true }
  );
  const row = createRes?.data?.client || createRes?.data || {};
  return {
    clientId: Number(row.id),
    clientName: row.full_name || name,
    created: true
  };
}

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  error.value = '';
  try {
    const agencyId = Number(form.agencyId);
    const organizationId = Number(form.organizationId);
    const fromCatalog = (agencyStore.agencies || []).find((a) => Number(a.id) === agencyId);
    const fromMemberships = (agencyStore.userAgencies || []).find((a) => Number(a.id) === agencyId);
    const tenant = fromCatalog
      || fromMemberships
      || (Number(agencyStore.currentAgency?.id) === agencyId ? agencyStore.currentAgency : null)
      || (tenantOptions.value || []).find((t) => Number(t.id) === agencyId)
      || null;
    const agencySlug = String(tenant?.slug || tenant?.portal_url || tenant?.portalUrl || '').trim();
    const agencyName = String(tenant?.name || '').trim();
    const agencyLogoPath = String(tenant?.logo_path || tenant?.logoPath || '').trim() || null;
    const agencyLogoUrl = String(tenant?.logo_url || tenant?.logoUrl || '').trim() || null;
    const built = [];
    for (const item of preview.value.items) {
      const linked = await findOrCreateClient(item, agencyId, organizationId);
      built.push({
        ...item,
        clientId: linked.clientId,
        clientName: linked.clientName,
        agencyId,
        organizationId,
        agencySlug: agencySlug || null,
        agencyName: agencyName || null,
        agencyLogoPath,
        agencyLogoUrl,
        status: 'pending'
      });
    }
    emit('built', {
      items: built,
      skipped: preview.value.skipped,
      agencyId,
      organizationId
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not build queue';
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
  align-items: flex-start;
  justify-content: center;
  z-index: 90;
  padding: 24px 16px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(560px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal-head { display: flex; justify-content: space-between; align-items: center; }
.na-modal-head h3 { margin: 0; }
.hint { color: #64748b; font-size: 0.85rem; margin: 8px 0 12px; }
.muted { color: #64748b; font-size: 0.82rem; margin: 4px 0; }
.error { color: #b91c1c; font-size: 0.85rem; }
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.na-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.na-btn-primary {
  border: none; background: #0f766e; color: #fff; border-radius: 10px;
  font-weight: 700; padding: 8px 14px; cursor: pointer;
}
.na-btn-outline {
  border: 1px solid #0f766e; background: #fff; color: #0d5f59; border-radius: 10px;
  font-weight: 700; padding: 8px 14px; cursor: pointer;
}
.na-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.na-link-btn { border: none; background: transparent; color: #0f766e; cursor: pointer; font-weight: 600; }
</style>
