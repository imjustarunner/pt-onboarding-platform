<template>
  <div class="tenant-settings-card-hub">
    <header class="hub-header">
      <h2 class="hub-title">{{ tenantName }}</h2>
      <p class="hub-subtitle">
        {{
          isSuperAdmin
            ? 'Pick an area below. Use Hub home and the quick links above for directory and platform-wide defaults.'
            : 'Pick an area below. Use the agency bar at the top if you manage more than one tenant.'
        }}
      </p>
    </header>

    <TenantPeopleSnapshot :agency-id="agencyStore.currentAgency?.id" />

    <section v-if="isSuperAdmin" class="hub-section">
      <h3 class="hub-section-title">Superadmin only</h3>
      <p class="hub-section-hint">Governance, eligibility, and identity for this tenant.</p>
      <div class="hub-cards">
        <button type="button" class="hub-card hub-card--superadmin-only" @click="openArea('platform', 'tenant-overview')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('tenant-overview')" :src="iconFor('tenant-overview')" alt="" class="hub-card-icon-img" />
            <span v-else>📋</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">{{ tenantOverviewCardLabel }}</span>
            <span class="hub-card-desc">Feature matrix, visibility overrides, billing snapshot, invoices.</span>
          </span>
        </button>
        <button type="button" class="hub-card hub-card--superadmin-only" @click="openArea('platform', 'agency-platform')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('agency-platform')" :src="iconFor('agency-platform')" alt="" class="hub-card-icon-img" />
            <span v-else>🏛️</span>
          </span>
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
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('company-profile')" :src="iconFor('company-profile')" alt="" class="hub-card-icon-img" />
            <span v-else>🏢</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Company profile</span>
            <span class="hub-card-desc">Branding, features, terminology, org structure for this tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'tenant-features')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('company-profile')" :src="iconFor('company-profile')" alt="" class="hub-card-icon-img" />
            <span v-else>🎛️</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Features</span>
            <span class="hub-card-desc">Scoped feature availability, pricing, and a-la-carte controls for this tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'team-roles')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('team-roles')" :src="iconFor('team-roles')" alt="" class="hub-card-icon-img" />
            <span v-else>👥</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Team & roles</span>
            <span class="hub-card-desc">Who can access what inside this tenant.</span>
          </span>
        </button>
      </div>
    </section>

    <section class="hub-section">
      <h3 class="hub-section-title">Billing account</h3>
      <p class="hub-section-hint">
        Charges, invoices, receipts, payment methods, and merchant setup for this tenant.
      </p>
      <div class="hub-cards hub-cards-single">
        <button type="button" class="hub-card" @click="openArea('general', 'billing')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('billing')" :src="iconFor('billing')" alt="" class="hub-card-icon-img" />
            <span v-else>💳</span>
          </span>
            <span class="hub-card-body">
              <span class="hub-card-label">Billing</span>
            <span class="hub-card-desc">Charges, invoices, receipts, payment methods, and billing history for this tenant.</span>
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
          :class="{ 'hub-card--superadmin-only': row.superadminOnly }"
          @click="openArea(row.category, row.item)"
        >
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor(row.item)" :src="iconFor(row.item)" alt="" class="hub-card-icon-img" />
            <span v-else>{{ row.icon || '⚙️' }}</span>
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

const props = defineProps({
  isSuperAdmin: { type: Boolean, default: false },
  /** { title: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true },
  resolveItemIcon: { type: Function, default: null }
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
