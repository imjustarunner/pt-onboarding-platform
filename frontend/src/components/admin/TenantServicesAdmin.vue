<template>
  <div class="tsa">
    <div class="tsa-head">
      <h3>Tenant service types</h3>
      <p class="hint">
        Enable a business type and click <strong>Save business types</strong>.
        Each type gets its own default service suite and starter packages (mental health uses the clinical counseling catalog;
        tutoring, coaching, consulting, etc. get a simple session). You can edit or add more anytime.
        Only enabled verticals appear in booking and public finders.
      </p>
      <p v-if="capabilitiesSummary" class="hint audit">{{ capabilitiesSummary }}</p>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="muted">Loading…</div>

    <template v-else>
      <section class="tsa-section">
        <h4>Business types</h4>
        <div class="tsa-chips">
          <label v-for="code in catalog" :key="code" class="tsa-chip">
            <input type="checkbox" :checked="enabledTypeSet.has(code)" @change="toggleType(code, $event.target.checked)" />
            <span>{{ labelType(code) }}</span>
          </label>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="savingTypes" @click="saveTypes">
          {{ savingTypes ? 'Saving…' : 'Save business types' }}
        </button>
      </section>

      <section class="tsa-section">
        <div class="tsa-row">
          <h4>Services by business type</h4>
          <button type="button" class="btn btn-primary btn-sm" @click="startCreate">Add service</button>
        </div>
        <p class="hint">
          Suites are scoped to the business type that owns them. Enabling a type seeds its defaults; disable a type to hide it from booking.
        </p>

        <div v-if="editing" class="tsa-form">
          <label>
            Name
            <input v-model="form.name" class="input" maxlength="200" />
          </label>
          <label>
            Service code
            <input v-model="form.serviceCode" class="input" maxlength="32" placeholder="e.g. 90837, H2014" />
          </label>
          <label>
            Business type
            <select v-model="form.businessType" class="input">
              <option v-for="code in enabledTypesOrAll" :key="`bt-${code}`" :value="code">{{ labelType(code) }}</option>
            </select>
          </label>
          <label>
            Duration (minutes)
            <input v-model.number="form.defaultDurationMinutes" class="input" type="number" min="5" max="480" />
          </label>
          <label>
            Modality
            <select v-model="form.modality" class="input">
              <option value="EITHER">In-person or telehealth</option>
              <option value="IN_PERSON">In-person only</option>
              <option value="TELEHEALTH">Telehealth only</option>
            </select>
          </label>
          <label class="check"><input v-model="form.allowsIndividual" type="checkbox" /> Individual</label>
          <label class="check"><input v-model="form.allowsGroup" type="checkbox" /> Group / multi</label>
          <label class="check"><input v-model="form.isStaffBookable" type="checkbox" /> Staff bookable</label>
          <label class="check"><input v-model="form.isPubliclyBookable" type="checkbox" /> Publicly bookable</label>
          <div class="tsa-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="editing = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="savingService" @click="saveService">
              {{ savingService ? 'Saving…' : (form.id ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>

        <div v-if="!enabledTypesOrAll.length" class="muted">Enable at least one business type to see its service suite.</div>
        <div v-for="code in enabledTypesOrAll" :key="`svc-suite-${code}`" class="tsa-suite">
          <h5>{{ labelType(code) }}</h5>
          <ul v-if="servicesForType(code).length" class="tsa-list">
            <li v-for="svc in servicesForType(code)" :key="svc.id" class="tsa-item">
              <div>
                <strong>
                  <span v-if="svc.serviceCode" class="tsa-code">{{ svc.serviceCode }}</span>
                  {{ svc.name }}
                </strong>
                <span class="muted"> · {{ svc.defaultDurationMinutes }}m · {{ modalityLabel(svc.modality) }}</span>
              </div>
              <div class="tsa-item-actions">
                <button type="button" class="btn btn-secondary btn-xs" @click="editService(svc)">Edit</button>
                <button type="button" class="btn btn-secondary btn-xs" @click="openStaff(svc)">Staff</button>
                <button type="button" class="btn btn-danger btn-xs" @click="removeService(svc)">Deactivate</button>
              </div>
            </li>
          </ul>
          <p v-else class="muted">No services yet — save business types to seed the default suite, or add one.</p>
        </div>
      </section>

      <section v-if="staffService" class="tsa-section">
        <h4>Staff for {{ staffService.name }}</h4>
        <p class="hint">Enter comma-separated user IDs to assign. Assigned staff are the only bookable providers when any assignment exists.</p>
        <input v-model="staffUserIdsText" class="input" placeholder="e.g. 12, 34, 56" />
        <div class="tsa-actions" style="margin-top: 8px;">
          <button type="button" class="btn btn-secondary btn-sm" @click="staffService = null">Close</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="savingStaff" @click="saveStaff">
            {{ savingStaff ? 'Saving…' : 'Save staff' }}
          </button>
        </div>
        <ul v-if="staffRows.length" class="tsa-list" style="margin-top: 8px;">
          <li v-for="s in staffRows" :key="s.id" class="muted">
            #{{ s.userId }} {{ s.firstName }} {{ s.lastName }} {{ s.email ? `(${s.email})` : '' }}
          </li>
        </ul>
      </section>

      <section class="tsa-section">
        <div class="tsa-row">
          <h4>Packages by business type</h4>
          <button type="button" class="btn btn-primary btn-sm" @click="startPackage">Add package</button>
        </div>
        <p class="hint">
          Each package belongs to one business type and only spends against that type’s services.
        </p>
        <div v-if="editingPackage" class="tsa-form">
          <label>
            Name
            <input v-model="packageForm.name" class="input" maxlength="200" />
          </label>
          <label>
            Business type
            <select v-model="packageForm.businessType" class="input">
              <option v-for="code in enabledTypesOrAll" :key="`pkg-${code}`" :value="code">{{ labelType(code) }}</option>
            </select>
          </label>
          <label>
            Sessions
            <input v-model.number="packageForm.sessionCount" class="input" type="number" min="1" max="500" />
          </label>
          <label>
            Price (cents)
            <input v-model.number="packageForm.priceCents" class="input" type="number" min="0" />
          </label>
          <label>
            Consume on
            <select v-model="packageForm.consumeOn" class="input">
              <option value="reserve">Reserve at booking</option>
              <option value="complete">Consume when completed</option>
            </select>
          </label>
          <div class="tsa-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="editingPackage = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="savingPackage" @click="savePackage">
              {{ savingPackage ? 'Saving…' : (packageForm.id ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>
        <div v-for="code in enabledTypesOrAll" :key="`pkg-suite-${code}`" class="tsa-suite">
          <h5>{{ labelType(code) }}</h5>
          <ul v-if="packagesForType(code).length" class="tsa-list">
            <li v-for="pkg in packagesForType(code)" :key="pkg.id" class="tsa-item">
              <div>
                <strong>{{ pkg.name }}</strong>
                <span class="muted"> · {{ pkg.sessionCount }} sessions · {{ pkg.consumeOn }}</span>
              </div>
              <div class="tsa-item-actions">
                <button type="button" class="btn btn-secondary btn-xs" @click="editPackage(pkg)">Edit</button>
              </div>
            </li>
          </ul>
          <p v-else class="muted">No packages for this type yet.</p>
        </div>
      </section>

      <section class="tsa-section">
        <SessionNotificationsAdmin :agency-id="agencyId" />
      </section>

      <section class="tsa-section">
        <div class="tsa-row">
          <h4>Cancellation policies</h4>
          <button type="button" class="btn btn-primary btn-sm" @click="startPolicy">Add policy</button>
        </div>
        <p class="hint">
          Hierarchy: appointment override → package → service → business type → tenant → affiliation.
          Most specific matching policy wins.
        </p>
        <div v-if="editingPolicy" class="tsa-form">
          <label>
            Name
            <input v-model="policyForm.name" class="input" maxlength="200" />
          </label>
          <label>
            Scope
            <select v-model="policyForm.scopeLevel" class="input">
              <option value="tenant">Tenant default</option>
              <option value="business_type">Business type</option>
              <option value="service">Service</option>
              <option value="package">Package</option>
              <option value="affiliation">Affiliation</option>
            </select>
          </label>
          <label v-if="policyForm.scopeLevel === 'business_type'">
            Business type
            <select v-model="policyForm.businessType" class="input">
              <option v-for="code in enabledTypesOrAll" :key="`pol-${code}`" :value="code">{{ labelType(code) }}</option>
            </select>
          </label>
          <label>
            Notice hours
            <input v-model.number="policyForm.noticeHours" class="input" type="number" min="0" max="720" />
          </label>
          <label>
            Late fee (cents)
            <input v-model.number="policyForm.lateFeeCents" class="input" type="number" min="0" />
          </label>
          <label>
            Late package action
            <select v-model="policyForm.latePackageAction" class="input">
              <option value="forfeit">Forfeit credit</option>
              <option value="release">Release credit</option>
              <option value="review">Staff review</option>
            </select>
          </label>
          <label class="check"><input v-model="policyForm.allowClientCancel" type="checkbox" /> Allow client cancel</label>
          <label class="check"><input v-model="policyForm.requireReason" type="checkbox" /> Require reason</label>
          <div class="tsa-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="editingPolicy = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="savingPolicy" @click="savePolicy">
              {{ savingPolicy ? 'Saving…' : (policyForm.id ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>
        <ul class="tsa-list">
          <li v-for="pol in policies" :key="pol.id" class="tsa-item">
            <div>
              <strong>{{ pol.name }}</strong>
              <span class="muted">
                · {{ pol.scopeLevel }} · {{ pol.noticeHours }}h notice
                · late {{ pol.latePackageAction }}
                <template v-if="pol.lateFeeCents"> · fee {{ pol.lateFeeCents }}¢</template>
              </span>
            </div>
            <div class="tsa-item-actions">
              <button type="button" class="btn btn-secondary btn-xs" @click="editPolicy(pol)">Edit</button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';
import { buildCapabilitiesPayload } from '../../config/businessTypeCapabilities.js';
import SessionNotificationsAdmin from './SessionNotificationsAdmin.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const emit = defineEmits(['capabilities-changed']);

const loading = ref(false);
const error = ref('');
const catalog = ref([]);
const businessTypes = ref([]);
const services = ref([]);
const packages = ref([]);
const policies = ref([]);
const editing = ref(false);
const editingPackage = ref(false);
const editingPolicy = ref(false);
const savingTypes = ref(false);
const savingService = ref(false);
const savingStaff = ref(false);
const savingPackage = ref(false);
const savingPolicy = ref(false);
const staffService = ref(null);
const staffRows = ref([]);
const staffUserIdsText = ref('');
const form = ref(emptyForm());
const packageForm = ref(emptyPackageForm());
const policyForm = ref(emptyPolicyForm());
const capabilities = ref(null);

function emptyForm() {
  return {
    id: 0,
    name: '',
    serviceCode: '',
    businessType: 'mental_health',
    defaultDurationMinutes: 60,
    modality: 'EITHER',
    allowsIndividual: true,
    allowsGroup: false,
    isStaffBookable: true,
    isPubliclyBookable: false
  };
}

function emptyPackageForm() {
  return {
    id: 0,
    name: '',
    businessType: 'mental_health',
    sessionCount: 4,
    priceCents: 0,
    consumeOn: 'reserve'
  };
}

function emptyPolicyForm() {
  return {
    id: 0,
    name: '',
    scopeLevel: 'tenant',
    businessType: 'mental_health',
    noticeHours: 24,
    lateFeeCents: 0,
    latePackageAction: 'forfeit',
    allowClientCancel: true,
    requireReason: true
  };
}

const enabledTypeSet = computed(() => new Set(
  (businessTypes.value || []).filter((t) => t.isEnabled).map((t) => t.businessType)
));

const enabledTypesOrAll = computed(() => {
  const enabled = Array.from(enabledTypeSet.value);
  return enabled.length ? enabled : (catalog.value || []);
});

const labelType = (code) => String(code || '').replace(/_/g, ' ');

const servicesForType = (code) =>
  (services.value || []).filter((s) => String(s.businessType) === String(code));

const packagesForType = (code) =>
  (packages.value || []).filter((p) => String(p.businessType) === String(code));

const capabilitiesSummary = computed(() => {
  const caps = capabilities.value;
  if (!caps?.enabledBusinessTypes?.length) return '';
  const publics = (caps.allowedPublicServiceTypes || []).join(', ') || 'none';
  const surfaces = (caps.allowedRoleSurfaces || []).join(', ') || 'none';
  return `Active packs → public: ${publics}; role surfaces: ${surfaces}.`;
});

const emitCapabilities = (caps) => {
  const payload = caps || buildCapabilitiesPayload(businessTypes.value || []);
  capabilities.value = payload;
  emit('capabilities-changed', payload);
};

const modalityLabel = (modality) => {
  const m = String(modality || '').toUpperCase();
  if (m === 'IN_PERSON') return 'In-person';
  if (m === 'TELEHEALTH') return 'Telehealth';
  if (m === 'EITHER') return 'In-person or telehealth';
  return modality || '—';
};

const load = async () => {
  const aid = Number(props.agencyId || 0);
  if (!aid) return;
  loading.value = true;
  error.value = '';
  try {
    // Seed suites once via business-types, then load catalogs without re-seeding in parallel.
    const bt = await api.get(`/tenant-booking/agencies/${aid}/business-types`, {
      params: { ensureDefaults: 'true' }
    });
    catalog.value = bt.data?.catalog || [];
    businessTypes.value = bt.data?.businessTypes || [];
    emitCapabilities(bt.data?.capabilities || null);

    const [svc, pkg, pol] = await Promise.all([
      api.get(`/tenant-booking/agencies/${aid}/tenant-services`, {
        params: { includeInactive: 'false', ensureSuites: 'false' }
      }),
      api.get(`/tenant-booking/agencies/${aid}/packages`, { params: { ensureSuites: 'false' } })
        .catch(() => ({ data: { packages: [] } })),
      api.get(`/tenant-booking/agencies/${aid}/cancellation-policies`, { params: { ensureDefault: 'true' } })
        .catch(() => ({ data: { policies: [] } }))
    ]);
    services.value = svc.data?.services || [];
    packages.value = pkg.data?.packages || [];
    policies.value = pol.data?.policies || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load catalog';
  } finally {
    loading.value = false;
  }
};

const toggleType = (code, on) => {
  const list = [...(businessTypes.value || [])];
  const idx = list.findIndex((t) => t.businessType === code);
  if (idx >= 0) list[idx] = { ...list[idx], isEnabled: !!on };
  else list.push({ businessType: code, isEnabled: !!on, sortOrder: list.length });
  businessTypes.value = list;
};

const saveTypes = async () => {
  const aid = Number(props.agencyId || 0);
  savingTypes.value = true;
  error.value = '';
  try {
    const payload = (catalog.value || []).map((code, i) => ({
      businessType: code,
      isEnabled: enabledTypeSet.value.has(code),
      sortOrder: i
    }));
    const r = await api.put(`/tenant-booking/agencies/${aid}/business-types`, { businessTypes: payload });
    businessTypes.value = r.data?.businessTypes || [];
    emitCapabilities(r.data?.capabilities || null);
    // Suites seed on save — reload services/packages so new defaults appear immediately.
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save types';
  } finally {
    savingTypes.value = false;
  }
};

const startPackage = () => {
  packageForm.value = emptyPackageForm();
  packageForm.value.businessType = enabledTypesOrAll.value[0] || 'mental_health';
  editingPackage.value = true;
};

const editPackage = (pkg) => {
  packageForm.value = {
    id: pkg.id,
    name: pkg.name,
    businessType: pkg.businessType,
    sessionCount: pkg.sessionCount,
    priceCents: pkg.priceCents,
    consumeOn: pkg.consumeOn || 'reserve'
  };
  editingPackage.value = true;
};

const savePackage = async () => {
  const aid = Number(props.agencyId || 0);
  if (!String(packageForm.value.name || '').trim()) {
    error.value = 'Package name is required';
    return;
  }
  savingPackage.value = true;
  error.value = '';
  try {
    if (packageForm.value.id) {
      await api.patch(`/tenant-booking/agencies/${aid}/packages/${packageForm.value.id}`, packageForm.value);
    } else {
      await api.post(`/tenant-booking/agencies/${aid}/packages`, packageForm.value);
    }
    editingPackage.value = false;
    const r = await api.get(`/tenant-booking/agencies/${aid}/packages`);
    packages.value = r.data?.packages || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save package';
  } finally {
    savingPackage.value = false;
  }
};

const startPolicy = () => {
  policyForm.value = emptyPolicyForm();
  policyForm.value.businessType = enabledTypesOrAll.value[0] || 'mental_health';
  editingPolicy.value = true;
};

const editPolicy = (pol) => {
  policyForm.value = {
    id: pol.id,
    name: pol.name,
    scopeLevel: pol.scopeLevel || 'tenant',
    businessType: pol.businessType || enabledTypesOrAll.value[0] || 'mental_health',
    noticeHours: pol.noticeHours,
    lateFeeCents: pol.lateFeeCents,
    latePackageAction: pol.latePackageAction || 'forfeit',
    allowClientCancel: pol.allowClientCancel !== false,
    requireReason: pol.requireReason !== false
  };
  editingPolicy.value = true;
};

const savePolicy = async () => {
  const aid = Number(props.agencyId || 0);
  if (!String(policyForm.value.name || '').trim()) {
    error.value = 'Policy name is required';
    return;
  }
  savingPolicy.value = true;
  error.value = '';
  try {
    if (policyForm.value.id) {
      await api.patch(
        `/tenant-booking/agencies/${aid}/cancellation-policies/${policyForm.value.id}`,
        policyForm.value
      );
    } else {
      await api.post(`/tenant-booking/agencies/${aid}/cancellation-policies`, policyForm.value);
    }
    editingPolicy.value = false;
    const r = await api.get(`/tenant-booking/agencies/${aid}/cancellation-policies`);
    policies.value = r.data?.policies || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save policy';
  } finally {
    savingPolicy.value = false;
  }
};

const startCreate = () => {
  form.value = emptyForm();
  form.value.businessType = enabledTypesOrAll.value[0] || 'mental_health';
  editing.value = true;
};

const editService = (svc) => {
  form.value = {
    id: svc.id,
    name: svc.name,
    serviceCode: svc.serviceCode || '',
    businessType: svc.businessType,
    defaultDurationMinutes: svc.defaultDurationMinutes,
    modality: svc.modality,
    allowsIndividual: svc.allowsIndividual,
    allowsGroup: svc.allowsGroup,
    isStaffBookable: svc.isStaffBookable,
    isPubliclyBookable: svc.isPubliclyBookable
  };
  editing.value = true;
};

const saveService = async () => {
  const aid = Number(props.agencyId || 0);
  if (!String(form.value.name || '').trim()) {
    error.value = 'Service name is required';
    return;
  }
  savingService.value = true;
  error.value = '';
  try {
    if (form.value.id) {
      await api.patch(`/tenant-booking/agencies/${aid}/tenant-services/${form.value.id}`, form.value);
    } else {
      await api.post(`/tenant-booking/agencies/${aid}/tenant-services`, form.value);
    }
    editing.value = false;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save service';
  } finally {
    savingService.value = false;
  }
};

const removeService = async (svc) => {
  if (!window.confirm(`Deactivate “${svc.name}”?`)) return;
  const aid = Number(props.agencyId || 0);
  try {
    await api.delete(`/tenant-booking/agencies/${aid}/tenant-services/${svc.id}`);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to deactivate';
  }
};

const openStaff = async (svc) => {
  staffService.value = svc;
  const aid = Number(props.agencyId || 0);
  try {
    const r = await api.get(`/tenant-booking/agencies/${aid}/tenant-services/${svc.id}/staff`);
    staffRows.value = r.data?.staff || [];
    staffUserIdsText.value = staffRows.value.map((s) => s.userId).join(', ');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load staff';
  }
};

const saveStaff = async () => {
  if (!staffService.value) return;
  const aid = Number(props.agencyId || 0);
  const userIds = String(staffUserIdsText.value || '')
    .split(',')
    .map((s) => Number(String(s).trim()))
    .filter((n) => n > 0);
  savingStaff.value = true;
  try {
    const r = await api.put(
      `/tenant-booking/agencies/${aid}/tenant-services/${staffService.value.id}/staff`,
      { userIds }
    );
    staffRows.value = r.data?.staff || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save staff';
  } finally {
    savingStaff.value = false;
  }
};

watch(() => props.agencyId, () => { void load(); });
onMounted(() => { void load(); });
</script>

<style scoped>
.tsa { display: flex; flex-direction: column; gap: 16px; }
.tsa-head h3 { margin: 0 0 4px; }
.tsa-section { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fff; }
.tsa-section h4 { margin: 0 0 8px; }
.tsa-suite {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
}
.tsa-suite h5 {
  margin: 0 0 8px;
  font-size: 0.92rem;
  font-weight: 700;
  text-transform: capitalize;
  color: var(--primary, #047857);
}
.tsa-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.tsa-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; }
.tsa-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tsa-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.tsa-form label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: 600; }
.tsa-form .check { flex-direction: row; align-items: center; font-weight: 500; }
.tsa-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
.tsa-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tsa-item { display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-radius: 8px; background: #f8fafc; }
.tsa-item-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tsa-code {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 5px;
  background: #ecfdf5;
  color: #047857;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.hint { color: #64748b; font-size: 0.85rem; margin: 0; }
.hint.audit { margin-top: 6px; }
.muted { color: #64748b; }
.error { color: #b91c1c; }
.input { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
@media (max-width: 720px) {
  .tsa-form { grid-template-columns: 1fr; }
}
</style>
