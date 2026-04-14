<template>
  <div class="tenant-settings-card-hub">
    <header class="hub-header">
      <h2 class="hub-title">{{ tenantName }}</h2>
      <p class="hub-subtitle">
        {{
          isSuperAdmin
            ? 'Pick an area below. Home, organizations, and platform defaults stay in the slim nav; everything else opens here.'
            : 'Pick an area below. Use the agency bar at the top if you manage more than one tenant.'
        }}
      </p>
    </header>

    <section v-if="isSuperAdmin" class="hub-section">
      <h3 class="hub-section-title">Superadmin only</h3>
      <p class="hub-section-hint">Governance, eligibility, and identity for this tenant.</p>
      <div class="hub-cards">
        <button type="button" class="hub-card" @click="openArea('platform', 'tenant-overview')">
          <span class="hub-card-icon" aria-hidden="true">📋</span>
          <span class="hub-card-body">
            <span class="hub-card-label">{{ tenantOverviewCardLabel }}</span>
            <span class="hub-card-desc">Feature matrix, visibility overrides, billing snapshot, invoices.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('platform', 'agency-platform')">
          <span class="hub-card-icon" aria-hidden="true">🏛️</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Tenant identity & locks</span>
            <span class="hub-card-desc">Slug, active status, affiliation, superadmin-managed flags.</span>
          </span>
        </button>
      </div>
    </section>

    <section class="hub-section">
      <h3 class="hub-section-title">You & your admins</h3>
      <p class="hub-section-hint">Day-to-day tenant configuration (admins see the same screens with role limits).</p>
      <div class="hub-cards">
        <button type="button" class="hub-card" @click="openArea('general', 'company-profile')">
          <span class="hub-card-icon" aria-hidden="true">🏢</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Company profile</span>
            <span class="hub-card-desc">Branding, features, terminology, org structure for this tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'company-profile', 'features')">
          <span class="hub-card-icon" aria-hidden="true">🎛️</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Feature toggles</span>
            <span class="hub-card-desc">Opens the Features tab (superadmin sets eligibility from Overview).</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'team-roles')">
          <span class="hub-card-icon" aria-hidden="true">👥</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Team & roles</span>
            <span class="hub-card-desc">Who can access what inside this tenant.</span>
          </span>
        </button>
      </div>
    </section>

    <section class="hub-section">
      <h3 class="hub-section-title">Mixed: billing & subscriptions</h3>
      <p class="hub-section-hint">
        Superadmin often owns catalog and entitlements; tenant admins handle invoices and payment methods where
        permitted.
      </p>
      <div class="hub-cards hub-cards-single">
        <button type="button" class="hub-card" @click="openArea('general', 'billing')">
          <span class="hub-card-icon" aria-hidden="true">💳</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Billing</span>
            <span class="hub-card-desc">Plans, line items, and billing history for this tenant.</span>
          </span>
        </button>
      </div>
    </section>

    <section v-for="block in secondaryBlocks" :key="block.title" class="hub-section">
      <h3 class="hub-section-title">{{ block.title }}</h3>
      <div class="hub-cards">
        <button
          v-for="row in block.items"
          :key="`${row.category}-${row.item}`"
          type="button"
          class="hub-card"
          @click="openArea(row.category, row.item)"
        >
          <span class="hub-card-icon" aria-hidden="true">{{ row.icon || '⚙️' }}</span>
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

const props = defineProps({
  isSuperAdmin: { type: Boolean, default: false },
  /** { title: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true }
});

const agencyStore = useAgencyStore();

const tenantName = computed(() => agencyStore.currentAgency?.name || 'This tenant');

const tenantOverviewCardLabel = computed(() => {
  const n = String(agencyStore.currentAgency?.name || '').trim();
  return n ? `${n} Overview` : 'Overview';
});

const openArea = (category, item, agencyTab) => {
  props.onOpenArea({ category, item, agencyTab });
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

.hub-card-icon {
  font-size: 1.35rem;
  line-height: 1;
  flex-shrink: 0;
}

.hub-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  line-height: 1.4;
}
</style>
