<template>
  <div class="staff-setup">
    <p v-if="!readonly" class="staff-setup-hint">
      Set provider{{ isSchool ? ', service day,' : '' }} and insurance here. You can change these until staff readiness is marked complete.
    </p>
    <p v-else class="staff-setup-hint muted">Assigned by office staff.</p>

    <div v-if="readonly" class="staff-readonly-summary">
      <div class="staff-readonly-row">
        <span class="label">Provider</span>
        <span>{{ checklist?.provider_name || 'Not assigned' }}</span>
      </div>
      <div v-if="isSchool" class="staff-readonly-row">
        <span class="label">Service day</span>
        <span>{{ checklist?.client?.service_day || 'Not set' }}</span>
      </div>
      <div class="staff-readonly-row">
        <span class="label">Insurance</span>
        <span>{{ checklist?.client?.insurance_type_id ? 'Indicated' : 'Not indicated' }}</span>
      </div>
    </div>

    <template v-else>
      <div v-if="loading" class="muted small">Loading assignment options…</div>
      <div v-else-if="loadError" class="error small">{{ loadError }}</div>

      <div v-else class="staff-setup-form">
        <div class="field" :class="{ done: providerDone }">
        <div class="field-label-row">
          <span class="field-check" :class="{ on: providerDone }">
            <svg v-if="providerDone" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
          </span>
          <label for="ob-provider">Provider</label>
        </div>
        <select
          id="ob-provider"
          v-model="draftProviderId"
          class="field-select"
          :disabled="!canEdit || savingAssignment"
          @change="onProviderChange"
        >
          <option value="">Select provider…</option>
          <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
            {{ providerLabel(p) }}
          </option>
        </select>
        <div v-if="!providerOptions.length" class="field-note muted">
          {{ isSchool ? 'No providers affiliated with this school yet.' : 'No providers found for this agency.' }}
        </div>
      </div>

      <div v-if="isSchool" class="field" :class="{ done: dayDone }">
        <div class="field-label-row">
          <span class="field-check" :class="{ on: dayDone }">
            <svg v-if="dayDone" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
          </span>
          <label for="ob-day">Service day</label>
        </div>
        <select
          id="ob-day"
          v-model="draftServiceDay"
          class="field-select"
          :disabled="!canEdit || savingAssignment || !draftProviderId"
          @change="onDayChange"
        >
          <option value="">{{ draftProviderId ? 'Select day…' : 'Select a provider first' }}</option>
          <option v-for="d in availableDays" :key="d" :value="d">{{ d }}</option>
        </select>
        <div v-if="draftProviderId && availableDays.length <= 1" class="field-note muted">
          This provider has no scheduled work days with capacity at this school yet — you can still set Unknown.
        </div>
      </div>

      <div class="field" :class="{ done: insuranceDone }">
        <div class="field-label-row">
          <span class="field-check" :class="{ on: insuranceDone }">
            <svg v-if="insuranceDone" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
          </span>
          <label for="ob-insurance">Insurance / payment</label>
        </div>
        <select
          id="ob-insurance"
          v-model="draftInsuranceId"
          class="field-select"
          :disabled="!canEdit || savingInsurance"
          @change="saveInsurance"
        >
          <option value="">Select insurance / payment…</option>
          <option v-for="i in insuranceTypes" :key="i.id" :value="String(i.id)">{{ i.label }}</option>
        </select>
      </div>

      <div class="staff-setup-actions">
        <button
          v-if="canEdit"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="savingAssignment || !assignmentDirty || !canSaveAssignment"
          @click="saveAssignment"
        >
          {{ savingAssignment ? 'Saving…' : (isSchool ? 'Save provider & day' : 'Save provider') }}
        </button>
        <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
        <span v-else-if="saveError" class="error small">{{ saveError }}</span>
        <span v-else-if="!canEdit" class="muted tiny">Staff readiness already marked complete — edit from the client record if needed.</span>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  checklist: { type: Object, required: true },
  readonly: { type: Boolean, default: false }
});
const emit = defineEmits(['updated']);

const loading = ref(false);
const loadError = ref('');
const savingAssignment = ref(false);
const savingInsurance = ref(false);
const saveMsg = ref('');
const saveError = ref('');

const providerOptions = ref([]);
const scheduleRows = ref([]);
const insuranceTypes = ref([]);

const draftProviderId = ref('');
const draftServiceDay = ref('');
const draftInsuranceId = ref('');
const savedProviderId = ref('');
const savedServiceDay = ref('');
const savedInsuranceId = ref('');

const isSchool = computed(() => String(props.checklist?.client_type || '') === 'school');
const agencyId = computed(() => Number(props.checklist?.client?.agency_id || 0) || null);
const organizationId = computed(() => Number(props.checklist?.client?.organization_id || 0) || null);
const canEdit = computed(() => {
  if (props.checklist?.staff_onboarding_completed_at) return false;
  const status = String(props.checklist?.status_key || props.checklist?.client?.client_status_key || '').toLowerCase();
  return !['onboarded', 'current'].includes(status);
});

const providerDone = computed(() =>
  (props.checklist?.staff_items || []).some((i) => i.key === 'provider_assigned' && i.done)
);
const dayDone = computed(() =>
  (props.checklist?.staff_items || []).some((i) => i.key === 'service_day_assigned' && i.done)
);
const insuranceDone = computed(() =>
  (props.checklist?.staff_items || []).some((i) => i.key === 'insurance_indicated' && i.done)
);

const availableDays = computed(() => {
  const pid = Number(draftProviderId.value || 0);
  const days = new Set(['Unknown']);
  if (!pid) return ['Unknown'];
  for (const row of scheduleRows.value || []) {
    if (Number(row?.provider_user_id) !== pid) continue;
    const active = row?.is_active === undefined ? true : !!(row.is_active === 1 || row.is_active === true);
    if (!active) continue;
    const day = String(row?.day_of_week || '').trim();
    if (!day) continue;
    const avail = row?.slots_available;
    const hasCapacity = avail === null || avail === undefined ? true : Number(avail) > 0;
    // Keep currently assigned day even if capacity is 0, so edits don't drop it.
    if (!hasCapacity && day !== savedServiceDay.value) continue;
    days.add(day);
  }
  const list = Array.from(days);
  return list.sort((a, b) => {
    if (a === 'Unknown' && b !== 'Unknown') return -1;
    if (b === 'Unknown' && a !== 'Unknown') return 1;
    return (WEEKDAY_ORDER.indexOf(a) + 1 || 99) - (WEEKDAY_ORDER.indexOf(b) + 1 || 99);
  });
});

const assignmentDirty = computed(() => {
  if (String(draftProviderId.value || '') !== String(savedProviderId.value || '')) return true;
  if (isSchool.value && String(draftServiceDay.value || '') !== String(savedServiceDay.value || '')) return true;
  return false;
});

const canSaveAssignment = computed(() => {
  if (!draftProviderId.value) return false;
  if (isSchool.value && !draftServiceDay.value) return false;
  return true;
});

function providerLabel(p) {
  const first = String(p?.first_name || '').trim();
  const last = String(p?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim() || `Provider ${p?.id || ''}`;
}

function syncDraftFromChecklist() {
  const c = props.checklist?.client || {};
  const pid = c.provider_id || props.checklist?.provider_user_id || '';
  draftProviderId.value = pid ? String(pid) : '';
  savedProviderId.value = draftProviderId.value;
  draftServiceDay.value = c.service_day ? String(c.service_day) : '';
  savedServiceDay.value = draftServiceDay.value;
  draftInsuranceId.value = c.insurance_type_id ? String(c.insurance_type_id) : '';
  savedInsuranceId.value = draftInsuranceId.value;
  saveMsg.value = '';
  saveError.value = '';
}

function onProviderChange() {
  saveMsg.value = '';
  saveError.value = '';
  const days = availableDays.value;
  if (draftServiceDay.value && !days.includes(draftServiceDay.value)) {
    draftServiceDay.value = '';
  }
  // Office clients only need provider — save immediately.
  if (!isSchool.value && draftProviderId.value) {
    saveAssignment();
  }
}

function onDayChange() {
  saveMsg.value = '';
  saveError.value = '';
  if (canSaveAssignment.value && assignmentDirty.value) {
    saveAssignment();
  }
}

async function loadOptions() {
  const aid = agencyId.value;
  const orgId = organizationId.value;
  if (!aid) {
    loadError.value = 'Missing agency context for this client.';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    if (isSchool.value && orgId) {
      const [sched, aff, ins] = await Promise.all([
        api.get('/provider-scheduling/assignments', {
          params: { agencyId: aid, schoolOrganizationId: orgId },
          skipGlobalLoading: true
        }),
        api.get('/provider-scheduling/affiliated-providers', {
          params: { agencyId: aid, schoolOrganizationId: orgId },
          skipGlobalLoading: true
        }),
        api.get('/client-settings/insurance-types', {
          params: { agencyId: aid },
          skipGlobalLoading: true
        })
      ]);
      scheduleRows.value = Array.isArray(sched.data) ? sched.data : [];
      const byProvider = new Map();
      for (const row of scheduleRows.value) {
        const pid = Number(row?.provider_user_id);
        if (!pid || byProvider.has(pid)) continue;
        byProvider.set(pid, {
          id: pid,
          first_name: row?.provider_first_name || '',
          last_name: row?.provider_last_name || ''
        });
      }
      for (const p of (Array.isArray(aff.data) ? aff.data : [])) {
        const pid = Number(p?.id);
        if (!pid || byProvider.has(pid)) continue;
        byProvider.set(pid, {
          id: pid,
          first_name: p?.first_name || '',
          last_name: p?.last_name || ''
        });
      }
      providerOptions.value = Array.from(byProvider.values()).sort((a, b) =>
        String(a.last_name || '').localeCompare(String(b.last_name || ''))
        || String(a.first_name || '').localeCompare(String(b.first_name || ''))
      );
      insuranceTypes.value = (ins.data || []).filter(
        (s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true)
      );
    } else {
      const [prov, ins] = await Promise.all([
        api.get('/provider-scheduling/providers', { params: { agencyId: aid }, skipGlobalLoading: true }),
        api.get('/client-settings/insurance-types', { params: { agencyId: aid }, skipGlobalLoading: true })
      ]);
      scheduleRows.value = [];
      providerOptions.value = (Array.isArray(prov.data) ? prov.data : []).map((p) => ({
        id: Number(p.id),
        first_name: p.first_name || '',
        last_name: p.last_name || ''
      })).filter((p) => p.id);
      insuranceTypes.value = (ins.data || []).filter(
        (s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true)
      );
    }
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load staff setup options';
    providerOptions.value = [];
    scheduleRows.value = [];
    insuranceTypes.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveAssignment() {
  if (!canEdit.value || !canSaveAssignment.value) return;
  const id = Number(props.clientId || 0);
  const providerUserId = Number(draftProviderId.value || 0);
  if (!id || !providerUserId) return;

  savingAssignment.value = true;
  saveError.value = '';
  saveMsg.value = '';
  try {
    if (isSchool.value) {
      const orgId = organizationId.value;
      if (!orgId) throw new Error('School organization is required');
      await api.post(`/clients/${id}/provider-assignments`, {
        organization_id: orgId,
        provider_user_id: providerUserId,
        service_day: String(draftServiceDay.value || 'Unknown'),
        is_primary: true
      }, { skipGlobalLoading: true });
    } else {
      await api.put(`/clients/${id}/provider`, {
        provider_id: providerUserId
      }, { skipGlobalLoading: true });
    }
    savedProviderId.value = String(providerUserId);
    savedServiceDay.value = isSchool.value ? String(draftServiceDay.value || '') : '';
    saveMsg.value = 'Provider assignment saved';
    emit('updated');
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Failed to save provider assignment';
  } finally {
    savingAssignment.value = false;
  }
}

async function saveInsurance() {
  if (!canEdit.value) return;
  const id = Number(props.clientId || 0);
  if (!id) return;
  const next = draftInsuranceId.value ? Number(draftInsuranceId.value) : null;
  if (String(next || '') === String(savedInsuranceId.value || '')) return;

  savingInsurance.value = true;
  saveError.value = '';
  saveMsg.value = '';
  try {
    await api.put(`/clients/${id}`, {
      insurance_type_id: next
    }, { skipGlobalLoading: true });
    savedInsuranceId.value = next ? String(next) : '';
    saveMsg.value = 'Insurance saved';
    emit('updated');
  } catch (e) {
    draftInsuranceId.value = savedInsuranceId.value;
    saveError.value = e.response?.data?.error?.message || 'Failed to save insurance';
  } finally {
    savingInsurance.value = false;
  }
}

watch(
  () => [props.clientId, props.checklist?.client?.provider_id, props.checklist?.client?.service_day, props.checklist?.client?.insurance_type_id],
  () => syncDraftFromChecklist(),
  { immediate: true }
);

watch(
  () => [props.clientId, agencyId.value, organizationId.value, isSchool.value, props.readonly],
  () => {
    if (props.readonly) return;
    loadOptions();
  },
  { immediate: true }
);
</script>

<style scoped>
.staff-setup {
  margin-top: 4px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #bae6fd;
  background: #f0f9ff;
}
.staff-setup-hint {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.4;
}
.staff-readonly-summary {
  display: grid;
  gap: 8px;
}
.staff-readonly-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.88rem;
  padding: 8px 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.staff-readonly-row .label {
  font-weight: 700;
  color: #64748b;
}
.staff-setup-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-label-row label {
  font-size: 0.82rem;
  font-weight: 800;
  color: #0f172a;
}
.field-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: #fff;
}
.field-check.on {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.field-check.on svg { width: 12px; height: 12px; }
.field-select {
  width: 100%;
  max-width: 420px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.88rem;
  background: #fff;
  cursor: pointer;
}
.field-select:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background: #f8fafc;
}
.field-note { font-size: 0.75rem; }
.staff-setup-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.save-msg { font-size: 0.82rem; font-weight: 700; color: #0369a1; }
.error { color: #b91c1c; }
.muted { color: #64748b; }
.small { font-size: 0.82rem; }
.tiny { font-size: 0.75rem; }
</style>
