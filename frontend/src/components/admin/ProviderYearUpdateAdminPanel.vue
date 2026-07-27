<template>
  <div class="pyu-admin">
    <div class="pyu-admin__head">
      <div>
        <h2>Provider Year Update</h2>
        <p class="muted">Track provider progress, materials requests, and shareable links for {{ schoolYear }}.</p>
      </div>
      <div class="pyu-admin__head-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!filteredRows.length" @click="exportCsv">
          Export Report
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="pyu-admin__campaign">
      <div class="pyu-admin__campaign-status">
        <span class="pill" :class="'pill--' + (campaign.status || 'draft')">{{ campaignLabel }}</span>
        <span class="muted">
          <template v-if="campaign.isPushed">
            Pushed {{ formatDt(campaign.pushedAt) }} — providers see Year Update on My Dashboard (dismissible) and shareable links work.
          </template>
          <template v-else-if="campaign.isEnabled">
            Enabled — use <strong>Get link</strong> / <strong>Copy link</strong> to text providers, or Push to Providers to show Year Update on My Dashboard.
          </template>
          <template v-else>Not started — Enable Provider Year Update for {{ schoolYear }}.</template>
        </span>
      </div>
      <div class="pyu-admin__campaign-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="campaignBusy || campaign.isEnabled"
          @click="enableYearUpdate"
        >
          {{ campaign.isEnabled ? 'Year Update Enabled' : 'Enable Provider Year Update' }}
        </button>
        <button
          type="button"
          class="btn btn-push"
          :disabled="campaignBusy || !campaign.isEnabled"
          @click="pushToProviders"
        >
          {{ campaign.isPushed ? 'Pushed to Providers' : 'Push to Providers' }}
        </button>
      </div>
      <p v-if="pushFlash" class="success-banner">{{ pushFlash }}</p>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="pyu-admin__metrics">
      <div class="metric">
        <span class="metric__label">Total Providers</span>
        <strong>{{ summary.totalProviders || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Completed</span>
        <strong>{{ summary.finalized || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">In Progress</span>
        <strong>{{ summary.inProgress || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Not Started</span>
        <strong>{{ summary.notStarted || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Link Clicks</span>
        <strong>{{ summary.totalTokenViews || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Need School Cart</span>
        <strong>{{ summary.needSchoolCartCount || 0 }}</strong>
      </div>
    </div>

    <div class="pyu-admin__workspace" :class="{ 'has-detail': Boolean(selectedRow) }">
      <div class="pyu-admin__main">
        <div class="pyu-admin__filters">
          <input v-model="filterText" type="text" placeholder="Search providers…" class="pyu-admin__input" />
          <select v-model="filterStatus">
            <option value="all">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="finalized">Finalized</option>
          </select>
          <label class="inline"><input v-model="filterCart" type="checkbox" /> Needs school cart</label>
        </div>

        <div class="pyu-admin__table-wrap">
          <table class="pyu-admin__table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Schools</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Sections</th>
                <th>Clicks</th>
                <th>Last activity</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredRows"
                :key="row.providerUserId"
                :class="{ selected: selectedRow?.providerUserId === row.providerUserId }"
                @click="selectRow(row)"
              >
                <td>
                  <strong>{{ row.providerName }}</strong>
                  <div class="muted small">{{ row.email }}</div>
                </td>
                <td class="muted small">{{ row.schoolNames || '—' }}</td>
                <td><span class="pill" :class="'pill--' + (row.status || 'not_started')">{{ statusLabel(row.status) }}</span></td>
                <td>{{ row.sectionPercent || 0 }}%</td>
                <td>
                  <span
                    v-for="key in sectionKeys"
                    :key="key"
                    class="dot"
                    :class="sectionDotClass(row, key)"
                    :title="sectionTitle(key)"
                  />
                </td>
                <td>{{ row.tokenClickCount || 0 }}</td>
                <td class="muted small">{{ formatDt(row.lastActivityAt) || '—' }}</td>
                <td @click.stop>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="!campaign.isEnabled || linkBusy"
                    @click="copyLink(row)"
                  >
                    {{ linkFor(row) ? 'Copy' : 'Get link' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="!primaryToken(row) || linkBusy"
                    @click="toggleMarkSent(row)"
                  >
                    {{ row.markedSent ? 'Sent ✓' : 'Mark sent' }}
                  </button>
                </td>
              </tr>
              <tr v-if="!filteredRows.length">
                <td colspan="8" class="muted">No providers with school assignments found for this agency.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside v-if="selectedRow" class="pyu-admin__detail">
        <button type="button" class="btn btn-secondary btn-sm" @click="selectedRow = null">Close</button>
        <h3>{{ selectedRow.providerName }}</h3>
        <p class="muted">{{ selectedRow.email }}</p>
        <p v-if="selectedRow.phone" class="muted">{{ selectedRow.phone }}</p>
        <div class="detail-block">
          <strong>Schools</strong>
          <ul>
            <li v-for="s in selectedRow.schools || []" :key="s.schoolOrganizationId">
              {{ s.schoolName }} <span class="muted">({{ s.dayCount }} day{{ s.dayCount === 1 ? '' : 's' }})</span>
            </li>
          </ul>
        </div>
        <div class="detail-block">
          <strong>Materials</strong>
          <p>School cart: {{ selectedRow.needSchoolCart ? 'Yes' : 'No' }}</p>
          <p v-if="selectedRow.materialsNotes" class="muted">{{ selectedRow.materialsNotes }}</p>
        </div>
        <div class="detail-block">
          <strong>Reminders</strong>
          <p>{{ selectedRow.remindersDone || 0 }} / {{ selectedRow.remindersTotal || 0 }} items marked</p>
        </div>
        <div class="detail-block">
          <strong>Share link</strong>
          <p class="link-box">
            {{ linkFor(selectedRow) || (campaign.isEnabled ? 'Click “Copy link” to generate a shareable URL.' : 'Enable Provider Year Update to create links.') }}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!campaign.isEnabled || linkBusy"
            @click="copyLink(selectedRow)"
          >
            {{ linkBusy ? 'Working…' : (linkFor(selectedRow) ? 'Copy link' : 'Generate link') }}
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import {
  SECTION_META,
  currentSchoolYear,
  publicProviderYearUpdateUrl,
  copyTextToClipboard,
} from '../../utils/providerYearUpdate';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  schoolYear: { type: String, default: '' },
  organizationSlug: { type: String, default: '' },
});

const schoolYear = computed(() => props.schoolYear || currentSchoolYear());
const loading = ref(false);
const campaignBusy = ref(false);
const linkBusy = ref(false);
const error = ref('');
const pushFlash = ref('');
const rows = ref([]);
const summary = ref({});
const campaign = ref({ status: 'draft', isEnabled: false, isPushed: false });
const filterText = ref('');
const filterStatus = ref('all');
const filterCart = ref(false);
const selectedRow = ref(null);
const sectionKeys = SECTION_META.map((m) => m.key);

const campaignLabel = computed(() => {
  if (campaign.value.isPushed) return 'Pushed';
  if (campaign.value.isEnabled) return 'Enabled';
  return 'Draft';
});

const filteredRows = computed(() => {
  let list = rows.value || [];
  const q = filterText.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        String(r.providerName || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.schoolNames || '').toLowerCase().includes(q)
    );
  }
  if (filterStatus.value !== 'all') {
    list = list.filter((r) => (r.status || 'not_started') === filterStatus.value);
  }
  if (filterCart.value) list = list.filter((r) => r.needSchoolCart);
  return list;
});

function statusLabel(s) {
  if (s === 'finalized') return 'Completed';
  if (s === 'in_progress') return 'In progress';
  return 'Not started';
}

function sectionTitle(key) {
  return SECTION_META.find((m) => m.key === key)?.shortTitle || key;
}

function sectionDotClass(row, key) {
  const sec = (row.sections || []).find((s) => s.sectionKey === key);
  if (sec?.completed) return 'dot--done';
  if (sec?.reviewed) return 'dot--reviewed';
  return 'dot--empty';
}

function formatDt(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function primaryToken(row) {
  const tokens = row?.tokens || [];
  return tokens.find((t) => !t.locked_at) || tokens[0] || null;
}

function linkFor(row) {
  const t = primaryToken(row);
  return t?.token ? publicProviderYearUpdateUrl(t.token, props.organizationSlug) : '';
}

async function ensureLink(row) {
  if (!row || linkFor(row)) return linkFor(row);
  if (!campaign.value.isEnabled) return '';
  linkBusy.value = true;
  error.value = '';
  try {
    await api.post('/provider-year-update/tokens', {
      agencyId: Number(props.agencyId),
      providerUserId: Number(row.providerUserId),
      schoolYear: schoolYear.value,
    });
    await load();
    const refreshed = rows.value.find((r) => r.providerUserId === row.providerUserId) || row;
    if (selectedRow.value?.providerUserId === row.providerUserId) selectedRow.value = refreshed;
    return linkFor(refreshed);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to generate link';
    return '';
  } finally {
    linkBusy.value = false;
  }
}

async function copyLink(row) {
  if (!row) return;
  let url = linkFor(row);
  if (!url) url = await ensureLink(row);
  if (!url) return;
  const ok = await copyTextToClipboard(url);
  pushFlash.value = ok ? `Copied link for ${row.providerName}` : 'Could not copy — select the link manually.';
  setTimeout(() => {
    pushFlash.value = '';
  }, 2500);
}

async function selectRow(row) {
  selectedRow.value = row;
  if (campaign.value.isEnabled && !linkFor(row) && !linkBusy.value) {
    await ensureLink(row);
  }
}

async function toggleMarkSent(row) {
  const t = primaryToken(row);
  if (!t?.id) return;
  const sent = !row.markedSent;
  await api.patch(`/provider-year-update/tokens/${t.id}/mark-sent`, { sent });
  row.markedSent = sent;
  if (t) t.marked_sent_at = sent ? new Date().toISOString() : null;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/provider-year-update/report', {
      params: { agencyId: props.agencyId, schoolYear: schoolYear.value },
    });
    rows.value = res.data?.providers || [];
    summary.value = res.data?.summary || {};
    campaign.value = res.data?.campaign || { status: 'draft', isEnabled: false, isPushed: false };
    if (selectedRow.value) {
      selectedRow.value =
        rows.value.find((r) => r.providerUserId === selectedRow.value.providerUserId) || null;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load report';
  } finally {
    loading.value = false;
  }
}

async function enableYearUpdate() {
  campaignBusy.value = true;
  error.value = '';
  try {
    await api.post('/provider-year-update/campaign/enable', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Enable failed';
  } finally {
    campaignBusy.value = false;
  }
}

async function pushToProviders() {
  campaignBusy.value = true;
  error.value = '';
  pushFlash.value = '';
  try {
    const res = await api.post('/provider-year-update/campaign/push', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = `Pushed to ${res.data?.providersReady || 0} providers (${res.data?.tokensCreated || 0} new links).`;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Push failed';
  } finally {
    campaignBusy.value = false;
  }
}

function exportCsv() {
  const headers = [
    'Provider',
    'Email',
    'Schools',
    'Status',
    'Progress %',
    'Clicks',
    'Last activity',
    'Need school cart',
    'Materials notes',
    'Link',
  ];
  const lines = [headers.join(',')];
  for (const r of filteredRows.value) {
    const cells = [
      r.providerName,
      r.email,
      r.schoolNames,
      r.status,
      r.sectionPercent,
      r.tokenClickCount,
      r.lastActivityAt || '',
      r.needSchoolCart ? 'yes' : 'no',
      r.materialsNotes || '',
      linkFor(r),
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`);
    lines.push(cells.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `provider-year-update-${schoolYear.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

watch(
  () => props.agencyId,
  () => load()
);

onMounted(load);
</script>

<style scoped>
.pyu-admin {
  width: 100%;
  max-width: none;
  padding: 0 0 2rem;
  box-sizing: border-box;
}
.pyu-admin__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.pyu-admin__head h2 {
  margin: 0 0 4px;
  color: #0c4a6e;
}
.pyu-admin__head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pyu-admin__campaign {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
  margin-bottom: 16px;
}
.pyu-admin__campaign-status {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.pyu-admin__campaign-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-push {
  background: #0c4a6e;
  color: #fff;
  border: none;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #e2e8f0;
}
.pill--draft { background: #e2e8f0; }
.pill--enabled { background: #fef3c7; color: #92400e; }
.pill--pushed { background: #dcfce7; color: #166534; }
.pill--not_started { background: #e2e8f0; }
.pill--in_progress { background: #dbeafe; color: #1e40af; }
.pill--finalized { background: #dcfce7; color: #166534; }
.pyu-admin__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.metric {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
}
.metric__label {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}
.metric strong {
  font-size: 1.25rem;
}
.pyu-admin__workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.pyu-admin__workspace.has-detail {
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
}
.pyu-admin__filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  align-items: center;
}
.pyu-admin__input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  min-width: 200px;
}
.pyu-admin__table-wrap {
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.pyu-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.pyu-admin__table th,
.pyu-admin__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
}
.pyu-admin__table tbody tr {
  cursor: pointer;
}
.pyu-admin__table tbody tr:hover,
.pyu-admin__table tbody tr.selected {
  background: #f8fafc;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 3px;
  background: #cbd5e1;
}
.dot--done { background: #16a34a; }
.dot--reviewed { background: #2563eb; }
.dot--empty { background: #cbd5e1; }
.pyu-admin__detail {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}
.detail-block {
  margin-top: 14px;
}
.detail-block ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.link-box {
  font-size: 0.8rem;
  word-break: break-all;
  background: #f8fafc;
  padding: 8px;
  border-radius: 8px;
}
.success-banner {
  margin: 10px 0 0;
  color: #166534;
  background: #dcfce7;
  padding: 8px 10px;
  border-radius: 8px;
}
.error-banner {
  margin-bottom: 12px;
  color: #991b1b;
  background: #fee2e2;
  padding: 8px 10px;
  border-radius: 8px;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
}
.small { font-size: 0.8rem; }
.muted { color: #64748b; }
@media (max-width: 960px) {
  .pyu-admin__workspace.has-detail {
    grid-template-columns: 1fr;
  }
}
</style>
