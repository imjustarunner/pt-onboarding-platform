<template>
  <div class="hb-digest">
    <div v-if="loading" class="muted">Loading handbook updates…</div>
    <template v-else>
      <header class="hb-head">
        <div>
          <div class="kicker">Handbook Updates</div>
          <h2>{{ digest?.title || 'Handbook Updates' }}</h2>
          <p class="muted">
            {{ digest?.period_label ? `${digest.period_label} · ` : '' }}
            Changes since the previous Admin Update. Keep these updates with your workplace handbook.
          </p>
        </div>
        <a
          v-if="fullHandbookUrl"
          class="doc-link"
          :href="fullHandbookUrl"
          target="_blank"
          rel="noopener"
        >Open full handbook →</a>
      </header>

      <p v-if="digest?.status === 'draft'" class="muted">Draft for review — these changes are still being edited. Formal acknowledgment opens when they are published.</p>
      <p v-if="canEdit" class="editor-notice">Administrator editing: changes saved here update this shared handbook digest for everyone in the agency.</p>
      <p v-if="editMessage" role="status">{{editMessage}}</p>
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
          </div>
          <div class="part">
            <span class="part-label">Rationale</span>
            <p>{{ e.rationale || '—' }}</p>
          </div>
          <div class="part">
            <span class="part-label">Changed content</span>
            <div class="changed" v-html="formatChanged(e.changed_content)" />
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
        <p v-if="askMsg" class="ok">{{ askMsg }}</p>
      </div>

      <div class="ack-row">
        <button type="button" class="btn primary" :disabled="acking || previewMode || digest?.status==='draft' || !entries.length" @click="acknowledge">
          {{ acking ? 'Saving…' : 'I have reviewed these handbook updates' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import DraftHtmlEditor from '../admin/DraftHtmlEditor.vue';
import {useAuthStore} from '../../store/auth';

const props = defineProps({
  accessMode: { type: String, default: 'auth' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  recipientId: { type: [Number, String], default: null },
  previewMode: { type: Boolean, default: false },
  adminUpdateId: { type: [Number, String], default: null },
  pushId: { type: [Number, String], default: null }
});
const emit = defineEmits(['acknowledged']);

const loading = ref(false);
const digest = ref(null);
const entries = ref([]);
const fullHandbookUrl = ref('');
const question = ref('');
const asking = ref(false);
const askMsg = ref('');
const acking = ref(false);
const auth=useAuthStore(),canEdit=ref(false),editing=ref(null),editBusy=ref(false),editMessage=ref('');
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

function formatChanged(text) {
  if (!text) return '<p>—</p>';
  const raw = String(text);
  if (raw.includes('<')) return DOMPurify.sanitize(raw);
  return `<p>${raw.replace(/\n/g, '<br/>')}</p>`;
}

async function load() {
  loading.value = true;
  try {
    let data;
    if (props.accessMode === 'token' && props.token) {
      const res = await api.get(`/public/provider-update/${encodeURIComponent(props.token)}/handbook`);
      data = res.data;
    } else {
      const res = await api.get('/provider-update/handbook/published', {
        params: {
          agencyId: props.agencyId,
          adminUpdateId: props.adminUpdateId || undefined,
          pushId: props.pushId || undefined
        }
      });
      data = res.data;
    }
    digest.value = data.digest || null;
    entries.value = data.entries || [];
    fullHandbookUrl.value = data.fullHandbookUrl || '';
    await checkEditAccess();
  } finally {
    loading.value = false;
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
    askMsg.value = 'Question sent to People Operations.';
  } finally {
    asking.value = false;
  }
}

async function acknowledge() {
  if(props.previewMode)return;
  acking.value = true;
  try {
    emit('acknowledged');
  } finally {
    acking.value = false;
  }
}

onMounted(load);
watch(() => [props.agencyId, props.token, props.adminUpdateId], load);
</script>

<style scoped>
.changed :deep(img),.changed :deep(video){max-width:100%;height:auto}
.changed{overflow-x:auto}.changed :deep(table){width:100%;border-collapse:collapse;margin:16px 0}.changed :deep(th){background:#173e5a;color:#fff;text-align:left}.changed :deep(td),.changed :deep(th){padding:12px;border:1px solid #d4dee5;min-width:100px}.changed :deep(h2){color:#173e5a;border-top:3px solid #c8dce9;padding-top:22px;margin-top:28px}.changed :deep(h3){color:#173e5a;background:#edf3f8;padding:12px;border-radius:8px}.changed :deep(dd){margin:6px 0 18px}.inline-editor{display:grid;gap:12px}.inline-editor label{display:grid;gap:6px}.inline-editor input,.inline-editor textarea{font:inherit;padding:10px;color:#19344e;border:1px solid #849bad;border-radius:6px}.editor-notice{background:#e7f0fb;color:#173e5a;padding:16px;border-radius:10px}
.hb-digest {
  --line: rgba(15, 23, 42, 0.08);
  --glass: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.85rem;
}
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
