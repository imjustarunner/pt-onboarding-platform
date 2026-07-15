<template>
  <div class="clobby">
    <header class="clobby__header">
      <h1>Counseling Sessions</h1>
      <p>Start or reopen a one-to-one counseling session with activities.</p>
      <p v-if="resolvedAgencyName" class="clobby__org">
        Organization: <strong>{{ resolvedAgencyName }}</strong>
      </p>
    </header>

    <form class="clobby__create" @submit.prevent="createSession">
      <h2>New video session</h2>
      <p class="clobby__hint">
        No client required. Start alone, then copy a share link whenever you want to invite someone.
      </p>
      <label>
        Title
        <input v-model="title" type="text" maxlength="120" required />
      </label>
      <label>
        Client user ID (optional)
        <input v-model="clientUserId" type="number" min="1" placeholder="Leave blank — invite later with a link" />
      </label>
      <button type="submit" class="clobby__btn" :disabled="creating || !resolvedAgencyId">
        {{ creating ? 'Creating…' : 'Create &amp; open session' }}
      </button>
      <p v-if="!resolvedAgencyId" class="clobby__error">
        Select a tenant/organization above (e.g. ITSCO), then try again.
      </p>
      <p v-if="error" class="clobby__error">{{ error }}</p>
    </form>

    <section v-if="lastShareUrl" class="clobby__share">
      <h2>Share link</h2>
      <p class="clobby__hint">Send this to a client (they must sign in to join).</p>
      <code class="clobby__link">{{ lastShareUrl }}</code>
      <div class="clobby__share-actions">
        <button type="button" class="clobby__btn" @click="copyShare">
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
        <router-link v-if="lastSessionKey" class="clobby__btn clobby__btn--link" :to="sessionPath(lastSessionKey)">
          Open session
        </router-link>
      </div>
    </section>

    <section class="clobby__list">
      <h2>Your sessions</h2>
      <p v-if="loading">Loading…</p>
      <ul v-else>
        <li v-for="s in sessions" :key="s.publicId || s.id">
          <div>
            <strong>{{ s.title || 'Counseling Session' }}</strong>
            <span class="clobby__meta">{{ s.status }}</span>
          </div>
          <router-link class="clobby__btn clobby__btn--link" :to="sessionPath(s.publicId || s.id)">
            Open
          </router-link>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import * as counselingApi from '../../services/counselingApi.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const agencyStore = useAgencyStore();

const sessions = ref([]);
const loading = ref(true);
const creating = ref(false);
const title = ref('Counseling Session');
const clientUserId = ref('');
const error = ref('');
const lastShareUrl = ref('');
const lastSessionKey = ref(null);
const copied = ref(false);

const orgSlug = computed(() => {
  const fromRoute = String(route.params.organizationSlug || '').trim();
  if (fromRoute) return fromRoute;
  const a = agencyStore.currentAgency;
  return String(a?.slug || a?.portal_url || a?.portalUrl || '').trim() || null;
});

function agencyMatchesSlug(agency, slug) {
  if (!agency || !slug) return false;
  const s = String(slug).toLowerCase();
  return [agency.slug, agency.portal_url, agency.portalUrl]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
    .includes(s);
}

const resolvedAgency = computed(() => {
  const slug = String(route.params.organizationSlug || '').trim();
  if (slug) {
    const pools = [
      agencyStore.currentAgency,
      ...(Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []),
      ...(Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    ].filter(Boolean);
    const match = pools.find((a) => agencyMatchesSlug(a, slug));
    if (match) return match;
  }
  if (agencyStore.currentAgency?.id) return agencyStore.currentAgency;
  const q = Number(route.query.agencyId || 0);
  if (q) {
    const pools = [
      ...(Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []),
      ...(Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    ];
    return pools.find((a) => Number(a.id) === q) || { id: q, name: `Agency #${q}` };
  }
  const uidAgency = Number(auth.user?.agencyId || auth.user?.agency_id || 0);
  if (uidAgency) return { id: uidAgency, name: auth.user?.agencyName || `Agency #${uidAgency}` };
  return null;
});

const resolvedAgencyId = computed(() => Number(resolvedAgency.value?.id || 0) || 0);
const resolvedAgencyName = computed(
  () => resolvedAgency.value?.name || resolvedAgency.value?.official_name || ''
);

function sessionPath(id) {
  if (orgSlug.value) return `/${orgSlug.value}/counseling/session/${id}`;
  return `/counseling/session/${id}`;
}

async function refresh() {
  loading.value = true;
  try {
    sessions.value = await counselingApi.listCounselingSessions({
      agencyId: resolvedAgencyId.value || undefined
    });
  } finally {
    loading.value = false;
  }
}

function buildShareUrl(sharePath) {
  if (!sharePath) return '';
  const origin = window.location.origin;
  if (orgSlug.value && sharePath.startsWith('/counseling/')) {
    return `${origin}/${orgSlug.value}${sharePath}`;
  }
  return `${origin}${sharePath}`;
}

async function copyShare() {
  if (!lastShareUrl.value) return;
  try {
    await navigator.clipboard.writeText(lastShareUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    /* ignore */
  }
}

async function createSession() {
  creating.value = true;
  error.value = '';
  copied.value = false;
  try {
    const agencyId = resolvedAgencyId.value;
    if (!agencyId) {
      error.value = 'Select a tenant/organization above, then try again.';
      return;
    }
    const payload = {
      agencyId,
      title: title.value.trim() || 'Counseling Session',
      clientUserId: clientUserId.value ? Number(clientUserId.value) : null
    };
    const data = await counselingApi.createCounselingSession(payload);
    lastSessionKey.value = data.session.publicId || data.session.id;
    lastShareUrl.value = buildShareUrl(data.sharePath);
    await router.push(sessionPath(lastSessionKey.value));
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to create session';
  } finally {
    creating.value = false;
  }
}

watch(resolvedAgencyId, () => {
  refresh();
});

onMounted(async () => {
  if (!agencyStore.currentAgency && auth.user?.id) {
    try {
      await agencyStore.fetchUserAgencies();
    } catch {
      /* best-effort */
    }
  }
  await refresh();
});
</script>

<style scoped>
.clobby {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}
.clobby__header h1 {
  margin: 0 0 0.35rem;
}
.clobby__header p {
  margin: 0;
  color: #475569;
}
.clobby__org {
  margin-top: 0.5rem !important;
  font-size: 0.9rem;
}
.clobby__hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 400;
}
.clobby__share {
  margin-top: 1.5rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 1rem;
}
.clobby__link {
  display: block;
  word-break: break-all;
  background: #fff;
  border: 1px solid #d1fae5;
  border-radius: 8px;
  padding: 0.65rem;
  font-size: 0.8rem;
  margin: 0.5rem 0;
}
.clobby__share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.clobby__create,
.clobby__list {
  margin-top: 1.5rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}
.clobby__create label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
  font-size: 0.9rem;
}
.clobby__create input {
  font: inherit;
  font-weight: 400;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  min-height: 44px;
}
.clobby__btn {
  min-height: 44px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  padding: 0.55rem 1rem;
}
.clobby__btn--link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  background: #0f172a;
}
.clobby__error {
  color: #b91c1c;
  margin: 0.75rem 0 0;
}
.clobby__list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.clobby__list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem 0;
  border-bottom: 1px solid #f1f5f9;
}
.clobby__meta {
  display: block;
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 400;
}
</style>
