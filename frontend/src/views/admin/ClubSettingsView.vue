<template>
  <div class="container">
    <div class="club-settings-header">
      <h1>Club Settings</h1>
      <p>Simple controls for your club brand and billing.</p>
    </div>

    <div v-if="loading" class="loading">Loading club settings...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="cards-grid">
      <section class="settings-card">
        <div class="card-header">
          <h2>Club Identity</h2>
          <p>Logo, icon, and colors used in your club portal.</p>
        </div>

        <div class="field">
          <label>Logo input method</label>
          <div class="mode-row">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'url' }"
              @click="logoInputMethod = 'url'"
            >
              URL
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'upload' }"
              @click="logoInputMethod = 'upload'"
            >
              Upload
            </button>
          </div>
        </div>

        <div v-if="logoInputMethod === 'url'" class="field">
          <label>Logo URL</label>
          <input v-model="form.logoUrl" type="url" placeholder="https://example.com/logo.png" />
        </div>

        <div v-else class="field">
          <label>Upload logo</label>
          <input
            ref="logoInputRef"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
            @change="onUploadLogo"
          />
          <div v-if="uploadingLogo" class="hint">Uploading logo...</div>
          <div class="hint">Recommended: square image, 256x256 or larger.</div>
        </div>

        <div v-if="resolvedLogoUrl" class="logo-preview">
          <img :src="resolvedLogoUrl" alt="Club logo preview" />
        </div>

        <div class="field">
          <label>Club main icon</label>
          <div class="icon-row">
            <IconSelector v-model="form.iconId" />
            <button
              v-if="form.iconId"
              type="button"
              class="btn btn-danger btn-sm"
              @click="form.iconId = null"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="colors-grid">
          <div class="field">
            <label>Primary color</label>
            <input v-model="form.primaryColor" type="color" class="color-picker" />
            <input v-model="form.primaryColor" type="text" placeholder="#0f172a" />
          </div>
          <div class="field">
            <label>Secondary color</label>
            <input v-model="form.secondaryColor" type="color" class="color-picker" />
            <input v-model="form.secondaryColor" type="text" placeholder="#1e40af" />
          </div>
        </div>

        <div class="actions-row">
          <button type="button" class="btn btn-primary" :disabled="savingIdentity" @click="saveIdentity">
            {{ savingIdentity ? 'Saving...' : 'Save Club Identity' }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Billing</h2>
          <p>Essential billing details for this club.</p>
        </div>

        <div v-if="billingError" class="error">{{ billingError }}</div>
        <div v-if="billingLoading" class="hint">Loading billing...</div>

        <div v-else>
          <div class="billing-summary">
            <div><strong>Client payments mode:</strong> {{ billingSettings.clientPaymentsMode || 'not_configured' }}</div>
            <div><strong>Invoice count:</strong> {{ invoices.length }}</div>
            <div><strong>Payment methods:</strong> {{ paymentMethods.length }}</div>
          </div>

          <div class="mini-list">
            <h3>Payment Methods</h3>
            <div v-if="paymentMethods.length === 0" class="hint">No payment methods on file.</div>
            <div v-for="m in paymentMethods.slice(0, 3)" :key="m.id" class="mini-row">
              <span>{{ m.brand || 'Card' }} •••• {{ m.last4 || '----' }}</span>
              <button
                v-if="!m.isDefault"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="setDefaultPaymentMethod(m.id)"
              >
                Set Default
              </button>
              <span v-else class="pill">Default</span>
            </div>
          </div>

          <div class="mini-list">
            <h3>Recent Invoices</h3>
            <div v-if="invoices.length === 0" class="hint">No invoices yet.</div>
            <div v-for="inv in invoices.slice(0, 5)" :key="inv.id" class="mini-row">
              <span>#{{ inv.id }} - {{ formatCurrency(inv.totalCents) }}</span>
              <button type="button" class="btn btn-secondary btn-sm" @click="downloadInvoice(inv.id)">
                PDF
              </button>
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-secondary" :disabled="billingLoading" @click="loadBilling">
              Refresh Billing
            </button>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Club Records</h2>
          <p>Seed starting records. New record-breakers must be verified by a manager from workout submissions.</p>
        </div>
        <div v-if="recordsError" class="error">{{ recordsError }}</div>
        <div class="records-list">
          <div v-if="clubRecords.length === 0" class="hint">No records yet. Add your first all-time record.</div>
          <div v-for="(record, idx) in clubRecords" :key="record.id || `record-${idx}`" class="record-row">
            <input v-model="record.label" type="text" placeholder="Label (e.g., Longest Trail Run)" />
            <input v-model.number="record.value" type="number" step="0.01" placeholder="Seed value (e.g., 42.6)" />
            <input v-model="record.unit" type="text" placeholder="Unit (e.g., miles)" />
            <select v-model="record.metricKey">
              <option value="">Metric source</option>
              <option value="distance_miles">Distance (miles)</option>
              <option value="duration_minutes">Duration (minutes)</option>
              <option value="points">Points</option>
            </select>
            <input v-model="record.notes" type="text" placeholder="Notes (optional)" />
            <button type="button" class="btn btn-danger btn-sm" @click="removeRecord(idx)">Remove</button>
          </div>
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-secondary" @click="addRecord">Add Record</button>
          <button type="button" class="btn btn-primary" :disabled="savingRecords" @click="saveRecords">
            {{ savingRecords ? 'Saving...' : 'Save Club Records' }}
          </button>
        </div>
        <div class="hint" style="margin-top: 10px;">
          Record values are not manually broken. When a workout exceeds a tracked metric, a verification request appears below.
        </div>
        <div class="mini-list" style="margin-top: 12px;">
          <h3>Pending Record Verifications</h3>
          <div v-if="verificationsLoading" class="hint">Loading verification requests...</div>
          <div v-else-if="recordVerifications.length === 0" class="hint">No pending verification requests.</div>
          <div v-for="v in recordVerifications" :key="`verification-${v.id}`" class="mini-row">
            <span>
              <strong>{{ v.record_label }}</strong>:
              {{ Number(v.current_value).toFixed(2) }} -> {{ Number(v.candidate_value).toFixed(2) }}
              by {{ `${v.first_name || ''} ${v.last_name || ''}`.trim() || `User ${v.challenger_user_id}` }}
            </span>
            <div class="actions-row">
              <button type="button" class="btn btn-primary btn-sm" @click="reviewVerification(v.id, 'approved')">Approve</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="reviewVerification(v.id, 'rejected')">Reject</button>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Coming Soon</h2>
          <p>Additional lightweight club controls can be added here over time.</p>
        </div>
        <div class="hint">This intentionally stays small and focused for SSC club admins.</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useSummitStatsChallengeChrome } from '../../composables/useSummitStatsChallengeChrome';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import IconSelector from '../../components/admin/IconSelector.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const isSsc = useSummitStatsChallengeChrome();

const loading = ref(true);
const error = ref('');
const savingIdentity = ref(false);
const uploadingLogo = ref(false);
const logoInputRef = ref(null);
const logoInputMethod = ref('url');

const billingLoading = ref(false);
const billingError = ref('');
const billingSettings = ref({});
const paymentMethods = ref([]);
const invoices = ref([]);
const clubRecords = ref([]);
const recordsError = ref('');
const savingRecords = ref(false);
const recordVerifications = ref([]);
const verificationsLoading = ref(false);

const form = ref({
  logoUrl: '',
  logoPath: '',
  iconId: null,
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316'
});

const currentAgency = computed(() => agencyStore.currentAgency?.value || agencyStore.currentAgency || null);
const currentAgencyId = computed(() => Number(currentAgency.value?.id || 0) || null);

const normalizedHex = (raw, fallback) => {
  const src = String(raw || '').trim();
  if (!src) return fallback;
  const prefixed = src.startsWith('#') ? src : `#${src}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(prefixed)) return prefixed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(prefixed)) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toUpperCase();
  }
  return fallback;
};

const resolvedLogoUrl = computed(() => {
  if (logoInputMethod.value === 'upload' && form.value.logoPath) return toUploadsUrl(form.value.logoPath);
  return String(form.value.logoUrl || '').trim() || null;
});

const orgTo = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

const hydrateIdentity = async () => {
  if (!currentAgencyId.value) return;
  const { data } = await api.get(`/agencies/${currentAgencyId.value}`);
  const palette = data?.color_palette
    ? (typeof data.color_palette === 'string' ? JSON.parse(data.color_palette) : data.color_palette)
    : {};
  form.value = {
    logoUrl: data?.logo_url || '',
    logoPath: data?.logo_path || '',
    iconId: data?.icon_id ?? null,
    primaryColor: palette?.primary || '#0f172a',
    secondaryColor: palette?.secondary || '#1e40af',
    accentColor: palette?.accent || '#f97316'
  };
  logoInputMethod.value = form.value.logoPath ? 'upload' : 'url';
};

const saveIdentity = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingIdentity.value = true;
    error.value = '';
    const payload = {
      logoUrl: logoInputMethod.value === 'url' ? (form.value.logoUrl?.trim() || null) : null,
      logoPath: logoInputMethod.value === 'upload' ? (form.value.logoPath || null) : null,
      iconId: form.value.iconId ?? null,
      colorPalette: {
        primary: normalizedHex(form.value.primaryColor, '#0F172A'),
        secondary: normalizedHex(form.value.secondaryColor, '#1E40AF'),
        accent: normalizedHex(form.value.accentColor, '#F97316')
      }
    };
    await api.put(`/agencies/${currentAgencyId.value}`, payload);
    await hydrateIdentity();
    await agencyStore.fetchUserAgencies();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save club identity';
  } finally {
    savingIdentity.value = false;
  }
};

const onUploadLogo = async (event) => {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP.';
    return;
  }
  try {
    uploadingLogo.value = true;
    error.value = '';
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await api.post('/logos/upload', formData);
    if (data?.success && data?.path) {
      form.value.logoPath = data.path;
      form.value.logoUrl = '';
      logoInputMethod.value = 'upload';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to upload logo';
  } finally {
    uploadingLogo.value = false;
    try {
      if (logoInputRef.value) logoInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const loadBilling = async () => {
  if (!currentAgencyId.value) return;
  try {
    billingLoading.value = true;
    billingError.value = '';
    const [settingsRes, methodsRes, invoicesRes] = await Promise.all([
      api.get(`/billing/${currentAgencyId.value}/settings`),
      api.get(`/billing/${currentAgencyId.value}/payment-methods`),
      api.get(`/billing/${currentAgencyId.value}/invoices`)
    ]);
    billingSettings.value = settingsRes?.data || {};
    paymentMethods.value = Array.isArray(methodsRes?.data) ? methodsRes.data : [];
    invoices.value = Array.isArray(invoicesRes?.data) ? invoicesRes.data : [];
  } catch (e) {
    billingError.value = e?.response?.data?.error?.message || 'Failed to load billing';
  } finally {
    billingLoading.value = false;
  }
};

const loadClubRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    recordsError.value = '';
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records`);
    clubRecords.value = Array.isArray(data?.records)
      ? data.records.map((r, idx) => ({
        id: r.id || `record-${Date.now()}-${idx}`,
        label: r.label || '',
        value: r.value ?? null,
        unit: r.unit || '',
        notes: r.notes || '',
        metricKey: r.metricKey || ''
      }))
      : [];
  } catch (e) {
    clubRecords.value = [];
    recordsError.value = e?.response?.data?.error?.message || 'Failed to load club records';
  }
};

const addRecord = () => {
  clubRecords.value.push({
    id: `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    value: '',
    unit: '',
    notes: '',
    metricKey: ''
  });
};

const removeRecord = (idx) => {
  clubRecords.value.splice(idx, 1);
};

const saveRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingRecords.value = true;
    recordsError.value = '';
    const payload = {
      records: clubRecords.value.map((r) => ({
        id: r.id,
        label: String(r.label || '').trim(),
        value: r.value != null ? Number(r.value) : null,
        unit: String(r.unit || '').trim(),
        notes: String(r.notes || '').trim(),
        metricKey: String(r.metricKey || '').trim() || null
      }))
    };
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records`, payload);
    await Promise.all([loadClubRecords(), loadRecordVerifications()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to save club records';
  } finally {
    savingRecords.value = false;
  }
};

const loadRecordVerifications = async () => {
  if (!currentAgencyId.value) return;
  try {
    verificationsLoading.value = true;
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications`);
    recordVerifications.value = Array.isArray(data?.verifications)
      ? data.verifications.filter((v) => String(v.status || '').toLowerCase() === 'pending')
      : [];
  } catch {
    recordVerifications.value = [];
  } finally {
    verificationsLoading.value = false;
  }
};

const reviewVerification = async (verificationId, status) => {
  if (!currentAgencyId.value || !verificationId) return;
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications/${verificationId}`, { status });
    await Promise.all([loadRecordVerifications(), loadClubRecords()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to review verification request';
  }
};

const setDefaultPaymentMethod = async (paymentMethodId) => {
  if (!currentAgencyId.value || !paymentMethodId) return;
  try {
    await api.post(`/billing/${currentAgencyId.value}/payment-methods/${paymentMethodId}/default`);
    await loadBilling();
  } catch (e) {
    billingError.value = e?.response?.data?.error?.message || 'Failed to set default payment method';
  }
};

const downloadInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const base = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  window.open(`${base}/api/billing/invoices/${invoiceId}/pdf`, '_blank', 'noopener');
};

const formatCurrency = (cents) => {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

onMounted(async () => {
  try {
    loading.value = true;
    await agencyStore.fetchUserAgencies();
    if (!isSsc.value) {
      router.replace(orgTo('/admin/settings'));
      return;
    }
    if (!currentAgency.value || String(currentAgency.value.organization_type || '').toLowerCase() !== 'affiliation') {
      const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
      const club = list.find((a) => String(a?.organization_type || '').toLowerCase() === 'affiliation');
      if (club) agencyStore.setCurrentAgency(club);
    }
    if (!currentAgencyId.value) {
      error.value = 'No club context found for this user.';
      return;
    }
    await Promise.all([hydrateIdentity(), loadBilling(), loadClubRecords(), loadRecordVerifications()]);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load club settings';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.club-settings-header {
  margin-bottom: 20px;
}

.club-settings-header h1 {
  margin: 0;
}

.club-settings-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.settings-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 16px;
  box-shadow: var(--shadow);
}

.card-header h2 {
  margin: 0;
  font-size: 18px;
}

.card-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.field label {
  font-weight: 700;
}

.mode-row,
.icon-row,
.actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-row .btn.active {
  border-color: var(--primary);
}

.logo-preview {
  margin-top: 12px;
  width: 88px;
  height: 88px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-alt);
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.colors-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 6px;
}

.color-picker {
  height: 36px;
  padding: 0;
}

.billing-summary {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.mini-list {
  margin-top: 14px;
}

.mini-list h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.records-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.record-row {
  display: grid;
  gap: 8px;
  grid-template-columns: 1.2fr 0.7fr 0.8fr 0.9fr 1.2fr auto;
}

@media (max-width: 1200px) {
  .record-row {
    grid-template-columns: 1fr;
  }
}

.pill {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>

