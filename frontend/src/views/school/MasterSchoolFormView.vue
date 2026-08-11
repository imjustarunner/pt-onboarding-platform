<template>
  <div class="msf-page">
    <header class="msf-header">
      <div>
        <h1>Master School Form</h1>
        <p class="muted msf-sub">
          One questionnaire and consent flow for every school. Each school keeps its own shareable link in the
          School Referral Hub; every open uses this master live. Edit EN and ES here — you stay on this page.
        </p>
      </div>
      <div class="msf-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="referralHubTo">Referral Hub links</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to School Operations</router-link>
      </div>
    </header>

    <div class="msf-toolbar">
      <div class="locale-tabs" role="tablist">
        <button
          type="button"
          class="locale-tab"
          :class="{ active: locale === 'en' }"
          @click="setLocale('en')"
        >
          English master
        </button>
        <button
          type="button"
          class="locale-tab"
          :class="{ active: locale === 'es' }"
          @click="setLocale('es')"
        >
          Spanish master
        </button>
      </div>
      <div v-if="masterMeta" class="msf-meta">
        <strong>{{ masterMeta.title || 'School Referral Master' }}</strong>
        <span class="version-pill">V{{ masterMeta.version || 1 }}</span>
        <span class="muted">{{ masterMeta.stepCount }} step(s) · live inheritance</span>
      </div>
    </div>

    <p class="muted msf-tip">
      Tip: remove duplicate insurance / permission one-time questions here — use Insurance info / Communications /
      Guardian steps instead. School shareable URLs stay in the Referral Hub; they are hidden from Digital Forms.
      <strong>Active</strong> does not apply here — every school link uses this master live.
    </p>

    <details v-if="masterCompare" class="msf-compare" open>
      <summary>Compare English ↔ Spanish masters</summary>
      <p class="muted msf-compare-intro">
        Use this to see step order differences and questionnaire fields that exist on one language but not the other.
        Spanish-only <strong>Spanish Clarification</strong> appears only on the ES master.
      </p>
      <div class="msf-compare-grid">
        <div class="msf-compare-col">
          <strong>English ({{ masterCompare.enStepCount }} steps)</strong>
        </div>
        <div class="msf-compare-col">
          <strong>Spanish ({{ masterCompare.esStepCount }} steps)</strong>
        </div>
      </div>
      <div
        v-for="(row, idx) in masterCompare.paired"
        :key="`pair-${idx}`"
        class="msf-compare-row"
        :class="{ 'msf-compare-row--mismatch': row.mismatch }"
      >
        <div class="msf-compare-col">{{ row.en ? `${row.en.index}. ${row.en.label}` : '—' }}</div>
        <div class="msf-compare-col">{{ row.es ? `${row.es.index}. ${row.es.label}` : '—' }}</div>
      </div>
      <div v-if="masterCompare.onlyInEnglish.length" class="msf-compare-fields">
        <strong>Question fields only on English master</strong>
        <ul>
          <li v-for="f in masterCompare.onlyInEnglish" :key="`en-only-${f.key}`">
            <code>{{ f.key }}</code> — {{ f.label }}
          </li>
        </ul>
      </div>
      <div v-if="masterCompare.onlyInSpanish.length" class="msf-compare-fields">
        <strong>Question fields only on Spanish master</strong>
        <ul>
          <li v-for="f in masterCompare.onlyInSpanish" :key="`es-only-${f.key}`">
            <code>{{ f.key }}</code> — {{ f.label }}
          </li>
        </ul>
      </div>
      <p
        v-if="!masterCompare.onlyInEnglish.length && !masterCompare.onlyInSpanish.length && !masterCompare.paired.some((r) => r.mismatch)"
        class="muted msf-compare-ok"
      >
        Step order and question field keys match between EN and ES.
      </p>
    </details>

    <div v-if="!agencyId" class="error">No agency context. Open School Operations from an agency portal.</div>
    <div v-else-if="loading" class="muted">Loading master form…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!editorLinkId" class="error">Master editor link is missing. Refresh or contact support.</div>
    <IntakeLinksView
      v-else
      :key="`${locale}-${editorLinkId}`"
      class="msf-editor"
      :embedded="true"
      :initial-edit-link-id="editorLinkId"
      :scoped-agency-id="agencyId"
      @saved="onEditorSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import IntakeLinksView from '../admin/IntakeLinksView.vue';
import { compareSchoolMasterSteps } from '../../utils/schoolMasterStepCompare.js';

const route = useRoute();
const agencyStore = useAgencyStore();

const locale = ref(String(route.query?.locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
const loading = ref(true);
const error = ref('');
const editorLinkId = ref(null);
const masterMeta = ref(null);
const masterCompare = ref(null);

const orgSlug = computed(() =>
  typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''
);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/school-operations` : '/school-operations'));
const referralHubTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/school-referral-hub` : '/admin/school-referral-hub'
);

async function loadMasterCompare() {
  if (!agencyId.value) {
    masterCompare.value = null;
    return;
  }
  try {
    const [enRes, esRes] = await Promise.all([
      api.get(`/agencies/${agencyId.value}/school-intake-master`, { params: { locale: 'en' } }),
      api.get(`/agencies/${agencyId.value}/school-intake-master`, { params: { locale: 'es' } })
    ]);
    masterCompare.value = compareSchoolMasterSteps(
      enRes.data?.master?.intake_steps || [],
      esRes.data?.master?.intake_steps || []
    );
  } catch {
    masterCompare.value = null;
  }
}

async function loadMaster() {
  if (!agencyId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/school-intake-master`, {
      params: { locale: locale.value }
    });
    const m = res.data?.master || null;
    editorLinkId.value = m?.editor_intake_link_id ? Number(m.editor_intake_link_id) : null;
    const steps = Array.isArray(m?.intake_steps) ? m.intake_steps : [];
    masterMeta.value = {
      title: m?.title || '',
      version: m?.version ?? 1,
      stepCount: steps.length
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load master form';
    editorLinkId.value = null;
    masterMeta.value = null;
  } finally {
    loading.value = false;
  }
}

function setLocale(next) {
  const lang = next === 'es' ? 'es' : 'en';
  if (locale.value === lang) return;
  locale.value = lang;
}

async function onEditorSaved() {
  await Promise.all([loadMaster(), loadMasterCompare()]);
}

watch(agencyId, (id) => {
  if (id) {
    loadMaster();
    loadMasterCompare();
  }
});

watch(locale, () => {
  loadMaster();
});

onMounted(() => {
  loadMaster();
  loadMasterCompare();
});
</script>

<style scoped>
.msf-page {
  padding: 24px 40px 48px;
  max-width: 1800px;
  margin: 0 auto;
}
.msf-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.msf-header h1 {
  margin: 0;
}
.msf-sub {
  max-width: 52rem;
  margin: 6px 0 0;
  line-height: 1.45;
}
.msf-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.msf-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 8px;
}
.msf-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.version-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.msf-tip {
  margin: 0 0 14px;
  font-size: 13px;
}
.msf-compare {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fafafa;
}
.msf-compare summary {
  cursor: pointer;
  font-weight: 700;
  color: #111827;
}
.msf-compare-intro {
  margin: 10px 0 12px;
  font-size: 13px;
}
.msf-compare-grid,
.msf-compare-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.msf-compare-grid {
  margin-bottom: 6px;
  font-size: 13px;
}
.msf-compare-row {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.35;
}
.msf-compare-row--mismatch {
  background: #fff7ed;
  border: 1px solid #fed7aa;
}
.msf-compare-col {
  min-width: 0;
}
.msf-compare-fields {
  margin-top: 12px;
  font-size: 13px;
}
.msf-compare-fields ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.msf-compare-ok {
  margin: 12px 0 0;
  font-size: 13px;
}
.locale-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: #f3f4f6;
}
.locale-tab {
  border: 0;
  background: transparent;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.locale-tab.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.muted { color: #6b7280; }
.error { color: #b91c1c; margin-bottom: 12px; }
.msf-editor :deep(.container) {
  max-width: none;
  padding: 0;
}
</style>
