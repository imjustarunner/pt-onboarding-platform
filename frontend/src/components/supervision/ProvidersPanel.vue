<template>
  <div class="supervision-modal supervision-panel providers-panel" role="region" aria-labelledby="providers-panel-title">
    <div class="supervision-modal-header">
      <button
        v-if="selectedProvider"
        type="button"
        class="supervision-modal-back"
        aria-label="Back to providers"
        @click="selectedProvider = null"
      >
        Back to providers
      </button>
      <h2 id="providers-panel-title">
        {{ selectedProvider ? providerDisplayName(selectedProvider) : 'Providers' }}
      </h2>
    </div>
    <div class="supervision-modal-body">
      <template v-if="!selectedProvider">
        <div v-if="loading" class="supervision-loading">Loading providers…</div>
        <div v-else-if="error" class="supervision-error">{{ error }}</div>
        <div v-else-if="providers.length === 0" class="supervision-empty">
          <p>No providers in your organization.</p>
        </div>
        <div v-else class="supervision-groups">
          <section
            v-for="group in groupedProviders"
            :key="group.key"
            class="supervision-group"
          >
            <header class="supervision-group-header">
              <span class="supervision-group-swatch" :style="group.headerStyle" />
              <h3 class="supervision-group-name">{{ group.name }}</h3>
              <span class="supervision-group-count">{{ group.items.length }}</span>
            </header>
            <div class="supervision-grid">
              <button
                v-for="p in group.items"
                :key="providerKey(p)"
                type="button"
                class="supervision-card"
                @click="selectedProvider = p"
              >
                <div class="supervision-card-avatar" :class="{ 'has-photo': p.supervisee_profile_photo_url }">
                  <img v-if="p.supervisee_profile_photo_url" :src="toUploadsUrl(p.supervisee_profile_photo_url)" :alt="providerDisplayName(p)" class="supervision-card-avatar-img" />
                  <span v-else class="supervision-card-avatar-initial">{{ avatarInitial(p) }}</span>
                </div>
                <div class="supervision-card-info">
                  <span class="supervision-card-name">{{ providerDisplayName(p) }}</span>
                  <span class="supervision-card-meta">{{ p.agency_name || '' }}</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      </template>

      <template v-else>
        <div class="supervision-detail">
          <section class="supervision-hero">
            <div class="supervision-hero-avatar" :class="{ 'has-photo': selectedProvider?.supervisee_profile_photo_url }">
              <img v-if="selectedProvider?.supervisee_profile_photo_url" :src="toUploadsUrl(selectedProvider.supervisee_profile_photo_url)" :alt="providerDisplayName(selectedProvider)" class="supervision-hero-avatar-img" />
              <span v-else class="supervision-hero-avatar-initial">{{ selectedProvider ? avatarInitial(selectedProvider) : '' }}</span>
            </div>
            <div class="supervision-hero-info">
              <h2 class="supervision-hero-name">{{ providerDisplayName(selectedProvider) }}</h2>
              <p v-if="selectedProvider?.agency_name" class="supervision-hero-meta">{{ selectedProvider.agency_name }}</p>
            </div>
          </section>

          <section class="supervision-detail-section">
            <h3>School / program portals</h3>
            <p class="supervision-placeholder" style="margin-bottom: 0.5rem;">Access school or program portals this provider is affiliated with.</p>
            <div v-if="affiliatedPortalsLoading" class="supervision-placeholder">Loading…</div>
            <div v-else-if="affiliatedPortalsError" class="supervision-error-inline">{{ affiliatedPortalsError }}</div>
            <div v-else-if="affiliatedPortals.length === 0" class="supervision-placeholder">No school or program portals for this provider.</div>
            <div v-else class="supervision-portal-buttons">
              <a
                v-for="portal in affiliatedPortals"
                :key="portal.id"
                :href="`/${portal.slug}/dashboard`"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-secondary btn-sm"
              >
                {{ portal.name }} portal
              </a>
            </div>
          </section>

          <section class="supervision-detail-section">
            <h3>Quick links</h3>
            <div class="providers-quick-links">
              <router-link
                :to="orgTo(`/admin/users/${selectedProvider.supervisee_id}`)"
                class="btn btn-secondary btn-sm"
              >
                View profile
              </router-link>
              <router-link
                :to="orgTo(`/admin/clients?provider_id=${selectedProvider.supervisee_id}`)"
                class="btn btn-secondary btn-sm"
              >
                View caseload
              </router-link>
              <router-link
                :to="{ path: orgTo('/schedule/staff'), query: { userId: selectedProvider.supervisee_id } }"
                class="btn btn-secondary btn-sm"
              >
                View schedule
              </router-link>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const orgSlug = computed(() => {
  const slugFromRoute = route.params.organizationSlug;
  if (typeof slugFromRoute === 'string' && slugFromRoute) return slugFromRoute;
  const slugFromAgency = agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url;
  return slugFromAgency || null;
});

const orgTo = (path) => {
  const slug = orgSlug.value;
  if (!slug) return path;
  return `/${slug}${path}`;
};

const loading = ref(true);
const error = ref('');
const providers = ref([]);
const selectedProvider = ref(null);
const affiliatedPortals = ref([]);
const affiliatedPortalsLoading = ref(false);
const affiliatedPortalsError = ref('');

function providerDisplayName(p) {
  const first = (p.supervisee_first_name || '').trim();
  const last = (p.supervisee_last_name || '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return `User ${p.supervisee_id}`;
}

function avatarInitial(p) {
  const first = (p.supervisee_first_name || '').trim().slice(0, 1);
  const last = (p.supervisee_last_name || '').trim().slice(0, 1);
  if (first && last) return (first + last).toUpperCase();
  if (first) return first.toUpperCase();
  return '?';
}

function providerKey(p) {
  return `${p.supervisee_id}-${p.agency_name || ''}`;
}

const groupedProviders = computed(() => {
  const items = providers.value || [];
  const byAgency = new Map();
  for (const p of items) {
    const name = String(p.agency_name || 'Other').trim();
    if (!byAgency.has(name)) byAgency.set(name, []);
    byAgency.get(name).push(p);
  }
  return Array.from(byAgency.entries()).map(([name, agencyItems]) => ({
    key: name,
    name,
    items: agencyItems,
    headerStyle: {}
  }));
});

async function fetchProviders() {
  const userId = authStore.user?.id;
  if (!userId) {
    error.value = 'Not signed in.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get('/users/me/providers-for-support');
    const rows = Array.isArray(response.data) ? response.data : [];
    providers.value = rows;
  } catch (err) {
    console.error('Failed to fetch providers:', err);
    error.value = err?.response?.data?.error?.message || 'Failed to load providers.';
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchAffiliatedPortals() {
  const p = selectedProvider.value;
  if (!p?.supervisee_id) {
    affiliatedPortals.value = [];
    return;
  }
  affiliatedPortalsLoading.value = true;
  affiliatedPortalsError.value = '';
  affiliatedPortals.value = [];
  try {
    const response = await api.get(`/users/${p.supervisee_id}/affiliated-portals`);
    affiliatedPortals.value = Array.isArray(response.data?.portals) ? response.data.portals : [];
  } catch (err) {
    affiliatedPortalsError.value = err?.response?.data?.error?.message || 'Failed to load portals.';
    affiliatedPortals.value = [];
  } finally {
    affiliatedPortalsLoading.value = false;
  }
}

watch(selectedProvider, (v) => {
  affiliatedPortals.value = [];
  affiliatedPortalsError.value = '';
  if (v) fetchAffiliatedPortals();
});

onMounted(() => {
  fetchProviders();
});
</script>

<style scoped>
.providers-panel {
  /* Reuse supervision-modal styles */
}
.providers-quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
