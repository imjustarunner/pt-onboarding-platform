<template>
  <div class="container">
    <div class="page-header" data-tour="provdir-header">
      <div>
        <router-link to="/admin" class="back-link">← Back to Dashboard</router-link>
        <h1 data-tour="provdir-title">Provider Directory</h1>
        <div class="muted" style="margin-top: 6px;">
          Search providers by profile fields (specialties, ages, interests). Optional AI can generate filters.
        </div>
      </div>
      <div class="header-actions" style="display: flex; gap: 10px; align-items: center;" data-tour="provdir-actions">
        <button class="btn btn-secondary" type="button" @click="rebuildIndex" :disabled="rebuilding">
          {{ rebuilding ? 'Rebuilding…' : 'Rebuild Index' }}
        </button>
        <button class="btn btn-primary" type="button" @click="runSearch" :disabled="loading">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>

    <div class="card" style="margin-top: 14px;" data-tour="provdir-filters">
      <h3 class="card-title" style="margin: 0 0 10px 0;">Filters</h3>

      <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="field">
          <label>Free text (optional)</label>
          <input v-model="textQuery" type="text" placeholder="e.g., ADHD, children, groups…" />
        </div>
        <div class="field">
          <label>Agency</label>
          <select v-model.number="agencyId">
            <option v-for="a in userAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
      </div>

      <div style="margin-top: 12px; display:flex; align-items:center; gap: 10px; flex-wrap: wrap;">
        <label style="display:inline-flex; align-items:center; gap: 8px; font-weight: 700;">
          <input type="checkbox" v-model="bachelorsOnly" />
          <span>Bachelors only</span>
        </label>
        <span class="muted" style="font-size: 12px;">Uses credentialing field <code>provider_credential</code> to tag bachelor-level providers.</span>
      </div>

      <div v-if="aiEnabled" class="card" style="margin-top: 12px;" data-tour="provdir-ai">
        <h4 style="margin: 0 0 8px 0;">AI (Gemini) – Generate filters</h4>
        <div class="field-row" style="grid-template-columns: 1fr auto; gap: 10px; align-items: end;">
          <div class="field">
            <label>Ask in plain language</label>
            <input v-model="aiQuery" type="text" placeholder="Who is interested in working with children with ADHD?" />
          </div>
          <button class="btn btn-secondary" type="button" @click="compileAi" :disabled="compilingAi || !aiQuery.trim()">
            {{ compilingAi ? 'Generating…' : 'Generate' }}
          </button>
        </div>
        <div v-if="aiExplanation" class="muted" style="margin-top: 8px;">{{ aiExplanation }}</div>
      </div>

      <div style="margin-top: 12px;" data-tour="provdir-structured-filters">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="margin: 0;">Structured filters</h4>
          <button class="btn btn-secondary btn-sm" type="button" @click="addFilter">Add filter</button>
        </div>

        <div v-if="filters.length === 0" class="muted" style="margin-top: 8px;">
          No filters yet. Add one, or use AI to generate.
        </div>

        <div v-for="(f, idx) in filters" :key="idx" class="card" style="margin-top: 10px;">
          <div class="field-row" style="grid-template-columns: 1fr 180px 1fr auto; gap: 10px; align-items: end;">
            <div class="field">
              <label>Field</label>
              <select v-model="f.fieldKey">
                <option value="" disabled>Select…</option>
                <option v-for="fd in searchableFields" :key="fd.fieldKey" :value="fd.fieldKey">
                  {{ fd.fieldLabel }}
                </option>
              </select>
            </div>
            <div class="field">
              <label>Operator</label>
              <select v-model="f.op">
                <option value="hasOption">Has option</option>
                <option value="textContains">Text contains</option>
                <option value="equals">Equals</option>
              </select>
            </div>
            <div class="field">
              <label>Value</label>
              <input v-model="f.value" type="text" placeholder="Value…" />
            </div>
            <button class="btn btn-danger btn-sm" type="button" @click="removeFilter(idx)">Remove</button>
          </div>
          <div v-if="fieldOptionsFor(f.fieldKey).length && f.op === 'hasOption'" class="muted" style="margin-top: 6px;">
            Options: {{ fieldOptionsFor(f.fieldKey).slice(0, 12).join(', ') }}<span v-if="fieldOptionsFor(f.fieldKey).length > 12">…</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;" data-tour="provdir-results">
      <h3 class="card-title" style="margin: 0 0 10px 0;">Results</h3>
      <div class="muted" v-if="!loading">Matches: {{ total }}</div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Searching…</div>
      <div v-else-if="results.length === 0" class="muted" style="margin-top: 10px;">No matches.</div>
      <div v-else style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in results" :key="u.id">
              <td>{{ (u.first_name || '') + ' ' + (u.last_name || '') }}</td>
              <td>{{ u.email }}</td>
              <td>{{ u.role }}</td>
              <td class="right">
                <router-link class="btn btn-secondary btn-sm" :to="userProfileLink(u.id)">Open</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="card-title" style="margin: 0 0 10px 0;">Import legacy answers (CSV/XLSX)</h3>
      <div class="muted">Uploads a spreadsheet and writes into canonical profile fields by <code>field_key</code>. You can match rows to users by email or by first/last name (recommended: also include DOB).</div>

      <div class="field-row" style="grid-template-columns: 1fr auto; gap: 10px; align-items: end; margin-top: 10px;">
        <div class="field">
          <label>File</label>
          <input type="file" @change="onFileChange" accept=".csv,.xlsx,.xls" />
        </div>
        <button class="btn btn-secondary" type="button" @click="previewImport" :disabled="!importFile || previewingImport">
          {{ previewingImport ? 'Previewing…' : 'Preview' }}
        </button>
      </div>

      <div v-if="importPreview" style="margin-top: 12px;">
        <div style="display:flex; gap: 10px; justify-content: flex-end; margin-bottom: 10px;">
          <button class="btn btn-secondary btn-sm" type="button" @click="autoMapExactHeaders" :disabled="!importPreview?.headers?.length">
            Auto-map exact header matches
          </button>
        </div>

        <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="field">
            <label>Match rows to users by</label>
            <select v-model="matchMode">
              <option value="name">First + Last name (optionally DOB)</option>
              <option value="email">Email address</option>
            </select>
          </div>
          <div class="field">
            <label>Mode</label>
            <select v-model="dryRun">
              <option :value="true">Dry run (no writes)</option>
              <option :value="false">Apply import</option>
            </select>
          </div>
        </div>

        <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px;">
          <div class="field" v-if="matchMode === 'email'">
            <label>Email column</label>
            <select v-model="matchEmailColumn">
              <option value="" disabled>Select…</option>
              <option v-for="h in importPreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div class="field" v-if="matchMode === 'name'">
            <label>First name column</label>
            <select v-model="matchFirstNameColumn">
              <option value="" disabled>Select…</option>
              <option v-for="h in importPreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div class="field" v-if="matchMode === 'name'">
            <label>Last name column</label>
            <select v-model="matchLastNameColumn">
              <option value="" disabled>Select…</option>
              <option v-for="h in importPreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div class="field" v-if="matchMode === 'name'">
            <label>DOB column (recommended)</label>
            <select v-model="matchDobColumn">
              <option value="">(none)</option>
              <option v-for="h in importPreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>

        <div class="card" style="margin-top: 10px;">
          <h4 style="margin: 0 0 8px 0;">Column mapping</h4>
          <div class="muted">Map spreadsheet columns to canonical profile fields (by `field_key`). Sensitive fields like passwords/SSN are blocked.</div>

          <div v-for="fd in searchableFields" :key="fd.fieldKey" class="field-row" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
            <div class="field">
              <label>{{ fd.fieldLabel }}</label>
              <div class="muted">{{ fd.fieldKey }}</div>
            </div>
            <div class="field">
              <label>Spreadsheet column</label>
              <select v-model="importMapping[fd.fieldKey]">
                <option value="">(ignore)</option>
                <option v-for="h in importPreview.headers" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px;">
          <button
            class="btn btn-primary"
            type="button"
            @click="runImport"
            :disabled="importing || !canRunImport"
          >
            {{ importing ? 'Running…' : (dryRun ? 'Run Dry Run' : 'Apply Import') }}
          </button>
        </div>

        <div v-if="importResult" class="card" style="margin-top: 10px;">
          <div><strong>Rows:</strong> {{ importResult.rowCount }}</div>
          <div><strong>Matched:</strong> {{ importResult.matched }}</div>
          <div><strong>Unmatched:</strong> {{ importResult.unmatched }}</div>
          <div><strong>Updates planned:</strong> {{ importResult.updatesPlanned }}</div>
          <div><strong>Updates applied:</strong> {{ importResult.updatesApplied }}</div>
          <div v-if="(importResult.unmatchedRows || []).length" class="muted" style="margin-top: 8px;">
            Showing up to 50 unmatched rows.
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 14px; border: 1px solid rgba(220, 53, 69, 0.35);">
      <h3 class="card-title" style="margin: 0 0 10px 0; color: #dc3545;">Rollback / Purge profile values (danger)</h3>
      <div class="muted">
        This permanently deletes <code>user_info_values</code> for the selected agency + field_keys. Use this if a bulk import went wrong.
      </div>

      <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
        <div class="field">
          <label>Agency</label>
          <select v-model.number="agencyId">
            <option v-for="a in userAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Only delete values updated after (optional)</label>
          <input v-model="purgeUpdatedAfter" type="datetime-local" />
          <div class="muted">Leave blank to delete all values for these keys (for this agency’s users).</div>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Field keys to purge (one per line)</label>
        <textarea
          v-model="purgeFieldKeysText"
          rows="6"
          placeholder="license_type_number&#10;license_issued&#10;license_expires&#10;mailing_address&#10;cell_number"
        ></textarea>
      </div>

      <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 10px;">
        <div class="field">
          <label>Mode</label>
          <select v-model="purgeDryRun">
            <option :value="true">Dry run (count only)</option>
            <option :value="false">Apply purge (delete)</option>
          </select>
        </div>
        <div class="field">
          <label>Confirm (type PURGE)</label>
          <input v-model="purgeConfirmText" type="text" placeholder="PURGE" />
        </div>
        <div class="field" style="align-self: end;">
          <button
            class="btn btn-danger"
            type="button"
            @click="runPurge"
            :disabled="purgeRunning || !agencyId || !purgeFieldKeysText.trim() || purgeConfirmText.trim() !== 'PURGE'"
          >
            {{ purgeRunning ? 'Working…' : (purgeDryRun ? 'Run Dry Run' : 'Purge Values') }}
          </button>
        </div>
      </div>

      <div v-if="purgeResult" class="card" style="margin-top: 10px;">
        <div><strong>Dry run:</strong> {{ purgeResult.dryRun ? 'Yes' : 'No' }}</div>
        <div><strong>Matched values:</strong> {{ purgeResult.matchedValues }}</div>
        <div><strong>Affected users:</strong> {{ purgeResult.affectedUsers }}</div>
        <div v-if="purgeResult.deletedValues !== undefined"><strong>Deleted values:</strong> {{ purgeResult.deletedValues }}</div>
        <div class="muted" v-if="purgeResult.updatedAfter">Updated after: {{ purgeResult.updatedAfter }}</div>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="card-title" style="margin: 0 0 10px 0;">Quick paste import (field_key: value)</h3>
      <div class="muted">
        Paste key/value lines to backfill a single user. Format: <code>field_key: value</code> (or <code>field_key[TAB]value</code>).
        Sensitive keys (password/SSN) are blocked.
      </div>

      <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
        <div class="field">
          <label>Personal email (match key)</label>
          <input v-model="kvPersonalEmail" type="email" placeholder="name@example.com" />
        </div>
        <div class="field">
          <label>Agency (for reindex)</label>
          <select v-model.number="agencyId">
            <option v-for="a in userAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Paste</label>
        <textarea v-model="kvText" rows="8" placeholder="work_location: Colorado Springs&#10;specialties_general: ADHD, Anxiety"></textarea>
      </div>

      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px;">
        <button class="btn btn-primary" type="button" @click="runKvPaste" :disabled="kvRunning || !kvPersonalEmail.trim() || !kvText.trim()">
          {{ kvRunning ? 'Importing…' : 'Import' }}
        </button>
      </div>

      <div v-if="kvResult" class="card" style="margin-top: 10px;">
        <div><strong>Updates applied:</strong> {{ kvResult.updatesApplied }}</div>
        <div v-if="(kvResult.unknownKeys || []).length" class="muted" style="margin-top: 6px;">
          Unknown keys: {{ kvResult.unknownKeys.slice(0, 20).join(', ') }}<span v-if="kvResult.unknownKeys.length > 20">…</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="card-title" style="margin: 0 0 10px 0;">Bulk create providers (in-school list)</h3>
      <div class="muted">
        Upload your school provider list (CSV/XLSX). This will create/link provider accounts to the selected agency and store your columns into Provider Info fields.
        Works with comma-CSV or semicolon-CSV. Matching is by provider name (creates deterministic placeholder emails).
      </div>

      <div class="field-row" style="grid-template-columns: 1fr auto; gap: 10px; align-items: end; margin-top: 10px;">
        <div class="field">
          <label>File</label>
          <input type="file" @change="onProviderListFileChange" accept=".csv,.xlsx,.xls" />
        </div>
        <button class="btn btn-primary" type="button" @click="runProviderBulkCreate" :disabled="!providerListFile || providerBulkRunning">
          {{ providerBulkRunning ? 'Importing…' : 'Import Providers' }}
        </button>
      </div>

      <div v-if="providerBulkResult" class="card" style="margin-top: 10px;">
        <div><strong>Rows:</strong> {{ providerBulkResult.rowCount }}</div>
        <div><strong>Created providers:</strong> {{ providerBulkResult.createdProviders }}</div>
        <div><strong>Updated providers:</strong> {{ providerBulkResult.updatedProviders }}</div>
        <div v-if="(providerBulkResult.errors || []).length" class="muted" style="margin-top: 8px;">
          Showing up to 50 errors.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const agencyStore = useAgencyStore();

const userAgencies = computed(() => agencyStore.userAgencies || []);
const agencyId = ref(null);

const parseFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};
const aiEnabled = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const flags = parseFlags(a?.feature_flags);
  return flags?.aiProviderSearchEnabled === true || flags?.aiProviderSearchEnabled === 1 || flags?.aiProviderSearchEnabled === '1' || String(flags?.aiProviderSearchEnabled || '').toLowerCase() === 'true';
});

const searchableFields = ref([]);
const filters = ref([]);
const textQuery = ref('');
const results = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const rebuilding = ref(false);

const bachelorsOnly = ref(false);
const ensureBachelorsFilter = () => {
  const key = 'degree_level';
  const op = 'hasOption';
  const value = 'bachelors';
  const has = (filters.value || []).some((f) => f?.fieldKey === key && f?.op === op && String(f?.value || '') === value);
  if (bachelorsOnly.value) {
    if (!has) filters.value.push({ fieldKey: key, op, value });
  } else {
    filters.value = (filters.value || []).filter((f) => !(f?.fieldKey === key && f?.op === op && String(f?.value || '') === value));
  }
};
watch(bachelorsOnly, () => ensureBachelorsFilter());

const aiQuery = ref('');
const compilingAi = ref(false);
const aiExplanation = ref('');

const importFile = ref(null);
const importPreview = ref(null);
const previewingImport = ref(false);
const importMapping = ref({});
const matchMode = ref('name');
const matchEmailColumn = ref('');
const matchFirstNameColumn = ref('');
const matchLastNameColumn = ref('');
const matchDobColumn = ref('');
const dryRun = ref(true);
const importing = ref(false);
const importResult = ref(null);

const kvPersonalEmail = ref('');
const kvText = ref('');
const kvRunning = ref(false);
const kvResult = ref(null);

const purgeFieldKeysText = ref('');
const purgeUpdatedAfter = ref('');
const purgeDryRun = ref(true);
const purgeConfirmText = ref('');
const purgeRunning = ref(false);
const purgeResult = ref(null);

const providerListFile = ref(null);
const providerBulkRunning = ref(false);
const providerBulkResult = ref(null);

const fieldOptionsFor = (fieldKey) => {
  const f = searchableFields.value.find((x) => x.fieldKey === fieldKey);
  return Array.isArray(f?.options) ? f.options : [];
};

const addFilter = () => {
  filters.value.push({ fieldKey: '', op: 'hasOption', value: '' });
};
const removeFilter = (idx) => {
  filters.value.splice(idx, 1);
};

const userProfileLink = (userId) => {
  const org = route.params.organizationSlug;
  return org ? `/${org}/admin/users/${userId}` : `/admin/users/${userId}`;
};

const loadSearchableFields = async () => {
  // Use canonical user-info field definitions (spec-driven). No provider_* gating.
  const r = await api.get('/user-info-fields');
  const defs = Array.isArray(r.data) ? r.data : [];
  searchableFields.value = defs
    .map((d) => ({
      fieldKey: d.field_key,
      fieldLabel: d.field_label || d.field_key,
      fieldType: d.field_type || 'text',
      options: (() => {
        if (!d.options) return null;
        if (Array.isArray(d.options)) return d.options;
        try { return JSON.parse(d.options); } catch { return null; }
      })()
    }))
    .sort((a, b) => String(a.fieldLabel).localeCompare(String(b.fieldLabel)));
};

const rebuildIndex = async () => {
  if (!agencyId.value) return;
  try {
    rebuilding.value = true;
    error.value = '';
    await api.post('/provider-search/rebuild', { agencyId: agencyId.value });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to rebuild index';
  } finally {
    rebuilding.value = false;
  }
};

const runSearch = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    ensureBachelorsFilter();
    const payload = {
      agencyId: agencyId.value,
      textQuery: textQuery.value || '',
      filters: filters.value.filter((f) => f.fieldKey && f.op && String(f.value || '').trim())
    };
    const r = await api.post('/provider-search/search', payload);
    results.value = r.data?.users || [];
    total.value = Number(r.data?.total || 0);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Search failed';
    results.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const compileAi = async () => {
  if (!agencyId.value) return;
  try {
    compilingAi.value = true;
    error.value = '';
    aiExplanation.value = '';
    const r = await api.post('/provider-search/compile', {
      agencyId: agencyId.value,
      queryText: aiQuery.value,
      allowedFields: searchableFields.value
    });
    filters.value = Array.isArray(r.data?.filters) ? r.data.filters : [];
    ensureBachelorsFilter();
    aiExplanation.value = r.data?.explanation || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'AI compile failed';
  } finally {
    compilingAi.value = false;
  }
};

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  agencyId.value = current?.id || (userAgencies.value?.[0]?.id || null);
  if (!agencyId.value && userAgencies.value?.length) agencyId.value = userAgencies.value[0].id;
  await loadSearchableFields();
  if (filters.value.length === 0) addFilter();
});

const onFileChange = (e) => {
  importFile.value = e?.target?.files?.[0] || null;
  importPreview.value = null;
  importResult.value = null;
  importMapping.value = {};
  matchMode.value = 'name';
  matchEmailColumn.value = '';
  matchFirstNameColumn.value = '';
  matchLastNameColumn.value = '';
  matchDobColumn.value = '';
};

const previewImport = async () => {
  if (!importFile.value) return;
  try {
    previewingImport.value = true;
    error.value = '';
    importResult.value = null;
    const fd = new FormData();
    fd.append('file', importFile.value);
    const r = await api.post('/provider-import/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    importPreview.value = r.data;
    // Sensible default: most sheets have login email in `email_address`.
    const headers = Array.isArray(r.data?.headers) ? r.data.headers : [];
    if (headers.includes('first_name') && headers.includes('last_name')) {
      matchMode.value = 'name';
      matchFirstNameColumn.value = 'first_name';
      matchLastNameColumn.value = 'last_name';
      if (headers.includes('date_of_birth')) matchDobColumn.value = 'date_of_birth';
    } else if (headers.includes('email_address') || headers.includes('personal_email')) {
      matchMode.value = 'email';
      matchEmailColumn.value = headers.includes('email_address') ? 'email_address' : 'personal_email';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import preview failed';
  } finally {
    previewingImport.value = false;
  }
};

const canRunImport = computed(() => {
  if (!importPreview.value) return false;
  if (matchMode.value === 'email') return !!matchEmailColumn.value;
  return !!matchFirstNameColumn.value && !!matchLastNameColumn.value;
});

const autoMapExactHeaders = () => {
  const headers = Array.isArray(importPreview.value?.headers) ? importPreview.value.headers : [];
  if (!headers.length) return;
  const headerSet = new Set(headers.map((h) => String(h || '').trim()));
  const next = { ...(importMapping.value || {}) };
  // If your sheet headers are canonical field_keys (as in your example), this maps everything in one click.
  (searchableFields.value || []).forEach((fd) => {
    const key = String(fd?.fieldKey || '').trim();
    if (!key) return;
    if (headerSet.has(key)) next[key] = key;
  });
  importMapping.value = next;
};

const runImport = async () => {
  if (!importFile.value || !agencyId.value) return;
  try {
    importing.value = true;
    error.value = '';
    const mapping = importMapping.value || {};
    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('agencyId', String(agencyId.value));
    fd.append('matchMode', String(matchMode.value || 'email'));
    fd.append('matchEmailColumn', String(matchEmailColumn.value || ''));
    fd.append('matchFirstNameColumn', String(matchFirstNameColumn.value || ''));
    fd.append('matchLastNameColumn', String(matchLastNameColumn.value || ''));
    fd.append('matchDobColumn', String(matchDobColumn.value || ''));
    fd.append('dryRun', dryRun.value ? 'true' : 'false');
    fd.append('mapping', JSON.stringify(mapping));
    const r = await api.post('/provider-import/apply', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    importResult.value = r.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    importing.value = false;
  }
};

const runKvPaste = async () => {
  if (!agencyId.value) return;
  try {
    kvRunning.value = true;
    error.value = '';
    kvResult.value = null;
    const r = await api.post('/provider-import/kv-paste', {
      agencyId: agencyId.value,
      personalEmail: kvPersonalEmail.value,
      kvText: kvText.value
    });
    kvResult.value = r.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Paste import failed';
  } finally {
    kvRunning.value = false;
  }
};

const runPurge = async () => {
  if (!agencyId.value) return;
  try {
    purgeRunning.value = true;
    error.value = '';
    purgeResult.value = null;
    const fieldKeys = purgeFieldKeysText.value
      .split(/\r?\n/)
      .map((l) => String(l || '').trim())
      .filter(Boolean);
    const updatedAfter = purgeUpdatedAfter.value ? purgeUpdatedAfter.value : null;
    const r = await api.post('/provider-import/purge', {
      agencyId: agencyId.value,
      fieldKeys,
      updatedAfter,
      dryRun: purgeDryRun.value,
      confirmText: purgeConfirmText.value
    });
    purgeResult.value = r.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Purge failed';
  } finally {
    purgeRunning.value = false;
  }
};

const onProviderListFileChange = (e) => {
  providerListFile.value = e?.target?.files?.[0] || null;
  providerBulkResult.value = null;
};

const runProviderBulkCreate = async () => {
  if (!providerListFile.value || !agencyId.value) return;
  try {
    providerBulkRunning.value = true;
    error.value = '';
    const fd = new FormData();
    fd.append('file', providerListFile.value);
    fd.append('agencyId', String(agencyId.value));
    const r = await api.post('/provider-import/bulk-create', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    providerBulkResult.value = r.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Provider import failed';
  } finally {
    providerBulkRunning.value = false;
  }
};
</script>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th, .table td {
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.right {
  text-align: right;
}
.field-row {
  display: grid;
}
.field label {
  display: block;
  font-weight: 700;
  margin-bottom: 4px;
}
.field input, .field select {
  width: 100%;
}
</style>

