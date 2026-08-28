<template>
  <div class="container mbox-import-page">
    <div class="page-header">
      <div>
        <h1>Staff mailbox import</h1>
        <p class="muted">
          Upload a Google Takeout <code>.mbox</code> into a staff member’s personal Communications inbox.
          Spam and Trash are skipped. Read/unread comes from Gmail labels when present.
        </p>
      </div>
      <router-link to="/admin/users" class="btn btn-secondary">Back to users</router-link>
    </div>

    <div v-if="!isSuperAdmin" class="error">Super admin access required.</div>

    <div v-else class="mbox-card">
      <div class="form-group">
        <label>Agency *</label>
        <select v-model="agencyId" :disabled="running">
          <option value="">Select agency…</option>
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>

      <div class="form-group">
        <label>Staff user *</label>
        <input
          v-model="userQuery"
          type="search"
          placeholder="Search by name or email…"
          :disabled="running || !agencyId"
          @input="onSearchInput"
        />
        <div v-if="userResults.length" class="user-results">
          <button
            v-for="u in userResults"
            :key="u.id"
            type="button"
            class="user-result"
            :class="{ selected: Number(userId) === Number(u.id) }"
            @click="selectUser(u)"
          >
            <strong>{{ u.first_name }} {{ u.last_name }}</strong>
            <span class="muted">{{ u.email || u.work_email }} · {{ u.role }} · #{{ u.id }}</span>
          </button>
        </div>
        <div v-if="selectedUser" class="selected-user">
          Selected: <strong>{{ selectedUser.first_name }} {{ selectedUser.last_name }}</strong>
          ({{ selectedUser.email || selectedUser.work_email }}) · id {{ selectedUser.id }}
        </div>
      </div>

      <div class="form-group">
        <label>mbox file *</label>
        <input type="file" accept=".mbox,.txt,application/mbox,text/plain" :disabled="running" @change="onFile" />
        <small class="form-help">
          From Google Takeout → Mail → “All mail Including Spam and Trash.mbox”. Large files (hundreds of MB) are OK; keep the tab open until it finishes.
        </small>
      </div>

      <div class="form-group checks">
        <label>
          <input v-model="dryRun" type="checkbox" :disabled="running" />
          Dry run (parse + report only, no writes)
        </label>
        <label>
          <input v-model="skipSpamTrash" type="checkbox" :disabled="running" />
          Skip Spam and Trash
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="running || !agencyId || !userId || !file"
          @click="runImport"
        >
          {{ running ? 'Importing… this can take a few minutes' : dryRun ? 'Preview import' : 'Import into inbox' }}
        </button>
      </div>

      <div v-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>

      <div v-if="result" class="import-results">
        <h3>{{ result.dryRun ? 'Preview results' : 'Import complete' }}</h3>
        <ul>
          <li><strong>Scanned:</strong> {{ result.scanned }}</li>
          <li><strong>Imported messages:</strong> {{ result.importedMessages }}</li>
          <li><strong>Threads created:</strong> {{ result.createdConversations }}</li>
          <li><strong>Threads reused:</strong> {{ result.reusedConversations }}</li>
          <li><strong>Duplicates skipped:</strong> {{ result.skippedDuplicate }}</li>
          <li><strong>Spam/Trash skipped:</strong> {{ result.skippedSpamTrash }}</li>
          <li><strong>Drafts skipped:</strong> {{ result.skippedDraft }}</li>
          <li><strong>Marked read:</strong> {{ result.markedRead }} · <strong>Left unread:</strong> {{ result.leftUnread }}</li>
          <li><strong>Attachments noted (not uploaded):</strong> {{ result.attachmentsNoted }}</li>
          <li v-if="result.dateMin"><strong>Date range:</strong> {{ result.dateMin }} → {{ result.dateMax }}</li>
          <li><strong>Mailbox:</strong> {{ result.mailboxEmail }} (inbox #{{ result.inboxId }})</li>
        </ul>
        <p class="muted">{{ result.note }}</p>
        <div v-if="(result.errors || []).length" class="error-list">
          <strong>{{ result.errors.length }} message error(s):</strong>
          <pre>{{ result.errors.slice(0, 20) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';

const authStore = useAuthStore();
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const agencies = ref([]);
const agencyId = ref('');
const agencyUsers = ref([]);
const userQuery = ref('');
const userResults = ref([]);
const userId = ref('');
const selectedUser = ref(null);
const file = ref(null);
const dryRun = ref(true);
const skipSpamTrash = ref(true);
const running = ref(false);
const error = ref('');
const result = ref(null);
let searchTimer = null;

onMounted(async () => {
  try {
    const r = await api.get('/agencies');
    agencies.value = r.data?.agencies || r.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load agencies';
  }
});

watch(agencyId, async (id) => {
  userId.value = '';
  selectedUser.value = null;
  userQuery.value = '';
  userResults.value = [];
  agencyUsers.value = [];
  if (!id) return;
  try {
    const r = await api.get('/users', { params: { agencyId: id }, skipGlobalLoading: true });
    agencyUsers.value = Array.isArray(r.data) ? r.data : r.data?.users || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load users';
  }
});

function onFile(e) {
  file.value = e.target.files?.[0] || null;
}

function selectUser(u) {
  selectedUser.value = u;
  userId.value = String(u.id);
  userQuery.value = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  userResults.value = [];
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchUsers, 150);
}

function searchUsers() {
  const q = String(userQuery.value || '')
    .trim()
    .toLowerCase();
  if (!q || q.length < 1) {
    userResults.value = [];
    return;
  }
  userResults.value = agencyUsers.value
    .filter((u) => {
      const hay = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''} ${u.work_email || ''} ${u.id}`
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 25);
}

async function runImport() {
  error.value = '';
  result.value = null;
  if (!file.value || !agencyId.value || !userId.value) {
    error.value = 'Agency, user, and mbox file are required.';
    return;
  }
  running.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file.value);
    fd.append('agencyId', agencyId.value);
    fd.append('userId', userId.value);
    fd.append('dryRun', dryRun.value ? 'true' : 'false');
    fd.append('skipSpamTrash', skipSpamTrash.value ? 'true' : 'false');
    const r = await api.post('/admin/mbox-import', fd, {
      timeout: 30 * 60 * 1000
    });
    result.value = r.data?.result || r.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    running.value = false;
  }
}
</script>

<style scoped>
.mbox-import-page { max-width: 820px; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.mbox-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
}
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-weight: 600; margin-bottom: 6px; }
.form-group select,
.form-group input[type='search'] {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
}
.checks { display: flex; flex-direction: column; gap: 8px; }
.checks label { font-weight: 500; display: flex; align-items: center; gap: 8px; }
.user-results {
  margin-top: 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  max-height: 220px;
  overflow: auto;
}
.user-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--border, #f3f4f6);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.user-result:hover,
.user-result.selected { background: #f8fafc; }
.selected-user { margin-top: 8px; font-size: 0.95rem; }
.import-results {
  margin-top: 18px;
  padding: 14px;
  background: #f8fafc;
  border-radius: 8px;
}
.import-results ul { margin: 8px 0 0; padding-left: 18px; }
.error-list { margin-top: 10px; }
.error-list pre {
  white-space: pre-wrap;
  font-size: 12px;
  max-height: 180px;
  overflow: auto;
}
.muted { color: #6b7280; }
.error { color: #b91c1c; }
</style>
