<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/admin')" class="back-link">← Back to Admin</router-link>
        <h1>Note Aid</h1>
        <p class="subtitle">Paste or dictate text, run an AI tool, then copy or save the result.</p>
      </div>
    </div>

    <div class="content-card">
      <div v-if="!currentAgencyId" class="empty-state">
        <strong>Select an agency</strong>
        <div class="muted">Note Aid is enabled/disabled per agency. Switch to an agency context first.</div>
      </div>

      <div v-else-if="!noteAidEnabled" class="empty-state">
        <strong>Note Aid is disabled for this agency</strong>
        <div class="muted">A super admin can enable it under Settings → Agencies → Feature toggles.</div>
      </div>

      <template v-else>
        <div class="row">
          <div class="col">
            <label class="label">Tool</label>
            <input v-model="toolSearch" type="text" class="input" placeholder="Search tools…" />
            <select v-model="selectedToolId" class="input" style="margin-top: 10px;">
              <option value="" disabled>Select a tool</option>
              <option v-for="t in filteredTools" :key="t.id" :value="t.id">
                {{ t.category }} — {{ t.name }}
              </option>
            </select>
            <small v-if="selectedTool" class="hint">{{ selectedTool.description }}</small>
          </div>

          <div class="col">
            <label class="label">Input</label>
            <textarea v-model="inputText" class="textarea" rows="10" placeholder="Paste or dictate here…" />
            <div class="actions">
              <button class="btn btn-secondary" type="button" :disabled="!speechSupported" @click="toggleDictation">
                {{ dictating ? 'Stop dictation' : 'Dictate' }}
              </button>
              <button class="btn btn-primary" type="button" :disabled="runDisabled" @click="runTool">
                {{ running ? 'Running…' : 'Run tool' }}
              </button>
            </div>
            <small v-if="!speechSupported" class="hint">Dictation is not supported in this browser.</small>
            <small v-if="runError" class="error">{{ runError }}</small>
          </div>
        </div>

        <div style="margin-top: 18px;">
          <label class="label">Output</label>
          <textarea v-model="outputText" class="textarea" rows="10" readonly placeholder="Output will appear here…" />
          <div class="actions">
            <button class="btn btn-secondary" type="button" :disabled="!outputText" @click="copyOutput">
              Copy output
            </button>
            <span v-if="copied" class="hint" style="margin-left: 10px;">Copied.</span>
          </div>
        </div>

        <div class="divider" />

        <div>
          <h3 class="h3">Save to Client Note (encrypted)</h3>
          <p class="muted">
            This will save the current output into the client’s notes thread using the existing encrypted notes system.
          </p>

          <div class="row">
            <div class="col">
              <label class="label">Find client</label>
              <div class="actions" style="gap: 8px;">
                <input v-model="clientSearch" type="text" class="input" placeholder="Search by initials / name / id…" />
                <button class="btn btn-secondary" type="button" :disabled="clientsLoading" @click="searchClients">
                  {{ clientsLoading ? 'Searching…' : 'Search' }}
                </button>
              </div>
              <select v-model="selectedClientId" class="input" style="margin-top: 10px;">
                <option value="">Select a client</option>
                <option v-for="c in clientResults" :key="c.id" :value="String(c.id)">
                  #{{ c.id }} — {{ c.initials || 'Client' }} ({{ c.status || 'active' }})
                </option>
              </select>
              <small v-if="clientsError" class="error">{{ clientsError }}</small>
            </div>

            <div class="col">
              <label class="label">Note settings</label>
              <div class="row" style="gap: 12px;">
                <div class="col" style="min-width: 220px;">
                  <label class="label sub">Category</label>
                  <select v-model="noteCategory" class="input">
                    <option value="general">General</option>
                    <option value="status">Status</option>
                    <option value="administrative">Administrative</option>
                    <option value="billing">Billing</option>
                    <option value="clinical">Clinical</option>
                  </select>
                </div>
                <div class="col" style="min-width: 220px;">
                  <label class="label sub">Urgency</label>
                  <select v-model="noteUrgency" class="input">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <label class="checkbox" style="margin-top: 10px;">
                <input v-model="noteInternalOnly" type="checkbox" />
                <span>Internal only</span>
              </label>

              <div class="actions">
                <button class="btn btn-primary" type="button" :disabled="saveDisabled" @click="saveToClientNote">
                  {{ saving ? 'Saving…' : 'Save output to client note' }}
                </button>
              </div>
              <small v-if="saveError" class="error">{{ saveError }}</small>
              <small v-if="saveSuccess" class="hint">{{ saveSuccess }}</small>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const route = useRoute();

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};

const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const noteAidEnabled = computed(() => isTruthyFlag(parseFeatureFlags(agencyStore.currentAgency?.feature_flags)?.noteAidEnabled));

// Tools
const tools = ref([]);
const toolSearch = ref('');
const selectedToolId = ref('');

const filteredTools = computed(() => {
  const q = String(toolSearch.value || '').trim().toLowerCase();
  const list = Array.isArray(tools.value) ? tools.value : [];
  if (!q) return list;
  return list.filter((t) => {
    const hay = `${t?.name || ''} ${t?.description || ''} ${t?.category || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const selectedTool = computed(() => {
  const id = String(selectedToolId.value || '');
  return (tools.value || []).find((t) => String(t?.id || '') === id) || null;
});

// Run tool
const inputText = ref('');
const outputText = ref('');
const running = ref(false);
const runError = ref('');
const copied = ref(false);

const runDisabled = computed(() => {
  if (running.value) return true;
  if (!noteAidEnabled.value) return true;
  if (!currentAgencyId.value) return true;
  if (!selectedToolId.value) return true;
  if (!String(inputText.value || '').trim()) return true;
  return false;
});

const runTool = async () => {
  if (runDisabled.value) return;
  try {
    running.value = true;
    runError.value = '';
    copied.value = false;
    const res = await api.post('/note-aid/execute', {
      agencyId: currentAgencyId.value,
      toolId: selectedToolId.value,
      inputText: String(inputText.value || '')
    });
    outputText.value = String(res?.data?.outputText || '');
  } catch (e) {
    runError.value = e.response?.data?.error?.message || 'Failed to run tool';
  } finally {
    running.value = false;
  }
};

const copyOutput = async () => {
  try {
    const text = String(outputText.value || '');
    if (!text) return;
    copied.value = false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    // ignore
  }
};

// Dictation (browser speech-to-text; no audio upload)
const dictating = ref(false);
let recognition = null;
const speechSupported = computed(() => {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
});

const toggleDictation = () => {
  if (!speechSupported.value) return;
  if (dictating.value) {
    try {
      recognition?.stop?.();
    } catch {
      // ignore
    }
    dictating.value = false;
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    try {
      const r = event?.results?.[event.results.length - 1];
      const t = r?.[0]?.transcript || '';
      if (t) {
        const prev = String(inputText.value || '');
        inputText.value = prev ? `${prev}\n${t}` : t;
      }
    } catch {
      // ignore
    }
  };
  recognition.onerror = () => {
    dictating.value = false;
  };
  recognition.onend = () => {
    dictating.value = false;
  };
  try {
    dictating.value = true;
    recognition.start();
  } catch {
    dictating.value = false;
  }
};

// Save to client note (encrypted system)
const clientSearch = ref('');
const clientsLoading = ref(false);
const clientsError = ref('');
const clientResults = ref([]);
const selectedClientId = ref('');

const noteCategory = ref('general');
const noteUrgency = ref('low');
const noteInternalOnly = ref(false);
const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref('');

const saveDisabled = computed(() => {
  if (saving.value) return true;
  if (!String(outputText.value || '').trim()) return true;
  if (!String(selectedClientId.value || '').trim()) return true;
  return false;
});

const searchClients = async () => {
  if (!currentAgencyId.value) return;
  try {
    clientsLoading.value = true;
    clientsError.value = '';
    clientResults.value = [];
    const res = await api.get('/clients', {
      params: {
        agency_id: currentAgencyId.value,
        search: String(clientSearch.value || '').trim()
      }
    });
    const list = Array.isArray(res.data) ? res.data : [];
    clientResults.value = list.slice(0, 50);
  } catch (e) {
    clientsError.value = e.response?.data?.error?.message || 'Failed to search clients';
    clientResults.value = [];
  } finally {
    clientsLoading.value = false;
  }
};

const saveToClientNote = async () => {
  if (saveDisabled.value) return;
  try {
    saving.value = true;
    saveError.value = '';
    saveSuccess.value = '';
    const clientId = String(selectedClientId.value || '').trim();
    await api.post(`/clients/${clientId}/notes`, {
      message: String(outputText.value || ''),
      category: String(noteCategory.value || 'general'),
      urgency: String(noteUrgency.value || 'low'),
      is_internal_only: noteInternalOnly.value === true
    });
    saveSuccess.value = 'Saved to client notes.';
    window.setTimeout(() => (saveSuccess.value = ''), 2500);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save note';
  } finally {
    saving.value = false;
  }
};

const loadTools = async () => {
  if (!currentAgencyId.value) return;
  if (!noteAidEnabled.value) return;
  try {
    const res = await api.get('/note-aid/tools', { params: { agencyId: currentAgencyId.value } });
    tools.value = Array.isArray(res?.data?.tools) ? res.data.tools : [];
  } catch {
    tools.value = [];
  }
};

onMounted(async () => {
  await loadTools();
});

watch([currentAgencyId, noteAidEnabled], async () => {
  tools.value = [];
  selectedToolId.value = '';
  toolSearch.value = '';
  runError.value = '';
  await loadTools();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.back-link {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--text-secondary);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.subtitle {
  margin: 6px 0 0 0;
  color: var(--text-secondary);
}

.content-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.row {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.col {
  flex: 1;
  min-width: 320px;
}

.label {
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.label.sub {
  font-weight: 600;
  margin-bottom: 6px;
}

.input,
.textarea,
select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg);
  color: var(--text-primary);
}

.textarea {
  resize: vertical;
}

.hint {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
}

.error {
  display: block;
  margin-top: 10px;
  color: #b42318;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  align-items: center;
  flex-wrap: wrap;
}

/* Keep Note Aid controls compact if global .btn changes. */
.content-card .btn {
  width: auto;
  min-width: 0;
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.2;
}

.content-card .btn.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 18px 0;
}

.h3 {
  margin: 0 0 6px 0;
}

.checkbox {
  display: flex;
  gap: 10px;
  align-items: center;
  user-select: none;
  color: var(--text-primary);
}

.empty-state {
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
}
</style>

