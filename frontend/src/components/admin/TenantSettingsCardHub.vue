<template>
  <div class="tenant-settings-card-hub">
    <header class="hub-header">
      <h2 class="hub-title">{{ tenantName }}</h2>
      <p class="hub-subtitle">
        {{
          isSuperAdmin
            ? 'Set up and manage this tenant. Start with Company setup, then catalogs and ops. Use Hub home and the quick links above for directory and platform-wide defaults.'
            : `Set up your ${contextNoun} in order below — identity first, then what you sell, features, team access, and billing.`
        }}
      </p>
    </header>

    <TenantPeopleSnapshot v-if="!filterActive" :agency-id="agencyStore.currentAgency?.id" />

    <p v-if="filterActive && !visibleSections.length" class="hub-filter-empty">
      No settings match “{{ filterQuery.trim() }}”.
    </p>

    <section
      v-for="section in visibleSections"
      :key="section.id"
      class="hub-section"
      :class="{
        'hub-section--single': section.singleColumn,
        'hub-section--setup': section.id === 'setup'
      }"
    >
      <h3 class="hub-section-title">{{ section.title }}</h3>
      <p v-if="section.hint" class="hub-section-hint">{{ section.hint }}</p>
      <div class="hub-cards" :class="{ 'hub-cards-single': section.singleColumn }">
        <button
          v-for="row in section.items"
          :key="`${row.category}-${row.item}`"
          type="button"
          class="hub-card"
          :class="{ 'hub-card--superadmin-only': row.superadminOnly }"
          @click="openArea(row.category, row.item)"
        >
          <span v-if="row.setupStep" class="hub-card-step" aria-hidden="true">{{ row.setupStep }}</span>
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
import { useAgencyStore } from '../../store/agency';
import TenantPeopleSnapshot from './TenantPeopleSnapshot.vue';
import {
  SETTINGS_SEARCH_DESCRIPTIONS,
  settingsCardMatchesQuery
} from '../../navigation/settingsSearchCatalog.js';

const props = defineProps({
  isSuperAdmin: { type: Boolean, default: false },
  /** { title: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true },
  resolveItemIcon: { type: Function, default: null },
  /** Live filter from Settings search — hides non-matching cards */
  filterQuery: { type: String, default: '' }
});

const agencyStore = useAgencyStore();

const contextNoun = computed(() => (props.isSuperAdmin ? 'tenant' : 'organization'));
const tenantName = computed(() => agencyStore.currentAgency?.name || `This ${contextNoun.value}`);

const tenantOverviewCardLabel = computed(() => {
  const n = String(agencyStore.currentAgency?.name || '').trim();
  return n ? `${n} Overview` : 'Overview';
});

/** Items promoted from secondary blocks into primary “Pay & workforce”. */
const WORKFORCE_ITEM_IDS = new Set(['payroll-schedule', 'departments', 'hiring-prehire']);

const secondaryItemById = computed(() => {
  const map = new Map();
  for (const block of props.secondaryBlocks || []) {
    for (const row of block.items || []) {
      if (row?.item) map.set(row.item, row);
    }
  }
  return map;
});

const primarySections = computed(() => {
  const noun = contextNoun.value;
  const sections = [];

  if (props.isSuperAdmin) {
    sections.push({
      id: 'superadmin',
      title: 'Platform management',
      hint: 'Superadmin tools for this tenant — overview, feature overrides, identity locks.',
      items: [
        {
          category: 'platform',
          item: 'tenant-overview',
          label: tenantOverviewCardLabel.value,
          fallbackIcon: '📋',
          superadminOnly: true,
          description: SETTINGS_SEARCH_DESCRIPTIONS['tenant-overview']
        },
        {
          category: 'platform',
          item: 'agency-platform',
          label: 'Tenant identity & locks',
          fallbackIcon: '🏛️',
          superadminOnly: true,
          description: SETTINGS_SEARCH_DESCRIPTIONS['agency-platform']
        }
      ]
    });
  }

  sections.push({
    id: 'setup',
    title: 'Company setup',
    hint: `Work top to bottom when onboarding a new ${noun}. Identity and what you sell first; then features, who can admin, and billing.`,
    items: [
      {
        setupStep: 1,
        category: 'general',
        item: 'company-profile',
        label: 'Company profile',
        fallbackIcon: '🏢',
        description: `Name, contact, address, sites, notifications, and other day-to-day ${noun} identity settings still managed here.`
      },
      {
        setupStep: 2,
        category: 'general',
        item: 'booking-service-types',
        label: 'Booking & service types',
        fallbackIcon: '📅',
        description: `What this ${noun} sells (counseling, tutoring, coaching, consulting) — unlocks finders, packages, and matching notifications.`
      },
      {
        setupStep: 3,
        category: 'general',
        item: 'tenant-features',
        label: 'Features',
        fallbackIcon: '🎛️',
        description: `Turn capabilities on for this ${noun}, review pricing, and manage a-la-carte controls (preferred over the legacy Features tab).`
      },
      {
        setupStep: 4,
        category: 'general',
        item: 'team-roles',
        label: 'Team & roles',
        fallbackIcon: '👥',
        description: `Who can access admin areas inside this ${noun}.`
      },
      {
        setupStep: 5,
        category: 'general',
        item: 'billing',
        label: 'Billing',
        fallbackIcon: '💳',
        description: `Charges, invoices, receipts, payment methods, and billing history for this ${noun}.`
      }
    ]
  });

  const workforce = [];
  for (const id of ['payroll-schedule', 'departments', 'hiring-prehire']) {
    const row = secondaryItemById.value.get(id);
    if (!row) continue;
    workforce.push({
      ...row,
      fallbackIcon: row.icon || (id === 'payroll-schedule' ? '💰' : id === 'departments' ? '🏛️' : '🤝'),
      description:
        id === 'payroll-schedule'
          ? `Pay schedules plus payroll policies (PTO, mileage, Med Cancel, holidays) — preferred over Company Profile → Payroll.`
          : row.description || SETTINGS_SEARCH_DESCRIPTIONS[id] || ''
    });
  }
  if (workforce.length) {
    sections.push({
      id: 'workforce',
      title: 'Pay & workforce',
      hint: `Payroll policies and workforce structure for this ${noun} (when enabled).`,
      items: workforce
    });
  }

  return sections;
});

const remainingSecondaryBlocks = computed(() =>
  (props.secondaryBlocks || [])
    .map((block) => ({
      ...block,
      items: (block.items || []).filter((row) => !WORKFORCE_ITEM_IDS.has(row.item))
    }))
    .filter((block) => block.items.length > 0)
);

const filterActive = computed(() => !!String(props.filterQuery || '').trim());

const visibleSections = computed(() => {
  const q = props.filterQuery;
  const secondary = remainingSecondaryBlocks.value.map((block, idx) => ({
    id: `secondary-${idx}-${block.title}`,
    title: block.title,
    hint: block.hint || '',
    items: (block.items || []).map((row) => ({
      ...row,
      fallbackIcon: row.icon || '⚙️'
    }))
  }));
  return [...primarySections.value, ...secondary]
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
  if (typeof fn !== 'function') return null;
  return fn(itemId) || null;
};
</script>

<style scoped>
.tenant-settings-card-hub {
  max-width: 960px;
}

.hub-header {
  margin-bottom: 28px;
}

.hub-title {
  margin: 0 0 8px 0;
  font-size: 1.35rem;
  font-weight: 700;
}

.hub-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  max-width: 46rem;
}

.hub-filter-empty {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.hub-section {
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.hub-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.hub-section-title {
  margin: 0 0 6px 0;
  font-size: 1rem;
  font-weight: 700;
}

.hub-section--setup .hub-section-title {
  font-size: 1.05rem;
}

.hub-section-hint {
  margin: 0 0 14px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.hub-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.hub-cards-single {
  grid-template-columns: minmax(0, 1fr);
  max-width: 480px;
}

.hub-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, #f9fafb);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.hub-card:hover {
  border-color: var(--primary, #059669);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.hub-card-step {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary, #059669) 14%, transparent);
  color: var(--primary, #047857);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.hub-card-icon {
  font-size: 1.35rem;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.hub-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 18px;
}

.hub-card-label {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
}

.hub-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.hub-card--superadmin-only {
  border-color: color-mix(in srgb, var(--accent, var(--primary)) 50%, var(--border));
  background: color-mix(in srgb, var(--accent, var(--primary)) 8%, var(--bg-alt, #f9fafb));
}

.hub-card-icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
}
</style>
