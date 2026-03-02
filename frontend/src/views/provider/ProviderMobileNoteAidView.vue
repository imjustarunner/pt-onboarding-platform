<template>
  <section class="card">
    <div class="section-head">
      <div>
        <h2>Note Aid</h2>
        <p>Quick launch + text draft save</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="actions">
      <router-link class="btn btn-primary btn-sm" :to="noteAidRoute">
        Open Full Note Aid
      </router-link>
    </div>

    <div class="field">
      <label>Draft text</label>
      <textarea v-model="draftText" rows="6" placeholder="Type session note draft..." />
    </div>
    <div class="actions">
      <button class="btn btn-success btn-sm" type="button" :disabled="saving || !draftText.trim()" @click="saveDraft">
        {{ saving ? 'Saving…' : 'Save Draft' }}
      </button>
    </div>

    <div v-if="successMessage" class="success-box">{{ successMessage }}</div>
    <div v-if="error" class="error-box">{{ error }}</div>

    <h3>Recent Drafts</h3>
    <div v-if="loading" class="muted">Loading drafts…</div>
    <div v-else-if="recentDrafts.length === 0" class="muted">No recent drafts found.</div>
    <div v-else class="drafts">
      <article v-for="d in recentDrafts" :key="d.id" class="draft">
        <div class="line1">
          <strong>{{ d.programLabel || d.serviceCode || 'Draft' }}</strong>
          <span>{{ formatDate(d.updatedAt || d.updated_at || d.createdAt) }}</span>
        </div>
        <p>{{ truncate(d.inputText || d.input_text || '', 140) }}</p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const agencyStore = useAgencyStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');
const recentDrafts = ref([]);
const draftText = ref('');

const orgSlug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));

const noteAidRoute = computed(() => {
  const query = { ...route.query };
  return {
    path: orgSlug.value ? `/${orgSlug.value}/admin/note-aid` : '/admin/note-aid',
    query
  };
});

const resolveAgencyId = async () => {
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (current?.id) return Number(current.id);
  const rows = await agencyStore.fetchUserAgencies();
  if (Array.isArray(rows) && rows[0]?.id) return Number(rows[0].id);
  return null;
};

const formatDate = (raw) => {
  const d = new Date(raw || '');
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString();
};

const truncate = (text, len) => {
  const raw = String(text || '').trim();
  if (raw.length <= len) return raw || 'No text';
  return `${raw.slice(0, len)}...`;
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    successMessage.value = '';
    const agencyId = await resolveAgencyId();
    if (!agencyId) throw new Error('No organization context available.');
    const resp = await api.get('/clinical-notes/recent', {
      params: { agencyId, days: 7 }
    });
    recentDrafts.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    recentDrafts.value = [];
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load recent drafts.';
  } finally {
    loading.value = false;
  }
};

const saveDraft = async () => {
  try {
    saving.value = true;
    error.value = '';
    successMessage.value = '';
    const agencyId = await resolveAgencyId();
    if (!agencyId) throw new Error('No organization context available.');

    await api.post('/clinical-notes/drafts', {
      agencyId,
      inputText: draftText.value.trim()
    });
    successMessage.value = 'Draft saved.';
    draftText.value = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save draft.';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.field {
  margin-top: 10px;
}

.field label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}

textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  resize: vertical;
}

.actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

h3 {
  margin: 14px 0 10px;
  font-size: 16px;
}

.drafts {
  display: grid;
  gap: 8px;
}

.draft {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-alt);
}

.line1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.draft p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
}

.error-box {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 10px;
}

.success-box {
  background: #e7f7ef;
  border: 1px solid #b8e6ca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 10px;
  color: #15693f;
}
</style>
