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
            Changes since the previous Admin Update. The full handbook stays in Google Docs.
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

      <div v-if="!entries.length" class="empty">
        No handbook updates in this digest.
      </div>

      <article v-for="(e, idx) in entries" :key="e.id || idx" class="entry">
        <div class="entry-num">{{ idx + 1 }}</div>
        <div class="entry-body">
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

      <div class="ack-row" v-if="!previewMode">
        <button type="button" class="btn primary" :disabled="acking" @click="acknowledge">
          {{ acking ? 'Saving…' : 'I have reviewed these handbook updates' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

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

function formatChanged(text) {
  if (!text) return '<p>—</p>';
  const raw = String(text);
  if (raw.includes('<')) return raw;
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
