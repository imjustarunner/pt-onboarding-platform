<template>
  <div class="faq">
    <div class="header">
      <div>
        <h2 style="margin: 0;">FAQ</h2>
        <div class="muted">Answers to common questions (non-client-specific).</div>
      </div>
      <div class="header-actions">
        <button
          v-if="canManageFaq"
          class="btn btn-primary btn-sm"
          type="button"
          @click="openCreateModal"
        >
          Add FAQ
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="groups.length === 0" class="empty">No FAQs published yet.</div>

    <div v-else class="groups">
      <div v-for="g in groups" :key="g.subjectKey" class="group">
        <div class="group-title">{{ g.subjectLabel }}</div>
        <div class="items">
          <details v-for="i in g.items" :key="i.id" class="item">
            <summary class="q">{{ i.question }}</summary>
            <div class="a">
              <div v-if="i.ai_summary" class="summary">
                <div class="label">Quick answer</div>
                <div class="text">{{ i.ai_summary }}</div>
              </div>
              <div class="label">Answer</div>
              <div class="text">{{ i.answer }}</div>
            </div>
          </details>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal" class="faq-modal-overlay" @click.self="closeCreateModal">
      <div class="faq-modal" @click.stop>
        <div class="faq-modal-header">
          <strong>Add FAQ</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeCreateModal">Close</button>
        </div>
        <div class="faq-modal-body">
          <div class="field">
            <label>Subject</label>
            <input v-model="newFaqSubject" class="input" type="text" maxlength="120" placeholder="General" />
          </div>
          <div class="field">
            <label>Question</label>
            <textarea v-model="newFaqQuestion" class="input textarea" rows="4" placeholder="Enter FAQ question"></textarea>
          </div>
          <div class="field">
            <label>Answer</label>
            <textarea v-model="newFaqAnswer" class="input textarea" rows="6" placeholder="Enter answer"></textarea>
          </div>
          <div v-if="createError" class="error">{{ createError }}</div>
          <div class="faq-modal-actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="closeCreateModal">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" :disabled="creatingFaq" @click="submitCreateFaq">
              {{ creatingFaq ? 'Saving…' : 'Save FAQ' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true }
});

const authStore = useAuthStore();
const loading = ref(false);
const error = ref('');
const faqs = ref([]);
const showCreateModal = ref(false);
const creatingFaq = ref(false);
const createError = ref('');
const newFaqSubject = ref('');
const newFaqQuestion = ref('');
const newFaqAnswer = ref('');

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManageFaq = computed(() => (
  roleNorm.value === 'provider' ||
  roleNorm.value === 'admin' ||
  roleNorm.value === 'staff' ||
  roleNorm.value === 'super_admin'
));

const normalizeSubject = (s) => String(s || '').trim();

const groups = computed(() => {
  const list = Array.isArray(faqs.value) ? faqs.value : [];
  const by = new Map();
  for (const f of list) {
    const subject = normalizeSubject(f?.subject) || 'General';
    const key = subject.toLowerCase();
    if (!by.has(key)) by.set(key, { subjectKey: key, subjectLabel: subject, items: [] });
    by.get(key).items.push(f);
  }
  const out = Array.from(by.values());
  for (const g of out) {
    g.items.sort((a, b) => String(a.question || '').localeCompare(String(b.question || '')));
  }
  out.sort((a, b) => String(a.subjectLabel || '').localeCompare(String(b.subjectLabel || '')));
  return out;
});

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/faq`);
    faqs.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load FAQ';
    faqs.value = [];
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  createError.value = '';
  showCreateModal.value = true;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  creatingFaq.value = false;
  createError.value = '';
  newFaqSubject.value = '';
  newFaqQuestion.value = '';
  newFaqAnswer.value = '';
};

const submitCreateFaq = async () => {
  if (!canManageFaq.value) return;
  const question = String(newFaqQuestion.value || '').trim();
  const answer = String(newFaqAnswer.value || '').trim();
  if (!question || !answer) {
    createError.value = 'Question and answer are required.';
    return;
  }
  try {
    creatingFaq.value = true;
    createError.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/faq`, {
      subject: String(newFaqSubject.value || '').trim() || 'General',
      question,
      answer
    });
    await load();
    closeCreateModal();
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create FAQ';
  } finally {
    creatingFaq.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.header-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.muted {
  color: var(--text-secondary);
}
.error {
  color: #b32727;
  margin: 10px 0;
}
.empty {
  color: var(--text-secondary);
  padding: 18px 0;
}
.group {
  margin-top: 16px;
}
.group-title {
  font-weight: 900;
  margin-bottom: 8px;
  color: var(--text-primary);
}
.item {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.q {
  cursor: pointer;
  font-weight: 800;
  color: var(--text-primary);
}
.a {
  margin-top: 10px;
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
.summary {
  border-left: 3px solid var(--primary);
  padding-left: 10px;
  margin-bottom: 10px;
}
.faq-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 1700;
}
.faq-modal {
  width: min(680px, 96vw);
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.faq-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.faq-modal-body {
  padding: 14px;
}
.field {
  margin-bottom: 10px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  padding: 10px 12px;
}
.textarea {
  resize: vertical;
}
.faq-modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

