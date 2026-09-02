<template>
  <div class="na-catalog-settings">
    <header class="na-catalog-head">
      <h2>Note Aid catalog</h2>
      <p>
        Manage Note Aids for <strong>this organization only</strong>. Enable built-in tools, add custom
        writers (e.g. tutoring) with your own instructions, attach PDF/TXT reference materials, and
        limit who can use each aid — everyone with access, or only specific people.
      </p>
    </header>

    <p v-if="!agencyId" class="na-catalog-warn">Select an organization to manage Note Aids.</p>
    <p v-if="loadError" class="na-catalog-err">{{ loadError }}</p>
    <p v-if="saveMessage" class="na-catalog-ok">{{ saveMessage }}</p>

    <section v-if="agencyId" class="na-catalog-section">
      <h3>Built-in aids</h3>
      <div v-for="aid in builtInAids" :key="aid.id" class="na-catalog-row">
        <div class="na-catalog-main">
          <label class="na-catalog-enable">
            <input
              type="checkbox"
              :checked="isEnabled(aid.id, aid.disabledByDefault)"
              @change="toggleEnabled(aid, $event.target.checked)"
            />
            <span>{{ aid.label }}</span>
          </label>
          <small>{{ aid.categoryLabel }}{{ aid.serviceCode ? ` · ${aid.serviceCode}` : '' }}</small>
        </div>
        <div class="na-catalog-flags">
          <label>
            <input
              type="checkbox"
              :checked="attachSession(aid.id)"
              @change="setAttach(aid, 'session', $event.target.checked)"
            />
            Session
          </label>
          <label>
            <input
              type="checkbox"
              :checked="attachClaim(aid.id)"
              @change="setAttach(aid, 'claim', $event.target.checked)"
            />
            Claim
          </label>
          <button type="button" class="na-catalog-people-btn" @click="openPeople(aid.id, null, aid.label)">
            Who can use
          </button>
        </div>
      </div>
    </section>

    <section v-if="agencyId" class="na-catalog-section">
      <div class="na-catalog-section-head">
        <h3>Custom aids (this tenant)</h3>
        <button type="button" class="na-catalog-add" @click="showCustomForm = !showCustomForm">
          {{ showCustomForm ? 'Cancel' : 'Add custom aid' }}
        </button>
      </div>

      <form v-if="showCustomForm" class="na-catalog-form" @submit.prevent="createCustom">
        <label>Title <input v-model="customForm.title" required maxlength="255" placeholder="e.g. Tutoring progress note" /></label>
        <label>Service code <input v-model="customForm.serviceCode" maxlength="16" placeholder="optional" /></label>
        <label>Short guidance (shown in the library) <textarea v-model="customForm.guidance" rows="2" /></label>
        <label>
          Writing instructions / training
          <textarea
            v-model="customForm.systemPrompt"
            rows="5"
            placeholder="Paste the full directions the AI should follow when writing this note…"
          />
        </label>
        <label>
          Extra learning notes
          <textarea v-model="customForm.trainingNotes" rows="3" placeholder="Optional tone, examples, or constraints…" />
        </label>
        <label>
          Reference folder name
          <input
            v-model="customForm.kbFolder"
            maxlength="96"
            placeholder="auto from title if blank (e.g. tutoring_aid)"
          />
          <small class="hint">PDF/TXT uploads for this aid go into this knowledge-base folder.</small>
        </label>
        <label class="na-catalog-inline">
          <input v-model="customForm.attachableToSession" type="checkbox" /> Attachable to session
        </label>
        <label class="na-catalog-inline">
          <input v-model="customForm.attachableToClaim" type="checkbox" /> Attachable to billing claim
        </label>
        <button type="submit" :disabled="saving">Save custom aid</button>
      </form>

      <div v-for="row in customAids" :key="row.id" class="na-catalog-card">
        <div class="na-catalog-row">
          <div class="na-catalog-main">
            <strong>{{ row.title }}</strong>
            <small>
              {{ row.service_code || 'No code' }}
              <template v-if="(row.kbFolders || []).length">
                · refs: {{ (row.kbFolders || []).join(', ') }}
              </template>
            </small>
          </div>
          <div class="na-catalog-flags">
            <label>
              <input
                type="checkbox"
                :checked="!!row.enabled"
                @change="toggleCustomEnabled(row, $event.target.checked)"
              />
              Enabled
            </label>
            <button type="button" class="na-catalog-people-btn" @click="openPeople(null, row.id, row.title)">
              Who can use
            </button>
          </div>
        </div>
        <div class="na-catalog-refs">
          <div class="na-catalog-upload-row">
            <input
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              @change="onPickRefFile(row, $event)"
            />
            <button
              type="button"
              class="na-catalog-add"
              :disabled="uploadingAidId === row.id"
              @click="uploadReference(row)"
            >
              {{ uploadingAidId === row.id ? 'Uploading…' : 'Upload PDF/TXT reference' }}
            </button>
          </div>
          <small class="hint">
            Uploads to folder
            <code>{{ primaryFolder(row) }}</code>
            (same Note Aid knowledge base used for learning materials).
          </small>
        </div>
      </div>
      <p v-if="!customAids.length && !showCustomForm" class="na-catalog-empty">No custom aids yet.</p>
    </section>

    <div v-if="peopleOpen" class="na-catalog-modal" @click.self="peopleOpen = false">
      <div class="na-catalog-modal-card">
        <h3>Who can use — {{ peopleTitle }}</h3>
        <p class="hint">
          Scoped to this tenant. Leave everyone unchecked to allow all providers who otherwise have
          Note Aid access. Check specific people to limit the aid to only those users.
        </p>
        <input v-model="peopleFilter" class="na-catalog-search" placeholder="Filter people…" />
        <ul class="na-catalog-assign-list">
          <li v-for="u in filteredAgencyUsers" :key="u.id">
            <label class="na-catalog-inline">
              <input
                type="checkbox"
                :checked="isUserAssigned(u.id)"
                @change="toggleUserAssignment(u, $event.target.checked)"
              />
              <span>{{ userLabel(u) }}</span>
            </label>
          </li>
        </ul>
        <p v-if="!filteredAgencyUsers.length" class="na-catalog-empty">No users found for this organization.</p>
        <button type="button" class="na-catalog-close" @click="peopleOpen = false">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { listBuiltInNoteAids } from '../../config/noteAidWorkspace.js';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgencyId || agencyStore.selectedAgencyId || 0) || null);

const builtInAids = listBuiltInNoteAids();
const settings = ref([]);
const customAids = ref([]);
const assignments = ref([]);
const agencyUsers = ref([]);
const loadError = ref('');
const saveMessage = ref('');
const saving = ref(false);
const showCustomForm = ref(false);
const peopleOpen = ref(false);
const peopleCatalogAidId = ref(null);
const peopleCustomAidId = ref(null);
const peopleTitle = ref('');
const peopleFilter = ref('');
const uploadingAidId = ref(null);
const pendingFiles = reactive({});

const customForm = reactive({
  title: '',
  serviceCode: '',
  guidance: '',
  systemPrompt: '',
  trainingNotes: '',
  kbFolder: '',
  attachableToSession: false,
  attachableToClaim: false
});

const settingsById = computed(() => {
  const m = new Map();
  for (const s of settings.value || []) m.set(String(s.catalog_aid_id), s);
  return m;
});

function slugFolder(title) {
  return String(title || 'custom_aid')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'custom_aid';
}

function primaryFolder(row) {
  const folders = row.kbFolders || [];
  if (folders.length) return folders[0];
  return `custom_aid_${row.id}`;
}

function isEnabled(aidId, disabledByDefault = false) {
  const s = settingsById.value.get(String(aidId));
  if (s) return !!(s.enabled === true || s.enabled === 1 || s.enabled === '1');
  return !disabledByDefault;
}

function attachSession(aidId) {
  const s = settingsById.value.get(String(aidId));
  if (s?.attachable_to_session == null) return true;
  return !!(s.attachable_to_session === true || s.attachable_to_session === 1);
}

function attachClaim(aidId) {
  const s = settingsById.value.get(String(aidId));
  if (s?.attachable_to_claim == null) return true;
  return !!(s.attachable_to_claim === true || s.attachable_to_claim === 1);
}

async function load() {
  loadError.value = '';
  saveMessage.value = '';
  if (!agencyId.value) {
    settings.value = [];
    customAids.value = [];
    assignments.value = [];
    agencyUsers.value = [];
    return;
  }
  try {
    const [catalogRes, usersRes] = await Promise.all([
      api.get('/note-aid/catalog/admin', {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      }),
      api.get('/note-aid/catalog/users', {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      }).catch(() => ({ data: null }))
    ]);
    settings.value = catalogRes?.data?.settings || [];
    customAids.value = catalogRes?.data?.customAids || [];
    assignments.value = catalogRes?.data?.assignments || [];
    agencyUsers.value = usersRes?.data?.users || [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load catalog';
  }
}

watch(agencyId, () => { load(); }, { immediate: true });

async function upsertSetting(catalogAidId, patch) {
  saving.value = true;
  saveMessage.value = '';
  try {
    await api.post('/note-aid/catalog/settings', {
      agencyId: agencyId.value,
      catalogAidId,
      ...patch
    }, { skipGlobalLoading: true });
    await load();
    saveMessage.value = 'Saved.';
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

function toggleEnabled(aid, enabled) {
  upsertSetting(aid.id, {
    enabled,
    attachableToSession: attachSession(aid.id),
    attachableToClaim: attachClaim(aid.id)
  });
}

function setAttach(aid, kind, value) {
  upsertSetting(aid.id, {
    enabled: isEnabled(aid.id, aid.disabledByDefault),
    attachableToSession: kind === 'session' ? value : attachSession(aid.id),
    attachableToClaim: kind === 'claim' ? value : attachClaim(aid.id)
  });
}

async function createCustom() {
  if (!customForm.title.trim()) return;
  saving.value = true;
  try {
    const folder = (customForm.kbFolder || slugFolder(customForm.title)).trim();
    await api.post('/note-aid/catalog/custom', {
      agencyId: agencyId.value,
      title: customForm.title.trim(),
      serviceCode: customForm.serviceCode || null,
      guidance: customForm.guidance || null,
      systemPrompt: customForm.systemPrompt || null,
      trainingNotes: customForm.trainingNotes || null,
      kbFolders: folder ? [folder] : [],
      attachableToSession: !!customForm.attachableToSession,
      attachableToClaim: !!customForm.attachableToClaim,
      enabled: true
    }, { skipGlobalLoading: true });
    customForm.title = '';
    customForm.serviceCode = '';
    customForm.guidance = '';
    customForm.systemPrompt = '';
    customForm.trainingNotes = '';
    customForm.kbFolder = '';
    customForm.attachableToSession = false;
    customForm.attachableToClaim = false;
    showCustomForm.value = false;
    await load();
    saveMessage.value = 'Custom aid created for this organization.';
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Create failed';
  } finally {
    saving.value = false;
  }
}

async function toggleCustomEnabled(row, enabled) {
  saving.value = true;
  try {
    await api.patch(`/note-aid/catalog/custom/${row.id}`, {
      agencyId: agencyId.value,
      enabled
    }, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Update failed';
  } finally {
    saving.value = false;
  }
}

function onPickRefFile(row, event) {
  const file = event?.target?.files?.[0] || null;
  pendingFiles[row.id] = file;
}

async function uploadReference(row) {
  const file = pendingFiles[row.id];
  if (!file) {
    loadError.value = 'Choose a PDF or TXT file first.';
    return;
  }
  uploadingAidId.value = row.id;
  saveMessage.value = '';
  loadError.value = '';
  try {
    const folder = primaryFolder(row);
    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('folder', folder);
    fd.append('file', file);
    await api.post('/note-aid/settings/upload', fd, { skipGlobalLoading: true });
    const folders = [...new Set([...(row.kbFolders || []), folder])];
    await api.patch(`/note-aid/catalog/custom/${row.id}`, {
      agencyId: agencyId.value,
      kbFolders: folders
    }, { skipGlobalLoading: true });
    pendingFiles[row.id] = null;
    await load();
    saveMessage.value = `Uploaded reference to ${folder}.`;
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Upload failed';
  } finally {
    uploadingAidId.value = null;
  }
}

function openPeople(catalogAidId, customAidId, title) {
  peopleCatalogAidId.value = catalogAidId;
  peopleCustomAidId.value = customAidId;
  peopleTitle.value = title || 'Note Aid';
  peopleFilter.value = '';
  peopleOpen.value = true;
}

const activeAssignments = computed(() => {
  return (assignments.value || []).filter((a) => {
    if (peopleCatalogAidId.value) return String(a.catalog_aid_id) === String(peopleCatalogAidId.value) && !!a.is_enabled;
    if (peopleCustomAidId.value) return Number(a.custom_aid_id) === Number(peopleCustomAidId.value) && !!a.is_enabled;
    return false;
  });
});

const assignedUserIds = computed(() => new Set(activeAssignments.value.map((a) => Number(a.user_id))));

function isUserAssigned(userId) {
  return assignedUserIds.value.has(Number(userId));
}

const filteredAgencyUsers = computed(() => {
  const q = String(peopleFilter.value || '').trim().toLowerCase();
  const list = [...(agencyUsers.value || [])].sort((a, b) => {
    const an = userLabel(a).toLowerCase();
    const bn = userLabel(b).toLowerCase();
    return an.localeCompare(bn);
  });
  if (!q) return list;
  return list.filter((u) => userLabel(u).toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q));
});

function userLabel(u) {
  const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email || `User #${u.id}`;
}

async function toggleUserAssignment(user, enabled) {
  try {
    await api.post('/note-aid/catalog/assignments', {
      agencyId: agencyId.value,
      userId: user.id,
      catalogAidId: peopleCatalogAidId.value || null,
      customAidId: peopleCustomAidId.value || null,
      isEnabled: !!enabled
    }, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Assignment failed';
  }
}
</script>

<style scoped>
.na-catalog-settings { max-width: 920px; }
.na-catalog-head h2 { margin: 0 0 0.35rem; font-size: 1.25rem; }
.na-catalog-head p { margin: 0 0 1rem; color: #4b5563; line-height: 1.45; }
.na-catalog-section { margin-bottom: 1.5rem; }
.na-catalog-section h3 { margin: 0 0 0.75rem; font-size: 1rem; }
.na-catalog-section-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.na-catalog-row {
  display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between;
  padding: 0.65rem 0;
}
.na-catalog-card {
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.65rem;
}
.na-catalog-main { display: flex; flex-direction: column; gap: 0.15rem; min-width: 240px; }
.na-catalog-main small { color: #6b7280; }
.na-catalog-enable { display: flex; gap: 0.5rem; align-items: flex-start; font-weight: 600; }
.na-catalog-flags { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.na-catalog-people-btn, .na-catalog-add, .na-catalog-form button, .na-catalog-close {
  border: 1px solid #d1d5db; background: #fff; border-radius: 6px; padding: 0.35rem 0.65rem; cursor: pointer;
}
.na-catalog-form { display: grid; gap: 0.65rem; margin-bottom: 1rem; padding: 0.85rem; background: #f9fafb; border-radius: 8px; }
.na-catalog-form label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
.na-catalog-form input, .na-catalog-form textarea, .na-catalog-search {
  border: 1px solid #d1d5db; border-radius: 6px; padding: 0.4rem 0.55rem;
}
.na-catalog-inline { display: flex !important; align-items: center; gap: 0.4rem; }
.na-catalog-warn, .na-catalog-err { color: #b91c1c; }
.na-catalog-ok { color: #047857; }
.na-catalog-empty { color: #6b7280; }
.na-catalog-refs { margin-top: 0.35rem; padding-top: 0.45rem; border-top: 1px dashed #e5e7eb; }
.na-catalog-upload-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.na-catalog-modal {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: grid; place-items: center; z-index: 80;
}
.na-catalog-modal-card {
  width: min(520px, 92vw); max-height: 80vh; overflow: auto; background: #fff; border-radius: 10px;
  padding: 1rem 1.1rem; display: grid; gap: 0.75rem;
}
.na-catalog-assign-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
.hint { color: #6b7280; font-size: 0.85rem; margin: 0; }
code { font-size: 0.8rem; }
</style>
