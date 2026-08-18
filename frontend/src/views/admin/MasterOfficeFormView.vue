<template>
  <div class="msf-page">
    <header class="msf-header">
      <div>
        <h1>Master Counseling Digital Form</h1>
        <p class="muted msf-sub">
          Counseling in-office intake used by Join → In-Depth Intake Packet. Separate from school referral masters
          and from Master Tutoring — no school ROI step. Edit EN/ES here; the published shell updates live for Join.
        </p>
      </div>
      <div class="msf-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="paperTo">Master Counseling Paper</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to Clients &amp; Guardians</router-link>
      </div>
    </header>

    <div class="msf-toolbar">
      <div class="locale-tabs" role="tablist">
        <button type="button" class="locale-tab" :class="{ active: locale === 'en' }" @click="setLocale('en')">
          English master
        </button>
        <button type="button" class="locale-tab" :class="{ active: locale === 'es' }" @click="setLocale('es')">
          Spanish master
        </button>
      </div>
      <div v-if="masterMeta" class="msf-meta">
        <strong>{{ masterMeta.title || 'Office Intake Master' }}</strong>
        <span class="version-pill">V{{ masterMeta.version || 1 }}</span>
        <span class="muted">{{ masterMeta.stepCount }} step(s) · Join In-Depth</span>
      </div>
    </div>

    <p class="muted msf-tip">
      Tip: keep school ROI off this master. Legal packet sections and Smart Disclosure stay here for office clients.
      Shareable Join uses the published shell automatically.
    </p>

    <div v-if="!agencyId" class="error">No agency context. Open Workforce Ops from an agency portal.</div>
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
import IntakeLinksView from './IntakeLinksView.vue';

const route = useRoute();
const agencyStore = useAgencyStore();

const locale = ref(String(route.query?.locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
const loading = ref(true);
const error = ref('');
const editorLinkId = ref(null);
const masterMeta = ref(null);

const orgSlug = computed(() =>
  typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''
);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/schedule` : '/schedule'));
const paperTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/master-office-paper` : '/admin/master-office-paper'
);

async function loadMaster() {
  if (!agencyId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/office-intake-master`, {
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
  await loadMaster();
}

watch(agencyId, (id) => { if (id) loadMaster(); });
watch(locale, () => { loadMaster(); });
onMounted(() => { loadMaster(); });
</script>

<style scoped>
.msf-page { padding: 24px 40px 48px; max-width: 1800px; margin: 0 auto; }
.msf-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 12px; }
.msf-header h1 { margin: 0; }
.msf-sub { max-width: 52rem; margin: 6px 0 0; line-height: 1.45; }
.msf-header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.msf-toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.msf-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.version-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.msf-tip { margin: 0 0 14px; font-size: 13px; }
.locale-tabs { display: inline-flex; gap: 4px; padding: 3px; border-radius: 999px; background: #f3f4f6; }
.locale-tab { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; }
.locale-tab.active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.muted { color: #6b7280; }
.error { color: #b91c1c; margin-bottom: 12px; }
.msf-editor :deep(.container) { max-width: none; padding: 0; }
</style>
