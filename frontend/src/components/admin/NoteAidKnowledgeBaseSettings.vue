<template>
  <div class="kb-settings">
    <div class="kb-header">
      <div>
        <h2>Note Aid Knowledge Base</h2>
        <p class="muted">Manage KB folders and upload PDFs for Note Aid tools.</p>
      </div>
      <button class="btn btn-primary" :disabled="saving || !canSave" @click="saveSettings">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>

    <div v-if="!noteAidEnabled" class="empty-state">
      <strong>Note Aid is disabled for this agency</strong>
      <div class="muted">Enable Note Aid to manage KB settings.</div>
    </div>

    <div v-else>
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="kb-body">
        <div class="kb-section">
          <h3>Global extra folders</h3>
          <p class="muted">These folders are added to every tool (comma-separated).</p>
          <input v-model="kbExtraFoldersInput" class="input" placeholder="shared, policy_updates, billing_2025" />
        </div>

        <div class="kb-section">
          <h3>H2014 Program options</h3>
          <p class="muted">Additional program labels for agencies without program records.</p>
          <input v-model="programOptionsInput" class="input" placeholder="Skill Builders, After School Program" />
          <small v-if="detectedH2014Programs.length" class="hint">
            Detected H2014 programs: {{ detectedH2014Programs.join(', ') }}
          </small>
        </div>

        <div class="kb-section">
          <h3>Tool folder overrides</h3>
          <p class="muted">Leave blank to use defaults. Comma-separated folder names.</p>
          <div class="kb-tools">
            <div v-for="tool in tools" :key="tool.id" class="kb-tool-card">
              <div class="kb-tool-title">{{ tool.name }}</div>
              <div class="kb-tool-default">
                Default: <span class="mono">{{ (tool.defaultFolders || []).join(', ') || '—' }}</span>
              </div>
              <input
                v-model="folderOverrides[tool.id]"
                class="input"
                :placeholder="tool.defaultFolders?.join(', ') || 'folder1, folder2'"
              />
            </div>
          </div>
        </div>

        <div class="kb-section">
          <h3>Upload PDF/TXT</h3>
          <p class="muted">Upload documents directly into a folder.</p>
          <div class="kb-upload-row">
            <input v-model="uploadFolder" class="input" placeholder="H0031_intake" />
            <input ref="fileInput" type="file" class="input" accept=".pdf,.txt" />
            <button class="btn btn-secondary" :disabled="uploading || !uploadFolder" @click="uploadDocument">
              {{ uploading ? 'Uploading…' : 'Upload' }}
            </button>
          </div>
          <small v-if="uploadSuccess" class="hint">{{ uploadSuccess }}</small>
          <small v-if="uploadError" class="error">{{ uploadError }}</small>
        </div>

        <div v-if="authStore.user?.role === 'super_admin'" class="kb-section">
          <h3>Platform KB files (read-only)</h3>
          <p class="muted">These are the current files in the bucket.</p>
          <div v-if="filesLoading" class="muted">Loading files…</div>
          <div v-else-if="!bucketFiles.length" class="muted">No files found.</div>
          <div v-else class="kb-file-list">
            <div v-for="f in bucketFiles" :key="f.name" class="kb-file-row">
              <div class="kb-file-name">{{ f.name }}</div>
              <div class="kb-file-meta">
                {{ f.contentType || 'unknown' }} · {{ Math.round((f.size || 0) / 1024) }} KB
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const tools = ref([]);
const kbExtraFoldersInput = ref('');
const programOptionsInput = ref('');
const folderOverrides = ref({});
const bucketFiles = ref([]);
const filesLoading = ref(false);
const uploadFolder = ref('');
const uploading = ref(false);
const uploadError = ref('');
const uploadSuccess = ref('');
const fileInput = ref(null);

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};

const noteAidEnabled = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  const v = flags?.noteAidEnabled;
  const s = String(v ?? '').trim().toLowerCase();
  return v === true || v === 1 || s === 'true' || s === '1' || s === 'yes' || s === 'on';
});

const canSave = computed(() => noteAidEnabled.value && !!currentAgencyId.value);

const normalizeFolders = (raw) => {
  return String(raw || '')
    .split(',')
    .map((f) => f.trim().replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean);
};

const isH2014ProgramName = (name) => {
  const s = String(name || '').toLowerCase();
  if (!s) return false;
  return s.includes('pcp') || s.includes('tpt') || s.includes('skill builder') || s.includes('skillbuilder') || s.includes('h2014');
};

const detectedH2014Programs = computed(() => {
  return normalizeFolders(programOptionsInput.value).filter(isH2014ProgramName);
});

const loadSettings = async () => {
  if (!currentAgencyId.value || !noteAidEnabled.value) return;
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/note-aid/settings', { params: { agencyId: currentAgencyId.value } });
    tools.value = Array.isArray(res?.data?.tools) ? res.data.tools : [];
    const extras = Array.isArray(res?.data?.kbExtraFolders) ? res.data.kbExtraFolders : [];
    kbExtraFoldersInput.value = extras.join(', ');
    const programs = Array.isArray(res?.data?.noteAidProgramOptions) ? res.data.noteAidProgramOptions : [];
    programOptionsInput.value = programs.join(', ');
    const overrides = res?.data?.kbFolderOverrides || {};
    const next = {};
    for (const tool of tools.value) {
      const list = Array.isArray(overrides?.[tool.id]) ? overrides[tool.id] : [];
      next[tool.id] = list.join(', ');
    }
    folderOverrides.value = next;
    if (authStore?.user?.role === 'super_admin') {
      await loadFiles();
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load KB settings';
  } finally {
    loading.value = false;
  }
};

const loadFiles = async () => {
  if (!currentAgencyId.value) return;
  try {
    filesLoading.value = true;
    const res = await api.get('/note-aid/settings/files', { params: { agencyId: currentAgencyId.value } });
    bucketFiles.value = Array.isArray(res?.data?.files) ? res.data.files : [];
  } catch {
    bucketFiles.value = [];
  } finally {
    filesLoading.value = false;
  }
};

const saveSettings = async () => {
  if (!canSave.value) return;
  try {
    saving.value = true;
    error.value = '';
    const overrides = {};
    for (const [toolId, raw] of Object.entries(folderOverrides.value || {})) {
      const list = normalizeFolders(raw);
      if (list.length) overrides[toolId] = list;
    }
    const extras = normalizeFolders(kbExtraFoldersInput.value);
    const programs = normalizeFolders(programOptionsInput.value);
    await api.post('/note-aid/settings', {
      agencyId: currentAgencyId.value,
      kbFolderOverrides: overrides,
      kbExtraFolders: extras,
      noteAidProgramOptions: programs
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save KB settings';
  } finally {
    saving.value = false;
  }
};

const uploadDocument = async () => {
  if (!currentAgencyId.value) return;
  const file = fileInput.value?.files?.[0];
  if (!file) {
    uploadError.value = 'Select a file to upload.';
    return;
  }
  try {
    uploading.value = true;
    uploadError.value = '';
    uploadSuccess.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    fd.append('folder', String(uploadFolder.value || '').trim());
    fd.append('file', file, file.name);
    const res = await api.post('/note-aid/settings/upload', fd);
    uploadSuccess.value = `Uploaded to ${res?.data?.path || 'bucket'}`;
    fileInput.value.value = '';
  } catch (e) {
    uploadError.value = e.response?.data?.error?.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

watch(currentAgencyId, () => {
  loadSettings();
});
watch(noteAidEnabled, () => {
  loadSettings();
});

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.kb-settings {
  padding: 12px;
}
.kb-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.kb-section {
  margin-bottom: 20px;
}
.kb-tools {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.kb-tool-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: white;
}
.kb-tool-title {
  font-weight: 700;
  margin-bottom: 6px;
}
.kb-tool-default {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.kb-upload-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: center;
}
.kb-file-list {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  max-height: 360px;
  overflow: auto;
}
.kb-file-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.kb-file-row:last-child {
  border-bottom: none;
}
.kb-file-name {
  font-size: 13px;
}
.kb-file-meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
</style>
