<template>
  <div class="msf-page">
    <header class="msf-header">
      <div>
        <h1>{{ channelMeta?.label || 'Master Digital Form' }}</h1>
        <p class="muted msf-sub">
          Framed master for the {{ channelMeta?.shortLabel || channel }} vertical. Structure is ready —
          questionnaire content and Join Full pathway wiring come online when this channel is activated.
        </p>
        <span class="framed-pill">{{ statusLabel }}</span>
      </div>
      <div class="msf-header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to Clients &amp; Guardians</router-link>
      </div>
    </header>

    <div class="msf-toolbar">
      <div class="locale-tabs" role="tablist">
        <button type="button" class="locale-tab" :class="{ active: locale === 'en' }" @click="setLocale('en')">English</button>
        <button type="button" class="locale-tab" :class="{ active: locale === 'es' }" @click="setLocale('es')">Spanish</button>
      </div>
      <div v-if="masterMeta" class="msf-meta">
        <strong>{{ masterMeta.title }}</strong>
        <span class="version-pill">V{{ masterMeta.version || 1 }}</span>
      </div>
    </div>

    <div v-if="!validChannel" class="error">Unknown channel. Use tutoring, consulting, or coaching.</div>
    <div v-else-if="!agencyId" class="error">No agency context.</div>
    <div v-else-if="loading" class="muted">Loading framed master…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!editorLinkId" class="framed-empty">
      <p>This master shell is framed but has no editor link yet.</p>
      <button type="button" class="btn btn-primary" :disabled="creating" @click="ensureMaster">
        {{ creating ? 'Creating…' : 'Create framed shell' }}
      </button>
    </div>
    <IntakeLinksView
      v-else
      :key="`${channel}-${locale}-${editorLinkId}`"
      class="msf-editor"
      :embedded="true"
      :initial-edit-link-id="editorLinkId"
      :scoped-agency-id="agencyId"
      @saved="loadMaster"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import IntakeLinksView from './IntakeLinksView.vue';
import { FRAMED_MASTER_CHANNELS, getMasterFormChannel } from '../../constants/masterFormChannels.js';

const route = useRoute();
const agencyStore = useAgencyStore();

const channel = computed(() => String(route.params?.channel || '').trim().toLowerCase());
const validChannel = computed(() => FRAMED_MASTER_CHANNELS.includes(channel.value));
const channelMeta = computed(() => getMasterFormChannel(channel.value));
const locale = ref('en');
const loading = ref(true);
const creating = ref(false);
const error = ref('');
const editorLinkId = ref(null);
const masterMeta = ref(null);
const statusLabel = computed(() => {
  const s = String(masterMeta.value?.status || channelMeta.value?.status || 'framed');
  return s === 'active' ? 'Active' : 'Framed — coming online';
});

const orgSlug = computed(() =>
  typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''
);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/schedule` : '/schedule'));

async function loadMaster() {
  if (!agencyId.value || !validChannel.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/channel-intake-masters/${channel.value}`, {
      params: { locale: locale.value }
    });
    const m = res.data?.master || null;
    editorLinkId.value = m?.editor_intake_link_id ? Number(m.editor_intake_link_id) : null;
    masterMeta.value = {
      title: m?.title || channelMeta.value?.label,
      version: m?.version ?? 1,
      status: m?.status || 'framed'
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load channel master';
    editorLinkId.value = null;
  } finally {
    loading.value = false;
  }
}

async function ensureMaster() {
  creating.value = true;
  try {
    await api.put(`/agencies/${agencyId.value}/channel-intake-masters/${channel.value}`, {
      locale: locale.value,
      title: channelMeta.value?.label || null
    });
    await loadMaster();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to create framed shell';
  } finally {
    creating.value = false;
  }
}

function setLocale(next) {
  const lang = next === 'es' ? 'es' : 'en';
  if (locale.value === lang) return;
  locale.value = lang;
}

watch([agencyId, channel, locale], () => loadMaster());
onMounted(loadMaster);
</script>

<style scoped>
.msf-page { padding: 24px 40px 48px; max-width: 1800px; margin: 0 auto; }
.msf-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.msf-header h1 { margin: 0; }
.msf-sub { max-width: 48rem; margin: 6px 0 0; line-height: 1.45; }
.framed-pill { display: inline-flex; margin-top: 10px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
.msf-header-actions { display: flex; gap: 8px; }
.msf-toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.msf-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.version-pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.locale-tabs { display: inline-flex; gap: 4px; padding: 3px; border-radius: 999px; background: #f3f4f6; }
.locale-tab { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; }
.locale-tab.active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.framed-empty { padding: 24px; border: 1px dashed #d1d5db; border-radius: 12px; background: #fafafa; }
.muted { color: #6b7280; }
.error { color: #b91c1c; margin-bottom: 12px; }
.msf-editor :deep(.container) { max-width: none; padding: 0; }
</style>
