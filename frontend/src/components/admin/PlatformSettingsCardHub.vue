<template>
  <div class="platform-settings-card-hub">
    <header class="hub-header">
      <h2 class="hub-title">Platform</h2>
      <p class="hub-subtitle">
        Operate the platform here (defaults, catalog, all orgs). Pick a tenant in the bar above to run that
        organization’s Company setup hub — profile, booking types, features, team, and billing.
      </p>
    </header>

    <p v-if="filterActive && !visibleSections.length" class="hub-filter-empty">
      No settings match “{{ filterQuery.trim() }}”.
    </p>

    <section v-for="section in visibleSections" :key="section.id" class="hub-section">
      <h3 class="hub-section-title">{{ section.title }}</h3>
      <p v-if="section.hint" class="hub-section-hint">{{ section.hint }}</p>
      <div class="hub-cards">
        <button
          v-for="row in section.items"
          :key="`${row.category}-${row.item}`"
          type="button"
          class="hub-card"
          :class="{ 'hub-card--superadmin-only': row.superadminOnly }"
          @click="openArea(row.category, row.item)"
        >
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor(row.item)" :src="iconFor(row.item)" alt="" class="hub-card-icon-img" />
            <span v-else>{{ row.fallbackIcon || '⚙️' }}</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">{{ row.label }}</span>
            <span v-if="row.description" class="hub-card-desc">{{ row.description }}</span>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../../store/branding';
import {
  SETTINGS_SEARCH_DESCRIPTIONS,
  settingsCardMatchesQuery
} from '../../navigation/settingsSearchCatalog.js';

const props = defineProps({
  /** { title: string, hint?: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true },
  /** (itemId) => url | null — from SettingsModal getSettingsIconUrl */
  resolveItemIcon: { type: Function, default: null },
  /** Live filter from Settings search — hides non-matching cards */
  filterQuery: { type: String, default: '' }
});

const brandingStore = useBrandingStore();

const primarySections = [
  {
    id: 'governance',
    title: 'Platform operators',
    hint: 'Global defaults, pricing, and the full tenant directory — manage every company from here.',
    items: [
      {
        category: 'platform',
        item: 'platform-settings',
        label: 'Platform defaults',
        fallbackIcon: '🔐',
        superadminOnly: true,
        description: SETTINGS_SEARCH_DESCRIPTIONS['platform-settings']
      },
      {
        category: 'platform',
        item: 'platform-billing',
        label: 'Platform billing',
        fallbackIcon: '💳',
        superadminOnly: true,
        description: SETTINGS_SEARCH_DESCRIPTIONS['platform-billing']
      },
      {
        category: 'platform',
        item: 'platform-feature-catalog',
        label: 'Feature Catalog & Pricing',
        fallbackIcon: '🧮',
        superadminOnly: true,
        description: SETTINGS_SEARCH_DESCRIPTIONS['platform-feature-catalog']
      },
      {
        category: 'platform',
        item: 'platform-feature-audit',
        label: 'Feature audit log',
        fallbackIcon: '📜',
        superadminOnly: true,
        description: SETTINGS_SEARCH_DESCRIPTIONS['platform-feature-audit']
      },
      {
        category: 'platform',
        item: 'platform-all-agencies',
        label: 'All organizations',
        fallbackIcon: '🗂️',
        superadminOnly: true,
        description: SETTINGS_SEARCH_DESCRIPTIONS['platform-all-agencies']
      },
      {
        category: 'system',
        item: 'audit-center',
        label: 'Audit center',
        fallbackIcon: '🛡️',
        description: SETTINGS_SEARCH_DESCRIPTIONS['audit-center']
      },
      {
        category: 'system',
        item: 'viewport-preview',
        label: 'Viewport preview',
        fallbackIcon: '📱',
        description: SETTINGS_SEARCH_DESCRIPTIONS['viewport-preview']
      }
    ]
  },
  {
    id: 'general-billing',
    title: 'Open with a tenant selected',
    hint: 'These screens need a company context — pick a tenant in the bar above (recommended), or open and choose in-page.',
    items: [
      {
        category: 'general',
        item: 'company-profile',
        label: 'Company profile',
        fallbackIcon: '🏢',
        description: SETTINGS_SEARCH_DESCRIPTIONS['company-profile']
      },
      {
        category: 'general',
        item: 'booking-service-types',
        label: 'Booking & service types',
        fallbackIcon: '📅',
        description: SETTINGS_SEARCH_DESCRIPTIONS['booking-service-types']
      },
      {
        category: 'general',
        item: 'tenant-features',
        label: 'Features',
        fallbackIcon: '🎛️',
        description: SETTINGS_SEARCH_DESCRIPTIONS['tenant-features']
      },
      {
        category: 'general',
        item: 'team-roles',
        label: 'Team & roles',
        fallbackIcon: '👥',
        description: SETTINGS_SEARCH_DESCRIPTIONS['team-roles']
      },
      {
        category: 'general',
        item: 'billing',
        label: 'Billing',
        fallbackIcon: '💳',
        description: SETTINGS_SEARCH_DESCRIPTIONS.billing
      }
    ]
  }
];

const filterActive = computed(() => !!String(props.filterQuery || '').trim());

const visibleSections = computed(() => {
  const q = props.filterQuery;
  const secondary = (props.secondaryBlocks || []).map((block, idx) => ({
    id: `secondary-${idx}-${block.title}`,
    title: block.title,
    hint: block.hint || '',
    items: (block.items || []).map((row) => ({
      ...row,
      fallbackIcon: row.icon || '⚙️'
    }))
  }));
  return [...primarySections, ...secondary]
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((row) => settingsCardMatchesQuery(q, row))
    }))
    .filter((section) => section.items.length > 0);
});

const openArea = (category, item, agencyTab) => {
  props.onOpenArea({ category, item, agencyTab });
};

const iconFor = (itemId) => {
  const fn = props.resolveItemIcon;
  if (typeof fn === 'function') {
    const u = fn(itemId);
    if (u) return u;
  }
  if (itemId === 'platform-all-agencies') {
    const u = brandingStore.getAdminQuickActionIconUrl('manage_agencies');
    return u || null;
  }
  return null;
};
</script>

<style scoped>
.platform-settings-card-hub {
  max-width: 1100px;
}

.hub-header {
  margin-bottom: 28px;
}

.hub-title {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.hub-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.55;
  max-width: 52rem;
}

.hub-filter-empty {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.hub-section {
  margin-bottom: 32px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}

.hub-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.hub-section-title {
  margin: 0 0 6px 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
}

.hub-section-hint {
  margin: 0 0 14px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
  max-width: 48rem;
}

.hub-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.hub-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  text-align: left;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
  min-height: 5.5rem;
}

.hub-card:hover {
  border-color: var(--primary, #059669);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.07);
}

.hub-card-icon {
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}

.hub-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hub-card-label {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.hub-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.hub-card--superadmin-only {
  border-color: color-mix(in srgb, var(--accent, var(--primary)) 50%, var(--border));
  background: color-mix(in srgb, var(--accent, var(--primary)) 8%, var(--bg-primary, #fff));
}

.hub-card-icon-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  display: block;
}
</style>
