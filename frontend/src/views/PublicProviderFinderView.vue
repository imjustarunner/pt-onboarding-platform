<template>
  <div class="finder-page">
    <header class="finder-header">
      <div>
        <h1>Find a Provider</h1>
        <p class="muted">Choose a provider and request a time for intake or current-client booking.</p>
      </div>
      <div class="header-controls">
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="shiftWeek(-7)">Previous week</button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="shiftWeek(7)">Next week</button>
      </div>
    </header>

    <section class="filters">
      <label class="field">
        <span>Booking type</span>
        <div class="tab-row">
          <button class="tab-btn" :class="{ active: bookingMode === 'NEW_CLIENT' }" type="button" @click="setMode('NEW_CLIENT')">
            New client intake
          </button>
          <button class="tab-btn" :class="{ active: bookingMode === 'CURRENT_CLIENT' }" type="button" @click="setMode('CURRENT_CLIENT')">
            I am a current client
          </button>
        </div>
      </label>

      <label class="field">
        <span>Program</span>
        <div class="tab-row">
          <button class="tab-btn" :class="{ active: programType === 'IN_PERSON' }" type="button" @click="setProgram('IN_PERSON')">
            In-Person Counseling
          </button>
          <button class="tab-btn" :class="{ active: programType === 'VIRTUAL' }" type="button" @click="setProgram('VIRTUAL')">
            Virtual Counseling
          </button>
        </div>
      </label>

      <label class="field">
        <span>Week starting</span>
        <input v-model="weekStart" type="date" @change="loadProviders" />
      </label>

      <label class="field">
        <span>Company scope</span>
        <div class="tab-row">
          <button class="tab-btn" :class="{ active: agencyScope === 'ALL' }" type="button" @click="setAgencyScope('ALL')">
            All affiliated companies
          </button>
          <button class="tab-btn" :class="{ active: agencyScope === 'SINGLE' }" type="button" @click="setAgencyScope('SINGLE')">
            One company
          </button>
        </div>
      </label>

      <label class="field">
        <span>Company</span>
        <select v-model="selectedScopeAgencyId" :disabled="agencyScope !== 'SINGLE' || scopeAgencies.length === 0" @change="loadProviders">
          <option value="">Select company</option>
          <option v-for="a in scopeAgencies" :key="`scope-${a.id}`" :value="Number(a.id)">
            {{ a.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>Search provider</span>
        <input v-model="search" type="text" placeholder="Type a name..." />
      </label>
    </section>

    <div v-if="introBlurb" class="intro-blurb">
      {{ introBlurb }}
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading provider availability...</div>
    <div v-else-if="filteredProviders.length === 0" class="empty">No providers available for this selection.</div>

    <section v-else class="provider-grid">
      <article v-for="provider in filteredProviders" :key="provider.providerId" class="provider-card">
        <header class="card-header">
          <button class="photo-btn" type="button" @click="openProviderInfo(provider)">
            <img v-if="provider.profilePhotoUrl" :src="provider.profilePhotoUrl" :alt="provider.displayName" class="avatar" />
            <div v-else class="avatar avatar-fallback">{{ initialsFor(provider.displayName) }}</div>
          </button>
          <div class="card-title-wrap">
            <h2>{{ provider.displayName }}</h2>
            <p class="muted">{{ provider.availability?.thisWeekCount || 0 }} opening(s) this week</p>
            <p class="meta-line">Next available: {{ formatDateTime(provider.availability?.nextAvailableAt) || 'No opening in lookahead window' }}</p>
            <p class="meta-line">Booked through: {{ provider.availability?.bookedThroughDate || 'Open this week' }}</p>
          </div>
        </header>

        <div class="slot-list">
          <button
            v-for="slot in (provider.availability?.slots || []).slice(0, 8)"
            :key="`${provider.providerId}-${slot.startAt}-${slot.endAt}`"
            class="slot-btn"
            :class="slot.programType === 'VIRTUAL' ? 'slot-virtual' : 'slot-office'"
            type="button"
            @click="openRequest(provider, slot)"
          >
            <div class="slot-time">{{ formatDateTime(slot.startAt) }} - {{ timeOnly(slot.endAt) }}</div>
            <div class="slot-meta">
              <span>{{ slot.programType === 'VIRTUAL' ? 'Virtual' : 'In person' }}</span>
              <span class="badge">Recurring {{ slot.recurrence?.frequency || 'WEEKLY' }}</span>
            </div>
            <div v-if="slot.buildingName || slot.roomLabel" class="slot-loc">
              {{ [slot.buildingName, slot.roomLabel].filter(Boolean).join(' • ') }}
            </div>
          </button>
        </div>
      </article>
    </section>

    <div v-if="showProviderInfo && providerInfo" class="modal-overlay" @click.self="closeProviderInfo">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ providerInfo.provider?.displayName }}</h3>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeProviderInfo">Close</button>
        </div>
        <div class="modal-body">
          <img v-if="providerInfo.provider?.profilePhotoUrl" :src="providerInfo.provider.profilePhotoUrl" :alt="providerInfo.provider.displayName" class="info-avatar" />
          <p v-if="providerInfo.profile?.publicBlurb">{{ providerInfo.profile.publicBlurb }}</p>
          <p v-else class="muted">Provider bio coming soon.</p>
          <div class="info-row">
            <strong>Self-pay:</strong>
            <span>{{ providerInfo.profile?.selfPayRateLabel || 'Contact office for rate' }}</span>
          </div>
          <div v-if="providerInfo.profile?.selfPayRateNote" class="info-row">
            <strong>Rate note:</strong>
            <span>{{ providerInfo.profile.selfPayRateNote }}</span>
          </div>
          <div class="info-row">
            <strong>Insurance accepted:</strong>
            <span>{{ insuranceLabel(providerInfo.profile?.insurancesAccepted) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showRequestModal && requestModal.provider && requestModal.slot" class="modal-overlay" @click.self="closeRequest">
      <div class="modal">
        <div class="modal-header">
          <h3>Request appointment</h3>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeRequest">Close</button>
        </div>
        <div class="modal-body">
          <p><strong>{{ requestModal.provider.displayName }}</strong></p>
          <p class="muted">{{ formatDateTime(requestModal.slot.startAt) }} - {{ timeOnly(requestModal.slot.endAt) }}</p>

          <div class="form-grid">
            <label class="field">
              <span>Your name</span>
              <input v-model="requestForm.name" type="text" />
            </label>
            <label class="field">
              <span>Your email</span>
              <input v-model="requestForm.email" type="email" />
            </label>
            <label class="field">
              <span>Your phone</span>
              <input v-model="requestForm.phone" type="tel" />
            </label>
            <label v-if="bookingMode === 'CURRENT_CLIENT'" class="field">
              <span>Client initials</span>
              <input v-model="requestForm.clientInitials" type="text" maxlength="32" placeholder="e.g. JDS" />
            </label>
          </div>

          <div v-if="bookingMode === 'NEW_CLIENT'" class="new-client-card">
            <h4>New client account setup</h4>
            <div class="form-grid">
              <label class="field">
                <span>Client full name</span>
                <input v-model="requestForm.clientFullName" type="text" />
              </label>
              <label class="field">
                <span>Guardian first name</span>
                <input v-model="requestForm.guardianFirstName" type="text" />
              </label>
              <label class="field">
                <span>Guardian last name</span>
                <input v-model="requestForm.guardianLastName" type="text" />
              </label>
              <label class="field">
                <span>Guardian email</span>
                <input v-model="requestForm.guardianEmail" type="email" />
              </label>
              <label class="field">
                <span>Guardian phone</span>
                <input v-model="requestForm.guardianPhone" type="tel" />
              </label>
              <label class="field">
                <span>Relationship</span>
                <input v-model="requestForm.guardianRelationship" type="text" placeholder="Parent, Guardian..." />
              </label>
            </div>
          </div>

          <label class="field">
            <span>Notes</span>
            <textarea v-model="requestForm.notes" rows="3" />
          </label>

          <div v-if="requestError" class="error" style="margin-top: 8px;">{{ requestError }}</div>
          <div v-if="requestSuccess" class="success">{{ requestSuccess }}</div>

          <div class="modal-actions">
            <button class="btn btn-primary" type="button" :disabled="requestSaving" @click="submitRequest">
              {{ requestSaving ? 'Submitting...' : 'Submit request' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const loading = ref(false);
const error = ref('');
const providers = ref([]);
const introBlurb = ref('');
const weekStart = ref(getWeekStartYmd(new Date()));
const bookingMode = ref('NEW_CLIENT');
const programType = ref('IN_PERSON');
const agencyScope = ref('ALL');
const scopeAgencies = ref([]);
const selectedScopeAgencyId = ref('');
const search = ref('');

const showProviderInfo = ref(false);
const providerInfo = ref(null);
const showRequestModal = ref(false);
const requestModal = ref({ provider: null, slot: null });
const requestSaving = ref(false);
const requestError = ref('');
const requestSuccess = ref('');
const requestForm = ref({
  name: '',
  email: '',
  phone: '',
  notes: '',
  clientInitials: '',
  clientFullName: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianEmail: '',
  guardianPhone: '',
  guardianRelationship: ''
});

const agencyId = computed(() => Number(route.params.agencyId || 0) || null);
const accessKey = computed(() => String(route.query.key || '').trim());
const filteredProviders = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  if (!q) return providers.value;
  return providers.value.filter((p) => String(p.displayName || '').toLowerCase().includes(q));
});

function getWeekStartYmd(dateLike) {
  const d = new Date(dateLike);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'PR';
}

function formatDateTime(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeOnly(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function insuranceLabel(list) {
  if (!Array.isArray(list) || !list.length) return 'Contact office for details';
  return list.map((x) => String(x?.label || x)).filter(Boolean).join(', ');
}

async function loadProviders() {
  if (!agencyId.value) {
    error.value = 'Invalid agency link.';
    providers.value = [];
    return;
  }
  if (!accessKey.value) {
    error.value = 'Missing access key. Please use the full invitation link.';
    providers.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/public/provider-availability/${agencyId.value}/providers`, {
      params: {
        key: accessKey.value,
        weekStart: weekStart.value,
        bookingMode: bookingMode.value,
        programType: programType.value,
        agencyScope: agencyScope.value,
        ...(agencyScope.value === 'SINGLE' && Number(selectedScopeAgencyId.value || 0) > 0
          ? { filterAgencyId: Number(selectedScopeAgencyId.value) }
          : {})
      },
      skipAuthRedirect: true
    });
    providers.value = Array.isArray(data?.providers) ? data.providers : [];
    introBlurb.value = String(data?.introBlurb || '').trim();
    scopeAgencies.value = Array.isArray(data?.scopeAgencies) ? data.scopeAgencies : [];
    if (agencyScope.value === 'SINGLE') {
      const selected = Number(selectedScopeAgencyId.value || 0);
      const valid = scopeAgencies.value.some((a) => Number(a.id) === selected);
      if (!valid) {
        selectedScopeAgencyId.value = scopeAgencies.value.length ? Number(scopeAgencies.value[0].id) : '';
      }
    } else {
      selectedScopeAgencyId.value = '';
    }
  } catch (e) {
    providers.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load providers.';
  } finally {
    loading.value = false;
  }
}

async function openProviderInfo(provider) {
  providerInfo.value = null;
  showProviderInfo.value = true;
  try {
    const { data } = await api.get(`/public/provider-availability/${agencyId.value}/providers/${provider.providerId}/profile`, {
      params: { key: accessKey.value },
      skipAuthRedirect: true
    });
    providerInfo.value = data || null;
  } catch (e) {
    providerInfo.value = {
      provider: { displayName: provider.displayName, profilePhotoUrl: provider.profilePhotoUrl || null },
      profile: { publicBlurb: '', insurancesAccepted: [], selfPayRateLabel: null, selfPayRateNote: null }
    };
  }
}

function closeProviderInfo() {
  showProviderInfo.value = false;
  providerInfo.value = null;
}

function openRequest(provider, slot) {
  requestError.value = '';
  requestSuccess.value = '';
  requestModal.value = { provider, slot };
  requestForm.value = {
    name: '',
    email: '',
    phone: '',
    notes: '',
    clientInitials: '',
    clientFullName: '',
    guardianFirstName: '',
    guardianLastName: '',
    guardianEmail: '',
    guardianPhone: '',
    guardianRelationship: ''
  };
  showRequestModal.value = true;
}

function closeRequest() {
  showRequestModal.value = false;
  requestModal.value = { provider: null, slot: null };
  requestSaving.value = false;
  requestError.value = '';
}

async function submitRequest() {
  const provider = requestModal.value.provider;
  const slot = requestModal.value.slot;
  if (!provider || !slot) return;
  requestSaving.value = true;
  requestError.value = '';
  requestSuccess.value = '';
  try {
    const payload = {
      providerId: provider.providerId,
      modality: programType.value === 'VIRTUAL' ? 'VIRTUAL' : 'IN_PERSON',
      bookingMode: bookingMode.value,
      programType: programType.value,
      startAt: slot.startAt,
      endAt: slot.endAt,
      name: requestForm.value.name,
      email: requestForm.value.email,
      phone: requestForm.value.phone || null,
      notes: requestForm.value.notes || null,
      clientInitials: requestForm.value.clientInitials || null,
      clientFullName: requestForm.value.clientFullName || null,
      guardianFirstName: requestForm.value.guardianFirstName || null,
      guardianLastName: requestForm.value.guardianLastName || null,
      guardianEmail: requestForm.value.guardianEmail || null,
      guardianPhone: requestForm.value.guardianPhone || null,
      guardianRelationship: requestForm.value.guardianRelationship || null
    };
    await api.post(`/public/provider-availability/${agencyId.value}/requests`, payload, {
      params: { key: accessKey.value },
      skipAuthRedirect: true
    });
    requestSuccess.value = 'Request submitted successfully. Our team will follow up shortly.';
    await loadProviders();
  } catch (e) {
    requestError.value = e?.response?.data?.error?.message || 'Failed to submit request.';
  } finally {
    requestSaving.value = false;
  }
}

async function setMode(mode) {
  bookingMode.value = mode;
  await loadProviders();
}

async function setProgram(program) {
  programType.value = program;
  await loadProviders();
}

async function setAgencyScope(scope) {
  agencyScope.value = scope === 'SINGLE' ? 'SINGLE' : 'ALL';
  if (agencyScope.value === 'ALL') selectedScopeAgencyId.value = '';
  await loadProviders();
}

async function shiftWeek(days) {
  weekStart.value = addDaysYmd(weekStart.value, days);
  await loadProviders();
}

onMounted(async () => {
  await loadProviders();
});
</script>

<style scoped>
.finder-page { max-width: 1180px; margin: 0 auto; padding: 18px; display: grid; gap: 14px; }
.finder-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.finder-header h1 { margin: 0; }
.muted { color: rgba(15, 23, 42, 0.68); }
.meta-line { margin: 2px 0; font-size: 12px; color: #334155; }
.header-controls { display: flex; gap: 8px; }
.filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #fff; }
.field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
.field input, .field textarea, .field select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
.tab-row { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-btn { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 12px; border-radius: 999px; font-size: 12px; cursor: pointer; }
.tab-btn.active { background: #dbeafe; border-color: #60a5fa; font-weight: 700; }
.intro-blurb { border: 1px solid #dbeafe; background: #eff6ff; border-radius: 12px; padding: 12px; white-space: pre-wrap; }
.error { background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; padding: 10px 12px; }
.success { background: #ecfdf3; border: 1px solid #86efac; color: #14532d; border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
.loading, .empty { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; background: #f8fafc; }
.provider-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.provider-card { border: 1px solid #dbeafe; border-radius: 14px; background: linear-gradient(180deg,#fff 0%,#f8fafc 100%); padding: 12px; display: grid; gap: 10px; }
.card-header { display: flex; gap: 10px; }
.card-title-wrap h2 { margin: 0 0 2px; font-size: 18px; }
.photo-btn { background: none; border: 0; padding: 0; cursor: pointer; }
.avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.avatar-fallback { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: #bfdbfe; color: #1e3a8a; font-weight: 700; }
.slot-list { display: grid; gap: 8px; }
.slot-btn { text-align: left; border-radius: 10px; border: 1px solid transparent; padding: 8px 10px; cursor: pointer; }
.slot-office { background: #dcfce7; border-color: #86efac; }
.slot-virtual { background: #ede9fe; border-color: #c4b5fd; }
.slot-time { font-weight: 700; font-size: 13px; }
.slot-meta { display: flex; gap: 8px; align-items: center; font-size: 12px; }
.slot-loc { font-size: 12px; margin-top: 2px; color: #334155; }
.badge { border: 1px solid rgba(15,23,42,.15); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(2,6,23,.5); display: grid; place-items: center; padding: 14px; z-index: 9000; }
.modal { width: min(760px, 100%); max-height: 90vh; overflow: auto; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; }
.modal-body { padding: 12px 14px; }
.info-avatar { width: 90px; height: 90px; border-radius: 12px; object-fit: cover; margin-bottom: 10px; }
.info-row { display: flex; gap: 8px; margin-top: 6px; font-size: 13px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.new-client-card { border: 1px solid #dbeafe; border-radius: 10px; background: #f8fbff; padding: 10px; margin-top: 10px; }
.new-client-card h4 { margin: 0 0 8px; }
.modal-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
@media (max-width: 900px) {
  .provider-grid { grid-template-columns: 1fr; }
  .filters { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
