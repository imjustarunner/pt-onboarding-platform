<template>
  <div class="faq">
    <div class="header">
      <div>
        <h2 style="margin: 0;">FAQ</h2>
        <div class="muted">Answers to common questions (non-client-specific).</div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true }
});

const loading = ref(false);
const error = ref('');
const faqs = ref([]);

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
</style>

