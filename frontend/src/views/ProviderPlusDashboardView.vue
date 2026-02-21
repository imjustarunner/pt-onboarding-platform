<template>
  <div class="provider-plus-dashboard">
    <header class="page-header">
      <h1>Operations Dashboard</h1>
      <p class="subtitle">
        Focused operations workspace for schedule coordination and program support.
      </p>
    </header>

    <section class="cards-grid" aria-label="Operations dashboard quick actions">
      <router-link
        v-for="card in cards"
        :key="card.id"
        :to="card.to"
        class="action-card"
      >
        <div class="action-icon-wrap">
          <img
            v-if="getCardIconUrl(card) && !failedIconIds.has(card.id)"
            :src="getCardIconUrl(card)"
            :alt="`${card.title} icon`"
            class="action-icon"
            @error="onIconError(card.id)"
          />
          <div v-else class="action-icon-placeholder">{{ card.emoji }}</div>
        </div>
        <div class="card-body">
          <div class="card-title">{{ card.title }}</div>
          <div class="card-description">{{ card.description }}</div>
        </div>
      </router-link>
    </section>

    <!-- Personal momentum list / checklist below cards -->
    <section v-if="currentAgencyId" class="momentum-section" aria-label="Your focus">
      <h2 class="momentum-section-title">{{ momentumListEnabled ? 'Your Momentum List' : 'Your Checklist' }}</h2>
      <MomentumListTab
        v-if="momentumListEnabled"
        :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
        :agency-id="currentAgencyId"
        :kudos-enabled="canSeeKudosWidget"
      />
      <UnifiedChecklistTab
        v-else
        :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
        :agency-id="currentAgencyId"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useMomentumListAddon } from '../composables/useMomentumListAddon';
import MomentumListTab from '../components/dashboard/MomentumListTab.vue';
import UnifiedChecklistTab from '../components/dashboard/UnifiedChecklistTab.vue';

const route = useRoute();
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();

const currentAgencyId = computed(() => agencyStore.currentAgency?.id ?? null);
const { momentumListEnabled } = useMomentumListAddon(currentAgencyId);

const parseFeatureFlags = (raw) => {
  if (!raw || typeof raw !== 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return raw;
};
const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};
const agencyFlags = computed(() => parseFeatureFlags(agencyStore.currentAgency?.feature_flags));
const canSeeKudosWidget = computed(() => isTruthyFlag(agencyFlags.value?.kudosEnabled));

const failedIconIds = ref(new Set());

const activeOrganizationSlug = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? slug : null;
});

const orgTo = (path) => {
  if (!activeOrganizationSlug.value) return path;
  return `/${activeOrganizationSlug.value}${path}`;
};

const getCardIconUrl = (card) => {
  if (!card?.iconKey) return null;
  return brandingStore.getAdminQuickActionIconUrl(card.iconKey, agencyStore.currentAgency);
};

const onIconError = (cardId) => {
  failedIconIds.value = new Set([...failedIconIds.value, cardId]);
};

const cards = computed(() => [
  {
    id: 'school_overview',
    title: 'School Overview',
    description: 'View school-level status and progress dashboards.',
    to: { path: orgTo('/admin/schools/overview'), query: { orgType: 'school' } },
    iconKey: 'school_overview',
    emoji: '🏫'
  },
  {
    id: 'program_overview',
    title: 'Program Overview',
    description: 'Track program-level status and progress dashboards.',
    to: { path: orgTo('/admin/schools/overview'), query: { orgType: 'program' } },
    iconKey: 'program_overview',
    emoji: '🧩'
  },
  {
    id: 'schedule_hub',
    title: 'Schedule Hub',
    description: 'Manage building and provider schedule coverage.',
    to: orgTo('/schedule'),
    iconKey: 'schedule',
    emoji: '📅'
  },
  {
    id: 'provider_availability',
    title: 'Provider Availability',
    description: 'Review and coordinate provider availability.',
    to: orgTo('/admin/provider-availability'),
    iconKey: 'provider_availability_dashboard',
    emoji: '👥'
  },
  {
    id: 'communications',
    title: 'Communications',
    description: 'Access communications workspace and SMS inbox.',
    to: orgTo('/admin/communications'),
    iconKey: 'dashboard_communications',
    emoji: '💬'
  },
  {
    id: 'chats',
    title: 'Chats',
    description: 'Coordinate cases and updates through platform chats.',
    to: orgTo('/admin/communications/chats'),
    iconKey: 'dashboard_chats',
    emoji: '💭'
  },
  {
    id: 'tools_aids',
    title: 'Tools & Aids',
    description: 'Open operational tools and clinical support aids.',
    to: orgTo('/admin/tools-aids'),
    iconKey: 'tools_aids',
    emoji: '🩺'
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Review team and personal notifications.',
    to: orgTo('/notifications'),
    iconKey: 'dashboard_notifications',
    emoji: '🔔'
  }
]);
</script>

<style scoped>
.provider-plus-dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
}

.page-header h1 {
  margin: 0;
}

.subtitle {
  margin-top: 0.5rem;
  color: #5f6b7a;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}

.action-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  text-decoration: none;
  border: 1px solid #d9dee7;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.action-card:hover {
  border-color: #5b7ce6;
  box-shadow: 0 6px 20px rgba(21, 56, 122, 0.08);
}

.action-icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--bg-alt, #f3f4f6);
}

.action-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.action-icon-placeholder {
  font-size: 1.5rem;
  line-height: 1;
}

.card-body {
  min-width: 0;
}

.card-title {
  font-weight: 700;
  color: #1f2b3d;
}

.card-description {
  margin-top: 0.4rem;
  color: #54627a;
  line-height: 1.35;
}

.momentum-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #d9dee7;
}

.momentum-section-title {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2b3d;
}
</style>
