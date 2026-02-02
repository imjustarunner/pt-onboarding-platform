<template>
  <div class="page">
    <div class="header">
      <div>
        <h2 style="margin: 0;">FAQ</h2>
        <div class="muted">Create and publish School Portal FAQs (agency-scoped; no client initials).</div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="filters">
      <label class="field">
        Agency
        <select v-model="selectedAgencyId" class="input">
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </label>
      <label class="field">
        Status
        <select v-model="status" class="input">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label class="field" style="flex: 1; min-width: 220px;">
        Search
        <input v-model="q" class="input" type="text" placeholder="Subject, question, or answer…" />
      </label>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Create FAQ</div>
        <label class="field">
          Subject (optional)
          <input v-model="create.subject" class="input" type="text" placeholder="e.g., Scheduling" />
        </label>
        <label class="field">
          Question
          <textarea v-model="create.question" class="textarea" rows="3" />
        </label>
        <label class="field">
          Answer
          <textarea v-model="create.answer" class="textarea" rows="4" />
        </label>
        <label class="field">
          Status
          <select v-model="create.status" class="input">
            <option value="pending">Pending</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <small class="muted">Publishing will best-effort generate a short AI “Quick answer” if Gemini is configured.</small>
        </label>
        <button class="btn btn-primary" type="button" @click="createFaq" :disabled="creating || !canCreate">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
        <div v-if="createError" class="error" style="margin-top: 10px;">{{ createError }}</div>
      </div>

      <div class="card">
        <div class="card-title">FAQs</div>
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="filteredFaqs.length === 0" class="muted">No FAQs found.</div>
        <div v-else class="list">
          <button
            v-for="f in filteredFaqs"
            :key="f.id"
            class="row"
            type="button"
            :class="{ active: Number(selectedFaq?.id) === Number(f.id) }"
            @click="selectFaq(f)"
          >
            <div class="row-top">
              <strong>{{ f.subject || 'General' }}</strong>
              <span class="pill">{{ formatStatus(f.status) }}</span>
            </div>
            <div class="row-q">{{ f.question }}</div>
          </button>
        </div>
      </div>

      <div class="card" v-if="selectedFaq">
        <div class="card-title">Edit</div>
        <label class="field">
          Subject
          <input v-model="edit.subject" class="input" type="text" />
        </label>
        <label class="field">
          Question
          <textarea v-model="edit.question" class="textarea" rows="3" />
        </label>
        <label class="field">
          Answer
          <textarea v-model="edit.answer" class="textarea" rows="4" />
        </label>
        <label class="field">
          Status
          <select v-model="edit.status" class="input">
            <option value="pending">Pending</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <div v-if="selectedFaq.ai_summary" class="summary">
          <div class="label">Quick answer</div>
          <div class="text">{{ selectedFaq.ai_summary }}</div>
        </div>
        <button class="btn btn-primary" type="button" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <div v-if="saveError" class="error" style="margin-top: 10px;">{{ saveError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const agencies = computed(() => {
  const list = Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [];
  return list
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
    .map((a) => ({ id: a.id, name: a.name }));
});

const selectedAgencyId = ref('');
const status = ref('');
const q = ref('');

const loading = ref(false);
const error = ref('');
const faqs = ref([]);

const creating = ref(false);
const createError = ref('');
const create = ref({ subject: '', question: '', answer: '', status: 'pending' });

const selectedFaq = ref(null);
const edit = ref({ subject: '', question: '', answer: '', status: 'pending' });
const saving = ref(false);
const saveError = ref('');

const canCreate = computed(() => {
  return String(create.value.question || '').trim().length > 0 && String(create.value.answer || '').trim().length > 0;
});

const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'published') return 'Published';
  if (v === 'archived') return 'Archived';
  return 'Pending';
};

const filteredFaqs = computed(() => {
  const list = Array.isArray(faqs.value) ? faqs.value : [];
  const query = String(q.value || '').trim().toLowerCase();
  if (!query) return list;
  return list.filter((f) => {
    const hay = [f.subject, f.question, f.answer].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(query);
  });
});

const load = async () => {
  try {
    const aid = Number(selectedAgencyId.value);
    if (!aid) return;
    loading.value = true;
    error.value = '';
    const params = { agencyId: aid };
    if (status.value) params.status = status.value;
    const r = await api.get('/faqs', { params });
    faqs.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load FAQs';
    faqs.value = [];
  } finally {
    loading.value = false;
  }
};

const selectFaq = (f) => {
  selectedFaq.value = f || null;
  edit.value = {
    subject: String(f?.subject || ''),
    question: String(f?.question || ''),
    answer: String(f?.answer || ''),
    status: String(f?.status || 'pending')
  };
  saveError.value = '';
};

const createFaq = async () => {
  try {
    const aid = Number(selectedAgencyId.value);
    if (!aid) return;
    creating.value = true;
    createError.value = '';
    await api.post('/faqs', {
      agencyId: aid,
      subject: create.value.subject?.trim() || null,
      question: create.value.question?.trim(),
      answer: create.value.answer?.trim(),
      status: create.value.status
    });
    create.value = { subject: '', question: '', answer: '', status: 'pending' };
    await load();
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create FAQ';
  } finally {
    creating.value = false;
  }
};

const save = async () => {
  try {
    if (!selectedFaq.value?.id) return;
    saving.value = true;
    saveError.value = '';
    const r = await api.put(`/faqs/${selectedFaq.value.id}`, {
      subject: edit.value.subject?.trim() || null,
      question: edit.value.question?.trim(),
      answer: edit.value.answer?.trim(),
      status: edit.value.status
    });
    // Update local list
    const updated = r.data || null;
    const list = Array.isArray(faqs.value) ? faqs.value.slice() : [];
    const idx = list.findIndex((x) => Number(x?.id) === Number(selectedFaq.value?.id));
    if (idx >= 0) list[idx] = updated;
    faqs.value = list;
    selectedFaq.value = updated;
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save FAQ';
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  await agencyStore.fetchAgencies();
  const currentId = agencyStore.currentAgency?.id ? String(agencyStore.currentAgency.id) : '';
  selectedAgencyId.value = currentId || (agencies.value?.[0]?.id ? String(agencies.value[0].id) : '');
  await load();
});

watch([selectedAgencyId, status], load);
</script>

<style scoped>
.page {
  padding: 22px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
.error {
  color: #b32727;
  margin: 10px 0;
}
.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: end;
  margin-bottom: 12px;
}
.field {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  display: block;
}
.input, .textarea {
  width: 100%;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
  margin-top: 6px;
}
.textarea {
  min-width: 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 12px;
}
.card-title {
  font-weight: 900;
  margin-bottom: 10px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow: auto;
}
.row {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--bg);
  cursor: pointer;
}
.row.active {
  border-color: var(--primary);
  background: white;
}
.row-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
}
.pill {
  font-size: 12px;
  color: var(--text-secondary);
}
.row-q {
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.summary {
  border-left: 3px solid var(--primary);
  padding-left: 10px;
  margin: 10px 0;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.text {
  white-space: pre-wrap;
}
@media (max-width: 1100px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

