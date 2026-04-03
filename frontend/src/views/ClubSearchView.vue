<template>
  <div class="club-search" :style="{ background: loginBackground }">
    <div class="clubs-container">
      <div v-if="displayLogoUrl && !logoError" class="clubs-logo">
        <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="logoError = true" />
      </div>
      <h1>Find a Club</h1>
      <p class="subtitle">Browse clubs and apply to join. Sign in to apply.</p>

      <div class="search-filters">
        <input
          v-model="search"
          type="text"
          placeholder="Search by name or city..."
          class="search-input"
          @input="debouncedSearch"
        />
        <select v-model="stateFilter" class="state-select" @change="fetchClubs">
          <option value="">All states</option>
          <option v-for="s in usStates" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div v-if="loading" class="loading">Loading clubs…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!clubs.length" class="empty">No clubs found. Try a different search.</div>
      <div v-else class="clubs-grid">
        <div v-for="c in clubs" :key="c.id" class="club-card">
          <div class="club-info">
            <button type="button" class="club-name-link" @click="viewClub(c)">{{ c.name }}</button>
            <div v-if="c.slug || c.city || c.state" class="club-meta">
              <template v-if="c.slug">{{ c.slug }}</template>
              <template v-if="c.slug && (c.city || c.state)"> · </template>
              <template v-if="c.city || c.state">{{ [c.city, c.state].filter(Boolean).join(', ') }}</template>
            </div>
          </div>
          <div class="club-actions-row">
            <button type="button" class="btn btn-ghost btn-sm" @click="viewClub(c)">View</button>
            <div v-if="isMember(c.id)" class="club-badge">Member</div>
            <button
              v-else
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="applyingId === c.id"
              @click="applyToClub(c)"
            >
              {{ applyingId === c.id ? 'Joining…' : (isSscSstcSlug ? 'Apply to Join' : (authStore.isAuthenticated ? 'Apply to Join' : 'Sign in to Join')) }}
            </button>
          </div>
        </div>
      </div>

      <p class="signup-link">
        Don't have an account? <router-link :to="signupPath">Sign up</router-link>
        <span class="sep">|</span>
        <router-link :to="clubManagerSignupPath">Create a club instead</router-link>
      </p>
      <!-- reCAPTCHA placeholder: apply-to-join flow (sign up to apply) - add when implementing -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useBrandingStore } from '../store/branding';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

const route  = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const orgSlug = computed(() => route.params?.organizationSlug || null);
const loginPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/login` : '/login'));
const signupPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/signup` : '/signup'));
const clubManagerSignupPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/signup/club-manager` : '/signup/club-manager'
);

const loginTheme = ref(null);
const logoError = ref(false);
const clubs = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const stateFilter = ref('');
const applyingId = ref(null);
let searchTimeout = null;

const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const loginBackground = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.themeSettings?.loginBackground) {
    return loginTheme.value.agency.themeSettings.loginBackground;
  }
  return brandingStore.loginBackground;
});

const myAgencyIds = computed(() => {
  const list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  return new Set((Array.isArray(list) ? list : []).map((a) => Number(a?.id)).filter(Boolean));
});

const isMember = (clubId) => myAgencyIds.value.has(Number(clubId));

const fetchClubs = async () => {
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/summit-stats/clubs', {
      params: {
        search: search.value.trim() || undefined,
        state: stateFilter.value || undefined
      },
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    clubs.value = r.data?.clubs || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load clubs';
    clubs.value = [];
  } finally {
    loading.value = false;
  }
};

const debouncedSearch = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fetchClubs, 300);
};

const isSscSstcSlug = computed(() => {
  const s = String(orgSlug.value || '').toLowerCase();
  return s === 'ssc' || s === 'sstc';
});

const applyToClub = async (club) => {
  // SSC/SSTC: send through the full member application flow (handles both authed and unauthed)
  if (isSscSstcSlug.value) {
    router.push({ path: `/${orgSlug.value}/join`, query: { club: club.id } });
    return;
  }
  // Other tenants: require auth, then direct-apply via API
  if (!authStore.isAuthenticated) {
    router.push({ path: loginPath.value, query: { redirect: `/${orgSlug.value}/clubs` } });
    return;
  }
  applyingId.value = club.id;
  try {
    await api.post(`/summit-stats/clubs/${club.id}/apply`);
    await agencyStore.fetchUserAgencies();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to join club';
  } finally {
    applyingId.value = null;
  }
};

const viewClub = (club) => {
  router.push({ path: `/${orgSlug.value}/clubs/${club.id}` });
};

const fetchLoginTheme = async (portalUrl) => {
  try {
    const r = await api.get(`/agencies/portal/${portalUrl}/login-theme`, { skipGlobalLoading: true });
    loginTheme.value = r.data;
    brandingStore.setPortalThemeFromLoginTheme(r.data);
  } catch {
    // ignore
  }
};

onMounted(async () => {
  if (orgSlug.value) await fetchLoginTheme(orgSlug.value);
  else if (!brandingStore.portalHostPortalUrl) brandingStore.clearPortalTheme();
  await fetchClubs();
  if (authStore.isAuthenticated) await agencyStore.fetchUserAgencies();
});

watch(orgSlug, (newSlug) => {
  if (newSlug) fetchLoginTheme(newSlug);
});
</script>

<style scoped>
.club-search {
  min-height: 100vh;
  padding: 24px;
}
.clubs-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 32px;
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.clubs-logo {
  text-align: center;
  margin-bottom: 20px;
}
.clubs-logo .logo-image {
  max-height: 80px;
  max-width: 200px;
  object-fit: contain;
}
.clubs-container h1 {
  margin: 0 0 8px 0;
  font-size: 1.5em;
}
.subtitle {
  margin: 0 0 24px 0;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.search-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 180px;
  padding: 12px 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  font-size: 1em;
}
.state-select {
  padding: 12px 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  font-size: 1em;
  min-width: 140px;
}
.club-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-secondary {
  background: var(--bg, #f5f5f5);
  color: var(--text, #333);
  border: 1px solid var(--border-color, #ddd);
}
.loading, .error, .empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted, #666);
}
.error {
  color: #c62828;
}
.clubs-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.club-card {
  padding: 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.club-name-link {
  font-weight: 600;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: var(--primary, #1d4ed8);
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.club-name-link:hover { opacity: .8; }
.club-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.btn-ghost {
  background: none;
  border: 1px solid var(--border-color, #e0e0e0);
  color: var(--text-secondary, #64748b);
}
.club-info {
  flex: 1;
  min-width: 120px;
}
.club-meta {
  font-size: 0.9em;
  color: var(--text-muted, #666);
  margin-top: 2px;
}
.club-badge {
  margin-left: auto;
  padding: 4px 10px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 500;
}
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  border: none;
  text-decoration: none;
  display: inline-block;
}
.btn-primary {
  background: var(--primary, #0066cc);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.signup-link {
  margin-top: 24px;
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.signup-link a {
  color: var(--primary, #0066cc);
  text-decoration: none;
}
.signup-link a:hover {
  text-decoration: underline;
}
.signup-link .sep {
  margin: 0 8px;
  color: var(--border, #ccc);
}
</style>
