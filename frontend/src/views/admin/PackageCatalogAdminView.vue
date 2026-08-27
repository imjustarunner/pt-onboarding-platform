<template>
  <div class="pkg-admin container">
    <div class="page-header">
      <div>
        <h1>Package catalog</h1>
        <p class="subtitle">
          Tenant-wide packages (coaching / individual tutoring) or program-scoped packages
          (Summer Reading, small group). Wired for Stripe checkout and session entitlements.
        </p>
      </div>
      <button type="button" class="btn btn-primary" @click="startCreate">+ New package</button>
    </div>

    <div class="filters card">
      <label>Business type
        <select v-model="filterBusinessType" @change="load">
          <option value="">All enabled</option>
          <option v-for="bt in businessTypes" :key="bt" :value="bt">{{ bt }}</option>
        </select>
      </label>
      <label>Scope
        <select v-model="filterScope" @change="load">
          <option value="all">All packages</option>
          <option value="tenant">Tenant-wide only</option>
          <option value="program">Program-scoped only</option>
        </select>
      </label>
      <label v-if="filterScope !== 'tenant'">Program
        <select v-model="filterProgramId" @change="load">
          <option value="">Any / all programs</option>
          <option v-for="p in programs" :key="p.id" :value="String(p.id)">{{ p.class_name }}</option>
        </select>
      </label>
      <label class="toggle"><input v-model="includeInactive" type="checkbox" @change="load" /> Show inactive</label>
    </div>

    <div v-if="loading" class="card">Loading…</div>
    <div v-else-if="error" class="card err">{{ error }}</div>

    <div v-else class="list">
      <div
        v-for="pkg in filteredPackages"
        :key="pkg.id"
        class="card pkg-card"
        :class="{ inactive: !pkg.isActive }"
      >
        <div class="pkg-head">
          <div>
            <h3>{{ pkg.name }}</h3>
            <p class="meta">
              {{ pkg.sessionCount }} sessions · {{ formatMoney(pkg.priceCents) }}
              · {{ pkg.businessType }}
              · {{ pkg.packageType }}
            </p>
          </div>
          <div class="pkg-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="duplicate(pkg)">Duplicate</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="edit(pkg)">Edit</button>
          </div>
        </div>
        <p v-if="pkg.description" class="desc">{{ pkg.description }}</p>
        <div class="chips">
          <span>{{ pkg.learningProgramClassId ? (pkg.programName || `Program #${pkg.learningProgramClassId}`) : 'Tenant-wide' }}</span>
          <span>Consume: {{ pkg.consumeOn }}</span>
          <span v-if="pkg.allowedTenantServiceIds?.length">
            {{ pkg.allowedTenantServiceIds.length }} service{{ pkg.allowedTenantServiceIds.length === 1 ? '' : 's' }}
          </span>
          <span v-else>Any service (type)</span>
          <span v-if="pkg.isPublic">Public catalog</span>
          <span v-else>Staff only</span>
          <span v-if="!pkg.isActive">Inactive</span>
        </div>
        <div v-if="pkg.isPublic" class="preview">
          <strong>Guardian preview:</strong>
          {{ pkg.name }} — {{ pkg.sessionCount }} sessions for {{ formatMoney(pkg.priceCents) }}
        </div>
      </div>
      <p v-if="!filteredPackages.length" class="muted">No packages yet. Create your first package.</p>
    </div>

    <div v-if="formOpen" class="modal-backdrop" @click.self="formOpen = false">
      <div class="modal-card">
        <h3>{{ editingId ? 'Edit package' : 'New package' }}</h3>

        <label>Name<input v-model="form.name" type="text" /></label>
        <label>Description<textarea v-model="form.description" rows="2" /></label>

        <div class="row2">
          <label>Business type
            <select v-model="form.businessType">
              <option v-for="bt in businessTypes" :key="bt" :value="bt">{{ bt }}</option>
            </select>
          </label>
          <label>Package type
            <select v-model="form.packageType">
              <option value="prepaid_bundle">Prepaid bundle</option>
              <option value="payg">Pay as you go</option>
              <option value="subscription" disabled>Subscription (soon)</option>
              <option value="installment" disabled>Installment (soon)</option>
            </select>
          </label>
        </div>

        <label>Scope
          <select v-model="form.scope">
            <option value="tenant">Tenant-wide (no program)</option>
            <option value="program">Tied to a program</option>
          </select>
        </label>
        <label v-if="form.scope === 'program'">Program
          <select v-model="form.learningProgramClassId">
            <option value="">Select program…</option>
            <option v-for="p in programs" :key="p.id" :value="String(p.id)">{{ p.class_name }}</option>
          </select>
        </label>

        <div class="row2">
          <label># of sessions<input v-model.number="form.sessionCount" type="number" min="1" /></label>
          <label>List price ($)<input v-model.number="form.priceDollars" type="number" min="0" step="0.01" /></label>
        </div>

        <fieldset class="svc-fieldset">
          <legend>Attach to services <span v-if="form.isPublic">(required for public)</span></legend>
          <p class="muted">Public pages show packages only after the visitor picks a service.</p>
          <label v-for="svc in servicesForBusinessType" :key="svc.id" class="svc-check">
            <input
              type="checkbox"
              :value="svc.id"
              :checked="form.allowedTenantServiceIds.includes(svc.id)"
              @change="toggleService(svc.id, $event.target.checked)"
            />
            {{ svc.name }}
            <span v-if="svc.isPubliclyBookable" class="chip">public</span>
          </label>
          <p v-if="!servicesForBusinessType.length" class="muted">
            No tenant services for {{ form.businessType }}. Create services in Tenant booking settings first.
          </p>
        </fieldset>

        <div class="row2">
          <label>Consume on
            <select v-model="form.consumeOn">
              <option value="reserve">Reserve at booking</option>
              <option value="complete">Complete session</option>
            </select>
          </label>
          <label>Delivery mode
            <select v-model="form.deliveryMode">
              <option value="1:1">1:1</option>
              <option value="small_group">Small group</option>
            </select>
          </label>
        </div>

        <h4>Billing</h4>
        <label>Mode
          <select v-model="form.billingMode">
            <option value="pay_in_full">Pay in full</option>
            <option value="subscription" disabled>Subscription (soon)</option>
            <option value="installments" disabled>Installments (soon)</option>
          </select>
        </label>

        <h4>Policies</h4>
        <div class="row2">
          <label>Cancel notice (hours)<input v-model.number="form.cancelHours" type="number" min="0" /></label>
          <label>Expire after (days)<input v-model.number="form.expirationDays" type="number" min="0" placeholder="optional" /></label>
        </div>
        <label>Late cancel / no-show
          <select v-model="form.latePolicy">
            <option value="forfeit">Forfeit 1 session</option>
            <option value="free_rebook">Free rebook</option>
            <option value="fee">Fee (manual)</option>
          </select>
        </label>

        <div class="toggles">
          <label><input v-model="form.isPublic" type="checkbox" /> Show in guardian / public catalog</label>
          <label><input v-model="form.autoEnrollSubject" type="checkbox" /> Auto-enroll tutoring subject on purchase</label>
          <label><input v-model="form.isActive" type="checkbox" /> Active</label>
        </div>

        <div v-if="form.isPublic" class="preview-box">
          <strong>Guardian sees:</strong>
          <div>{{ form.name || 'Package name' }}</div>
          <div class="muted">{{ form.sessionCount || 0 }} sessions · {{ formatMoney((form.priceDollars || 0) * 100) }}</div>
        </div>

        <p v-if="saveError" class="err">{{ saveError }}</p>
        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="formOpen = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save package' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import * as unifiedPackages from '../../services/unifiedPackages';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const agencyStore = useAgencyStore();
const agencyId = () => Number(agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id || 0);

const loading = ref(true);
const error = ref('');
const packages = ref([]);
const programs = ref([]);
const tenantServices = ref([]);
const businessTypes = ref(['tutoring', 'coaching', 'consulting']);
const filterBusinessType = ref('');
const filterScope = ref('all');
const filterProgramId = ref('');
const includeInactive = ref(true);

const formOpen = ref(false);
const editingId = ref(null);
const saving = ref(false);
const saveError = ref('');

const blankForm = () => ({
  name: '',
  description: '',
  businessType: 'tutoring',
  packageType: 'prepaid_bundle',
  scope: 'tenant',
  learningProgramClassId: '',
  sessionCount: 4,
  priceDollars: 0,
  consumeOn: 'reserve',
  deliveryMode: '1:1',
  billingMode: 'pay_in_full',
  cancelHours: 24,
  expirationDays: null,
  latePolicy: 'forfeit',
  isPublic: true,
  autoEnrollSubject: true,
  isActive: true,
  allowedTenantServiceIds: []
});
const form = ref(blankForm());

const formatMoney = unifiedPackages.formatMoney;

const servicesForBusinessType = computed(() =>
  (tenantServices.value || []).filter(
    (s) => String(s.businessType) === String(form.value.businessType) && s.isActive !== false
  )
);

const filteredPackages = computed(() => {
  let rows = packages.value || [];
  if (filterScope.value === 'tenant') {
    rows = rows.filter((p) => !p.learningProgramClassId);
  } else if (filterScope.value === 'program') {
    rows = rows.filter((p) => !!p.learningProgramClassId);
    if (filterProgramId.value) {
      rows = rows.filter((p) => String(p.learningProgramClassId) === String(filterProgramId.value));
    }
  } else if (filterProgramId.value) {
    rows = rows.filter(
      (p) => !p.learningProgramClassId || String(p.learningProgramClassId) === String(filterProgramId.value)
    );
  }
  return rows;
});

async function loadMeta() {
  const aid = agencyId();
  if (!aid) return;
  try {
    const [btRes, progRes, svcRes] = await Promise.all([
      api.get(`/tenant-booking/agencies/${aid}/business-types`, { skipGlobalLoading: true }).catch(() => null),
      api.get('/learning-program-classes', {
        params: { status: 'active', limit: 200 },
        skipGlobalLoading: true
      }).catch(() => null),
      api.get(`/tenant-booking/agencies/${aid}/tenant-services`, { skipGlobalLoading: true }).catch(() => null)
    ]);
    const enabled = (btRes?.data?.businessTypes || btRes?.data?.types || [])
      .map((r) => r.business_type || r.businessType || r)
      .filter(Boolean);
    if (enabled.length) businessTypes.value = enabled;
    programs.value = Array.isArray(progRes?.data?.classes)
      ? progRes.data.classes
      : (Array.isArray(progRes?.data) ? progRes.data : []);
    tenantServices.value = Array.isArray(svcRes?.data?.services)
      ? svcRes.data.services
      : (Array.isArray(svcRes?.data) ? svcRes.data : []);
  } catch {
    /* keep defaults */
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const aid = agencyId();
    if (!aid) {
      error.value = 'No agency selected';
      return;
    }
    const params = {
      includeInactive: includeInactive.value ? 'true' : 'false'
    };
    if (filterBusinessType.value) params.businessType = filterBusinessType.value;
    if (filterScope.value === 'tenant') params.learningProgramClassId = 'null';
    else if (filterProgramId.value && filterScope.value === 'program') {
      params.learningProgramClassId = filterProgramId.value;
    }
    packages.value = await unifiedPackages.listPackages(aid, params);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load packages';
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  editingId.value = null;
  form.value = blankForm();
  if (businessTypes.value.length) form.value.businessType = businessTypes.value[0];
  if (filterProgramId.value) {
    form.value.scope = 'program';
    form.value.learningProgramClassId = filterProgramId.value;
  }
  formOpen.value = true;
  saveError.value = '';
}

function toggleService(id, checked) {
  const sid = Number(id);
  const set = new Set(form.value.allowedTenantServiceIds || []);
  if (checked) set.add(sid);
  else set.delete(sid);
  form.value.allowedTenantServiceIds = [...set];
}

function edit(pkg) {
  editingId.value = pkg.id;
  form.value = {
    name: pkg.name,
    description: pkg.description || '',
    businessType: pkg.businessType,
    packageType: pkg.packageType || 'prepaid_bundle',
    scope: pkg.learningProgramClassId ? 'program' : 'tenant',
    learningProgramClassId: pkg.learningProgramClassId ? String(pkg.learningProgramClassId) : '',
    sessionCount: pkg.sessionCount,
    priceDollars: (pkg.priceCents || 0) / 100,
    consumeOn: pkg.consumeOn || 'reserve',
    deliveryMode: pkg.domainConfig?.deliveryMode || '1:1',
    billingMode: (pkg.billingOptions?.modes || ['pay_in_full'])[0] || 'pay_in_full',
    cancelHours: pkg.policies?.cancellationNoticeHours ?? 24,
    expirationDays: pkg.policies?.expirationDays ?? null,
    latePolicy: pkg.policies?.lateCancelPolicy || 'forfeit',
    isPublic: !!pkg.isPublic,
    autoEnrollSubject: pkg.domainConfig?.autoEnrollSubject !== false,
    isActive: !!pkg.isActive,
    allowedTenantServiceIds: Array.isArray(pkg.allowedTenantServiceIds)
      ? pkg.allowedTenantServiceIds.map((n) => Number(n)).filter((n) => n > 0)
      : []
  };
  formOpen.value = true;
  saveError.value = '';
}

async function duplicate(pkg) {
  try {
    const aid = agencyId();
    await unifiedPackages.duplicatePackage(aid, pkg.id, {
      learningProgramClassId: pkg.learningProgramClassId
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Duplicate failed';
  }
}

function buildPayload() {
  const f = form.value;
  const allowed = (f.allowedTenantServiceIds || []).map((n) => Number(n)).filter((n) => n > 0);
  return {
    name: f.name,
    description: f.description || null,
    businessType: f.businessType,
    packageType: f.packageType,
    learningProgramClassId: f.scope === 'program' && f.learningProgramClassId
      ? Number(f.learningProgramClassId)
      : null,
    sessionCount: f.sessionCount,
    priceCents: Math.round(Number(f.priceDollars || 0) * 100),
    consumeOn: f.consumeOn,
    isPublic: !!f.isPublic,
    isActive: !!f.isActive,
    allowedTenantServiceIds: allowed.length ? allowed : null,
    billingOptions: {
      modes: [f.billingMode || 'pay_in_full'],
      installments: null,
      subscriptionInterval: null
    },
    policies: {
      cancellationNoticeHours: Number(f.cancelHours) || 24,
      lateCancelPolicy: f.latePolicy,
      noShowPolicy: f.latePolicy,
      expirationDays: f.expirationDays ? Number(f.expirationDays) : null,
      rolloverAllowed: false
    },
    domainConfig: {
      sessionMinutes: 60,
      deliveryMode: f.deliveryMode,
      autoEnrollSubject: !!f.autoEnrollSubject,
      engagementType: f.businessType === 'coaching' ? 'coaching' : undefined
    }
  };
}

async function save() {
  saving.value = true;
  saveError.value = '';
  try {
    if (form.value.scope === 'program' && !form.value.learningProgramClassId) {
      saveError.value = 'Select a program for program-scoped packages';
      return;
    }
    if (form.value.isPublic && !(form.value.allowedTenantServiceIds || []).length) {
      saveError.value = 'Public packages must be attached to at least one service (so public pages can show Service → Packages).';
      return;
    }
    const aid = agencyId();
    const payload = buildPayload();
    if (editingId.value) {
      await unifiedPackages.updatePackage(aid, editingId.value, payload);
    } else {
      await unifiedPackages.createPackage(aid, payload);
    }
    formOpen.value = false;
    await load();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const qProgram = route.query.programId;
  if (qProgram) {
    filterScope.value = 'program';
    filterProgramId.value = String(qProgram);
  }
  await loadMeta();
  await load();
});
</script>

<style scoped>
.pkg-admin { padding: 1.25rem 1rem 2rem; max-width: 960px; }
.page-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
.subtitle { color: #64748b; margin: 0.25rem 0 0; max-width: 40rem; }
.filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; margin-bottom: 1rem; }
.filters label, .modal-card label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
.filters select, .modal-card input, .modal-card select, .modal-card textarea {
  border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.4rem 0.5rem; font: inherit;
}
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem; }
.pkg-card.inactive { opacity: 0.65; }
.pkg-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
.pkg-actions { display: flex; gap: 0.4rem; }
.meta, .muted, .desc { color: #64748b; margin: 0.2rem 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.chips span { background: #f1f5f9; border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.75rem; }
.preview, .preview-box { margin-top: 0.6rem; padding: 0.55rem 0.7rem; background: #f8fafc; border-radius: 8px; font-size: 0.85rem; }
.err { color: #b91c1c; }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 80; padding: 1rem;
}
.modal-card {
  background: #fff; border-radius: 12px; max-width: 560px; width: 100%;
  max-height: 90vh; overflow: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.65rem;
}
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
.toggles { display: flex; flex-direction: column; gap: 0.35rem; }
.toggles label, .toggle { flex-direction: row !important; align-items: center; gap: 0.4rem !important; }
.svc-fieldset {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;
}
.svc-fieldset legend { font-size: 0.85rem; font-weight: 600; padding: 0 0.25rem; }
.svc-check { flex-direction: row !important; align-items: center; gap: 0.4rem !important; }
.chip { font-size: 0.7rem; background: #ecfdf5; color: #047857; border-radius: 999px; padding: 0.05rem 0.4rem; }
.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
.btn { border: none; border-radius: 8px; padding: 0.45rem 0.85rem; cursor: pointer; font: inherit; }
.btn-primary { background: #0f766e; color: #fff; }
.btn-secondary { background: #e2e8f0; color: #0f172a; }
.btn-sm { padding: 0.3rem 0.55rem; font-size: 0.8rem; }
@media (max-width: 640px) {
  .page-header { flex-direction: column; }
  .row2 { grid-template-columns: 1fr; }
}
</style>
