<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1 style="margin: 0;">Psychotherapy Compliance</h1>
        <div class="subhead">
          Upload billing reports to track psychotherapy CPT totals (FY Jul 1–Jun 30) and flag clients over 24 services.
        </div>
      </div>
    </div>

    <div v-if="!agencyId" class="hint">Select an organization first.</div>

    <div v-else class="grid">
      <div class="panel">
        <div class="panel-title">Upload billing report</div>
        <div class="row">
          <label class="field">
            <span class="label">Fiscal year</span>
            <select class="select" v-model="fiscalYearStart">
              <option v-for="fy in fiscalYearOptions" :key="fy.startYmd" :value="fy.startYmd">
                {{ fy.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="label">File</span>
            <input class="input" type="file" accept=".csv,.xlsx,.xls" @change="onFileChange" />
          </label>
          <button class="btn btn-primary" type="button" :disabled="uploading || !file" @click="upload">
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
          <button class="btn btn-secondary" type="button" :disabled="loading" @click="loadSummary">
            Refresh summary
          </button>
        </div>

        <div v-if="uploadResult" class="result">
          <div class="muted-small">Upload result</div>
          <pre class="pre">{{ uploadResult }}</pre>
        </div>
        <div v-if="uploadError" class="error">{{ uploadError }}</div>
      </div>

      <div class="panel">
        <div class="panel-title">Client lookup (for matching)</div>
        <div class="row">
          <input
            v-model="clientSearch"
            class="input"
            type="search"
            placeholder="Search clients by initials / name / id…"
          />
          <button class="btn btn-secondary" type="button" :disabled="clientSearching || !clientSearch.trim()" @click="searchClients">
            {{ clientSearching ? 'Searching…' : 'Search' }}
          </button>
        </div>
        <div v-if="clientSearchError" class="error">{{ clientSearchError }}</div>
        <div v-else class="lookup-results">
          <div v-for="c in clientSearchResults" :key="c.id" class="lookup-row">
            <div class="lookup-main">
              <div class="lookup-title">
                <strong>#{{ c.id }}</strong> <span class="pill">{{ c.initials || '—' }}</span>
              </div>
              <div class="muted-small">
                {{ c.organization_name || '—' }} • Provider: {{ c.provider_name || '—' }}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="copyClientId(c.id)">Copy ID</button>
          </div>
          <div v-if="clientSearchResults.length === 0" class="muted-small">No results.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Matched school clients</div>
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Initials</th>
              <th>Provider</th>
              <th>Codes</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in matchedRows" :key="`m-${r.client_id}-${r.provider_user_id}-${r.fiscal_year_start}`">
              <td><span class="pill">{{ r.client_abbrev }}</span></td>
              <td class="muted-small">{{ r.patient_initials_normalized || '—' }}</td>
              <td>{{ r.provider_name || (r.provider_user_id ? `User #${r.provider_user_id}` : '—') }}</td>
              <td class="codes">{{ formatCodes(r.per_code) }}</td>
              <td><strong>{{ r.total }}</strong></td>
              <td>
                <span class="status" :class="{ alert: r.surpassed_24 }">
                  {{ r.surpassed_24 ? 'Over 24' : 'OK' }}
                </span>
              </td>
            </tr>
            <tr v-if="matchedRows.length === 0">
              <td colspan="6" class="muted">No matched clients found for this fiscal year.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-title">Non-school / unmatched (needs matching)</div>
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Initials</th>
              <th>Provider</th>
              <th>Codes</th>
              <th>Total</th>
              <th>Status</th>
              <th>Match to client</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in unmatchedRows" :key="`u-${r.client_key_hash}-${r.provider_user_id}-${r.fiscal_year_start}`">
              <td><span class="pill">{{ r.client_abbrev }}</span></td>
              <td class="muted-small">{{ r.patient_initials_normalized || '—' }}</td>
              <td>{{ r.provider_name || (r.provider_user_id ? `User #${r.provider_user_id}` : '—') }}</td>
              <td class="codes">{{ formatCodes(r.per_code) }}</td>
              <td><strong>{{ r.total }}</strong></td>
              <td>
                <span class="status" :class="{ alert: r.surpassed_24 }">
                  {{ r.surpassed_24 ? 'Over 24' : 'OK' }}
                </span>
              </td>
              <td class="match-cell">
                <input
                  v-model="matchClientIdByHash[r.client_key_hash]"
                  class="input match-input"
                  type="number"
                  min="1"
                  placeholder="Client ID"
                />
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="matchingHash === r.client_key_hash"
                  @click="matchClient(r)"
                >
                  {{ matchingHash === r.client_key_hash ? 'Matching…' : 'Match' }}
                </button>
              </td>
            </tr>
            <tr v-if="unmatchedRows.length === 0">
              <td colspan="7" class="muted">No unmatched clients found for this fiscal year.</td>
            </tr>
          </tbody>
        </table>
        <div class="muted-small" style="margin-top: 8px;">
          Matching links all rows for the same client (hash) to the selected internal client ID.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const computeFiscalYearStartYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const startYear = m >= 7 ? y : (y - 1);
  return `${startYear}-07-01`;
};

const fiscalYearOptions = computed(() => {
  const now = new Date();
  const currentStart = computeFiscalYearStartYmd(now);
  const startYear = Number(currentStart.slice(0, 4));
  const years = [startYear, startYear - 1, startYear - 2];
  return years.map((y) => ({ startYmd: `${y}-07-01`, label: `${y}-${y + 1}` }));
});

const fiscalYearStart = ref('');

const file = ref(null);
const uploading = ref(false);
const uploadError = ref('');
const uploadResult = ref('');

const loading = ref(false);
const error = ref('');
const matchedRows = ref([]);
const unmatchedRows = ref([]);

const clientSearch = ref('');
const clientSearching = ref(false);
const clientSearchError = ref('');
const clientSearchResults = ref([]);

const matchClientIdByHash = ref({});
const matchingHash = ref('');

const formatCodes = (per) => {
  const obj = per && typeof per === 'object' ? per : {};
  return Object.entries(obj)
    .filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${String(code).toUpperCase()} (${Number(count)})`)
    .join(' ');
};

const onFileChange = (e) => {
  const f = e?.target?.files?.[0] || null;
  file.value = f;
  uploadError.value = '';
  uploadResult.value = '';
};

const upload = async () => {
  if (!agencyId.value) return;
  if (!file.value) return;
  try {
    uploading.value = true;
    uploadError.value = '';
    uploadResult.value = '';

    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('file', file.value);
    const r = await api.post('/psychotherapy-compliance/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    uploadResult.value = JSON.stringify(r.data || {}, null, 2);
    await loadSummary();
  } catch (e) {
    uploadError.value = e?.response?.data?.error?.message || e?.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const enrichProviderNames = async (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length > 0 && list.every((r) => String(r?.provider_name || '').trim())) return list;
  const ids = Array.from(
    new Set(list.map((r) => Number(r?.provider_user_id || 0)).filter((x) => Number.isFinite(x) && x > 0))
  );
  if (ids.length === 0) return rows;
  try {
    // Best-effort: resolve via /users/:id; keep it small to avoid spamming.
    const limited = ids.slice(0, 50);
    const results = await Promise.all(
      limited.map((id) =>
        api
          .get(`/users/${id}`)
          .then((resp) => ({ id, user: resp.data }))
          .catch(() => ({ id, user: null }))
      )
    );
    const byId = new Map(results.map((r) => [Number(r.id), r.user]));
    return list.map((r) => {
      const u = byId.get(Number(r?.provider_user_id || 0)) || null;
      const name = u?.first_name && u?.last_name ? `${u.first_name} ${u.last_name}` : null;
      return { ...r, provider_name: name };
    });
  } catch {
    return list;
  }
};

const loadSummary = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';

    if (!fiscalYearStart.value) fiscalYearStart.value = fiscalYearOptions.value[0]?.startYmd || '';
    const r = await api.get('/psychotherapy-compliance/summary', {
      params: { agencyId: agencyId.value, fiscalYearStart: fiscalYearStart.value }
    });
    const matched = Array.isArray(r.data?.matched) ? r.data.matched : [];
    const unmatched = Array.isArray(r.data?.unmatched) ? r.data.unmatched : [];
    matchedRows.value = await enrichProviderNames(matched);
    unmatchedRows.value = await enrichProviderNames(unmatched);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load summary';
    matchedRows.value = [];
    unmatchedRows.value = [];
  } finally {
    loading.value = false;
  }
};

const searchClients = async () => {
  if (!agencyId.value) return;
  const q = String(clientSearch.value || '').trim();
  if (!q) return;
  try {
    clientSearching.value = true;
    clientSearchError.value = '';
    clientSearchResults.value = [];
    const r = await api.get('/clients', { params: { agency_id: agencyId.value, search: q } });
    const list = Array.isArray(r.data) ? r.data : [];
    clientSearchResults.value = list.slice(0, 25);
  } catch (e) {
    clientSearchError.value = e?.response?.data?.error?.message || e?.message || 'Client search failed';
    clientSearchResults.value = [];
  } finally {
    clientSearching.value = false;
  }
};

const copyClientId = async (id) => {
  try {
    await navigator.clipboard.writeText(String(id));
  } catch {
    // ignore
  }
};

const matchClient = async (row) => {
  if (!agencyId.value) return;
  const hash = String(row?.client_key_hash || '').trim();
  const cid = parseInt(String(matchClientIdByHash.value?.[hash] || ''), 10);
  if (!hash || !cid) return;
  try {
    matchingHash.value = hash;
    await api.post('/psychotherapy-compliance/match', {
      agencyId: agencyId.value,
      clientKeyHash: hash,
      clientId: cid
    });
    await loadSummary();
  } catch (e) {
    // Keep it simple: show in main error area.
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to match client';
  } finally {
    matchingHash.value = '';
  }
};

onMounted(() => {
  fiscalYearStart.value = fiscalYearOptions.value[0]?.startYmd || '';
  loadSummary().catch(() => {});
});

watch(() => agencyId.value, () => loadSummary().catch(() => {}));
watch(() => fiscalYearStart.value, () => loadSummary().catch(() => {}));
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.subhead {
  color: var(--text-secondary);
  margin-top: 6px;
}
.grid {
  display: grid;
  gap: 12px;
}
.panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 14px;
}
.panel-title {
  font-weight: 900;
  margin-bottom: 10px;
}
.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.field {
  display: grid;
  gap: 6px;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.input,
.select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  padding: 10px 12px;
  min-width: 240px;
}
.match-input {
  min-width: 140px;
}
.error {
  color: #c33;
  margin-top: 8px;
}
.muted {
  color: var(--text-secondary);
}
.muted-small {
  color: var(--text-secondary);
  font-size: 12px;
}
.result {
  margin-top: 10px;
}
.pre {
  margin: 8px 0 0 0;
  max-height: 180px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg);
  font-size: 12px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}
.codes {
  white-space: nowrap;
}
.pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--bg);
  font-weight: 900;
  letter-spacing: 0.05em;
}
.status {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--bg);
  font-weight: 900;
}
.status.alert {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.10);
  color: #991b1b;
}
.match-cell {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.lookup-results {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.lookup-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg);
}
.lookup-title {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>

