<template>
  <div class="chats-view" :class="{ 'is-dashboard': !showWorkspace }">
    <div class="chats-bg" aria-hidden="true" />
    <div class="header" data-tour="chats-header">
      <div>
        <div class="back-row">
          <button class="btn btn-secondary btn-xs" type="button" @click="goBack">
            Back
          </button>
          <button class="btn btn-secondary btn-xs" type="button" @click="goToDashboard" title="Go to My Dashboard">
            My Dashboard
          </button>
          <button
            v-if="showWorkspace"
            class="btn btn-secondary btn-xs"
            type="button"
            @click="goToDashboardView"
          >
            Messages Dashboard
          </button>
          <router-link
            v-if="canUseCommunicationsCenter"
            class="btn btn-secondary btn-xs"
            :to="communicationsCenterPath"
          >
            Communications Center
          </router-link>
        </div>
        <template v-if="showWorkspace">
          <h2 data-tour="chats-title">Messages</h2>
          <p class="subtitle" data-tour="chats-subtitle">
            Direct messages, channels, threads, and mentions.
          </p>
        </template>
      </div>
      <div class="header-actions" data-tour="chats-actions">
        <div v-if="canChooseAgency" class="agency-picker" data-tour="chats-agency-picker">
          <label>Agency</label>
          <select v-model="selectedAgencyId" @change="onAgencyPicked">
            <option :value="''">Select…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="!agencyId && !isSuperAdmin" class="empty" data-tour="chats-empty">
      Select an agency first.
    </div>
    <div v-else class="workspace-host" data-tour="chats-workspace">
      <MessagesDashboard v-if="!showWorkspace" @open-workspace="onOpenWorkspace" />
      <MessagesWorkspace v-else layout="page" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useOrganizationStore } from '../../store/organization';
import MessagesWorkspace from '../../components/messages/MessagesWorkspace.vue';
import MessagesDashboard from '../../components/messages/MessagesDashboard.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const organizationStore = useOrganizationStore();
const route = useRoute();
const router = useRouter();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const canUseCommunicationsCenter = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'super_admin';
});

const showWorkspace = computed(() => String(route.query?.view || '').toLowerCase() === 'workspace');

const agencyId = computed(() => {
  const q = route.query?.agencyId ? parseInt(String(route.query.agencyId), 10) : null;
  if (Number.isFinite(q) && q > 0) return q;
  return agencyStore.currentAgency?.id || null;
});

const agencyOptions = computed(() => {
  const list = isSuperAdmin.value
    ? (agencyStore.agencies || [])
    : (agencyStore.userAgencies || agencyStore.agencies || []);
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const canChooseAgency = computed(() => (agencyOptions.value || []).length > 1);
const selectedAgencyId = ref('');

const dashboardPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  const normalized = slug.toLowerCase();
  if (normalized === 'ssc' || normalized === 'sstc') {
    return `/${slug}/my_club_dashboard`;
  }
  return slug ? `/${slug}/dashboard` : '/dashboard';
});

const communicationsCenterPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/communications` : '/admin/communications';
});

const goToDashboard = async () => {
  await router.push({ path: dashboardPath.value });
};

const goToDashboardView = async () => {
  const q = { ...route.query };
  delete q.view;
  delete q.tab;
  await router.push({ path: route.path, query: q });
};

const goBack = async () => {
  const state = typeof window !== 'undefined' && window.history ? window.history.state : null;
  if (state?.back) {
    router.back();
    return;
  }
  await goToDashboard();
};

const onOpenWorkspace = () => {
  // Navigation handled inside MessagesDashboard; keep for emit completeness
};

const onAgencyPicked = async () => {
  const id = parseInt(String(selectedAgencyId.value || ''), 10);
  if (!Number.isFinite(id) || id <= 0) return;
  const found = (agencyOptions.value || []).find((a) => Number(a?.id) === id);
  if (!found) return;

  agencyStore.setCurrentAgency(found);
  organizationStore.setCurrentOrganization(found);

  const hydrated = await agencyStore.hydrateAgencyById(id);
  const org = hydrated || found;

  try {
    const paletteRaw = org?.color_palette ?? org?.colorPalette ?? null;
    const themeRaw = org?.theme_settings ?? org?.themeSettings ?? null;
    const colorPalette = typeof paletteRaw === 'string' ? JSON.parse(paletteRaw) : (paletteRaw || {});
    const themeSettings = typeof themeRaw === 'string' ? JSON.parse(themeRaw) : (themeRaw || {});
    brandingStore.applyTheme({
      brandingAgencyId: org?.id,
      agencyId: org?.id,
      colorPalette,
      themeSettings
    });
  } catch {
    // ignore theme errors
  }

  const q = { ...route.query, agencyId: String(id) };
  router.replace({ query: q }).catch(() => {});
};

watch(
  agencyId,
  (id) => {
    if (id) selectedAgencyId.value = String(id);
  },
  { immediate: true }
);

onMounted(async () => {
  if (isSuperAdmin.value && !(agencyStore.agencies || []).length) {
    try {
      await agencyStore.fetchAgencies();
    } catch {
      // ignore
    }
  }
  if (!isSuperAdmin.value && !(agencyStore.userAgencies || []).length) {
    try {
      await agencyStore.fetchUserAgencies();
    } catch {
      // ignore
    }
  }
});
</script>

<style scoped>
.chats-view {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: calc(100vh - 64px);
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 16px 28px 32px;
}
.chats-view.is-dashboard {
  padding-top: 20px;
}
.chats-bg {
  display: none;
}
.chats-view.is-dashboard .chats-bg {
  display: block;
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(900px 360px at 0% 0%, rgba(56, 189, 248, 0.12), transparent 55%),
    radial-gradient(700px 300px at 100% 0%, rgba(251, 191, 36, 0.1), transparent 50%),
    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}
.header,
.workspace-host,
.empty {
  position: relative;
  z-index: 1;
}
.header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.back-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.agency-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.agency-picker select {
  min-width: 180px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.empty {
  padding: 24px;
  color: var(--text-secondary, #64748b);
}
.workspace-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
@media (max-width: 700px) {
  .chats-view { padding: 12px 14px 24px; }
}
</style>
