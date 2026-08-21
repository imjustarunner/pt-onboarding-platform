<template>
  <div class="hb-admin">
    <header class="head">
      <div>
        <h2>Handbook Updates</h2>
        <p class="muted">
          Monthly digest of handbook changes (subject · rationale · changed content). The full 100+ page handbook
          stays in Google Docs — link it below.
        </p>
      </div>
      <button type="button" class="btn primary" :disabled="busy" @click="createNew">+ New digest</button>
    </header>

    <label class="field glass">
      <span>Full handbook (Google Doc) link</span>
      <div class="row">
        <input v-model="fullUrl" class="input" placeholder="https://docs.google.com/document/d/…" />
        <button type="button" class="btn" :disabled="busy" @click="saveUrl">Save link</button>
      </div>
    </label>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="success" class="ok">{{ success }}</p>

    <div class="digest-list">
      <button
        v-for="d in digests"
        :key="d.id"
        type="button"
        class="digest-chip"
        :class="{ on: selectedId === d.id }"
        @click="openDigest(d.id)"
      >
        <strong>{{ d.period_label || d.title }}</strong>
        <span>{{ d.status }} · {{ d.entry_count || 0 }} updates</span>
      </button>
    </div>

    <div v-if="current" class="editor glass">
      <div class="row wrap">
        <label class="field grow">
          <span>Title</span>
          <input v-model="current.digest.title" class="input" />
        </label>
        <label class="field">
          <span>Period</span>
          <input v-model="current.digest.period_label" class="input" placeholder="August 2026" />
        </label>
        <button type="button" class="btn" :disabled="busy" @click="saveDigestMeta">Save meta</button>
        <button type="button" class="btn primary" :disabled="busy" @click="publish">
          {{ current.digest.status === 'published' ? 'Republish' : 'Publish digest' }}
        </button>
      </div>

      <article v-for="(e, idx) in current.entries" :key="e.id || 'n' + idx" class="entry">
        <div class="entry-head">Update {{ idx + 1 }}</div>
        <label class="field">
          <span>1 · Subject</span>
          <input v-model="e.subject" class="input" placeholder="What changed" />
        </label>
        <label class="field">
          <span>2 · Rationale</span>
          <textarea v-model="e.rationale" rows="2" class="input" placeholder="Why this change was made" />
        </label>
        <label class="field">
          <span>3 · Changed content</span>
          <textarea v-model="e.changed_content" rows="4" class="input" placeholder="The new / updated policy text" />
        </label>
        <div class="row">
          <button type="button" class="btn sm" :disabled="busy" @click="saveEntry(e, idx)">Save update</button>
          <button type="button" class="btn sm danger" :disabled="busy || !e.id" @click="removeEntry(e)">Delete</button>
        </div>
      </article>

      <button type="button" class="btn" :disabled="busy" @click="addEntry">+ Add handbook update</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  adminUpdateId: { type: [Number, String], default: null },
  pushId: { type: [Number, String], default: null }
});

const digests = ref([]);
const selectedId = ref(null);
const current = ref(null);
const fullUrl = ref('');
const busy = ref(false);
const error = ref('');
const success = ref('');

async function reloadList() {
  const [listRes, pubRes] = await Promise.all([
    api.get('/provider-update/handbook/digests', { params: { agencyId: props.agencyId } }),
    api.get('/provider-update/handbook/published', { params: { agencyId: props.agencyId } })
  ]);
  digests.value = listRes.data?.digests || [];
  fullUrl.value = pubRes.data?.fullHandbookUrl || pubRes.data?.document?.full_handbook_url || '';
}

async function openDigest(id) {
  selectedId.value = id;
  const res = await api.get(`/provider-update/handbook/digests/${id}`, {
    params: { agencyId: props.agencyId }
  });
  current.value = res.data;
}

async function createNew() {
  busy.value = true;
  error.value = '';
  try {
    const now = new Date();
    const period = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const res = await api.post('/provider-update/handbook/digests', {
      agencyId: Number(props.agencyId),
      title: `${period} Handbook Updates`,
      periodLabel: period,
      adminUpdateId: props.adminUpdateId || null,
      providerUpdatePushId: props.pushId || null
    });
    current.value = res.data;
    selectedId.value = res.data?.digest?.id;
    await reloadList();
    success.value = 'Digest created.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Create failed';
  } finally {
    busy.value = false;
  }
}

async function saveUrl() {
  busy.value = true;
  try {
    await api.put('/provider-update/handbook/full-url', {
      agencyId: Number(props.agencyId),
      url: fullUrl.value
    });
    success.value = 'Full handbook link saved.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    busy.value = false;
  }
}

async function saveDigestMeta() {
  if (!current.value?.digest?.id) return;
  busy.value = true;
  try {
    const res = await api.put(`/provider-update/handbook/digests/${current.value.digest.id}`, {
      agencyId: Number(props.agencyId),
      title: current.value.digest.title,
      periodLabel: current.value.digest.period_label,
      adminUpdateId: props.adminUpdateId || current.value.digest.admin_update_id,
      providerUpdatePushId: props.pushId || current.value.digest.provider_update_push_id
    });
    current.value = res.data;
    await reloadList();
    success.value = 'Digest saved.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    busy.value = false;
  }
}

function addEntry() {
  if (!current.value) return;
  current.value.entries.push({
    id: null,
    subject: '',
    rationale: '',
    changed_content: '',
    sort_order: current.value.entries.length
  });
}

async function saveEntry(e, idx) {
  busy.value = true;
  try {
    const res = await api.post(`/provider-update/handbook/digests/${current.value.digest.id}/entries`, {
      agencyId: Number(props.agencyId),
      entryId: e.id || null,
      subject: e.subject,
      rationale: e.rationale,
      changedContent: e.changed_content,
      sortOrder: idx
    });
    current.value = res.data;
    await reloadList();
    success.value = 'Update saved.';
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Save failed';
  } finally {
    busy.value = false;
  }
}

async function removeEntry(e) {
  if (!e.id) {
    current.value.entries = current.value.entries.filter((x) => x !== e);
    return;
  }
  if (!window.confirm('Delete this handbook update?')) return;
  busy.value = true;
  try {
    const res = await api.delete(
      `/provider-update/handbook/digests/${current.value.digest.id}/entries/${e.id}`,
      { params: { agencyId: props.agencyId }, data: { agencyId: Number(props.agencyId) } }
    );
    current.value = res.data;
    await reloadList();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Delete failed';
  } finally {
    busy.value = false;
  }
}

async function publish() {
  if (!current.value?.digest?.id) return;
  for (let i = 0; i < current.value.entries.length; i += 1) {
    await saveEntry(current.value.entries[i], i);
  }
  await saveDigestMeta();
  busy.value = true;
  try {
    const res = await api.post(`/provider-update/handbook/digests/${current.value.digest.id}/publish`, {
      agencyId: Number(props.agencyId)
    });
    current.value = res.data;
    await reloadList();
    success.value = 'Handbook Updates digest published.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Publish failed';
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await reloadList();
  if (digests.value[0]) await openDigest(digests.value[0].id);
});
</script>

<style scoped>
.hb-admin { display: grid; gap: 1rem; }
.head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.glass {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  padding: 1rem;
  backdrop-filter: blur(12px);
}
.field { display: grid; gap: 0.3rem; margin-bottom: 0.5rem; }
.field.grow { flex: 1; min-width: 200px; }
.input, textarea.input {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  background: rgba(255, 255, 255, 0.9);
}
.row { display: flex; gap: 0.5rem; align-items: end; flex-wrap: wrap; }
.row.wrap { align-items: end; }
.btn {
  border: 1px solid rgba(61, 107, 79, 0.35);
  background: rgba(255, 255, 255, 0.85);
  color: #3d6b4f;
  border-radius: 10px;
  padding: 0.45rem 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: linear-gradient(135deg, #3d6b4f, #2f5540);
  color: #fff;
  border-color: transparent;
}
.btn.sm { padding: 0.25rem 0.55rem; font-size: 0.8rem; }
.btn.danger { border-color: #b91c1c; color: #b91c1c; }
.digest-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.digest-chip {
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.65);
  border-radius: 12px;
  padding: 0.55rem 0.75rem;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
}
.digest-chip.on { border-color: #3d6b4f; box-shadow: 0 0 0 1px #3d6b4f; }
.digest-chip span { font-size: 0.78rem; color: #64748b; }
.entry {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 0.85rem;
  margin: 0.75rem 0;
  background: rgba(248, 250, 252, 0.7);
}
.entry-head { font-weight: 800; color: #3d6b4f; margin-bottom: 0.5rem; }
.muted { color: #64748b; }
.err { color: #b91c1c; }
.ok { color: #3d6b4f; }
</style>
