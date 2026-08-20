<template>
  <div class="cg-page">
    <header class="cg-header">
      <div>
        <h1>Contract Generator</h1>
        <p>Editable clauses and configs that replace the Google Sheets employment contract builder.</p>
      </div>
      <div class="cg-tabs">
        <button type="button" :class="{ active: tab === 'configs' }" @click="tab = 'configs'">Configs</button>
        <button type="button" :class="{ active: tab === 'clauses' }" @click="tab = 'clauses'">Clauses</button>
        <button type="button" :class="{ active: tab === 'templates' }" @click="tab = 'templates'">Templates</button>
        <button type="button" :class="{ active: tab === 'wizard' }" @click="tab = 'wizard'">Generate</button>
      </div>
    </header>

    <div v-if="loading" class="cg-muted">Loading library…</div>
    <div v-else-if="error" class="cg-error">{{ error }}</div>

    <template v-else>
      <!-- Configs -->
      <section v-if="tab === 'configs'" class="cg-panel">
        <div v-for="c in configs" :key="c.id" class="cg-card">
          <strong>{{ c.name }}</strong>
          <div class="cg-muted">{{ c.slug }} · pay {{ c.pay_mode }} · {{ (c.clause_keys || []).join(' → ') }}</div>
        </div>
        <p v-if="!configs.length" class="cg-muted">No configs yet. Run migration 1250 for ITSCO seeds, or create one below.</p>
        <form class="cg-form" @submit.prevent="createConfig">
          <h3>New config</h3>
          <input v-model="newConfig.name" placeholder="Name" required />
          <input v-model="newConfig.slug" placeholder="slug_optional" />
          <select v-model="newConfig.payMode">
            <option value="hourly">Hourly</option>
            <option value="ffs">FFS</option>
            <option value="none">None</option>
          </select>
          <input v-model="newConfig.clauseKeys" placeholder="CLAUSE_A,CLAUSE_B" />
          <button type="submit" class="cg-btn">Create config</button>
        </form>
      </section>

      <!-- Clauses -->
      <section v-else-if="tab === 'clauses'" class="cg-panel">
        <div v-for="cl in clauses" :key="cl.id" class="cg-card">
          <div class="cg-card-head">
            <strong>{{ cl.clause_key }}</strong>
            <span class="cg-muted">{{ cl.title }}</span>
            <button type="button" class="cg-link" @click="editClause(cl)">Edit</button>
          </div>
          <div v-if="editingClauseId === cl.id" class="cg-form">
            <input v-model="clauseDraft.title" placeholder="Title" />
            <textarea v-model="clauseDraft.bodyHtml" rows="8" />
            <button type="button" class="cg-btn" @click="saveClause">Save clause</button>
          </div>
        </div>
        <form class="cg-form" @submit.prevent="createClause">
          <h3>New clause</h3>
          <input v-model="newClause.clauseKey" placeholder="CLAUSE_KEY" required />
          <input v-model="newClause.title" placeholder="Title" required />
          <textarea v-model="newClause.bodyHtml" rows="5" placeholder="HTML with {{TOKENS}}" required />
          <button type="submit" class="cg-btn">Create clause</button>
        </form>
      </section>

      <!-- Templates -->
      <section v-else-if="tab === 'templates'" class="cg-panel">
        <div v-for="t in templates" :key="t.id" class="cg-card">
          <strong>{{ t.name }}</strong>
          <div class="cg-muted">{{ t.font_family || 'default font' }}</div>
        </div>
        <form class="cg-form" @submit.prevent="createTemplate">
          <h3>New template</h3>
          <input v-model="newTemplate.name" placeholder="Name" required />
          <input v-model="newTemplate.fontFamily" placeholder="Font family" />
          <button type="submit" class="cg-btn">Create template</button>
        </form>
      </section>

      <!-- Wizard -->
      <section v-else class="cg-panel">
        <div class="cg-form">
          <label>
            Candidate user ID
            <input v-model="wizard.candidateUserId" type="number" required />
          </label>
          <label>
            Configuration
            <select v-model="wizard.configId" required>
              <option value="">— select —</option>
              <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label>
            Template (optional)
            <select v-model="wizard.templateId">
              <option value="">— config default —</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label>
            Compensation category (1–3)
            <input v-model.number="wizard.compensationCategory" type="number" min="1" max="3" />
          </label>
          <label>
            Compensation level (1–5)
            <input v-model.number="wizard.compensationLevel" type="number" min="1" max="5" />
          </label>
          <label>
            Supervisor name
            <input v-model="wizard.tokens.SUPERVISOR_NAME" />
          </label>
          <label>
            Min hours
            <input v-model="wizard.tokens.MIN_HOURS" />
          </label>
          <label>
            License info
            <input v-model="wizard.tokens.LICENSE_INFO" />
          </label>
          <label>
            University
            <input v-model="wizard.tokens.UNIVERSITY" />
          </label>
          <div class="cg-actions">
            <button type="button" class="cg-btn" :disabled="busy" @click="preview">Preview</button>
            <button type="button" class="cg-btn primary" :disabled="busy" @click="generate">Generate &amp; assign</button>
          </div>
          <p v-if="wizardMsg" class="cg-ok">{{ wizardMsg }}</p>
          <p v-if="wizardErr" class="cg-error">{{ wizardErr }}</p>
        </div>
        <div v-if="previewHtml" class="cg-preview" v-html="previewHtml"></div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const auth = useAuthStore();
const route = useRoute();
const agencyId = computed(() => auth.user?.agencyId || auth.currentAgencyId || route.query.agencyId);

const tab = ref('configs');
const loading = ref(true);
const error = ref('');
const busy = ref(false);
const templates = ref([]);
const clauses = ref([]);
const configs = ref([]);

const newConfig = ref({ name: '', slug: '', payMode: 'hourly', clauseKeys: '' });
const newClause = ref({ clauseKey: '', title: '', bodyHtml: '' });
const newTemplate = ref({ name: '', fontFamily: 'Georgia, serif' });
const editingClauseId = ref(null);
const clauseDraft = ref({ title: '', bodyHtml: '' });

const wizard = ref({
  candidateUserId: route.query.candidateUserId || '',
  configId: '',
  templateId: '',
  compensationCategory: 3,
  compensationLevel: 1,
  tokens: {
    SUPERVISOR_NAME: '',
    MIN_HOURS: '',
    LICENSE_INFO: '',
    UNIVERSITY: ''
  }
});
const previewHtml = ref('');
const wizardMsg = ref('');
const wizardErr = ref('');

async function loadLibrary() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/contracts/library', { params: { agencyId: agencyId.value } });
    templates.value = data.templates || [];
    clauses.value = data.clauses || [];
    configs.value = data.configs || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function createConfig() {
  const clauseKeys = String(newConfig.value.clauseKeys || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await api.post('/contracts/configs', {
    agencyId: agencyId.value,
    name: newConfig.value.name,
    slug: newConfig.value.slug,
    payMode: newConfig.value.payMode,
    clauseKeys
  });
  newConfig.value = { name: '', slug: '', payMode: 'hourly', clauseKeys: '' };
  await loadLibrary();
}

async function createClause() {
  await api.post('/contracts/clauses', {
    agencyId: agencyId.value,
    ...newClause.value
  });
  newClause.value = { clauseKey: '', title: '', bodyHtml: '' };
  await loadLibrary();
}

function editClause(cl) {
  editingClauseId.value = cl.id;
  clauseDraft.value = { title: cl.title, bodyHtml: cl.body_html };
}

async function saveClause() {
  await api.patch(`/contracts/clauses/${editingClauseId.value}`, {
    agencyId: agencyId.value,
    ...clauseDraft.value
  });
  editingClauseId.value = null;
  await loadLibrary();
}

async function createTemplate() {
  await api.post('/contracts/templates', {
    agencyId: agencyId.value,
    ...newTemplate.value
  });
  newTemplate.value = { name: '', fontFamily: 'Georgia, serif' };
  await loadLibrary();
}

async function preview() {
  wizardErr.value = '';
  wizardMsg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post(
      `/contracts/candidates/${wizard.value.candidateUserId}/preview`,
      {
        agencyId: agencyId.value,
        configId: Number(wizard.value.configId),
        templateId: wizard.value.templateId ? Number(wizard.value.templateId) : null,
        compensationCategory: wizard.value.compensationCategory,
        compensationLevel: wizard.value.compensationLevel,
        tokens: wizard.value.tokens
      }
    );
    previewHtml.value = data.html || '';
    if (data.unresolvedTokens?.length) {
      wizardMsg.value = `Preview ready. Unresolved: ${data.unresolvedTokens.join(', ')}`;
    } else {
      wizardMsg.value = 'Preview ready.';
    }
  } catch (e) {
    wizardErr.value = e?.response?.data?.error?.message || e.message;
  } finally {
    busy.value = false;
  }
}

async function generate() {
  wizardErr.value = '';
  wizardMsg.value = '';
  busy.value = true;
  try {
    const { data } = await api.post(
      `/contracts/candidates/${wizard.value.candidateUserId}/generate`,
      {
        agencyId: agencyId.value,
        configId: Number(wizard.value.configId),
        templateId: wizard.value.templateId ? Number(wizard.value.templateId) : null,
        compensationCategory: wizard.value.compensationCategory,
        compensationLevel: wizard.value.compensationLevel,
        tokens: wizard.value.tokens
      }
    );
    previewHtml.value = data.html || previewHtml.value;
    wizardMsg.value = `Assigned as task #${data.task?.id || data.taskId}. Generation #${data.generationId}.`;
  } catch (e) {
    wizardErr.value = e?.response?.data?.error?.message || e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  if (route.query.candidateUserId) tab.value = 'wizard';
  loadLibrary();
});
</script>

<style scoped>
.cg-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
.cg-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.cg-header h1 { margin: 0 0 6px; font-size: 22px; }
.cg-header p { margin: 0; color: #64748b; }
.cg-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.cg-tabs button {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer;
}
.cg-tabs button.active { background: #0f172a; color: #fff; border-color: #0f172a; }
.cg-panel { display: grid; gap: 12px; }
.cg-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #fff; }
.cg-card-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cg-form { display: grid; gap: 8px; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; }
.cg-form input, .cg-form select, .cg-form textarea {
  border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font: inherit;
}
.cg-form label { display: grid; gap: 4px; font-size: 13px; color: #475569; }
.cg-btn {
  justify-self: start; border: none; border-radius: 8px; padding: 8px 14px;
  background: #e2e8f0; cursor: pointer; font-weight: 600;
}
.cg-btn.primary { background: #2563eb; color: #fff; }
.cg-actions { display: flex; gap: 8px; }
.cg-muted { color: #94a3b8; font-size: 13px; }
.cg-error { color: #dc2626; }
.cg-ok { color: #16a34a; }
.cg-link { background: none; border: none; color: #2563eb; cursor: pointer; }
.cg-preview {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; overflow: auto;
}
</style>
