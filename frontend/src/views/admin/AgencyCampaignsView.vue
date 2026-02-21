<template>
  <div class="container campaigns-view">
    <div class="header">
      <div>
        <h2>Agency Campaigns</h2>
        <p class="subtitle">
          Send time-limited staff polls by SMS and track responses.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="refreshAll" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div v-else-if="!featureEnabled" class="card empty">
      <div class="title">Agency campaigns are not enabled.</div>
      <div class="note">Enable the $10/mo feature flag to unlock staff polls.</div>
    </div>

    <div v-else class="grid">
      <div class="card form-card">
        <h3>New campaign</h3>
        <div class="field">
          <label>Title</label>
          <input v-model="form.title" type="text" placeholder="Weekly engagement check-in" />
        </div>
        <div class="field">
          <label>Question</label>
          <textarea v-model="form.question" rows="4" placeholder="Are you available for an extra shift this week?"></textarea>
        </div>
        <div class="field">
          <label>End date/time</label>
          <input v-model="form.endsAtLocal" type="datetime-local" />
        </div>
        <div class="field">
          <label>Audience</label>
          <div class="audience">
            <label><input type="radio" value="all" v-model="form.audienceMode" /> All staff</label>
            <label><input type="radio" value="selected" v-model="form.audienceMode" /> Selected staff</label>
            <label><input type="radio" value="contacts" v-model="form.audienceMode" /> Contacts</label>
          </div>
        </div>
        <div v-if="form.audienceMode === 'contacts'" class="field contacts-audience">
          <div class="audience-target">
            <select v-model="form.audienceTarget.schoolId" class="filter-select">
              <option value="">All schools</option>
              <option v-for="s in audienceSchools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
            </select>
            <select v-model="form.audienceTarget.providerId" class="filter-select">
              <option value="">All providers</option>
              <option v-for="p in audienceProviders" :key="p.id" :value="String(p.id)">{{ p.first_name }} {{ p.last_name }}</option>
            </select>
            <input v-model="form.audienceTarget.clientId" type="text" placeholder="Client ID (optional)" class="filter-select" />
          </div>
          <div v-if="contactsAudienceCount !== null" class="muted">
            {{ contactsAudienceCount }} contact(s) with phone numbers
          </div>
        </div>
        <div v-if="form.audienceMode === 'selected'" class="field staff-list">
          <div class="staff-title">Choose staff</div>
          <div v-if="staffLoading" class="loading">Loading staff…</div>
          <div v-else class="staff-options">
            <label v-for="u in staff" :key="u.id" class="staff-option">
              <input type="checkbox" :value="u.id" v-model="form.recipientIds" />
              <span>{{ u.first_name }} {{ u.last_name }}</span>
              <span class="muted">{{ u.role }}</span>
              <span v-if="u.opted_out" class="pill muted">Opted out</span>
            </label>
          </div>
        </div>
        <div class="field note">
          <div v-if="shortCode">
            Short code: <span class="mono">{{ shortCode }}</span>
          </div>
          <div>Default responses: Y = Yes, N = No, OPT OUT = Opt Out</div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" @click="createCampaign(false)" :disabled="loading">Save draft</button>
          <button class="btn btn-primary" @click="createCampaign(true)" :disabled="loading">Send now</button>
        </div>
      </div>

      <div class="card list-card">
        <h3>Recent campaigns</h3>
        <div v-if="loading" class="loading">Loading…</div>
        <div v-else-if="campaigns.length === 0" class="empty">No campaigns yet.</div>
        <div v-else class="list">
          <div v-for="c in campaigns" :key="c.id" class="row">
            <div class="row-main">
              <div class="row-title">{{ c.title }}</div>
              <div class="row-meta">
                <span class="pill" :class="c.status">{{ c.status }}</span>
                <span class="muted">{{ formatDate(c.created_at) }}</span>
                <span class="muted">Recipients: {{ (c.contact_recipient_count ?? c.recipient_count) || 0 }}</span>
                <span class="muted">Responses: {{ c.response_count || 0 }}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="btn btn-secondary btn-xs" @click="selectCampaign(c)">Responses</button>
              <button
                v-if="c.status === 'draft'"
                class="btn btn-primary btn-xs"
                @click="sendCampaign(c)"
              >Send</button>
              <button
                v-if="c.status === 'sent'"
                class="btn btn-secondary btn-xs"
                @click="closeCampaign(c)"
              >Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedCampaign" class="card responses-card">
      <div class="responses-header">
        <div>
          <h3>{{ selectedCampaign.title }}</h3>
          <div class="muted">{{ selectedCampaign.question }}</div>
        </div>
        <button class="btn btn-secondary btn-xs" @click="selectedCampaign = null">Close</button>
      </div>
      <div v-if="responsesLoading" class="loading">Loading responses…</div>
      <div v-else class="responses-grid">
        <div v-for="group in responseGroups" :key="group.key" class="response-group">
          <div class="group-title">{{ group.label }} ({{ group.items.length }})</div>
          <div class="group-list">
            <div v-for="item in group.items" :key="item.user_id" class="group-row">
              <span>{{ item.first_name }} {{ item.last_name }}</span>
              <span class="muted">{{ formatDate(item.received_at) }}</span>
            </div>
            <div v-if="group.items.length === 0" class="muted">No responses yet.</div>
          </div>
        </div>
        <div class="response-group">
          <div class="group-title">Opted out ({{ optOuts.length }})</div>
          <div class="group-list">
            <div v-for="item in optOuts" :key="item.user_id" class="group-row">
              <span>{{ item.first_name }} {{ item.last_name }}</span>
              <span class="muted">{{ item.email }}</span>
            </div>
            <div v-if="optOuts.length === 0" class="muted">No opt-outs yet.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const campaigns = ref([]);
const staff = ref([]);
const error = ref('');
const loading = ref(false);
const staffLoading = ref(false);
const responsesLoading = ref(false);
const selectedCampaign = ref(null);
const responses = ref([]);
const optOuts = ref([]);

const form = ref({
  title: '',
  question: '',
  endsAtLocal: '',
  audienceMode: 'all',
  recipientIds: [],
  audienceTarget: { schoolId: '', providerId: '', clientId: '' }
});

const audienceSchools = ref([]);
const audienceProviders = ref([]);
const contactsAudienceCount = ref(null);

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const agencyFlags = computed(() =>
  parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags)
);
const featureEnabled = computed(() => agencyFlags.value?.agency_campaigns_enabled === true);
const shortCode = computed(() => agencyFlags.value?.agency_campaigns_short_code || agencyFlags.value?.agency_campaigns_shortcode || '');

const responseGroups = computed(() => {
  const groups = new Map();
  const defaults = [
    { key: 'Y', label: 'Yes' },
    { key: 'N', label: 'No' }
  ];
  for (const def of defaults) {
    groups.set(def.key, { key: def.key, label: def.label, items: [] });
  }
  for (const item of responses.value) {
    const key = String(item.response_key || '').toUpperCase();
    const label = item.response_label || key || 'Other';
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(item);
  }
  return Array.from(groups.values());
});

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

const refreshAll = async () => {
  if (!agencyId.value) return;
  error.value = '';
  loading.value = true;
  try {
    const res = await api.get(`/agency-campaigns?agencyId=${agencyId.value}`);
    campaigns.value = res.data?.campaigns || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load campaigns.';
  } finally {
    loading.value = false;
  }
};

const loadStaff = async () => {
  if (!agencyId.value) return;
  staffLoading.value = true;
  try {
    const res = await api.get(`/agency-campaigns/staff?agencyId=${agencyId.value}`);
    staff.value = res.data || [];
  } catch {
    staff.value = [];
  } finally {
    staffLoading.value = false;
  }
};

const createCampaign = async (sendNow) => {
  if (!agencyId.value) return;
  if (!form.value.title.trim() || !form.value.question.trim()) {
    error.value = 'Title and question are required.';
    return;
  }
  if (form.value.audienceMode === 'contacts') {
    const t = form.value.audienceTarget || {};
    if (!t.schoolId && !t.providerId && !t.clientId) {
      error.value = 'Select at least one target: school, provider, or client.';
      return;
    }
  }
  error.value = '';
  loading.value = true;
  try {
    const payload = {
      agencyId: agencyId.value,
      title: form.value.title.trim(),
      question: form.value.question.trim(),
      endsAt: form.value.endsAtLocal ? new Date(form.value.endsAtLocal).toISOString() : null,
      audienceMode: form.value.audienceMode,
      recipientIds: form.value.audienceMode === 'selected' ? form.value.recipientIds : []
    };
    if (form.value.audienceMode === 'contacts') {
      const t = form.value.audienceTarget || {};
      payload.audienceTarget = {
        schoolId: t.schoolId ? parseInt(t.schoolId, 10) : undefined,
        providerId: t.providerId ? parseInt(t.providerId, 10) : undefined,
        clientId: t.clientId ? parseInt(t.clientId, 10) : undefined
      };
    }
    const res = await api.post('/agency-campaigns', payload);
    const created = res.data;
    if (sendNow && created?.id) {
      await api.post(`/agency-campaigns/${created.id}/send`);
    }
    form.value = { title: '', question: '', endsAtLocal: '', audienceMode: 'all', recipientIds: [], audienceTarget: { schoolId: '', providerId: '', clientId: '' } };
    await refreshAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create campaign.';
  } finally {
    loading.value = false;
  }
};

const sendCampaign = async (campaign) => {
  if (!campaign?.id) return;
  loading.value = true;
  try {
    await api.post(`/agency-campaigns/${campaign.id}/send`);
    await refreshAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send campaign.';
  } finally {
    loading.value = false;
  }
};

const closeCampaign = async (campaign) => {
  if (!campaign?.id) return;
  loading.value = true;
  try {
    await api.post(`/agency-campaigns/${campaign.id}/close`);
    await refreshAll();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to close campaign.';
  } finally {
    loading.value = false;
  }
};

const selectCampaign = async (campaign) => {
  selectedCampaign.value = campaign;
  responsesLoading.value = true;
  try {
    const res = await api.get(`/agency-campaigns/${campaign.id}/responses`);
    responses.value = res.data?.responses || [];
    optOuts.value = res.data?.optOuts || [];
  } finally {
    responsesLoading.value = false;
  }
};

const loadAudienceOptions = async () => {
  if (!agencyId.value) return;
  try {
    const [schoolsRes, providersRes] = await Promise.all([
      api.get(`/agencies/${agencyId.value}/affiliated-organizations`),
      api.get('/provider-scheduling/providers', { params: { agencyId: agencyId.value } })
    ]);
    const schoolRows = Array.isArray(schoolsRes.data) ? schoolsRes.data : [];
    audienceSchools.value = schoolRows
      .filter((o) => String(o?.organization_type || '').toLowerCase() !== 'agency')
      .map((o) => ({ id: o.id, name: o.name || `Org ${o.id}` }));
    audienceProviders.value = providersRes.data || [];
  } catch {
    audienceSchools.value = [];
    audienceProviders.value = [];
  }
};

const fetchContactsAudienceCount = async () => {
  if (!agencyId.value || form.value.audienceMode !== 'contacts') {
    contactsAudienceCount.value = null;
    return;
  }
  const t = form.value.audienceTarget || {};
  if (!t.schoolId && !t.providerId && !t.clientId) {
    contactsAudienceCount.value = null;
    return;
  }
  try {
    const params = {};
    if (t.schoolId) params.schoolId = t.schoolId;
    if (t.providerId) params.providerId = t.providerId;
    if (t.clientId) params.clientId = t.clientId;
    const res = await api.get(`/contacts/agency/${agencyId.value}/audience`, { params });
    const list = res.data || [];
    contactsAudienceCount.value = list.filter((c) => c.phone).length;
  } catch {
    contactsAudienceCount.value = null;
  }
};

watch(
  () => agencyId.value,
  async (id) => {
    if (!id) return;
    await refreshAll();
    await loadStaff();
    await loadAudienceOptions();
  },
  { immediate: true }
);

watch(
  () => [form.value.audienceMode, form.value.audienceTarget?.schoolId, form.value.audienceTarget?.providerId, form.value.audienceTarget?.clientId],
  () => fetchContactsAudienceCount(),
  { deep: true }
);

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
});
</script>

<style scoped>
.campaigns-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.subtitle {
  color: #6b7280;
  margin-top: 4px;
}

.grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 24px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.field input,
.field textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.audience {
  display: flex;
  gap: 12px;
}

.staff-list {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.staff-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}

.staff-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.muted {
  color: #6b7280;
  font-size: 0.85rem;
}

.mono {
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.row-title {
  font-weight: 600;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: #f3f4f6;
  text-transform: uppercase;
}

.pill.draft {
  background: #e5e7eb;
}

.pill.sent {
  background: #d1fae5;
  color: #047857;
}

.pill.closed {
  background: #fde68a;
  color: #92400e;
}

.responses-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.responses-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.responses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.response-group {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
}

.group-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.group-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #f3f4f6;
}

.group-row:last-child {
  border-bottom: none;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
