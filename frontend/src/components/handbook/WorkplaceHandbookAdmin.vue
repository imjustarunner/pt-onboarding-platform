<template>
  <div :class="['hb-admin', { 'handbook-screen-only': !access.canPrint }]">
    <p class="handbook-print-notice">Read the current Workplace Handbook in the app. Printing and PDF export are not available in this view.</p>
    <header class="head">
      <div>
        <h2>Workplace Handbook</h2>
        <p class="muted">
          Read and publish your handbook, and keep your team’s policy updates connected to the right sections.
        </p>
      </div>
      <button type="button" class="btn primary" :disabled="busy" @click="activeView = 'updates'; createNew()">+ New digest</button>
    </header>

    <nav class="handbook-tabs" aria-label="Handbook workspace views">
      <button type="button" :aria-pressed="activeView === 'handbook'" @click="activeView = 'handbook'">Handbook</button>
      <button type="button" :aria-pressed="activeView === 'updates'" @click="activeView = 'updates'">Handbook Updates</button>
    </nav>
    <WorkplaceHandbookWorkspace ref="workspaceReader" v-show="activeView === 'handbook'" :agency-id="agencyId" :admin-update-id="adminUpdateId" :push-id="pushId" :full-handbook-url="fullUrl" :updates="publishedEntries" @sections="handbookSections = $event" @published="onHandbookPublished" @dirty="$emit('dirty', $event)" @draft-changed="$emit('draft-changed')" />

    <section v-show="activeView === 'updates'" class="digest-workspace">

    <label v-if="access.canOpenOriginal" class="field glass">
      <span>Original handbook link · admins and superadmins only</span>
      <div class="row">
        <input v-model="fullUrl" class="input" placeholder="https://…" />
        <button type="button" class="btn" :disabled="busy" @click="saveUrl">Save link</button>
      </div>
    </label>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="success" class="ok">{{ success }}</p>

    <HandbookDraftSections :agency-id="agencyId" />
    <h3>Change tracker and staff digest</h3>

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
          <input v-model="current.digest.title" class="input" :disabled="isPublished" />
        </label>
        <label class="field">
          <span>Period</span>
          <input v-model="current.digest.period_label" class="input" placeholder="October 2026" :disabled="isPublished" />
        </label>
        <button v-if="!isPublished" type="button" class="btn" :disabled="busy" @click="saveDigestMeta">Save details</button>
        <button v-if="!isPublished" type="button" class="btn primary" :disabled="busy" @click="publish">
          Publish digest
        </button>
      </div>

      <p v-if="isPublished" class="muted">This published update is preserved. You can connect its entries to handbook sections below. Create a new digest for further policy changes.</p>

      <article v-for="(e, idx) in current.entries" :key="e.id || 'n' + idx" class="entry">
        <div class="entry-head">Update {{ idx + 1 }}</div>
        <div v-if="e.handbook_version_id" class="generated-note">{{ e.change_kind }} · Handbook version record {{ e.handbook_version_id }} · Automatically added</div>
        <WorkplaceHandbookPolicyLinks :entry="e" :sections="handbookSections" @open="openPolicy" />
        <label v-if="handbookSections.length" class="field">
          <span>Handbook section</span>
          <select v-model="e.handbook_section_slug" class="input" :disabled="!!e.handbook_version_id || busy">
            <option :value="null">Not connected to a section</option>
            <option v-if="e.handbook_section_slug && !handbookSections.some(s => s.slug === e.handbook_section_slug)" :value="e.handbook_section_slug">{{ e.handbook_section_slug }} (previous section)</option>
            <option v-for="section in handbookSections" :key="section.slug" :value="section.slug">{{ section.parent_slug ? '↳ ' : '' }}{{ section.title }}</option>
          </select>
          <button v-if="e.id && !e.handbook_version_id" type="button" class="btn sm" :disabled="busy" @click="linkEntry(e)">Connect section</button>
        </label>
        <label class="field">
          <span>1 · Subject</span>
          <input v-model="e.subject" class="input" placeholder="What changed" :disabled="isPublished" />
        </label>
        <label class="field">
          <span>2 · Rationale</span>
          <textarea v-model="e.rationale" rows="2" class="input" placeholder="Why this change was made" :disabled="isPublished" />
        </label>
        <label class="field">
          <span>3 · Changed content</span>
          <DraftHtmlEditor v-if="!isPublished && !e.handbook_version_id" :agency-id="agencyId" v-model="e.changed_content" label="Updated policy text" />
          <textarea v-else v-model="e.changed_content" rows="4" class="input" placeholder="The new / updated policy text" :disabled="isPublished || !!e.handbook_version_id" />
        </label>
        <details v-if="e.previous_content"><summary>Previous wording</summary><div class="previous-content" v-html="safeHtml(e.previous_content)" /></details>
        <div v-if="!isPublished" class="row">
          <button type="button" class="btn sm" :disabled="busy" @click="saveEntry(e, idx)">Save update</button>
          <button type="button" class="btn sm danger" :disabled="busy || !!e.handbook_version_id" @click="removeEntry(e)">Delete</button>
        </div>
      </article>

      <button v-if="!isPublished" type="button" class="btn" :disabled="busy" @click="addEntry">+ Add handbook update</button>
    </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import HandbookDraftSections from './HandbookDraftSections.vue';
import DraftHtmlEditor from '../admin/DraftHtmlEditor.vue';
import WorkplaceHandbookWorkspace from './WorkplaceHandbookWorkspace.vue';
import WorkplaceHandbookPolicyLinks from './WorkplaceHandbookPolicyLinks.vue';

const emit = defineEmits(['dirty', 'published', 'draft-changed']);
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
const activeView = ref('handbook');
const handbookSections = ref([]);
const workspaceReader = ref(null);
const publishedEntries = ref([]);
const access = ref({});
const isPublished = computed(() => current.value?.digest?.status === 'published');
const safeHtml = value => DOMPurify.sanitize(String(value || ''));

async function openPolicy(slug) {
  activeView.value = 'handbook';
  await nextTick();
  await workspaceReader.value?.openSection(slug);
}

async function reloadList() {
  access.value = {};
  const [listRes, pubRes] = await Promise.all([
    api.get('/provider-update/handbook/digests', { params: { agencyId: props.agencyId } }),
    api.get('/provider-update/handbook/published', { params: { agencyId: props.agencyId } })
  ]);
  digests.value = listRes.data?.digests || [];
  access.value = pubRes.data?.access || {};
  fullUrl.value = pubRes.data?.fullHandbookUrl || pubRes.data?.document?.full_handbook_url || '';
  publishedEntries.value = pubRes.data?.handbook?.updates || pubRes.data?.entries || [];
}

async function onHandbookPublished(publication) {
  emit('published', publication);
  await reloadList();
  if (publication?.digestId) await openDigest(publication.digestId);
}

async function linkEntry(entry) {
  busy.value = true; error.value = ''; success.value = '';
  try {
    const { data } = await api.put(`/provider-update/handbook/digests/${current.value.digest.id}/entries/${entry.id}/section`, { agencyId: Number(props.agencyId), sectionSlug: entry.handbook_section_slug || null });
    const saved = data.entries?.find(e => e.id === entry.id);
    if (saved) Object.assign(entry, saved);
    await reloadList(); success.value = 'This update is connected to its handbook section.';
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The section could not be connected.'; }
  finally { busy.value = false; }
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

async function saveDigestMeta(throwOnError = false) {
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
    current.value.digest = res.data.digest;
    await reloadList();
    success.value = 'Digest saved.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Save failed';
    if (throwOnError === true) throw e;
  } finally {
    if (throwOnError !== true) busy.value = false;
  }
}

function addEntry() {
  if (!current.value) return;
  current.value.entries.push({
    id: null,
    subject: '',
    rationale: '',
    changed_content: '',
    sort_order: current.value.entries.length,
    handbook_section_slug: null
  });
}

async function saveEntry(e, idx, throwOnError = false) {
  busy.value = true;
  try {
    const res = await api.post(`/provider-update/handbook/digests/${current.value.digest.id}/entries`, {
      agencyId: Number(props.agencyId),
      entryId: e.id || null,
      subject: e.subject,
      rationale: e.rationale,
      changedContent: e.changed_content,
      sortOrder: idx,
      sectionSlug: e.handbook_section_slug || null
    });
    const saved = res.data.entries.find(entry => e.id ? entry.id === e.id : entry.sort_order === idx && entry.subject === e.subject);
    if (saved) Object.assign(e, saved);
    await reloadList();
    success.value = 'Update saved.';
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Save failed';
    if (throwOnError === true) throw err;
  } finally {
    if (throwOnError !== true) busy.value = false;
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
  busy.value = true;
  error.value = ''; success.value = '';
  try {
    for (let i = 0; i < current.value.entries.length; i += 1) {
      await saveEntry(current.value.entries[i], i, true);
    }
    await saveDigestMeta(true);
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
  try {
    await reloadList();
    if (digests.value[0]) await openDigest(digests.value[0].id);
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Handbook Updates could not be loaded.'; }
});
</script>

<style scoped>
.handbook-print-notice { display: none; }
@media print { .handbook-screen-only > * { display: none !important; }.handbook-screen-only > .handbook-print-notice { display: block !important; padding: 24px; color: black; background: white; } }
.hb-admin { display: grid; gap: 1rem; }
.digest-workspace { display: grid; gap: 1rem; }
.handbook-tabs { display: flex; gap: 8px; border-bottom: 1px solid #dce3d6; padding-bottom: 12px; }
.handbook-tabs button { padding: 10px 18px; border: 1px solid #d1dcca; border-radius: 7px; background: #fff; color: #12583f; cursor: pointer; font: inherit; font-size: 13px; }
.handbook-tabs button[aria-pressed="true"] { background: #12583f; color: #fff; }
.generated-note { color: #567345; font-size: 12px; margin-bottom: 12px; }
.previous-content { padding: 12px; background: #f4f6f0; font-size: 13px; }
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
