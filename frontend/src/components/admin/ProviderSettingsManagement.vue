<template>
  <div class="wrap">
    <div class="header-row">
      <div>
        <h2 style="margin:0;">Provider Settings</h2>
        <p class="hint">Manage provider credentials and default insurance eligibility rules.</p>
      </div>
      <div class="agency-pill" v-if="currentAgencyName">
        {{ currentAgencyName }}
      </div>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>
    <div v-if="loading" class="loading">Loading…</div>

    <div v-else class="grid">
      <div class="panel">
        <h3 style="margin-top:0;">Credentials</h3>
        <div class="add-row">
          <input v-model="newCredential.display_name" placeholder="New credential (e.g., LPC)" />
          <input v-model="newCredential.description" placeholder="Description (optional)" />
          <button class="btn btn-primary" type="button" @click="createCredential" :disabled="saving || !newCredential.display_name">
            Add
          </button>
        </div>
        <div class="table">
          <div class="thead">
            <div>Name</div>
            <div>Description</div>
            <div style="text-align:center;">Active</div>
            <div></div>
          </div>
          <div v-for="c in credentials" :key="c.id" class="trow">
            <div><input v-model="c.display_name" /></div>
            <div><input v-model="c.description" placeholder="(none)" /></div>
            <div style="text-align:center;"><input type="checkbox" v-model="c.is_active" /></div>
            <div style="text-align:right;">
              <button class="btn btn-secondary" type="button" @click="saveCredential(c)" :disabled="saving">Save</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="rules-header">
          <h3 style="margin:0;">Credential → Insurance Rules</h3>
          <button class="btn btn-primary" type="button" @click="saveRules" :disabled="saving">Save Rules</button>
        </div>
        <p class="hint" style="margin-top:8px;">
          Tricare is handled as a provider override; keep defaults focused on Medicaid/Commercial/Self Pay.
        </p>

        <div class="rules-table" v-if="credentials.length && insurances.length">
          <div class="rules-row rules-head">
            <div class="cell cred">Credential</div>
            <div v-for="ins in insurances" :key="ins.id" class="cell">
              {{ ins.display_name }}
            </div>
          </div>
          <div v-for="cred in credentials" :key="cred.id" class="rules-row">
            <div class="cell cred">{{ cred.display_name }}</div>
            <div v-for="ins in insurances" :key="ins.id" class="cell">
              <input type="checkbox" v-model="matrix[cred.id][ins.id]" />
            </div>
          </div>
        </div>
        <div v-else class="loading">Add at least one credential and one insurance option to edit rules.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const credentials = ref([]);
const insurances = ref([]);
const rules = ref([]);
const matrix = ref({});

const newCredential = ref({ display_name: '', description: '' });

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const currentAgencyName = computed(() => agencyStore.currentAgency?.name || '');

function buildMatrix() {
  const m = {};
  for (const c of credentials.value) {
    m[c.id] = {};
    for (const ins of insurances.value) {
      m[c.id][ins.id] = false;
    }
  }
  for (const r of rules.value) {
    if (m[r.credential_id] && m[r.credential_id][r.insurance_id] !== undefined) {
      m[r.credential_id][r.insurance_id] = !!r.is_allowed;
    }
  }
  matrix.value = m;
}

const load = async () => {
  if (!currentAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const creds = await api.get(`/settings-catalogs/${currentAgencyId.value}/provider_credentials`);
    credentials.value = (creds.data || []).map(r => ({ ...r, is_active: !!r.is_active }));

    const ins = await api.get(`/settings-catalogs/${currentAgencyId.value}/insurances`);
    insurances.value = (ins.data || []).map(r => ({ ...r, is_active: !!r.is_active }));

    const ruleResp = await api.get(`/settings-catalogs/${currentAgencyId.value}/provider-credential-insurance-rules`);
    rules.value = ruleResp.data?.rules || [];
    // Prefer canonical lists from rule endpoint if present
    if (ruleResp.data?.credentials) {
      credentials.value = ruleResp.data.credentials.map(r => ({ ...r, is_active: !!r.is_active }));
    }
    if (ruleResp.data?.insurances) {
      insurances.value = ruleResp.data.insurances.map(r => ({ ...r, is_active: !!r.is_active }));
    }
    buildMatrix();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to load provider settings';
  } finally {
    loading.value = false;
  }
};

const createCredential = async () => {
  if (!currentAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/settings-catalogs/${currentAgencyId.value}/provider_credentials`, {
      display_name: newCredential.value.display_name,
      description: newCredential.value.description,
      is_active: true
    });
    newCredential.value = { display_name: '', description: '' };
    await load();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to create credential';
  } finally {
    saving.value = false;
  }
};

const saveCredential = async (c) => {
  if (!currentAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.put(`/settings-catalogs/${currentAgencyId.value}/provider_credentials/${c.id}`, {
      display_name: c.display_name,
      description: c.description,
      is_active: !!c.is_active
    });
    await load();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to save credential';
  } finally {
    saving.value = false;
  }
};

const saveRules = async () => {
  if (!currentAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = [];
    for (const cred of credentials.value) {
      for (const ins of insurances.value) {
        payload.push({
          credential_id: cred.id,
          insurance_id: ins.id,
          is_allowed: !!matrix.value?.[cred.id]?.[ins.id]
        });
      }
    }
    await api.put(`/settings-catalogs/${currentAgencyId.value}/provider-credential-insurance-rules`, {
      rules: payload
    });
    await load();
  } catch (e) {
    console.error(e);
    error.value = e.response?.data?.error?.message || 'Failed to save rules';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
watch(currentAgencyId, load);
</script>

<style scoped>
.wrap { width: 100%; }
.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.hint { margin: 6px 0 0; color: var(--text-secondary); }
.agency-pill {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 999px;
  color: var(--text-secondary);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
.panel {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.add-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
input[type="text"], input:not([type]) {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.table { display: grid; gap: 8px; }
.thead, .trow {
  display: grid;
  grid-template-columns: 1fr 2fr 100px 120px;
  gap: 10px;
  align-items: center;
}
.thead {
  font-weight: 700;
  color: var(--text-secondary);
  padding: 0 6px 8px;
}
.trow {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}
.rules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.rules-table {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  margin-top: 12px;
}
.rules-row {
  display: grid;
  grid-template-columns: 220px repeat(auto-fit, minmax(140px, 1fr));
  gap: 0;
  border-bottom: 1px solid var(--border);
}
.rules-row:last-child { border-bottom: none; }
.cell {
  padding: 10px;
  border-right: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}
.cell.cred {
  justify-content: flex-start;
  font-weight: 700;
}
.rules-head .cell {
  background: var(--bg-alt);
  font-weight: 700;
  justify-content: center;
}
.rules-row .cell:last-child { border-right: none; }
.loading { color: var(--text-secondary); }
.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin: 12px 0;
  border: 1px solid #fcc;
}
.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}
.btn-primary {
  background: var(--primary);
  color: white;
}
.btn-secondary {
  background: white;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
</style>

