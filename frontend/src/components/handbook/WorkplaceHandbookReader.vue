<template>
  <div ref="readerRoot" :class="['hb-digest', { 'handbook-screen-only': !canPrint }]">
    <p class="handbook-print-notice">Read the current Workplace Handbook in the app. Printing and PDF export are not available in this view.</p>
    <div v-if="loading" class="muted">Loading handbook…</div>
    <p v-else-if="error" role="alert" class="reader-error">{{ error }} <button type="button" class="btn" @click="load">Try again</button></p>
    <template v-else>
      <div v-if="accessMode !== 'token' && !previewMode && !showHistory" class="history-action"><button type="button" class="btn" @click="showHistory = true">Handbook updates · Monthly tracker</button></div>
      <WorkplaceHandbookHistory v-if="showHistory" :agency-id="agencyId" :sections="handbook?.sections || []" @close="showHistory = false" @open-section="openHistorySection" />
      <div v-show="!showHistory" class="reader-content">
      <p v-if="handbook?.beta" class="beta-notice">Beta edition · Available to read while company publication is under review.</p>
      <div v-if="libraryMode && !handbook?.sections?.length" class="empty" role="status">A handbook has not been added for this organization yet. Your company administrator can prepare its edition in Library settings.</div>
      <nav v-if="!libraryMode && handbook?.sections?.length" class="reader-tabs" aria-label="Handbook views">
        <button type="button" :aria-pressed="activeView === 'updates'" @click="activeView = 'updates'">Latest updates <span v-if="entries.length">{{ entries.length }}</span></button>
        <button type="button" :aria-pressed="activeView === 'handbook'" @click="activeView = 'handbook'">Read handbook</button>
        <button v-if="!previewMode" type="button" @click="showAssistant">Ask the handbook ✦</button>
      </nav>
      <WorkplaceHandbookBook v-if="activeView === 'handbook' && handbook?.sections?.length" ref="book" :handbook="handbook" :analytics="accessMode !== 'token' && !previewMode && !handbook?.beta ? { agencyId, surface: analyticsSurface } : null" :updates="handbook.updates || []" :full-handbook-url="fullHandbookUrl" :can-open-original="canOpenOriginal" :can-print="canPrint" :answer-question="previewMode || handbook?.beta ? null : answerQuestion" @reload="load" />
      <template v-if="!libraryMode && activeView === 'updates'">
      <header class="hb-head">
        <div>
          <div class="kicker">Handbook Updates</div>
          <h2>{{ digest?.title || 'Handbook Updates' }}</h2>
          <p class="muted">
            {{ digest?.period_label ? `${digest.period_label} · ` : '' }}
            Published changes to the workplace handbook.
          </p>
        </div>
        <a
          v-if="sourceUrl"
          class="doc-link"
          :href="sourceUrl"
          target="_blank"
          rel="noopener"
        >Admin · Original handbook ↗</a>
      </header>

      <p v-if="digest?.status === 'draft'" class="muted">These communicated updates are being incorporated into the Workplace Handbook. You can mark this review complete below; doing so does not publish the manual or sign your amendment.</p>
      <p v-if="canEdit" class="editor-notice">Administrator editing: changes saved here update this shared handbook digest for everyone in the agency.</p>
      <p v-if="editMessage" role="status">{{editMessage}}</p>
      <p v-if="loadError" role="alert">{{loadError}} <button type="button" class="btn" @click="load">Try again</button></p>
      <div v-if="!entries.length" class="empty">
        No handbook updates in this digest.
      </div>

      <article v-for="(e, idx) in entries" :key="e.id || idx" class="entry">
        <div class="entry-num">{{ idx + 1 }}</div>
        <div class="entry-body">
          <div v-if="editing?.id===e.id" class="inline-editor">
            <label>Subject<input v-model="editing.subject" /></label>
            <label>Rationale<textarea v-model="editing.rationale" rows="2" /></label>
            <DraftHtmlEditor :agency-id="agencyId" v-model="editing.changed_content" label="Shared handbook update" />
            <button type="button" class="btn primary" :disabled="editBusy" @click="saveEdit">Save for everyone</button>
            <button type="button" class="btn" :disabled="editBusy" @click="editing=null">Cancel</button>
          </div>
          <template v-else>
          <div class="part">
            <span class="part-label">Subject</span>
            <h3>{{ e.subject }}</h3>
            <WorkplaceHandbookPolicyLinks :entry="e" :sections="handbook?.sections || []" @open="openSection" />
          </div>
          <HandbookUpdateLocations :entry="e" />
          <div class="part">
            <span class="part-label">Rationale</span>
            <p>{{ e.rationale || '—' }}</p>
          </div>
          <div class="part">
            <span class="part-label">Changed content</span>
            <div class="changed" @click="followPolicyLink" v-html="formatChanged(e.changed_content)" />
            <p v-if="e.change_kind === 'removed'">This section was removed from the current handbook.</p>
            <details v-if="e.previous_content"><summary>Previous wording</summary><div class="changed" v-html="formatChanged(e.previous_content)" /></details>
          </div>
          <button v-if="canEdit" type="button" class="btn" @click="editing={...e}">Edit shared update</button>
          </template>
        </div>
      </article>

      <div class="ask" v-if="!previewMode">
        <h4>Ask People Operations</h4>
        <textarea v-model="question" rows="3" placeholder="Question about these handbook updates…" />
        <button type="button" class="btn" :disabled="asking || !question.trim()" @click="submitQuestion">
          {{ asking ? 'Sending…' : 'Submit question' }}
        </button>
        <p v-if="askMsg" role="status">{{ askMsg }}</p>
      </div>

      <div class="ack-row" v-if="!previewMode && digest && entries.length">
        <button type="button" class="btn primary" :disabled="acking || !!loadError" @click="acknowledge">
          {{ acking ? 'Saving…' : 'I have reviewed these handbook updates' }}
        </button>
      </div>
      </template>
      <div v-if="!libraryMode && activeView === 'handbook' && (!digest || !entries.length) && handbook?.version && !previewMode" class="ack-row">
        <button type="button" class="btn primary" :disabled="acking" @click="acknowledge">I have reviewed the available handbook sections</button>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import { onMounted, onUpdated, ref, watch } from 'vue';
import {connectTrainingVideos} from '../../utils/trainingVideo';
import api from '../../services/api';
import DraftHtmlEditor from '../admin/DraftHtmlEditor.vue';
import {getActivePinia} from 'pinia';
import HandbookUpdateLocations from './HandbookUpdateLocations.vue';
import {useAuthStore} from '../../store/auth';
import { computed, nextTick } from 'vue';
import WorkplaceHandbookBook from './WorkplaceHandbookBook.vue';
import WorkplaceHandbookHistory from './WorkplaceHandbookHistory.vue';
import WorkplaceHandbookPolicyLinks from './WorkplaceHandbookPolicyLinks.vue';

const props = defineProps({
  libraryMode: { type: Boolean, default: false },
  analyticsSurface: { type: String, default: 'handbook' },
  accessMode: { type: String, default: 'auth' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  recipientId: { type: [Number, String], default: null },
  previewMode: { type: Boolean, default: false },
  adminUpdateId: { type: [Number, String], default: null },
  pushId: { type: [Number, String], default: null }
});
const emit = defineEmits(['acknowledged']);

const readerRoot=ref(null);
onUpdated(()=>{if(readerRoot.value)connectTrainingVideos(readerRoot.value);});
const loading = ref(false),loadError=ref('');
const digest = ref(null);
const entries = ref([]);
const fullHandbookUrl = ref('');
const access = ref({});
const canOpenOriginal = computed(() => props.accessMode !== 'token' && access.value.canOpenOriginal === true);
const canPrint = computed(() => props.accessMode !== 'token' && access.value.canPrint === true);
const question = ref('');
const asking = ref(false);
const askMsg = ref('');
const acking = ref(false);
const auth=getActivePinia() ? useAuthStore() : {user:null},canEdit=ref(false),editing=ref(null),editBusy=ref(false),editMessage=ref('');
async function checkEditAccess(){
  canEdit.value=false;
  if(digest.value?.status!=='draft'||!auth.user||!['admin','super_admin','support','assistant_admin'].includes(auth.user.role))return;
  try{await api.get(`/provider-update/handbook/digests/${digest.value.id}`,{params:{agencyId:props.agencyId}});canEdit.value=true;}catch{canEdit.value=false;}
}
async function saveEdit(){
  if(!canEdit.value||!editing.value)return;
  editBusy.value=true;editMessage.value='';
  try{const {data}=await api.post(`/provider-update/handbook/digests/${digest.value.id}/entries`,{agencyId:Number(props.agencyId),entryId:editing.value.id,subject:editing.value.subject,rationale:editing.value.rationale,changedContent:editing.value.changed_content,sortOrder:editing.value.sort_order});entries.value=data.entries;editing.value=null;editMessage.value='Shared handbook update saved for everyone.';}
  catch(e){editMessage.value=e.response?.data?.error?.message||'The update could not be saved.';}finally{editBusy.value=false;}
}
const error = ref('');
const handbook = ref(null);
const book = ref(null);
const activeView = ref('updates');
const showHistory = ref(false);
async function openHistorySection(slug) { showHistory.value = false; await openSection(slug); }
const sourceUrl = computed(() => canOpenOriginal.value && /^https?:\/\//i.test(fullHandbookUrl.value) ? fullHandbookUrl.value : '');
let request = 0;

function formatChanged(text) {
  if (!text) return '<p>—</p>';
  const raw = String(text);
  if (raw.includes('<')) return DOMPurify.sanitize(raw);
  return `<p>${raw.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`;
}

async function openSection(slug) {
  activeView.value = 'handbook'; await nextTick(); book.value?.selectSection(slug, true);
}
async function showAssistant() { activeView.value = 'handbook'; await nextTick(); await book.value?.showAssistant(); }
async function answerQuestion(payload, options) {
  const url = props.accessMode === 'token' ? `/public/provider-update/${encodeURIComponent(props.token)}/handbook/answer` : '/provider-update/handbook/answer';
  const body = props.accessMode === 'token' ? payload : { ...payload, analyticsSurface: props.analyticsSurface, agencyId: Number(props.agencyId) };
  const { data } = await api.post(url, body, { ...options, timeout: 240000 });
  return data;
}
function followPolicyLink(event) {
  const href = event.target.closest?.('a')?.getAttribute('href') || '';
  if (!href.startsWith('#handbook-')) return;
  const slug = href.slice('#handbook-'.length);
  if (!handbook.value?.sections?.some(s => s.slug === slug && s.content_status !== 'pending')) return;
  event.preventDefault(); openSection(slug);
}

async function load() {
  showHistory.value = false;
  loading.value = true; loadError.value = '';
  error.value = '';
  const currentRequest = ++request;
  access.value = {};
  try {
    let data;
    if (props.accessMode === 'token' && props.token) {
      const res = await api.get(`/public/provider-update/${encodeURIComponent(props.token)}/handbook`);
      data = res.data;
    } else {
      const res = await api.get(props.libraryMode ? '/provider-update/handbook/library' : '/provider-update/handbook/published', {
        params: {
          agencyId: props.agencyId,
          adminUpdateId: props.adminUpdateId || undefined,
          pushId: props.pushId || undefined
        }
      });
      data = res.data;
    }
    if (currentRequest !== request) return;
    digest.value = data.digest || null;
    entries.value = data.entries || [];
    fullHandbookUrl.value = data.fullHandbookUrl || '';
    await checkEditAccess();
    access.value = data.access || {};
    handbook.value = data.handbook || null;
    const deepLink = window.location.hash.replace(/^#handbook-/, '');
    activeView.value = props.libraryMode ? 'handbook' : handbook.value?.sections?.some(s => s.slug === deepLink) ? 'handbook' : entries.value.length || !handbook.value?.sections?.length ? 'updates' : 'handbook';
  } catch (e) {
    if (currentRequest === request) { loadError.value = error.value = e?.response?.data?.error?.message || 'The handbook could not be loaded.'; handbook.value = null; entries.value = []; digest.value = null; }
  } finally {
    if (currentRequest === request) loading.value = false;
  }
}

async function submitQuestion() {
  asking.value = true;
  askMsg.value = '';
  try {
    if (props.accessMode === 'token' && props.token) {
      await api.post(`/public/provider-update/${encodeURIComponent(props.token)}/handbook/questions`, {
        questionText: question.value
      });
    } else {
      await api.post('/provider-update/handbook/questions', {
        agencyId: Number(props.agencyId),
        recipientId: props.recipientId,
        questionText: question.value
      });
    }
    question.value = '';
    askMsg.value = 'Question sent to People Operations. You can continue reviewing your update.';
  } catch(e){askMsg.value=e.response?.data?.error?.message||'Your question could not be sent. Please try again; your text has been kept.';} finally {
    asking.value = false;
  }
}

async function acknowledge() {
  if(props.previewMode)return;
  acking.value = true;
  try {
    emit('acknowledged', { digestId: digest.value?.id || null, handbookVersionId: handbook.value?.version?.id || null });
  } finally {
    acking.value = false;
  }
}

watch(() => [props.agencyId, props.token, props.adminUpdateId, props.pushId, props.accessMode, props.libraryMode], load, { immediate: true });
</script>

<style scoped>
.reader-content{display:grid;gap:.85rem}.history-action{display:flex;justify-content:flex-end}.history-action .btn{font-size:13px;background:white;border:1px solid #ccd9c6;border-radius:7px;padding:10px 14px;color:#12583f;cursor:pointer}
.beta-notice { margin: 0 0 12px; padding: 10px 14px; border-radius: 7px; background: #f4f1df; color: #645a35; font-size: 12px; }
.changed :deep(img),.changed :deep(video){max-width:100%;height:auto}
.changed{overflow-x:auto}.changed :deep(table){width:100%;border-collapse:collapse;margin:16px 0}.changed :deep(th){background:#173e5a;color:#fff;text-align:left}.changed :deep(td),.changed :deep(th){padding:12px;border:1px solid #d4dee5;min-width:100px}.changed :deep(h2){color:#173e5a;border-top:3px solid #c8dce9;padding-top:22px;margin-top:28px}.changed :deep(h3){color:#173e5a;background:#edf3f8;padding:12px;border-radius:8px}.changed :deep(dd){margin:6px 0 18px}.inline-editor{display:grid;gap:12px}.inline-editor label{display:grid;gap:6px}.inline-editor input,.inline-editor textarea{font:inherit;padding:10px;color:#19344e;border:1px solid #849bad;border-radius:6px}.editor-notice{background:#e7f0fb;color:#173e5a;padding:16px;border-radius:10px}
.handbook-print-notice { display: none; }
@media print { .handbook-screen-only > * { display: none !important; }.handbook-screen-only > .handbook-print-notice { display: block !important; padding: 24px; color: black; background: white; } }
.hb-digest {
  --line: rgba(15, 23, 42, 0.08);
  --glass: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.85rem;
}
.reader-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.reader-tabs button { border: 1px solid #ccd9c6; border-radius: 7px; padding: 10px 16px; background: #fff; color: #12583f; font: inherit; font-size: 13px; cursor: pointer; }
.reader-tabs button[aria-pressed="true"] { background: #12583f; color: #fff; }
.reader-tabs span { margin-left: 8px; opacity: .75; }
.section-jump { border: 0; background: none; color: #12583f; cursor: pointer; padding: 8px 0; text-decoration: underline; font-size: 12px; }
.reader-error { color: #a13222; }
.hb-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem 1.1rem;
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 16px;
  backdrop-filter: blur(12px);
}
.kicker {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}
.hb-head h2 { margin: 0.15rem 0; }
.muted { color: #64748b; }
.doc-link {
  color: #0f766e;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.entry {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 0.75rem;
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem;
  backdrop-filter: blur(10px);
}
.entry-num {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(61, 107, 79, 0.12);
  color: #3d6b4f;
  font-weight: 800;
}
.part { margin-bottom: 0.75rem; }
.part:last-child { margin-bottom: 0; }
.part-label {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
  margin-bottom: 0.2rem;
}
.part h3 { margin: 0; font-size: 1.05rem; }
.part p, .changed { margin: 0; color: #334155; line-height: 1.5; }
.ask, .ack-row, .empty {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem;
}
.ask { display: grid; gap: 0.5rem; }
.ask textarea {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 0.6rem;
  font: inherit;
  background: rgba(255, 255, 255, 0.85);
}
.btn {
  width: fit-content;
  border: 1px solid rgba(61, 107, 79, 0.35);
  background: rgba(255, 255, 255, 0.8);
  color: #3d6b4f;
  border-radius: 10px;
  padding: 0.5rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: linear-gradient(135deg, #3d6b4f, #2f5540);
  color: #fff;
  border-color: transparent;
}
.ok { color: #3d6b4f; }
</style>
