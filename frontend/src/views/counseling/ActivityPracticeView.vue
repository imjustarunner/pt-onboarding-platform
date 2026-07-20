<template>
  <div class="apractice">
    <header class="apractice__header">
      <div>
        <p class="apractice__eyebrow">Practice mode</p>
        <h1>{{ activityTitle }}</h1>
        <p class="apractice__hint">
          Open this activity without a video session. Use “Use in session” from Tools when you want
          to run it live with a client.
        </p>
      </div>
      <div class="apractice__header-actions">
        <button type="button" class="apractice__btn" @click="goBack">Back to Tools</button>
        <button type="button" class="apractice__btn apractice__btn--secondary" @click="goCounseling">
          Use in session
        </button>
      </div>
    </header>

    <p v-if="loading" class="apractice__status">Starting practice…</p>
    <p v-else-if="error" class="apractice__error">{{ error }}</p>

    <div v-else-if="sessionKey && runtime" class="apractice__stage">
      <ActivityHost
        :session-id="sessionKey"
        role="provider"
        :runtime="runtime"
        :layout="layout"
        provider-label="You"
        practice-mode
        @runtime-updated="onRuntimeUpdated"
        @practice-exit="goBack"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import ActivityHost from '../../components/counseling/ActivityHost.vue';
import * as counselingApi from '../../services/counselingApi.js';
import { embeddedActivityManifests } from '../../activities/index.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const error = ref('');
const sessionKey = ref(null);
const runtime = ref(null);
let pollTimer = null;

const activityId = computed(() => String(route.params.activityId || '').trim());

const activityTitle = computed(() => {
  const fromRuntime = runtime.value?.sharedState?.activityDisplayName;
  if (fromRuntime) return fromRuntime;
  const manifest = embeddedActivityManifests[activityId.value];
  return manifest?.displayName || activityId.value || 'Activity';
});

const layout = computed(() => (window.matchMedia('(max-width: 720px)').matches ? 'mobile' : 'web'));

const orgSlug = computed(() => {
  const fromRoute = String(route.params.organizationSlug || '').trim();
  if (fromRoute) return fromRoute;
  const a = agencyStore.currentAgency;
  return String(a?.slug || a?.portal_url || a?.portalUrl || '').trim() || null;
});

function orgTo(path) {
  if (orgSlug.value) return `/${orgSlug.value}${path}`;
  return path;
}

function goBack() {
  stopPoll();
  router.push({
    path: orgTo('/dashboard'),
    query: { tab: 'tools_aids', toolsTab: 'games' }
  });
}

function goCounseling() {
  stopPoll();
  router.push(orgTo('/counseling'));
}

function onRuntimeUpdated(next) {
  if (next) runtime.value = next;
}

async function refreshRuntime() {
  if (!sessionKey.value) return;
  try {
    const next = await counselingApi.getActivityRuntime(sessionKey.value);
    if (next) runtime.value = next;
  } catch {
    /* ignore poll errors */
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    const agencyId =
      agencyStore.currentAgency?.id ||
      agencyStore.currentAgency?.value?.id ||
      null;
    if (!agencyId) {
      throw new Error('Select an organization first, then try again.');
    }
    if (!activityId.value) {
      throw new Error('Missing activity id.');
    }
    const data = await counselingApi.startPracticeActivity(activityId.value, { agencyId });
    sessionKey.value = data?.session?.publicId || data?.session?.id;
    runtime.value = data?.runtime || null;
    if (!sessionKey.value || !runtime.value) {
      throw new Error('Practice session could not be started.');
    }
    pollTimer = setInterval(refreshRuntime, 4000);
  } catch (err) {
    error.value =
      err?.response?.data?.error?.message || err?.message || 'Could not start practice mode.';
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  stopPoll();
});
</script>

<style scoped>
.apractice {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 20px 48px;
}
.apractice__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.apractice__eyebrow {
  margin: 0 0 4px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0f766e;
}
.apractice__header h1 {
  margin: 0;
  font-size: 1.6rem;
  letter-spacing: -0.02em;
}
.apractice__hint {
  margin: 8px 0 0;
  max-width: 42rem;
  color: #64748b;
  line-height: 1.45;
}
.apractice__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.apractice__btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.apractice__btn--secondary {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.apractice__status,
.apractice__error {
  padding: 16px;
  border-radius: 12px;
  background: #f8fafc;
}
.apractice__error {
  background: #fef2f2;
  color: #991b1b;
}
.apractice__stage {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 16px;
  min-height: 420px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}
@media (max-width: 720px) {
  .apractice {
    padding: 12px 12px 32px;
  }
  .apractice__stage {
    padding: 10px;
    min-height: 320px;
  }
}
</style>
