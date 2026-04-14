<template>
  <div class="superadmin-tenant-hub">
    <div class="section-header">
      <h2>{{ overviewHeading }}</h2>
      <p class="section-description">
        One place to see feature eligibility (platform default plus optional per-tenant overrides), what this tenant has enabled,
        billing catalog pricing where it exists, and quick links into Company Profile and full billing.
      </p>
    </div>

    <div v-if="!agencyStore.currentAgency" class="empty-state">
      <p>Select a tenant using Tenant context at the top of Settings.</p>
    </div>

    <template v-else>
      <div class="hub-actions">
        <button type="button" class="btn btn-secondary" @click="goCompanyProfileFeatures">
          Edit feature toggles (Company Profile)
        </button>
        <button type="button" class="btn btn-secondary" @click="goBilling">Open billing</button>
      </div>

      <div class="settings-section">
        <h3>Platform dashboards</h3>
        <p class="section-description">
          Open tenant-facing dashboards without leaving superadmin tools. Guardian opens in a safe preview mode, while the other options open the real tenant dashboard shell for the selected portal slug.
        </p>
        <div class="dashboard-launcher">
          <div class="dashboard-launcher-grid">
            <div class="form-field">
              <label>Portal slug</label>
              <input
                v-model.trim="dashboardPortalSlug"
                class="input"
                type="text"
                placeholder="tenant portal slug"
              />
            </div>
            <div class="form-field">
              <label>Dashboard type</label>
              <select v-model="dashboardPreviewType" class="select">
                <option v-for="opt in dashboardPreviewOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div class="form-field">
              <label>{{ dashboardTargetLabel }}</label>
              <input
                v-model.trim="dashboardTargetId"
                class="input"
                type="text"
                :placeholder="dashboardTargetPlaceholder"
                :disabled="!dashboardRequiresTarget"
              />
            </div>
          </div>
          <div class="dashboard-launcher-preview">
            <div class="mono small">{{ resolvedDashboardPreviewHref || 'Choose a portal slug to generate a preview link.' }}</div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-primary" :disabled="!resolvedDashboardPreviewHref" @click="openDashboardPreviewSameTab">
              Open here
            </button>
            <button type="button" class="btn btn-secondary" :disabled="!resolvedDashboardPreviewHref" @click="openDashboardPreviewWindow">
              Open in new window
            </button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Tenant identity & superadmin locks</h3>
        <p class="section-description">
          URL slug, active status, affiliation, and a few flags only superadmin can change for
          <strong>{{ agencyStore.currentAgency?.name || 'this tenant' }}</strong>.
        </p>
        <AgencyPlatformManagement embed-in-hub />
      </div>

      <div class="settings-section">
        <h3>Per-tenant feature visibility</h3>
        <p class="section-description">
          Override <strong>Platform Settings → Available Agency Features</strong> for this tenant only.
          “Use platform default” leaves that key to the global grid; Eligible / Hidden forces visibility of the toggle in Company Profile.
        </p>
        <div v-if="loadError" class="error">{{ loadError }}</div>
        <div class="override-grid">
          <div v-for="row in AVAILABLE_AGENCY_FEATURE_KEYS" :key="row.key" class="override-row">
            <span class="override-label">{{ row.label }}</span>
            <select v-model="overrideMode[row.key]" class="select override-select">
              <option value="inherit">Use platform default</option>
              <option value="eligible">Eligible (show toggle)</option>
              <option value="hidden">Hidden (no toggle)</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" :disabled="savingOverrides" @click="saveVisibilityOverrides">
            {{ savingOverrides ? 'Saving…' : 'Save visibility overrides' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="savingOverrides" @click="clearVisibilityOverrides">
            Clear overrides (inherit all)
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Features & commercial snapshot</h3>
        <p class="section-description">
          Eligible reflects the merged platform + tenant rule. Pricing shows subscription catalog lines when this product flag maps to a billable add-on; others are configured under Billing.
        </p>
        <div v-if="billingError" class="error">{{ billingError }}</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Eligible</th>
                <th>Tenant selected</th>
                <th>Commercial terms</th>
                <th>Usage / notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in AVAILABLE_AGENCY_FEATURE_KEYS" :key="`snap-${row.key}`">
                <td>{{ row.label }}</td>
                <td>
                  <span :class="['pill', effectiveEligible[row.key] ? 'pill-on' : 'pill-off']">
                    {{ effectiveEligible[row.key] ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td>
                  <span :class="['pill', flagSelected(row.key) ? 'pill-on' : 'pill-off']">
                    {{ flagSelected(row.key) ? 'On' : 'Off' }}
                  </span>
                </td>
                <td class="mono small">{{ commercialTerms(row.key) }}</td>
                <td class="small">{{ usageHint(row.key) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="settings-section">
        <h3>Recent invoices</h3>
        <p class="section-description">Same data as Billing → invoice list (latest {{ invoiceRows.length }}).</p>
        <div v-if="invoicesError" class="error">{{ invoicesError }}</div>
        <div v-if="invoiceRows.length === 0" class="muted">No invoices yet.</div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in invoiceRows" :key="inv.id">
                <td class="mono small">{{ inv.period_start }} – {{ inv.period_end }}</td>
                <td>{{ money(inv.total_cents) }}</td>
                <td>{{ inv.status }}</td>
                <td>{{ inv.payment_status || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import { AVAILABLE_AGENCY_FEATURE_KEYS } from '../../config/availableAgencyFeatureKeys.js';
import { isFeatureKeyAvailableAfterMerge } from '../../utils/mergeAvailableAgencyFeatures.js';
import AgencyPlatformManagement from './AgencyPlatformManagement.vue';

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const overviewHeading = computed(() => {
  const n = String(agencyStore.currentAgency?.name || '').trim();
  return n ? `${n} Overview` : 'Overview';
});
const route = useRoute();
const router = useRouter();

/** Maps Company Profile feature_flags keys to billing featureCatalog keys (best-effort; extend in billing catalog over time). */
const FLAG_KEY_TO_BILLING_CATALOG = {
  momentumListEnabled: 'momentumList',
  noteAidEnabled: 'geminiNoteAid',
  payrollEnabled: 'payrollWorkspace',
  shiftProgramsEnabled: 'officeSchedulingPublishing',
  publicProviderFinderEnabled: 'publicAvailability'
};

const loadError = ref('');
const billingError = ref('');
const invoicesError = ref('');
const savingOverrides = ref(false);
const dashboardPreviewType = ref('admin_dashboard');
const dashboardPortalSlug = ref('');
const dashboardTargetId = ref('');

const agencyDetail = ref(null);
const pricingPayload = ref(null);
const estimatePayload = ref(null);
const invoiceRows = ref([]);

const overrideMode = ref({});

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

const isTruthy = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

const featureFlagsParsed = computed(() => parseFlags(agencyDetail.value?.feature_flags));

const effectiveEligible = computed(() => {
  const pb = brandingStore.platformBranding;
  const globalRaw = pb?.available_agency_features_json;
  const tenantRaw = agencyDetail.value?.tenant_available_agency_features_json;
  const out = {};
  for (const { key } of AVAILABLE_AGENCY_FEATURE_KEYS) {
    out[key] = isFeatureKeyAvailableAfterMerge(globalRaw, tenantRaw, key);
  }
  return out;
});

const flagSelected = (key) => isTruthy(featureFlagsParsed.value[key]);

const catalogForFlag = (flagKey) => {
  const catKey = FLAG_KEY_TO_BILLING_CATALOG[flagKey];
  if (!catKey || !pricingPayload.value) return null;
  const catalog = pricingPayload.value.featureCatalog || {};
  const ent = pricingPayload.value.featureEntitlements || {};
  return {
    catKey,
    def: catalog[catKey] || {},
    ent: ent[catKey] || {}
  };
};

const formatCommercial = (def, ent) => {
  const unitCents =
    ent.unitAmountCents != null && ent.unitAmountCents !== ''
      ? Number(ent.unitAmountCents)
      : Number(def.unitAmountCents || 0);
  const model = def.pricingModel || 'flat_monthly';
  const label = def.unitLabel || 'unit';
  const dollars = (Number(unitCents) / 100).toFixed(2);
  if (model === 'flat_monthly') return `$${dollars}/mo flat`;
  if (model === 'usage') return `$${dollars}/${label}`;
  if (model === 'manual_quantity') return `$${dollars}/${label} (qty)`;
  return `$${dollars}`;
};

const commercialTerms = (flagKey) => {
  const mapped = catalogForFlag(flagKey);
  if (!mapped) {
    return '— (configure in Billing if billable)';
  }
  const { def, ent } = mapped;
  const parts = [formatCommercial(def, ent)];
  if (ent.available === false && ent.enabled !== true) parts.push('not offered');
  else if (ent.available === true && ent.enabled !== true) parts.push('available, not selected');
  else if (ent.enabled === true) parts.push('selected in billing');
  return parts.join(' · ');
};

const usageHint = (flagKey) => {
  const u = estimatePayload.value?.usage || {};
  if (flagKey === 'momentumListEnabled') {
    const n = Number(u.momentumListUsersUsed ?? 0);
    return `Active employees counted: ${n}`;
  }
  if (flagKey === 'noteAidEnabled') {
    const n = Number(u.activeEmployeesUsed ?? 0);
    return flagSelected(flagKey) ? `Billable seats context: ${n} active employees` : '—';
  }
  if (FLAG_KEY_TO_BILLING_CATALOG[flagKey]) {
    return 'See Billing for quantities and line items.';
  }
  return 'Organization-wide when enabled.';
};

const money = (cents) => {
  const n = Number(cents || 0) / 100;
  return `$${n.toFixed(2)}`;
};

const dashboardPreviewOptions = [
  { value: 'admin_dashboard', label: 'Admin dashboard' },
  { value: 'organization_dashboard', label: 'Organization dashboard' },
  { value: 'guardian_dashboard', label: 'Guardian dashboard preview' },
  { value: 'summit_dashboard', label: 'Summit member dashboard' },
  { value: 'operations_dashboard', label: 'Operations dashboard' },
  { value: 'season_dashboard', label: 'Season dashboard' },
  { value: 'learning_class_workspace', label: 'Learning class workspace' }
];

const dashboardRequiresTarget = computed(() => {
  return ['season_dashboard', 'learning_class_workspace', 'operations_dashboard'].includes(dashboardPreviewType.value);
});

const dashboardTargetLabel = computed(() => {
  if (dashboardPreviewType.value === 'season_dashboard') return 'Season ID';
  if (dashboardPreviewType.value === 'learning_class_workspace') return 'Class ID';
  if (dashboardPreviewType.value === 'operations_dashboard') return 'Program ID';
  return 'Target ID';
});

const dashboardTargetPlaceholder = computed(() => {
  if (dashboardPreviewType.value === 'season_dashboard') return 'season id';
  if (dashboardPreviewType.value === 'learning_class_workspace') return 'class id';
  if (dashboardPreviewType.value === 'operations_dashboard') return 'optional program id';
  return 'not needed for this dashboard';
});

const syncDashboardLauncherDefaults = () => {
  const slug = String(
    agencyDetail.value?.portal_url ||
    agencyDetail.value?.slug ||
    agencyStore.currentAgency?.portal_url ||
    agencyStore.currentAgency?.slug ||
    ''
  ).trim();
  dashboardPortalSlug.value = slug;
  dashboardTargetId.value = '';
};

const resolvedDashboardPreviewHref = computed(() => {
  const slug = String(dashboardPortalSlug.value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) return '';
  const tenantId = Number(agencyStore.currentAgency?.id || 0) || null;
  const targetId = String(dashboardTargetId.value || '').trim();
  const previewQuery = {
    previewMode: 'superadmin',
    ...(tenantId ? { previewAgencyId: String(tenantId) } : {})
  };
  let routeLocation = null;

  if (dashboardPreviewType.value === 'admin_dashboard') {
    routeLocation = { path: `/${slug}/admin`, query: previewQuery };
  } else if (dashboardPreviewType.value === 'organization_dashboard') {
    routeLocation = { path: `/${slug}/dashboard`, query: previewQuery };
  } else if (dashboardPreviewType.value === 'guardian_dashboard') {
    routeLocation = {
      path: `/${slug}/guardian`,
      query: previewQuery
    };
  } else if (dashboardPreviewType.value === 'summit_dashboard') {
    routeLocation = { path: `/${slug}/my_club_dashboard`, query: previewQuery };
  } else if (dashboardPreviewType.value === 'operations_dashboard') {
    routeLocation = {
      path: `/${slug}/operations-dashboard`,
      query: {
        ...previewQuery,
        ...(targetId ? { programId: targetId, previewProgramId: targetId } : {})
      }
    };
  } else if (dashboardPreviewType.value === 'season_dashboard') {
    if (!targetId) return '';
    routeLocation = {
      path: `/${slug}/season/${targetId}`,
      query: {
        ...previewQuery,
        previewTargetId: targetId
      }
    };
  } else if (dashboardPreviewType.value === 'learning_class_workspace') {
    if (!targetId) return '';
    routeLocation = {
      path: `/${slug}/learning/classes/${targetId}`,
      query: {
        ...previewQuery,
        previewTargetId: targetId
      }
    };
  }

  if (!routeLocation) return '';
  return router.resolve(routeLocation).href;
});

const initOverrideModes = () => {
  const tenant = parseFlags(agencyDetail.value?.tenant_available_agency_features_json);
  const next = {};
  for (const { key } of AVAILABLE_AGENCY_FEATURE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(tenant, key)) next[key] = 'inherit';
    else next[key] = tenant[key] !== false ? 'eligible' : 'hidden';
  }
  overrideMode.value = next;
};

const loadAgencyDetail = async () => {
  loadError.value = '';
  const id = agencyStore.currentAgency?.id;
  if (!id) return;
  try {
    const res = await api.get(`/agencies/${id}`);
    agencyDetail.value = res.data;
    initOverrideModes();
    syncDashboardLauncherDefaults();
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load agency';
  }
};

const loadBillingSnapshot = async () => {
  billingError.value = '';
  invoicesError.value = '';
  const id = agencyStore.currentAgency?.id;
  if (!id) return;
  try {
    const [pr, est, inv] = await Promise.all([
      api.get(`/billing/${id}/pricing`).catch(() => ({ data: null })),
      api.get(`/billing/${id}/estimate`).catch(() => ({ data: null })),
      api.get(`/billing/${id}/invoices`).catch(() => ({ data: [] }))
    ]);
    pricingPayload.value = pr.data
      ? {
          featureCatalog: pr.data.featureCatalog || {},
          featureEntitlements: pr.data.featureEntitlements || {}
        }
      : null;
    estimatePayload.value = est.data || null;
    invoiceRows.value = Array.isArray(inv.data) ? inv.data.slice(0, 8) : [];
  } catch (e) {
    billingError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load billing';
  }
};

const refreshAll = async () => {
  await brandingStore.fetchPlatformBranding();
  await loadAgencyDetail();
  await loadBillingSnapshot();
};

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    refreshAll();
  },
  { immediate: true }
);

const saveVisibilityOverrides = async () => {
  const id = agencyStore.currentAgency?.id;
  if (!id) return;
  savingOverrides.value = true;
  loadError.value = '';
  try {
    const built = {};
    for (const { key } of AVAILABLE_AGENCY_FEATURE_KEYS) {
      const m = overrideMode.value[key] || 'inherit';
      if (m === 'inherit') continue;
      built[key] = m === 'eligible';
    }
    const payload =
      Object.keys(built).length > 0 ? built : null;
    await api.put(`/agencies/${id}`, { tenantAvailableAgencyFeaturesJson: payload });
    await agencyStore.fetchAgencies();
    await loadAgencyDetail();
    const cur = agencyStore.currentAgency;
    if (cur && Number(cur.id) === Number(id)) {
      agencyStore.setCurrentAgency({
        ...cur,
        tenant_available_agency_features_json: payload
      });
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Save failed';
  } finally {
    savingOverrides.value = false;
  }
};

const clearVisibilityOverrides = async () => {
  for (const { key } of AVAILABLE_AGENCY_FEATURE_KEYS) {
    overrideMode.value[key] = 'inherit';
  }
  await saveVisibilityOverrides();
};

const goCompanyProfileFeatures = () => {
  const id = agencyStore.currentAgency?.id;
  if (!id) return;
  router.replace({
    query: {
      ...route.query,
      category: 'general',
      item: 'company-profile',
      agencyId: String(id),
      agencyTab: 'features'
    }
  });
};

const goBilling = () => {
  router.replace({
    query: {
      ...route.query,
      category: 'general',
      item: 'billing'
    }
  });
};

const openDashboardPreviewSameTab = async () => {
  if (!resolvedDashboardPreviewHref.value) return;
  await router.push(resolvedDashboardPreviewHref.value);
};

const openDashboardPreviewWindow = () => {
  if (!resolvedDashboardPreviewHref.value) return;
  window.open(resolvedDashboardPreviewHref.value, '_blank', 'noopener,noreferrer');
};
</script>

<style scoped>
.superadmin-tenant-hub {
  padding: 0;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h2 {
  margin: 0 0 8px 0;
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.hub-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.settings-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.settings-section h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.dashboard-launcher {
  max-width: 960px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.9), rgba(239, 246, 255, 0.9));
}

.dashboard-launcher-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.dashboard-launcher-preview {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 13px;
  font-weight: 600;
}

.override-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 720px;
}

.override-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.override-label {
  font-weight: 500;
  flex: 1 1 200px;
}

.override-select {
  min-width: 220px;
  flex: 1 1 240px;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th,
.data-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}

.data-table th {
  background: var(--bg-alt);
  font-weight: 600;
}

.small {
  font-size: 13px;
}

.mono {
  font-family: ui-monospace, monospace;
}

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.pill-on {
  background: rgba(34, 139, 34, 0.15);
  color: var(--text-primary);
}

.pill-off {
  background: rgba(120, 120, 120, 0.12);
  color: var(--text-secondary);
}

.error {
  color: #b00020;
  margin-bottom: 12px;
}

.muted {
  color: var(--text-secondary);
}

.empty-state {
  padding: 24px 0;
}

@media (max-width: 900px) {
  .dashboard-launcher-grid {
    grid-template-columns: 1fr;
  }
}
</style>
