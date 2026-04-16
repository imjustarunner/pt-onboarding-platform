<template>
  <div class="platform-settings-card-hub">
    <header class="hub-header">
      <h2 class="hub-title">Platform</h2>
      <p class="hub-subtitle">
        Global tools and defaults — no tenant selected. Choose a tenant in the bar above for organization-specific
        screens (profile, billing, per-tenant overview).
      </p>
    </header>

    <section class="hub-section">
      <h3 class="hub-section-title">Governance &amp; visibility</h3>
      <p class="hub-section-hint">
        Defaults that apply to every tenant until overridden, plus compliance-oriented views.
      </p>
      <div class="hub-cards">
        <button type="button" class="hub-card hub-card--superadmin-only" @click="openArea('platform', 'platform-settings')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('platform-settings')" :src="iconFor('platform-settings')" alt="" class="hub-card-icon-img" />
            <span v-else>🔐</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Platform defaults</span>
            <span class="hub-card-desc">
              Feature visibility grid, school portal icons, and other settings that shape what tenants see in Company
              Profile.
            </span>
          </span>
        </button>
        <button type="button" class="hub-card hub-card--superadmin-only" @click="openArea('platform', 'platform-billing')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('platform-billing')" :src="iconFor('platform-billing')" alt="" class="hub-card-icon-img" />
            <span v-else>💳</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Platform billing</span>
            <span class="hub-card-desc">
              Stripe and QuickBooks readiness for tenants that should pay the platform through your merchant account.
            </span>
          </span>
        </button>
        <button type="button" class="hub-card hub-card--superadmin-only" @click="openArea('platform', 'platform-all-agencies')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('platform-all-agencies')" :src="iconFor('platform-all-agencies')" alt="" class="hub-card-icon-img" />
            <span v-else>🗂️</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">All organizations</span>
            <span class="hub-card-desc">
              Full directory of tenants and orgs: search, create agencies, jump into any company profile.
            </span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('system', 'audit-center')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('audit-center')" :src="iconFor('audit-center')" alt="" class="hub-card-icon-img" />
            <span v-else>🛡️</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Audit center</span>
            <span class="hub-card-desc">Review activity and access trails across the platform where enabled.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('system', 'viewport-preview')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('viewport-preview')" :src="iconFor('viewport-preview')" alt="" class="hub-card-icon-img" />
            <span v-else>📱</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Viewport preview</span>
            <span class="hub-card-desc">Device framing and preview defaults for portal experiences.</span>
          </span>
        </button>
      </div>
    </section>

    <section class="hub-section">
      <h3 class="hub-section-title">General &amp; billing</h3>
      <p class="hub-section-hint">
        Company profile and billing often need a tenant — pick one above, or open the screen and choose from the
        in-page selector when offered.
      </p>
      <div class="hub-cards">
        <button type="button" class="hub-card" @click="openArea('general', 'company-profile')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('company-profile')" :src="iconFor('company-profile')" alt="" class="hub-card-icon-img" />
            <span v-else>🏢</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Company profile</span>
            <span class="hub-card-desc">Branding, features, terminology, structure — scoped once a tenant is chosen.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'team-roles')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('team-roles')" :src="iconFor('team-roles')" alt="" class="hub-card-icon-img" />
            <span v-else>👥</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Team &amp; roles</span>
            <span class="hub-card-desc">Who can access which areas inside a tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'billing')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('billing')" :src="iconFor('billing')" alt="" class="hub-card-icon-img" />
            <span v-else>💳</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Billing</span>
            <span class="hub-card-desc">Charges, invoices, receipts, payment methods, and billing history per tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'tenant-features')">
          <span class="hub-card-icon" aria-hidden="true">
            <img v-if="iconFor('company-profile')" :src="iconFor('company-profile')" alt="" class="hub-card-icon-img" />
            <span v-else>🎛️</span>
          </span>
          <span class="hub-card-body">
            <span class="hub-card-label">Features</span>
            <span class="hub-card-desc">Open the dedicated feature matrix for enablement, pricing, and a-la-carte controls.</span>
          </span>
        </button>
      </div>
    </section>

    <section v-for="block in secondaryBlocks" :key="block.title" class="hub-section">
      <h3 class="hub-section-title">{{ block.title }}</h3>
      <p v-if="block.hint" class="hub-section-hint">{{ block.hint }}</p>
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
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  /** { title: string, hint?: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true },
  /** (itemId) => url | null — from SettingsModal getSettingsIconUrl */
  resolveItemIcon: { type: Function, default: null }
});

const brandingStore = useBrandingStore();

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
