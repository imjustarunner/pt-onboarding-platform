<template>
  <div class="tenant-features-management">
    <div class="section-header">
      <h2>Features</h2>
      <p class="section-description">
        Scope what this tenant can buy, what it costs, and whether a-la-carte selection is currently open.
      </p>
    </div>

    <div v-if="!currentAgencyId" class="placeholder-content">
      <div class="placeholder-icon">🎛️</div>
      <h3>Select a tenant</h3>
      <p>Choose a tenant context above to manage feature access.</p>
    </div>

    <template v-else>
      <div class="card feature-summary-card">
        <div class="feature-summary-head">
          <div>
            <h3>{{ currentAgencyName }} feature controls</h3>
            <p class="muted">
              This page is the focused replacement for the old giant Features tab. It keeps the same billing-backed
              behavior, just in one dedicated workspace.
            </p>
          </div>
          <div class="feature-summary-stats">
            <div class="summary-stat">
              <span class="summary-stat-label">Available</span>
              <strong>{{ availableFeatureCount }}</strong>
            </div>
            <div class="summary-stat">
              <span class="summary-stat-label">Selected</span>
              <strong>{{ selectedFeatureCount }}</strong>
            </div>
            <div class="summary-stat">
              <span class="summary-stat-label">Locked</span>
              <strong>{{ lockedFeatureCount }}</strong>
            </div>
            <div class="summary-stat">
              <span class="summary-stat-label">Estimate</span>
              <strong>{{ estimateTotalLabel }}</strong>
            </div>
          </div>
        </div>

        <div class="feature-status-row">
          <span :class="['pill', billingRolloutActive ? 'pill-on' : 'pill-off']">
            {{ billingRolloutActive ? 'Billing active' : 'Billing coming soon' }}
          </span>
          <span :class="['pill', featureControls.allAlaCarteDisabled ? 'pill-warn' : 'pill-on']">
            {{ featureControls.allAlaCarteDisabled ? 'A-la-carte paused' : 'A-la-carte available' }}
          </span>
        </div>

        <div v-if="isSuperAdmin" class="feature-controls-banner">
          <div class="feature-controls-copy">
            <div class="label">Seasonal a-la-carte switch</div>
            <p class="muted">
              Use this when summer programming or another bundled arrangement should stop tenant self-serve add-ons for
              a while.
            </p>
          </div>
          <div class="feature-controls-actions">
            <select v-model="featureControlsDraft.allAlaCarteDisabled" class="select" :disabled="settingsLoading || savingControls">
              <option :value="false">Leave a-la-carte on</option>
              <option :value="true">Turn off all a-la-carte</option>
            </select>
            <button class="btn btn-secondary" type="button" :disabled="settingsLoading || savingControls" @click="saveFeatureControls">
              {{ savingControls ? 'Saving…' : 'Save toggle' }}
            </button>
          </div>
        </div>

        <div v-else-if="featureControls.allAlaCarteDisabled" class="feature-banner feature-banner-warning">
          A-la-carte is paused for this tenant right now. Pricing stays visible, but tenant admins cannot change
          selections until superadmin turns it back on.
        </div>

        <div v-else-if="!canUseLiveBilling" class="feature-banner">
          Billing is still in coming-soon mode for this tenant, so self-serve feature selection will stay locked until
          billing goes live.
        </div>

        <div v-if="loadError" class="error">{{ loadError }}</div>
      </div>

      <div v-if="isSuperAdmin" class="card">
        <div class="feature-panel-head">
          <div>
            <h3>Tenant feature matrix</h3>
            <p class="muted">
              Set what this tenant can choose from, preselect anything you want bundled in, and override pricing where
              needed.
            </p>
          </div>
          <button class="btn" type="button" :disabled="pricingLoading || pricingSaving" @click="saveSuperadminFeatures">
            {{ pricingSaving ? 'Saving…' : 'Save features' }}
          </button>
        </div>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>
        <div v-if="agencyFeatureDrafts.length === 0" class="empty">No billable features are configured for this tenant yet.</div>

        <div v-else class="feature-list">
          <article v-for="feature in agencyFeatureDrafts" :key="`admin-feature-${feature.key}`" class="feature-row feature-row-admin">
            <div class="feature-summary">
              <div class="feature-summary-top">
                <span class="feature-title">{{ feature.label }}</span>
                <span class="feature-key">{{ feature.key }}</span>
              </div>
              <div class="feature-description feature-description-compact">{{ feature.description }}</div>
              <div class="feature-price">{{ displayFeaturePrice(feature) }}</div>
            </div>

            <div class="feature-row-controls feature-row-controls-admin">
              <label class="feature-control">
                <span class="feature-control-label">Available</span>
                <select v-model="feature.available" class="select" :disabled="pricingLoading || pricingSaving">
                  <option :value="false">Hidden</option>
                  <option :value="true">Visible</option>
                </select>
              </label>

              <label class="feature-control">
                <span class="feature-control-label">Selected</span>
                <select v-model="feature.enabled" class="select" :disabled="pricingLoading || pricingSaving">
                  <option :value="false">Not selected</option>
                  <option :value="true">Selected</option>
                </select>
              </label>

              <label class="feature-control">
                <span class="feature-control-label">Lock</span>
                <select v-model="feature.locked" class="select" :disabled="pricingLoading || pricingSaving">
                  <option :value="false">Tenant can change</option>
                  <option :value="true">Superadmin only</option>
                </select>
              </label>

              <label class="feature-control">
                <span class="feature-control-label">Tenant $/mo override</span>
                <input
                  v-model.number="feature.tenantMonthlyOverrideDollars"
                  class="input"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="pricingLoading || pricingSaving"
                  :placeholder="`Default $${Number(feature.platformTenantMonthlyDollars || 0).toFixed(2)}`"
                />
                <span class="feature-control-hint">
                  Platform default: ${{ Number(feature.platformTenantMonthlyDollars || 0).toFixed(2) }}/mo
                </span>
              </label>

              <label v-if="feature.perUserBillable" class="feature-control">
                <span class="feature-control-label">Per-user $/mo override</span>
                <input
                  v-model.number="feature.userMonthlyOverrideDollars"
                  class="input"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="pricingLoading || pricingSaving"
                  :placeholder="`Default $${Number(feature.platformUserMonthlyDollars || 0).toFixed(2)}`"
                />
                <span class="feature-control-hint">
                  Platform default: ${{ Number(feature.platformUserMonthlyDollars || 0).toFixed(2) }}/user/mo
                </span>
              </label>

              <label v-if="feature.pricingModel === 'manual_quantity'" class="feature-control">
                <span class="feature-control-label">Unit price override</span>
                <input
                  v-model.number="feature.unitAmountOverrideDollars"
                  class="input"
                  type="number"
                  step="0.01"
                  min="0"
                  :disabled="pricingLoading || pricingSaving"
                  placeholder="Platform default"
                />
              </label>

              <label class="feature-control">
                <span class="feature-control-label">Quantity</span>
                <input
                  v-if="feature.pricingModel === 'manual_quantity'"
                  v-model.number="feature.quantity"
                  class="input"
                  type="number"
                  step="1"
                  min="0"
                  :disabled="pricingLoading || pricingSaving"
                />
                <div v-else class="feature-control-static">—</div>
              </label>

              <label class="feature-control feature-control--notes">
                <span class="feature-control-label">Notes</span>
                <input
                  v-model="feature.notes"
                  class="input"
                  type="text"
                  :disabled="pricingLoading || pricingSaving"
                  placeholder="Optional internal note"
                />
              </label>
            </div>

            <div v-if="feature.perUserBillable" class="entitled-users">
              <button type="button" class="btn-link" @click="toggleEntitledUsers(feature)">
                {{ feature.showEntitlements ? '▼' : '▶' }} Entitled users
                <span v-if="feature.entitledUsers.length" class="muted">
                  ({{ feature.entitledUsers.length }} active · est. {{ formatPerUserEstimate(feature) }})
                </span>
              </button>
              <div v-if="feature.showEntitlements" class="entitled-users-panel">
                <div v-if="feature.entitlementsError" class="error">{{ feature.entitlementsError }}</div>
                <div v-if="feature.entitlementsLoading" class="muted">Loading users…</div>
                <table v-else class="entitled-users-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th class="center">Entitled</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in feature.tenantUsers" :key="`${feature.key}-u-${u.id}`">
                      <td>{{ formatUserName(u) }}</td>
                      <td class="muted">{{ u.role || '—' }}</td>
                      <td class="muted">{{ u.email || '—' }}</td>
                      <td class="center">
                        <input
                          type="checkbox"
                          :checked="!!u.entitled"
                          @change="onToggleUserEntitlement(feature, u, $event.target.checked)"
                          :disabled="!!u.saving"
                        />
                      </td>
                    </tr>
                    <tr v-if="!feature.tenantUsers.length">
                      <td colspan="4" class="muted center">No users in this tenant.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div v-else class="card">
        <div class="feature-panel-head">
          <div>
            <h3>Available platform features</h3>
            <p class="muted">
              Only the features enabled for this tenant show here. Selections feed the billing subscription automatically.
            </p>
          </div>
          <button class="btn" type="button" :disabled="saveSelectionsDisabled" @click="saveTenantSelections">
            {{ savingSelections ? 'Saving…' : 'Save selections' }}
          </button>
        </div>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>
        <div v-if="tenantVisibleFeatures.length === 0" class="empty">No features are available for this tenant yet.</div>

        <div v-else class="feature-list">
          <article v-for="feature in tenantVisibleFeatures" :key="`tenant-feature-${feature.key}`" class="feature-row">
            <div class="feature-summary">
              <div class="feature-summary-top">
                <span class="feature-title">{{ feature.label }}</span>
                <span class="feature-key">{{ feature.key }}</span>
              </div>
              <div class="feature-description feature-description-compact">{{ feature.description }}</div>
              <div class="feature-meta-line">
                <div class="feature-badges">
                  <span :class="['pill', feature.enabled ? 'pill-on' : 'pill-off']">
                    {{ feature.enabled ? 'Selected' : (feature.available ? 'Available' : 'Hidden') }}
                  </span>
                  <span v-if="feature.locked" class="pill pill-warn">Locked</span>
                </div>
                <div class="feature-price">{{ displayFeaturePrice(feature) }}</div>
              </div>
            </div>

            <div class="feature-row-controls feature-row-controls-tenant">
              <label v-if="feature.pricingModel === 'manual_quantity'" class="feature-control feature-control--compact">
                <span class="feature-control-label">Quantity</span>
                <input
                  v-model.number="feature.quantity"
                  class="input feature-qty"
                  type="number"
                  step="1"
                  min="0"
                  :disabled="featureSelectionDisabled(feature)"
                />
              </label>

              <button class="btn" type="button" :disabled="featureSelectionDisabled(feature)" @click="feature.enabled = !feature.enabled">
                {{ feature.enabled ? 'Remove feature' : 'Add feature' }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { clearAdminApiCache } from '../../utils/adminApiCache.js';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const currentAgencyName = computed(() => agencyStore.currentAgency?.name || 'This tenant');
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const loadError = ref('');
const pricingError = ref('');
const pricingLoading = ref(false);
const pricingSaving = ref(false);
const settingsLoading = ref(false);
const savingControls = ref(false);
const savingSelections = ref(false);

const billingRollout = ref({
  status: 'coming_soon',
  isActive: false
});
const featureControls = ref({
  allAlaCarteDisabled: false
});
const featureControlsDraft = ref({
  allAlaCarteDisabled: false
});
const pricingOverrideRaw = ref(null);
const platformDefaults = ref({ catalog: {}, loaded: false });

async function loadPlatformDefaultsOnce() {
  if (platformDefaults.value.loaded) return platformDefaults.value.catalog;
  try {
    const res = await api.get('/billing/pricing/default');
    const cat = res.data?.pricing?.featureCatalog || res.data?.featureCatalog || {};
    platformDefaults.value = { catalog: cat, loaded: true };
    return cat;
  } catch {
    platformDefaults.value = { catalog: {}, loaded: true };
    return {};
  }
}
const agencyFeatureDrafts = ref([]);
const estimate = ref(null);
const agencyDetail = ref(null);
const agencyFeatureFlags = ref({});

const money = (cents) => {
  const v = Number(cents || 0) / 100;
  return `$${v.toFixed(2)}`;
};

const normalizeFeatureControls = (raw) => ({
  allAlaCarteDisabled: raw?.allAlaCarteDisabled === true
});

const parseFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};

const isTruthy = (value) => {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const BILLING_FEATURE_FLAG_KEY_OVERRIDES = {
  publicAvailability: 'publicProviderFinderEnabled',
  momentumList: 'momentumListEnabled',
  geminiNoteAid: 'noteAidEnabled',
  officeSchedulingPublishing: 'shiftProgramsEnabled',
  payrollWorkspace: 'payrollEnabled',
  onboardingTraining: 'onboardingTrainingEnabled',
  schoolPortals: 'schoolPortalsEnabled',
  skillBuildersSchoolProgram: 'skillBuildersSchoolProgramEnabled'
};

const resolveFeatureFlagKey = (feature) => {
  const explicit = String(feature?.featureFlagKey || '').trim();
  if (explicit) return explicit;
  const featureKey = String(feature?.key || '').trim();
  if (BILLING_FEATURE_FLAG_KEY_OVERRIDES[featureKey]) {
    return BILLING_FEATURE_FLAG_KEY_OVERRIDES[featureKey];
  }
  if (featureKey.endsWith('Enabled')) return featureKey;
  return null;
};

const formatFeaturePricing = (feature) => {
  const amount = Number(feature?.unitAmountCents || 0) / 100;
  if (feature?.pricingModel === 'usage') return `$${amount.toFixed(2)} / ${feature?.unitLabel || 'unit'}`;
  if (feature?.pricingModel === 'manual_quantity') return `$${amount.toFixed(2)} / ${feature?.unitLabel || 'unit'}`;
  return `$${amount.toFixed(2)} / month`;
};

const dollarsToCents = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
};

const featureCatalogToDraftRows = (catalog, entitlements = {}, featureFlags = {}, platformCatalog = {}, pricingOverrideCatalog = {}) => {
  const source = catalog && typeof catalog === 'object' ? catalog : {};
  return Object.values(source).map((feature) => {
    const entitlement = entitlements?.[feature.key] || {};
    const platformDef = platformCatalog?.[feature.key] || {};
    const overrideRaw = pricingOverrideCatalog?.[feature.key] || {};
    const featureFlagKey = resolveFeatureFlagKey(feature);
    const flagEnabled = featureFlagKey ? isTruthy(featureFlags?.[featureFlagKey]) : false;
    const tenantMonthlyCents = Number(feature.tenantMonthlyCents || 0);
    const userMonthlyCents = Number(feature.userMonthlyCents || 0);
    const platformTenantCents = Number(platformDef.tenantMonthlyCents != null ? platformDef.tenantMonthlyCents : tenantMonthlyCents);
    const platformUserCents = Number(platformDef.userMonthlyCents != null ? platformDef.userMonthlyCents : userMonthlyCents);
    return {
      key: feature.key,
      label: feature.label || feature.key,
      description: feature.description || '',
      pricingModel: feature.pricingModel || 'flat_monthly',
      unitAmountDollars: Number(feature.unitAmountCents || 0) / 100,
      tenantMonthlyDollars: tenantMonthlyCents / 100,
      userMonthlyDollars: userMonthlyCents / 100,
      platformTenantMonthlyDollars: platformTenantCents / 100,
      platformUserMonthlyDollars: platformUserCents / 100,
      tenantMonthlyOverrideDollars: overrideRaw.tenantMonthlyCents != null ? Number(overrideRaw.tenantMonthlyCents) / 100 : null,
      userMonthlyOverrideDollars: overrideRaw.userMonthlyCents != null ? Number(overrideRaw.userMonthlyCents) / 100 : null,
      perUserBillable: feature.perUserBillable === true || userMonthlyCents > 0 || platformUserCents > 0,
      minProrationDays: Number(feature.minProrationDays || 0),
      unitLabel: feature.unitLabel || 'month',
      usageKey: feature.usageKey || null,
      featureFlagKey,
      defaultAvailable: feature.defaultAvailable === true,
      tenantSelfServe: feature.tenantSelfServe !== false,
      available: entitlement.available === true || flagEnabled,
      enabled: entitlement.enabled === true || flagEnabled,
      included: entitlement.included === true,
      locked: entitlement.locked === true,
      quantity: entitlement.quantity != null ? Number(entitlement.quantity) : 0,
      unitAmountOverrideDollars: entitlement.unitAmountCents != null ? Number(entitlement.unitAmountCents || 0) / 100 : null,
      notes: entitlement.notes || '',
      showEntitlements: false,
      entitledUsers: [],
      tenantUsers: [],
      entitlementsLoading: false,
      entitlementsError: ''
    };
  });
};

const buildPricingOverridePayload = (rows, basePricing) => {
  const next = basePricing && typeof basePricing === 'object' ? JSON.parse(JSON.stringify(basePricing)) : {};
  if (!next.featureCatalog || typeof next.featureCatalog !== 'object') next.featureCatalog = {};
  for (const row of rows || []) {
    if (!row?.key) continue;
    const entry = next.featureCatalog[row.key] && typeof next.featureCatalog[row.key] === 'object'
      ? next.featureCatalog[row.key]
      : {};
    if (row.tenantMonthlyOverrideDollars != null && row.tenantMonthlyOverrideDollars !== '') {
      entry.tenantMonthlyCents = dollarsToCents(row.tenantMonthlyOverrideDollars);
    } else {
      delete entry.tenantMonthlyCents;
    }
    if (row.perUserBillable && row.userMonthlyOverrideDollars != null && row.userMonthlyOverrideDollars !== '') {
      entry.userMonthlyCents = dollarsToCents(row.userMonthlyOverrideDollars);
    } else {
      delete entry.userMonthlyCents;
    }
    if (Object.keys(entry).length > 0) {
      next.featureCatalog[row.key] = entry;
    } else {
      delete next.featureCatalog[row.key];
    }
  }
  return next;
};

const buildFeatureEntitlementsPayload = (rows, { adminView = false } = {}) => {
  const payload = {};
  for (const row of rows || []) {
    if (!row?.key) continue;
    payload[row.key] = {
      available: adminView ? row.available === true : undefined,
      enabled: row.enabled === true,
      included: adminView ? row.included === true : undefined,
      locked: adminView ? row.locked === true : undefined,
      quantity: row.pricingModel === 'manual_quantity' ? Math.max(0, Number(row.quantity || 0)) : undefined,
      unitAmountCents: adminView && row.unitAmountOverrideDollars != null ? dollarsToCents(row.unitAmountOverrideDollars) : undefined,
      notes: adminView ? (row.notes || '') : undefined
    };
  }
  return payload;
};

const billingRolloutActive = computed(() => billingRollout.value?.status === 'active');
const canUseLiveBilling = computed(() => isSuperAdmin.value || billingRolloutActive.value);
const availableFeatureCount = computed(() => agencyFeatureDrafts.value.filter((row) => row.available).length);
const selectedFeatureCount = computed(() => agencyFeatureDrafts.value.filter((row) => row.enabled).length);
const lockedFeatureCount = computed(() => agencyFeatureDrafts.value.filter((row) => row.locked).length);
const estimateTotalLabel = computed(() => estimate.value?.totals?.totalCents != null ? money(estimate.value.totals.totalCents) : '—');
const tenantVisibleFeatures = computed(() => agencyFeatureDrafts.value.filter((row) => row.available || row.enabled || row.included));
const saveSelectionsDisabled = computed(() => {
  if (savingSelections.value || settingsLoading.value) return true;
  if (!canUseLiveBilling.value) return true;
  return featureControls.value.allAlaCarteDisabled === true;
});

const displayFeaturePrice = (feature) => {
  const effectiveTenant = feature.tenantMonthlyOverrideDollars != null
    ? Number(feature.tenantMonthlyOverrideDollars)
    : Number(feature.tenantMonthlyDollars || 0);
  const effectiveUser = feature.userMonthlyOverrideDollars != null
    ? Number(feature.userMonthlyOverrideDollars)
    : Number(feature.userMonthlyDollars || 0);
  if (effectiveTenant > 0 || effectiveUser > 0) {
    const parts = [];
    if (effectiveTenant > 0) {
      const isOverride = feature.tenantMonthlyOverrideDollars != null;
      parts.push(`$${effectiveTenant.toFixed(2)} tenant/mo${isOverride ? ' (override)' : ''}`);
    }
    if (effectiveUser > 0 && feature.perUserBillable) {
      const isOverride = feature.userMonthlyOverrideDollars != null;
      parts.push(`$${effectiveUser.toFixed(2)} per user/mo${isOverride ? ' (override)' : ''}`);
    }
    if (parts.length > 0) return parts.join(' + ');
  }
  return formatFeaturePricing({
    unitAmountCents: (feature.unitAmountOverrideDollars != null ? feature.unitAmountOverrideDollars : feature.unitAmountDollars) * 100,
    pricingModel: feature.pricingModel,
    unitLabel: feature.unitLabel
  });
};

const featureSelectionDisabled = (feature) => (
  !canUseLiveBilling.value ||
  featureControls.value.allAlaCarteDisabled === true ||
  !feature.available ||
  feature.locked ||
  !feature.tenantSelfServe
);

const buildAgencyFeatureFlagsPayload = (rows) => {
  const next = {
    ...(agencyFeatureFlags.value || {})
  };
  for (const row of rows || []) {
    if (!row?.featureFlagKey) continue;
    next[row.featureFlagKey] = row.enabled === true || row.included === true;
  }
  return next;
};

const applyAgencyDetail = (agency) => {
  agencyDetail.value = agency || null;
  agencyFeatureFlags.value = parseFlags(agency?.feature_flags || agency?.featureFlags || {});
};

const loadAgencyDetail = async () => {
  if (!currentAgencyId.value) {
    applyAgencyDetail(null);
    return null;
  }
  try {
    const res = await api.get(`/agencies/${currentAgencyId.value}`);
    applyAgencyDetail(res.data || null);
    return res.data || null;
  } catch {
    const fallback = agencyStore.currentAgency || null;
    applyAgencyDetail(fallback);
    return fallback;
  }
};

const loadPricing = async () => {
  pricingError.value = '';
  if (!currentAgencyId.value) {
    agencyFeatureDrafts.value = [];
    pricingOverrideRaw.value = null;
    return;
  }
  pricingLoading.value = true;
  try {
    const [res, platformCat] = await Promise.all([
      api.get(`/billing/${currentAgencyId.value}/pricing`),
      loadPlatformDefaultsOnce()
    ]);
    pricingOverrideRaw.value = res.data?.pricingOverride ?? null;
    agencyFeatureDrafts.value = featureCatalogToDraftRows(
      res.data?.featureCatalog || {},
      res.data?.featureEntitlements || {},
      agencyFeatureFlags.value,
      platformCat,
      pricingOverrideRaw.value?.featureCatalog || {}
    );
  } catch (error) {
    pricingError.value = error?.response?.data?.error?.message || 'Failed to load feature pricing.';
    agencyFeatureDrafts.value = [];
    pricingOverrideRaw.value = null;
  } finally {
    pricingLoading.value = false;
  }
};

const loadSettings = async () => {
  loadError.value = '';
  if (!currentAgencyId.value) {
    billingRollout.value = { status: 'coming_soon', isActive: false };
    featureControls.value = normalizeFeatureControls();
    featureControlsDraft.value = normalizeFeatureControls();
    return;
  }
  settingsLoading.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/settings`);
    billingRollout.value = res.data?.billingRollout || { status: 'coming_soon', isActive: false };
    featureControls.value = normalizeFeatureControls(res.data?.featureControls);
    featureControlsDraft.value = normalizeFeatureControls(res.data?.featureControls);
  } catch (error) {
    loadError.value = error?.response?.data?.error?.message || 'Failed to load feature controls.';
  } finally {
    settingsLoading.value = false;
  }
};

const loadEstimate = async () => {
  if (!currentAgencyId.value) {
    estimate.value = null;
    return;
  }
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/estimate`);
    estimate.value = res.data || null;
  } catch {
    estimate.value = null;
  }
};

const loadAll = async () => {
  if (!currentAgencyId.value) {
    agencyFeatureDrafts.value = [];
    estimate.value = null;
    billingRollout.value = { status: 'coming_soon', isActive: false };
    featureControls.value = normalizeFeatureControls();
    featureControlsDraft.value = normalizeFeatureControls();
    applyAgencyDetail(null);
    return;
  }
  await Promise.all([loadAgencyDetail(), loadSettings(), loadEstimate()]);
  await loadPricing();
};

const saveFeatureControls = async () => {
  if (!currentAgencyId.value || !isSuperAdmin.value) return;
  savingControls.value = true;
  loadError.value = '';
  try {
    const res = await api.put(`/billing/${currentAgencyId.value}/settings`, {
      featureControls: normalizeFeatureControls(featureControlsDraft.value)
    });
    featureControls.value = normalizeFeatureControls(res.data?.featureControls);
    featureControlsDraft.value = normalizeFeatureControls(res.data?.featureControls);
  } catch (error) {
    loadError.value = error?.response?.data?.error?.message || 'Failed to save feature controls.';
  } finally {
    savingControls.value = false;
  }
};

const saveSuperadminFeatures = async () => {
  if (!currentAgencyId.value || !isSuperAdmin.value) return;
  pricingSaving.value = true;
  pricingError.value = '';
  try {
    const featureFlags = buildAgencyFeatureFlagsPayload(agencyFeatureDrafts.value);
    const agencyRes = await api.put(`/agencies/${currentAgencyId.value}`, {
      featureFlags
    });
    applyAgencyDetail(agencyRes.data || null);
    if (agencyStore.currentAgency?.id === currentAgencyId.value) {
      agencyStore.setCurrentAgency({
        ...(agencyStore.currentAgency || {}),
        ...(agencyRes.data || {})
      });
    }
    const pricingPayload = buildPricingOverridePayload(agencyFeatureDrafts.value, pricingOverrideRaw.value);
    await api.put(`/billing/${currentAgencyId.value}/pricing`, {
      pricing: pricingPayload,
      featureEntitlements: buildFeatureEntitlementsPayload(agencyFeatureDrafts.value, { adminView: true })
    });
    await Promise.all([loadAgencyDetail(), loadPricing(), loadEstimate(), loadSettings()]);
    clearAdminApiCache();
  } catch (error) {
    pricingError.value = error?.response?.data?.error?.message || 'Failed to save features.';
  } finally {
    pricingSaving.value = false;
  }
};

const saveTenantSelections = async () => {
  if (!currentAgencyId.value || isSuperAdmin.value) return;
  savingSelections.value = true;
  loadError.value = '';
  try {
    const featureFlags = buildAgencyFeatureFlagsPayload(agencyFeatureDrafts.value);
    const agencyRes = await api.put(`/agencies/${currentAgencyId.value}`, {
      featureFlags
    });
    applyAgencyDetail(agencyRes.data || null);
    if (agencyStore.currentAgency?.id === currentAgencyId.value) {
      agencyStore.setCurrentAgency({
        ...(agencyStore.currentAgency || {}),
        ...(agencyRes.data || {})
      });
    }
    await api.put(`/billing/${currentAgencyId.value}/settings`, {
      featureEntitlements: buildFeatureEntitlementsPayload(agencyFeatureDrafts.value, { adminView: false })
    });
    await Promise.all([loadAgencyDetail(), loadPricing(), loadEstimate(), loadSettings()]);
    clearAdminApiCache();
  } catch (error) {
    loadError.value = error?.response?.data?.error?.message || 'Failed to save feature selections.';
  } finally {
    savingSelections.value = false;
  }
};

const formatUserName = (u) => {
  const parts = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return parts || u.email || `User ${u.id}`;
};

const formatPerUserEstimate = (feature) => {
  const count = (feature.entitledUsers || []).length;
  const cents = Number(feature.userMonthlyDollars || 0) * 100;
  return `$${((count * cents) / 100).toFixed(2)}/mo`;
};

const toggleEntitledUsers = async (feature) => {
  feature.showEntitlements = !feature.showEntitlements;
  if (!feature.showEntitlements) return;
  if (feature.entitlementsLoading) return;
  feature.entitlementsLoading = true;
  feature.entitlementsError = '';
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/features/${feature.key}/users`);
    const entitled = res.data?.users || [];
    const candidates = res.data?.candidates || [];
    const entitledIds = new Set(entitled.map((u) => Number(u.userId)));
    feature.entitledUsers = entitled;
    feature.tenantUsers = candidates.map((u) => ({
      ...u,
      entitled: entitledIds.has(Number(u.id)),
      saving: false
    }));
  } catch (e) {
    feature.entitlementsError = e?.response?.data?.error?.message || 'Failed to load entitled users';
  } finally {
    feature.entitlementsLoading = false;
  }
};

const onToggleUserEntitlement = async (feature, user, enabled) => {
  if (!currentAgencyId.value) return;
  user.saving = true;
  feature.entitlementsError = '';
  try {
    await api.post(`/billing/${currentAgencyId.value}/features/users/${user.id}`, {
      featureKey: feature.key,
      enabled: !!enabled
    });
    user.entitled = !!enabled;
    if (enabled) {
      const exists = feature.entitledUsers.some((u) => Number(u.userId) === Number(user.id));
      if (!exists) feature.entitledUsers.push({
        userId: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email
      });
    } else {
      feature.entitledUsers = feature.entitledUsers.filter((u) => Number(u.userId) !== Number(user.id));
    }
  } catch (e) {
    user.entitled = !enabled;
    feature.entitlementsError = e?.response?.data?.error?.message || 'Failed to update entitlement';
  } finally {
    user.saving = false;
  }
};

watch(currentAgencyId, () => {
  loadAll();
}, { immediate: true });
</script>

<style scoped>
.tenant-features-management {
  padding: 0;
}

.feature-summary-card {
  margin-bottom: 16px;
}

.feature-summary-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.feature-summary-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(88px, 1fr));
  gap: 10px;
  min-width: min(100%, 420px);
}

.summary-stat {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--surface, #fff);
}

.summary-stat-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.feature-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.feature-controls-banner {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface, #fff) 92%, var(--brand-primary, #6a9c5c) 8%);
}

.feature-controls-copy p {
  margin: 4px 0 0 0;
}

.feature-controls-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.feature-banner {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface, #fff);
  color: var(--text-secondary);
}

.feature-banner-warning {
  background: color-mix(in srgb, #fff7e8 88%, var(--surface, #fff) 12%);
}

.feature-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.feature-list {
  display: grid;
  gap: 10px;
}

.feature-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.05fr) minmax(420px, 1.45fr);
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--brand-primary, #6a9c5c) 35%, var(--border) 65%);
  border-radius: 16px;
  background: var(--surface, #fff);
}

.feature-title {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-primary);
}

.feature-summary {
  min-width: 0;
}

.feature-summary-top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.feature-key {
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.feature-description {
  margin-top: 6px;
  color: var(--text-secondary);
  line-height: 1.35;
}

.feature-description-compact {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}

.feature-price {
  margin-top: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--text-primary) 70%, var(--brand-primary, #6a9c5c) 30%);
}

.feature-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.feature-meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.feature-row-controls {
  display: grid;
  gap: 10px;
}

.feature-row-controls-admin {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.feature-row-controls-tenant {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.feature-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.feature-control--notes {
  min-width: 180px;
}

.feature-control--compact {
  min-width: 120px;
}

.feature-control-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.feature-control-hint {
  font-size: 10px;
  color: var(--text-secondary, #6b7280);
  margin-top: 2px;
  font-style: italic;
}

.feature-control-static {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-secondary);
}

.feature-qty {
  max-width: 120px;
}

.placeholder-content {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 10px;
}

@media (max-width: 980px) {
  .feature-summary-head,
  .feature-controls-banner,
  .feature-panel-head {
    flex-direction: column;
  }

  .feature-row {
    grid-template-columns: 1fr;
  }

  .feature-summary-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    width: 100%;
  }

  .feature-controls-actions,
  .feature-row-controls-tenant {
    width: 100%;
  }

  .feature-controls-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .feature-row-controls-admin {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .feature-row-controls-tenant {
    justify-content: flex-start;
    align-items: stretch;
    flex-direction: column;
  }

  .feature-meta-line {
    flex-direction: column;
    align-items: flex-start;
  }
}

.entitled-users {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--border, #e5e7eb);
}
.btn-link {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--primary, #059669);
  font: inherit;
  padding: 0;
  font-weight: 600;
  font-size: 13px;
}
.btn-link .muted { font-weight: 400; margin-left: 6px; color: var(--text-secondary, #6b7280); }
.entitled-users-panel {
  margin-top: 8px;
  background: #f9fafb;
  padding: 8px;
  border-radius: 8px;
}
.entitled-users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.entitled-users-table th, .entitled-users-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}
.entitled-users-table tr:last-child td { border-bottom: none; }
.entitled-users-table .center { text-align: center; }
.entitled-users-table .muted { color: var(--text-secondary, #6b7280); }
</style>
