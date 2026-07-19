<template>
  <div class="mb-page">
    <header class="mb-header">
      <h1>Medical Billing</h1>
      <p class="muted">
        Chart, signing, claims, and Claim.MD — only available when Medical Billing flags are enabled for this organization.
      </p>
    </header>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="!flags.medicalBillingEnabled" class="mb-card">
      <p>
        Medical Billing is <strong>off</strong> for this organization. Enable it under Company Profile → feature toggles
        (platform must expose the Medical Billing features first).
      </p>
    </div>
    <template v-else>
      <section class="mb-card">
        <h2>Status</h2>
        <p>
          Medical Billing is <strong>on</strong>.
          Claim.MD:
          <span v-if="claimMd.configured">credentials configured</span>
          <span v-else>credentials not configured yet</span>
        </p>
      </section>

      <section class="mb-card">
        <h2>Client chart</h2>
        <div class="mb-row">
          <input v-model.number="chartClientId" class="mb-input" type="number" placeholder="Client ID" />
          <button type="button" class="mb-btn" @click="loadChart">Load chart</button>
        </div>
        <div v-if="chart" class="mb-chart">
          <p><strong>Notes:</strong> {{ chart.notes?.length || 0 }} · <strong>Plans:</strong> {{ chart.plans?.length || 0 }} · <strong>Diagnoses:</strong> {{ chart.diagnoses?.length || 0 }} · <strong>Encounters:</strong> {{ chart.sessions?.length || 0 }}</p>
          <ul class="mb-list">
            <li v-for="n in (chart.notes || []).slice(0, 8)" :key="'n'+n.id">
              Note #{{ n.id }} {{ n.title }}
              <span v-if="n.provider_signed_at"> · signed</span>
              <span v-if="n.supervisor_cosigned_at"> · cosigned</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="mb-card">
        <h2>Notes awaiting cosign</h2>
        <button type="button" class="mb-btn" :disabled="signingLoading" @click="loadSigningNotes">Refresh</button>
        <ul v-if="signingNotes.length" class="mb-list">
          <li v-for="n in signingNotes" :key="n.id">
            #{{ n.id }} — {{ n.title }}
            <button type="button" class="mb-btn mb-btn--small" @click="cosignNote(n.id)">Cosign</button>
          </li>
        </ul>
        <p v-else class="muted">No notes waiting for cosign.</p>
      </section>

      <section class="mb-card">
        <h2>Service codes</h2>
        <p class="muted">
          Add codes missing from the catalog. Configure single-unit vs multi-unit, minutes per unit,
          Medicaid 8-minute bands, min/max time, and an overflow code when duration is too long.
        </p>
        <div class="mb-form-grid">
          <input v-model="svcForm.serviceCode" class="mb-input" placeholder="Code (e.g. 90837)" />
          <input v-model="svcForm.description" class="mb-input mb-input--wide" placeholder="Description" />
          <select v-model="svcForm.unitCalcMode" class="mb-input">
            <option value="SINGLE">Single unit (1 per encounter)</option>
            <option value="MEDICAID_8_MINUTE_LADDER">Medicaid 8-minute ladder (15-min units)</option>
            <option value="FIXED_BLOCK">Fixed block (floor minutes ÷ unit)</option>
            <option value="CUSTOM_BANDS">Custom bands (use ladder JSON)</option>
            <option value="NONE">None / not unitized</option>
          </select>
          <input v-model.number="svcForm.unitMinutes" class="mb-input" type="number" placeholder="Min per unit" />
          <input v-model.number="svcForm.minMinutes" class="mb-input" type="number" placeholder="Min time" />
          <input v-model.number="svcForm.maxMinutes" class="mb-input" type="number" placeholder="Max time" />
          <input v-model.number="svcForm.maxUnitsPerSession" class="mb-input" type="number" placeholder="Max units/session" />
          <input v-model.number="svcForm.maxUnitsPerDay" class="mb-input" type="number" placeholder="Max units/day" />
          <input v-model="svcForm.overflowServiceCode" class="mb-input" placeholder="Overflow code" />
          <input v-model.number="svcForm.overflowAtMinutes" class="mb-input" type="number" placeholder="Overflow at (min)" />
          <input v-model="svcForm.defaultPlaceOfService" class="mb-input" placeholder="Default POS" maxlength="2" />
          <label class="mb-check"><input v-model="svcForm.tierQbha" type="checkbox" /> QBHA</label>
          <label class="mb-check"><input v-model="svcForm.tierBachelors" type="checkbox" /> Bachelor’s+</label>
          <label class="mb-check"><input v-model="svcForm.tierInternPlus" type="checkbox" /> Licensed / pre-licensed</label>
          <button type="button" class="mb-btn" :disabled="svcSaving" @click="saveServiceCode">Save code</button>
        </div>
        <div class="mb-row" style="margin-top: 0.75rem;">
          <input v-model.number="previewMinutes" class="mb-input" type="number" placeholder="Preview minutes" />
          <button type="button" class="mb-btn mb-btn--small" @click="previewUnits">Preview units</button>
          <span v-if="previewResult" class="muted">{{ previewResult }}</span>
        </div>
        <ul class="mb-list">
          <li v-for="c in serviceCodes" :key="c.id">
            <strong>{{ c.service_code }}</strong>
            <span class="muted">{{ c.description || '' }}</span>
            <span>{{ c.unit_calc_mode }}</span>
            <span v-if="c.min_minutes != null">min {{ c.min_minutes }}m</span>
            <span v-if="c.max_minutes != null">max {{ c.max_minutes }}m</span>
            <span v-if="c.overflow_service_code">→ {{ c.overflow_service_code }}</span>
            <button type="button" class="mb-btn mb-btn--small" @click="editServiceCode(c)">Edit</button>
          </li>
        </ul>
        <p v-if="!serviceCodes.length" class="muted">No agency medical service codes yet.</p>
      </section>

      <section class="mb-card">
        <h2>Service locations</h2>
        <p class="muted">
          Where care happened (tracked on the note). Claims bill under the linked office address;
          locations do not need to be credentialed facilities.
        </p>
        <div class="mb-form-grid">
          <input v-model="locForm.name" class="mb-input mb-input--wide" placeholder="Location name" />
          <input v-model="locForm.placeOfService" class="mb-input" placeholder="POS (11, 02, 12…)" maxlength="2" />
          <select v-model.number="locForm.billingOfficeLocationId" class="mb-input mb-input--wide">
            <option :value="0">Billing office (optional)</option>
            <option v-for="o in billingOffices" :key="o.id" :value="o.id">{{ o.name || `Office #${o.id}` }}</option>
          </select>
          <input v-model="locForm.streetAddress" class="mb-input mb-input--wide" placeholder="Street (optional)" />
          <input v-model="locForm.city" class="mb-input" placeholder="City" />
          <input v-model="locForm.state" class="mb-input" placeholder="State" />
          <input v-model="locForm.postalCode" class="mb-input" placeholder="ZIP" />
          <label class="mb-check">
            <input v-model="locForm.requiresCredentialing" type="checkbox" />
            Requires credentialing
          </label>
          <button type="button" class="mb-btn" :disabled="locSaving" @click="saveServiceLocation">Add location</button>
        </div>
        <ul class="mb-list">
          <li v-for="l in serviceLocations" :key="l.id">
            <strong>{{ l.name }}</strong>
            <span>POS {{ l.place_of_service }}</span>
            <span v-if="l.billing_office_name" class="muted">bills under {{ l.billing_office_name }}</span>
            <span v-else class="muted">no billing office linked</span>
          </li>
        </ul>
        <p v-if="!serviceLocations.length" class="muted">No service locations yet.</p>
      </section>

      <section class="mb-card">
        <h2>Claims queue</h2>
        <button type="button" class="mb-btn" :disabled="claimsLoading" @click="loadClaims">Refresh claims</button>
        <ul v-if="claims.length" class="mb-list">
          <li v-for="c in claims" :key="c.id">
            #{{ c.id }}
            {{ c.claim_lifecycle || c.claim_status }}
            — {{ formatCents(c.amount_cents) }}
            <span v-if="c.claimmd_claim_id"> · Claim.MD {{ c.claimmd_claim_id }}</span>
            <button
              v-if="claimMd.configured"
              type="button"
              class="mb-btn mb-btn--small"
              @click="submitClaim(c.id)"
            >Submit to Claim.MD</button>
          </li>
        </ul>
        <p v-else class="muted">No claims yet. Create from a signed encounter via API / Note Aid chart flow.</p>

        <h3 style="margin-top: 1.25rem;">Fee schedule</h3>
        <div class="mb-row">
          <input v-model="feeCode" class="mb-input" placeholder="Procedure code" />
          <input v-model.number="feeCents" class="mb-input" type="number" placeholder="Unit price (cents)" />
          <button type="button" class="mb-btn" @click="addFeeItem">Add</button>
        </div>
        <ul class="mb-list">
          <li v-for="f in feeItems" :key="f.id">{{ f.procedure_code }} — {{ formatCents(f.unit_price_cents) }}</li>
        </ul>
      </section>

      <section class="mb-card">
        <h2>Claim.MD credentials</h2>
        <p class="muted">AccountKey is encrypted at rest. BAA required before production use.</p>
        <div class="mb-row">
          <input v-model="accountId" class="mb-input" placeholder="Account ID (optional)" />
          <input v-model="accountKey" class="mb-input" type="password" placeholder="AccountKey" />
          <button type="button" class="mb-btn" @click="saveCredentials">Save</button>
        </div>
        <div class="mb-row" style="margin-top: 0.75rem;">
          <button type="button" class="mb-btn" @click="refreshResponses">Pull responses</button>
          <button type="button" class="mb-btn" @click="loadEras">List ERAs</button>
        </div>
        <pre v-if="claimMdLog" class="mb-log">{{ claimMdLog }}</pre>
      </section>
    </template>
    <p v-if="error" class="mb-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));

const loading = ref(true);
const error = ref('');
const flags = ref({
  medicalBillingEnabled: false,
  clinicalChartEnabled: false,
  clinicalNoteSigningEnabled: false,
  medicalClaimsEnabled: false,
  claimMdEnabled: false
});
const claimMd = ref({ configured: false });
const signingNotes = ref([]);
const signingLoading = ref(false);
const claims = ref([]);
const claimsLoading = ref(false);
const feeItems = ref([]);
const feeCode = ref('');
const feeCents = ref(0);
const accountId = ref('');
const accountKey = ref('');
const claimMdLog = ref('');
const chartClientId = ref(null);
const chart = ref(null);
const serviceCodes = ref([]);
const serviceLocations = ref([]);
const billingOffices = ref([]);
const svcSaving = ref(false);
const locSaving = ref(false);
const previewMinutes = ref(53);
const previewResult = ref('');
const svcForm = ref({
  serviceCode: '',
  description: '',
  unitCalcMode: 'SINGLE',
  unitMinutes: 15,
  minMinutes: null,
  maxMinutes: null,
  maxUnitsPerSession: null,
  maxUnitsPerDay: null,
  overflowServiceCode: '',
  overflowAtMinutes: null,
  defaultPlaceOfService: '',
  tierQbha: true,
  tierBachelors: true,
  tierInternPlus: true
});

const tiersFromForm = () => {
  const tiers = [];
  if (svcForm.value.tierQbha) tiers.push('qbha');
  if (svcForm.value.tierBachelors) tiers.push('bachelors');
  if (svcForm.value.tierInternPlus) tiers.push('intern_plus');
  return tiers.length ? tiers : null;
};

const applyTiersToForm = (raw) => {
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = null; }
  }
  if (!Array.isArray(arr) || !arr.length) {
    svcForm.value.tierQbha = true;
    svcForm.value.tierBachelors = true;
    svcForm.value.tierInternPlus = true;
    return;
  }
  const set = new Set(arr.map((t) => String(t).toLowerCase()));
  svcForm.value.tierQbha = set.has('qbha');
  svcForm.value.tierBachelors = set.has('bachelors');
  svcForm.value.tierInternPlus = set.has('intern_plus');
};
const locForm = ref({
  name: '',
  placeOfService: '11',
  billingOfficeLocationId: 0,
  streetAddress: '',
  city: '',
  state: '',
  postalCode: '',
  requiresCredentialing: false
});

const formatCents = (c) => `$${((Number(c) || 0) / 100).toFixed(2)}`;

const loadServiceCodes = async () => {
  if (!agencyId.value || !flags.value.medicalBillingEnabled) return;
  try {
    const res = await api.get('/medical-billing/service-codes', {
      params: { agencyId: agencyId.value, includeInactive: '0' }
    });
    serviceCodes.value = res?.data?.items || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load service codes';
  }
};

const loadServiceLocations = async () => {
  if (!agencyId.value || !flags.value.medicalBillingEnabled) return;
  try {
    const res = await api.get('/medical-billing/service-locations', {
      params: { agencyId: agencyId.value }
    });
    serviceLocations.value = res?.data?.items || [];
    billingOffices.value = res?.data?.billingOffices || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load service locations';
  }
};

const editServiceCode = (row) => {
  svcForm.value = {
    serviceCode: row.service_code || '',
    description: row.description || '',
    unitCalcMode: row.unit_calc_mode || 'SINGLE',
    unitMinutes: row.unit_minutes ?? 15,
    minMinutes: row.min_minutes,
    maxMinutes: row.max_minutes,
    maxUnitsPerSession: row.max_units_per_session,
    maxUnitsPerDay: row.max_units_per_day,
    overflowServiceCode: row.overflow_service_code || '',
    overflowAtMinutes: row.overflow_at_minutes,
    defaultPlaceOfService: row.default_place_of_service || '',
    tierQbha: true,
    tierBachelors: true,
    tierInternPlus: true
  };
  applyTiersToForm(row.allowed_credential_tiers_json);
};

const saveServiceCode = async () => {
  if (!agencyId.value || !svcForm.value.serviceCode) return;
  svcSaving.value = true;
  error.value = '';
  try {
    await api.post('/medical-billing/service-codes', {
      agencyId: agencyId.value,
      serviceCode: svcForm.value.serviceCode,
      description: svcForm.value.description,
      unitCalcMode: svcForm.value.unitCalcMode,
      unitMinutes: svcForm.value.unitMinutes,
      minMinutes: svcForm.value.minMinutes,
      maxMinutes: svcForm.value.maxMinutes,
      maxUnitsPerSession: svcForm.value.maxUnitsPerSession,
      maxUnitsPerDay: svcForm.value.maxUnitsPerDay,
      overflowServiceCode: svcForm.value.overflowServiceCode || null,
      overflowAtMinutes: svcForm.value.overflowAtMinutes,
      defaultPlaceOfService: svcForm.value.defaultPlaceOfService || null,
      allowedCredentialTiers: tiersFromForm()
    });
    await loadServiceCodes();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save service code';
  } finally {
    svcSaving.value = false;
  }
};

const previewUnits = async () => {
  if (!agencyId.value || !svcForm.value.serviceCode) {
    previewResult.value = 'Enter a service code first.';
    return;
  }
  try {
    const res = await api.post('/medical-billing/service-codes/preview-units', {
      agencyId: agencyId.value,
      serviceCode: svcForm.value.serviceCode,
      minutes: Number(previewMinutes.value || 0)
    });
    const d = res?.data || {};
    if (d.claimable === false) {
      previewResult.value = d.reason || 'Not claimable';
      return;
    }
    previewResult.value = [
      `${d.units} unit(s)`,
      d.effectiveServiceCode && d.effectiveServiceCode !== svcForm.value.serviceCode
        ? `as ${d.effectiveServiceCode}`
        : null,
      d.overflowApplied ? 'overflow' : null
    ].filter(Boolean).join(' · ');
  } catch (e) {
    previewResult.value = e.response?.data?.error?.message || 'Preview failed';
  }
};

const saveServiceLocation = async () => {
  if (!agencyId.value || !locForm.value.name || !locForm.value.placeOfService) return;
  locSaving.value = true;
  error.value = '';
  try {
    await api.post('/medical-billing/service-locations', {
      agencyId: agencyId.value,
      name: locForm.value.name,
      placeOfService: locForm.value.placeOfService,
      billingOfficeLocationId: Number(locForm.value.billingOfficeLocationId || 0) || null,
      streetAddress: locForm.value.streetAddress || null,
      city: locForm.value.city || null,
      state: locForm.value.state || null,
      postalCode: locForm.value.postalCode || null,
      requiresCredentialing: !!locForm.value.requiresCredentialing
    });
    locForm.value = {
      name: '',
      placeOfService: '11',
      billingOfficeLocationId: 0,
      streetAddress: '',
      city: '',
      state: '',
      postalCode: '',
      requiresCredentialing: false
    };
    await loadServiceLocations();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save location';
  } finally {
    locSaving.value = false;
  }
};

const loadChart = async () => {
  if (!agencyId.value || !chartClientId.value) return;
  try {
    const res = await api.get(`/medical-billing/clients/${chartClientId.value}/chart`, {
      params: { agencyId: agencyId.value }
    });
    chart.value = res?.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load chart';
  }
};

const loadStatus = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/medical-billing/status', { params: { agencyId: agencyId.value } });
    flags.value = res?.data?.flags || flags.value;
    claimMd.value = res?.data?.claimMd || { configured: false };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load status';
  } finally {
    loading.value = false;
  }
};

const loadSigningNotes = async () => {
  if (!agencyId.value || !flags.value.medicalBillingEnabled) return;
  signingLoading.value = true;
  try {
    const res = await api.get('/medical-billing/notes/signing', {
      params: { agencyId: agencyId.value, mode: 'cosign' }
    });
    signingNotes.value = res?.data?.notes || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load signing notes';
  } finally {
    signingLoading.value = false;
  }
};

const cosignNote = async (noteId) => {
  try {
    await api.post(`/medical-billing/notes/${noteId}/cosign`, { agencyId: agencyId.value });
    await loadSigningNotes();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Cosign failed';
  }
};

const loadClaims = async () => {
  if (!agencyId.value || !flags.value.medicalBillingEnabled) return;
  claimsLoading.value = true;
  try {
    const res = await api.get('/medical-billing/claims', { params: { agencyId: agencyId.value } });
    claims.value = res?.data?.claims || [];
    const fee = await api.get('/medical-billing/fee-schedule', { params: { agencyId: agencyId.value } });
    feeItems.value = fee?.data?.items || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load claims';
  } finally {
    claimsLoading.value = false;
  }
};

const addFeeItem = async () => {
  try {
    await api.post('/medical-billing/fee-schedule', {
      agencyId: agencyId.value,
      procedureCode: feeCode.value,
      unitPriceCents: feeCents.value
    });
    feeCode.value = '';
    feeCents.value = 0;
    await loadClaims();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to add fee item';
  }
};

const saveCredentials = async () => {
  try {
    await api.post('/medical-billing/claimmd/credentials', {
      agencyId: agencyId.value,
      accountId: accountId.value || null,
      accountKey: accountKey.value
    });
    accountKey.value = '';
    await loadStatus();
    claimMdLog.value = 'Credentials saved.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save credentials';
  }
};

const submitClaim = async (claimId) => {
  try {
    const res = await api.post(`/medical-billing/claimmd/claims/${claimId}/submit`, {
      agencyId: agencyId.value
    });
    claimMdLog.value = JSON.stringify(res?.data, null, 2);
    await loadClaims();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Submit failed';
  }
};

const refreshResponses = async () => {
  try {
    const res = await api.get('/medical-billing/claimmd/responses', {
      params: { agencyId: agencyId.value, responseId: '0' }
    });
    claimMdLog.value = JSON.stringify(res?.data, null, 2);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Response pull failed';
  }
};

const loadEras = async () => {
  try {
    const res = await api.get('/medical-billing/claimmd/eras', { params: { agencyId: agencyId.value } });
    claimMdLog.value = JSON.stringify(res?.data, null, 2);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'ERA list failed';
  }
};

onMounted(async () => {
  await loadStatus();
  await Promise.all([loadSigningNotes(), loadClaims(), loadServiceCodes(), loadServiceLocations()]);
});
</script>

<style scoped>
.mb-page { max-width: 920px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
.mb-header h1 { margin: 0 0 0.35rem; font-size: 1.5rem; }
.muted { color: #5c6570; font-size: 0.92rem; }
.mb-card {
  background: #fff;
  border: 1px solid #e2e6ea;
  border-radius: 10px;
  padding: 1rem 1.1rem;
  margin-top: 1rem;
}
.mb-flags { margin: 0.5rem 0 0; padding-left: 1.2rem; }
.mb-list { list-style: none; padding: 0; margin: 0.75rem 0 0; }
.mb-list li {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  padding: 0.45rem 0; border-bottom: 1px solid #f0f2f4;
}
.mb-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.mb-form-grid {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.75rem;
}
.mb-input {
  border: 1px solid #cfd6dd; border-radius: 6px; padding: 0.4rem 0.55rem; min-width: 140px;
}
.mb-input--wide { min-width: 220px; flex: 1 1 220px; }
.mb-check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
.mb-btn {
  border: 1px solid #2f5d8c; background: #2f5d8c; color: #fff;
  border-radius: 6px; padding: 0.4rem 0.75rem; cursor: pointer;
}
.mb-btn--small { padding: 0.25rem 0.5rem; font-size: 0.85rem; }
.mb-log {
  margin-top: 0.75rem; background: #f6f8fa; padding: 0.75rem; border-radius: 6px;
  max-height: 280px; overflow: auto; font-size: 0.8rem;
}
.mb-error { color: #a12622; margin-top: 1rem; }
</style>
