<template>
  <section v-if="shellVisible" class="club-employer-share-card">
    <div class="club-employer-share-card__head">
      <strong>Join a colleague’s club</strong>
      <small class="hint">Your club manager invited staff to join a Summit club.</small>
    </div>
    <div class="club-employer-share-card__list">
      <article v-for="p in prompts" :key="p.broadcastId" class="club-employer-share-card__item">
        <h3 class="club-employer-share-card__title">{{ p.clubName || 'Summit club' }}</h3>
        <p v-if="p.message" class="club-employer-share-card__msg">{{ p.message }}</p>
        <div class="club-employer-share-card__actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="savingId === p.broadcastId" @click="onJoin(p)">
            Join
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="savingId === p.broadcastId" @click="respond(p, 'dismiss')">
            Dismiss
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="savingId === p.broadcastId" @click="respond(p, 'never')">
            Never show
          </button>
        </div>
      </article>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useOrganizationStore } from '../../store/organization';
import { NATIVE_APP_ORG_SLUG } from '../../utils/summitPlatformSlugs.js';
import { resolveSummitStatsSlug } from '../../utils/summitRoutingContext.js';

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const organizationStore = useOrganizationStore();

const loading = ref(false);
const prompts = ref([]);
const error = ref('');
const savingId = ref(null);

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || 0);
const orgType = computed(() =>
  String(agencyStore.currentAgency?.organization_type || agencyStore.currentAgency?.organizationType || '').toLowerCase()
);

const shellVisible = computed(() => {
  if (!agencyId.value) return false;
  if (orgType.value === 'affiliation') return false;
  if (loading.value) return false;
  return prompts.value.length > 0;
});

const summitJoinSlug = computed(() => {
  const orgs =
    (Array.isArray(authStore.user?.agencies) && authStore.user.agencies.length
      ? authStore.user.agencies
      : agencyStore.userAgencies?.value ?? agencyStore.userAgencies) || [];
  const list = Array.isArray(orgs) ? orgs : [];
  const cur = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  return (
    resolveSummitStatsSlug({
      organizationContext: organizationStore.organizationContext || null,
      currentAgency: cur,
      orgs: list
    }) || NATIVE_APP_ORG_SLUG
  );
});

async function loadPrompts() {
  error.value = '';
  if (!agencyId.value || orgType.value === 'affiliation') {
    prompts.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get('/me/club-employer-share-prompts', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    prompts.value = Array.isArray(data?.prompts) ? data.prompts : [];
  } catch (e) {
    prompts.value = [];
    error.value = e?.response?.data?.error?.message || '';
  } finally {
    loading.value = false;
  }
}

async function respond(row, action) {
  const id = Number(row?.broadcastId || 0);
  if (!id) return;
  savingId.value = id;
  error.value = '';
  try {
    await api.post(`/me/club-employer-share-prompts/${id}/respond`, { action }, { skipGlobalLoading: true });
    prompts.value = prompts.value.filter((p) => Number(p.broadcastId) !== id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update';
  } finally {
    savingId.value = null;
  }
}

async function onJoin(row) {
  const clubId = Number(row?.clubId || 0);
  const bid = Number(row?.broadcastId || 0);
  if (!clubId || !bid) return;
  savingId.value = bid;
  error.value = '';
  try {
    await api.post(`/me/club-employer-share-prompts/${bid}/respond`, { action: 'join' }, { skipGlobalLoading: true });
    prompts.value = prompts.value.filter((p) => Number(p.broadcastId) !== bid);
    const slug = String(summitJoinSlug.value || NATIVE_APP_ORG_SLUG).toLowerCase();
    router.push({ path: `/${slug}/join`, query: { club: String(clubId) } });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update';
  } finally {
    savingId.value = null;
  }
}

watch(
  () => [agencyId.value, orgType.value],
  () => {
    loadPrompts();
  }
);

onMounted(() => {
  loadPrompts();
});
</script>

<style scoped>
.club-employer-share-card {
  margin: 0 0 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px solid #c7d2fe;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
}
.club-employer-share-card__head {
  margin-bottom: 12px;
}
.club-employer-share-card__head strong {
  display: block;
  font-size: 1rem;
  color: #1e293b;
}
.club-employer-share-card__head .hint {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}
.club-employer-share-card__item {
  padding: 12px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
}
.club-employer-share-card__item:first-of-type {
  border-top: none;
  padding-top: 0;
}
.club-employer-share-card__title {
  margin: 0 0 6px;
  font-size: 15px;
  color: #0f172a;
}
.club-employer-share-card__msg {
  margin: 0 0 10px;
  font-size: 14px;
  color: #475569;
  white-space: pre-wrap;
}
.club-employer-share-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.error {
  margin-top: 10px;
  color: #b91c1c;
  font-size: 14px;
}
</style>
