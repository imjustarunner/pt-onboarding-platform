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
        <button type="button" class="hub-card" @click="openArea('platform', 'platform-settings')">
          <span class="hub-card-icon" aria-hidden="true">🔐</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Platform defaults</span>
            <span class="hub-card-desc">
              Feature visibility grid, school portal icons, and other settings that shape what tenants see in Company
              Profile.
            </span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('platform', 'platform-all-agencies')">
          <span class="hub-card-icon" aria-hidden="true">🗂️</span>
          <span class="hub-card-body">
            <span class="hub-card-label">All organizations</span>
            <span class="hub-card-desc">
              Full directory of tenants and orgs: search, create agencies, jump into any company profile.
            </span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('system', 'audit-center')">
          <span class="hub-card-icon" aria-hidden="true">🛡️</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Audit center</span>
            <span class="hub-card-desc">Review activity and access trails across the platform where enabled.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('system', 'viewport-preview')">
          <span class="hub-card-icon" aria-hidden="true">📱</span>
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
          <span class="hub-card-icon" aria-hidden="true">🏢</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Company profile</span>
            <span class="hub-card-desc">Branding, features, terminology, structure — scoped once a tenant is chosen.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'team-roles')">
          <span class="hub-card-icon" aria-hidden="true">👥</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Team &amp; roles</span>
            <span class="hub-card-desc">Who can access which areas inside a tenant.</span>
          </span>
        </button>
        <button type="button" class="hub-card" @click="openArea('general', 'billing')">
          <span class="hub-card-icon" aria-hidden="true">💳</span>
          <span class="hub-card-body">
            <span class="hub-card-label">Billing</span>
            <span class="hub-card-desc">Plans, catalog line items, invoices, and payment methods per tenant.</span>
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
const props = defineProps({
  /** { title: string, hint?: string, items: { category, item, label, icon?, description? }[] }[] */
  secondaryBlocks: { type: Array, default: () => [] },
  onOpenArea: { type: Function, required: true }
});

const openArea = (category, item, agencyTab) => {
  props.onOpenArea({ category, item, agencyTab });
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
</style>
