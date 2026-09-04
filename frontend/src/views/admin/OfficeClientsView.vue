<template>
  <div class="ocm-root">
    <header class="ocm-header">
      <div>
        <p class="ocm-eyebrow">Office Client Management</p>
        <h1 class="ocm-title">Office Clients</h1>
        <p class="ocm-subtitle">
          Prospective and continuing office enrollments across your affiliated offices — no brand switch required.
        </p>
      </div>
      <div class="ocm-hub-header-actions">
        <nav class="ocm-hub-switcher" aria-label="Office tools">
          <template v-for="item in officeNavLinks" :key="item.key">
            <span v-if="item.isActive" class="ocm-hub-switcher-btn is-active" aria-current="page">{{ item.label }}</span>
            <router-link v-else class="ocm-hub-switcher-btn" :to="item.to">{{ item.label }}</router-link>
          </template>
        </nav>
        <router-link class="ocm-hub-action-btn ocm-hub-action-btn--primary" :to="orgPath('/admin/clients')">+ New intake</router-link>
        <button class="ocm-hub-action-btn" type="button" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : '↺ Refresh' }}
        </button>
      </div>
    </header>

    <div class="ocm-kpis">
      <div class="ocm-kpi"><div class="ocm-kpi-value">{{ aggregates.newToday || 0 }}</div><div class="ocm-kpi-label">New today</div></div>
      <div class="ocm-kpi"><div class="ocm-kpi-value">{{ aggregates.prospective || 0 }}</div><div class="ocm-kpi-label">Prospective</div></div>
      <div class="ocm-kpi"><div class="ocm-kpi-value">{{ aggregates.continuing || 0 }}</div><div class="ocm-kpi-label">Continuing</div></div>
      <div class="ocm-kpi"><div class="ocm-kpi-value">{{ aggregates.needsAction || 0 }}</div><div class="ocm-kpi-label">Needs follow-up</div></div>
      <div class="ocm-kpi"><div class="ocm-kpi-value">{{ aggregates.portalPending || 0 }}</div><div class="ocm-kpi-label">Portal pending</div></div>
    </div>

    <div class="ocm-toolbar">
      <input v-model="searchQuery" class="ocm-search" type="search" placeholder="Search clients, guardians, providers…" />
      <select v-if="multiTenant" v-model="tenantFilter" class="ocm-select">
        <option value="all">All my offices</option>
        <option v-for="a in accessibleAgencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
      </select>
      <select v-model="bucket" class="ocm-select">
        <option value="all">All office clients</option>
        <option value="prospective">Prospective</option>
        <option value="continuing">Continuing</option>
        <option value="waitlisted">Waitlisted</option>
      </select>
      <select v-model="whoFor" class="ocm-select">
        <option value="">All intake types</option>
        <option value="self">Self / adult</option>
        <option value="dependent">Dependent</option>
        <option value="couple">Couple</option>
        <option value="family">Family</option>
      </select>
      <label class="ocm-check"><input v-model="clinicalReviewOnly" type="checkbox" /> Clinical review</label>
      <label class="ocm-check"><input v-model="needsActionOnly" type="checkbox" /> Needs action</label>
      <label class="ocm-check"><input v-model="unassignedOnly" type="checkbox" /> Unassigned</label>
    </div>

    <div v-if="error" class="ocm-banner">{{ error }}</div>

    <div class="ocm-layout">
      <div class="ocm-main">
        <div class="ocm-table-wrap">
          <table class="ocm-table">
            <thead>
              <tr>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('name')">
                    Client<span class="ocm-sort-ind">{{ sortIndicator('name') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('guardian')">
                    Guardian(s)<span class="ocm-sort-ind">{{ sortIndicator('guardian') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('intake')">
                    Intake<span class="ocm-sort-ind">{{ sortIndicator('intake') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('preferredProvider')">
                    Preferred<span class="ocm-sort-ind">{{ sortIndicator('preferredProvider') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('assignedProvider')">
                    Assigned<span class="ocm-sort-ind">{{ sortIndicator('assignedProvider') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('portal')">
                    Portal<span class="ocm-sort-ind">{{ sortIndicator('portal') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('status')">
                    Status<span class="ocm-sort-ind">{{ sortIndicator('status') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('nextStep')">
                    Next step<span class="ocm-sort-ind">{{ sortIndicator('nextStep') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="ocm-th-btn" @click="toggleSort('submitted')">
                    Submitted<span class="ocm-sort-ind">{{ sortIndicator('submitted') }}</span>
                  </button>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !displayRows.length">
                <td colspan="10" class="ocm-empty">No office clients match these filters.</td>
              </tr>
              <tr
                v-for="c in displayRows"
                :key="c.id"
                :class="{ 'is-active': selectedId === c.id }"
                @click="selectedId = c.id"
              >
                <td>
                  <div class="ocm-client-cell">
                    <div v-if="agencyChips(c).length" class="ocm-agency-logos" :title="agencyNames(c)">
                      <template v-for="a in agencyChips(c)" :key="'ag-' + c.id + '-' + a.agencyId">
                        <img
                          v-if="a.logoUrl"
                          class="ocm-agency-logo"
                          :src="a.logoUrl"
                          :alt="a.name || 'Agency'"
                          loading="lazy"
                        />
                        <span v-else class="ocm-agency-fallback" :title="a.name">{{ agencyInitials(a.name) }}</span>
                      </template>
                    </div>
                    <div>
                      <strong>{{ c.fullName || '—' }}</strong>
                      <span
                        v-if="c.createdViaDevFill"
                        class="ocm-pill ocm-pill--dev-fill"
                        title="Created via Dev Fill (test/fake client)"
                      >Dev Fill</span>
                      <div class="ocm-muted">
                        <span v-if="showingAllAgencies && agencyNames(c)" class="ocm-agency-names">{{ agencyNames(c) }}</span>
                        <span v-if="c.age != null">Age {{ c.age }}</span>
                        <span v-if="c.therapyUnit" class="ocm-pill ocm-pill--unit">{{ c.therapyUnit.unitType }} · {{ c.therapyUnit.memberCount }}</span>
                        <span v-if="c.needsClinicalReview" class="ocm-pill ocm-pill--hold">Clinical review</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td>{{ guardianSummary(c) }}</td>
                <td>{{ c.intakeType || '—' }}</td>
                <td>{{ c.preferredProviderName || '—' }}</td>
                <td>
                  <div v-if="assignedProviders(c).length" class="ocm-provider-stack">
                    <div v-for="p in assignedProviders(c)" :key="'p-' + c.id + '-' + p.providerId + '-' + (p.agencyId || 0)" class="ocm-provider-row">
                      <img
                        v-if="p.agencyLogoUrl && showProviderAgencyLogo(c, p)"
                        class="ocm-provider-agency-logo"
                        :src="p.agencyLogoUrl"
                        :alt="p.agencyName || ''"
                        :title="p.agencyName || ''"
                        loading="lazy"
                      />
                      <span v-else-if="showProviderAgencyLogo(c, p) && p.agencyName" class="ocm-provider-agency-fallback" :title="p.agencyName">{{ agencyInitials(p.agencyName) }}</span>
                      <span>{{ p.name || 'Provider' }}</span>
                    </div>
                  </div>
                  <span v-else>Unassigned</span>
                </td>
                <td><span class="ocm-pill" :class="c.portalEnabled ? 'ocm-pill--ok' : 'ocm-pill--muted'">{{ portalLabel(c.portalEnabled) }}</span></td>
                <td>
                  <span class="ocm-pill ocm-pill--status">{{ statusText(c) }}</span>
                </td>
                <td>{{ c.nextStep?.label || '—' }}</td>
                <td>{{ formatRelativeTime(c.createdAt) }}</td>
                <td class="ocm-row-actions" @click.stop>
                  <button type="button" class="ocm-link" @click="selectedId = c.id">Review</button>
                  <a :href="clientProfilePath(c.id)" target="_blank" rel="noopener">Open</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="continuingRows.length" class="ocm-section">
          <h2>Continuing clients</h2>
          <div class="ocm-continue-grid">
            <article v-for="c in continuingRows.slice(0, 8)" :key="'cont-' + c.id" class="ocm-continue-card">
              <div v-if="agencyChips(c).length" class="ocm-agency-logos ocm-agency-logos--card">
                <img
                  v-for="a in agencyChips(c)"
                  :key="'cag-' + c.id + '-' + a.agencyId"
                  class="ocm-agency-logo"
                  :src="a.logoUrl"
                  :alt="a.name || 'Agency'"
                  loading="lazy"
                />
              </div>
              <strong>{{ c.fullName }}</strong>
              <span
                v-if="c.createdViaDevFill"
                class="ocm-pill ocm-pill--dev-fill"
                title="Created via Dev Fill (test/fake client)"
              >Dev Fill</span>
              <div class="ocm-muted">Provider: {{ providerSummary(c) }}</div>
              <div class="ocm-muted">Next: {{ c.nextAppointmentAt ? formatRelativeTime(c.nextAppointmentAt) : 'None scheduled' }}</div>
              <a :href="clientProfilePath(c.id)" class="ocm-link">Open ↗</a>
            </article>
          </div>
        </section>
      </div>

      <aside class="ocm-rail">
        <div class="ocm-rail-head">
          <h2>New Office Clients</h2>
          <span class="ocm-pill ocm-pill--status">{{ queueRows.length }}</span>
        </div>
        <div v-for="c in queueRows.slice(0, 12)" :key="'q-' + c.id" class="ocm-queue-row" @click="selectedId = c.id">
          <div>
            <strong>{{ c.fullName }}</strong>
            <span
              v-if="c.createdViaDevFill"
              class="ocm-pill ocm-pill--dev-fill"
              title="Created via Dev Fill (test/fake client)"
            >Dev Fill</span>
            <div class="ocm-muted">{{ c.nextStep?.label || statusText(c) }} · {{ formatRelativeTime(c.createdAt) }}</div>
          </div>
          <button type="button" class="ocm-btn ocm-btn--tiny" @click.stop="selectedId = c.id">Review</button>
        </div>
        <router-link class="ocm-link ocm-rail-footer" :to="orgPath('/admin/office-intake-queue')">View full intake queue</router-link>

        <div v-if="selected" class="ocm-drawer">
          <div class="ocm-drawer-head">
            <h3>
              {{ selected.fullName }}
              <span
                v-if="selected.createdViaDevFill"
                class="ocm-pill ocm-pill--dev-fill"
                title="Created via Dev Fill (test/fake client)"
              >Dev Fill</span>
            </h3>
            <button type="button" class="ocm-icon-btn" @click="selectedId = null">✕</button>
          </div>
          <div v-if="agencyChips(selected).length" class="ocm-agency-logos ocm-agency-logos--drawer">
            <div v-for="a in agencyChips(selected)" :key="'dag-' + a.agencyId" class="ocm-agency-chip">
              <img v-if="a.logoUrl" class="ocm-agency-logo" :src="a.logoUrl" :alt="a.name || ''" />
              <span v-else class="ocm-agency-fallback">{{ agencyInitials(a.name) }}</span>
              <span>{{ a.name }}</span>
            </div>
          </div>
          <dl class="ocm-dl">
            <div><dt>Status</dt><dd>{{ statusText(selected) }}</dd></div>
            <div><dt>Next step</dt><dd>{{ selected.nextStep?.label || '—' }}</dd></div>
            <div><dt>Guardians</dt><dd>{{ guardianSummary(selected) }}</dd></div>
            <div><dt>Preferred provider</dt><dd>{{ selected.preferredProviderName || '—' }}</dd></div>
            <div>
              <dt>Assigned</dt>
              <dd>
                <div v-if="assignedProviders(selected).length" class="ocm-provider-stack">
                  <div v-for="p in assignedProviders(selected)" :key="'sp-' + p.providerId + '-' + (p.agencyId || 0)" class="ocm-provider-row">
                    <img
                      v-if="p.agencyLogoUrl && showProviderAgencyLogo(selected, p)"
                      class="ocm-provider-agency-logo"
                      :src="p.agencyLogoUrl"
                      :alt="p.agencyName || ''"
                    />
                    <span>{{ p.name }}<template v-if="p.agencyName"> · {{ p.agencyName }}</template></span>
                  </div>
                </div>
                <template v-else>Unassigned</template>
              </dd>
            </div>
            <div><dt>Portal</dt><dd>{{ portalLabel(selected.portalEnabled) }}</dd></div>
            <div v-if="selected.needsClinicalReview"><dt>Clinical</dt><dd>Needs clinical review</dd></div>
            <div v-if="selected.therapyUnit"><dt>Unit</dt><dd>{{ selected.therapyUnit.unitType }} ({{ selected.therapyUnit.memberCount }} members)</dd></div>
          </dl>

          <div v-if="!hasAssigned(selected)" class="ocm-assign">
            <label>Assign provider</label>
            <select v-model="assignProviderId" class="ocm-select">
              <option value="">Select…</option>
              <option v-for="p in providers" :key="p.id" :value="String(p.id)">
                {{ p.name }}<template v-if="providerAgencyLabel(p)"> · {{ providerAgencyLabel(p) }}</template>
              </option>
            </select>
            <button type="button" class="ocm-btn ocm-btn--primary" :disabled="!assignProviderId || assigning" @click="assignSelected">
              {{ assigning ? 'Assigning…' : 'Assign' }}
            </button>
          </div>

          <div class="ocm-waitlist">
            <label>Waitlist reason</label>
            <input v-model="waitlistReason" class="ocm-search" type="text" placeholder="No openings, specialty, schedule…" />
            <div class="ocm-waitlist-actions">
              <button
                v-if="selected.bucket !== 'waitlisted' && selected.statusKey !== 'waitlist'"
                type="button"
                class="ocm-btn ocm-btn--ghost"
                :disabled="waitlisting"
                @click="setWaitlist(false)"
              >Add to waitlist</button>
              <button
                v-else
                type="button"
                class="ocm-btn ocm-btn--ghost"
                :disabled="waitlisting"
                @click="setWaitlist(true)"
              >Remove from waitlist</button>
            </div>
          </div>

          <a class="ocm-btn ocm-btn--primary ocm-btn--block" :href="clientProfilePath(selected.id)" target="_blank" rel="noopener">
            Open full client ↗
          </a>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import {
  useOfficeClientAgency,
  formatRelativeTime,
  portalLabel
} from '../../composables/useOfficeClientAgency.js';
import { buildOfficeQuickNavLinks } from '../../utils/officeQuickNav.js';
import '../../styles/officeQuickNav.css';

const route = useRoute();
const {
  agencyId,
  accessibleAgencies,
  multiTenant,
  tenantFilter,
  scopeAgencyIds,
  showingAllAgencies,
  agencyIdsParam,
  orgPath,
  clientProfilePath
} = useOfficeClientAgency();

const officeNavLinks = computed(() => buildOfficeQuickNavLinks({ orgPath, current: 'clients' }));

const loading = ref(false);
const error = ref('');
const clients = ref([]);
const aggregates = ref({});
const providers = ref([]);
const selectedId = ref(null);
const searchQuery = ref('');
const bucket = ref(String(route.query.bucket || 'all'));
const whoFor = ref(String(route.query.whoFor || ''));
const sort = ref(String(route.query.sort || (multiTenant.value ? 'agency' : 'submitted')));
const sortDir = ref(String(route.query.sortDir || 'desc') === 'asc' ? 'asc' : 'desc');
const clinicalReviewOnly = ref(String(route.query.clinicalReview || '') === '1');
const needsActionOnly = ref(String(route.query.needsAction || '') === '1');
const unassignedOnly = ref(String(route.query.unassigned || '') === '1');
const assignProviderId = ref('');
const assigning = ref(false);
const waitlistReason = ref('');
const waitlisting = ref(false);

const selected = computed(() => clients.value.find((c) => c.id === selectedId.value) || null);

const CLIENT_SIDE_SORTS = new Set(['guardian', 'intake', 'portal', 'status', 'nextStep', 'agency']);

function sortValue(c, key) {
  switch (key) {
    case 'name':
      return String(c.fullName || '');
    case 'guardian':
      return guardianSummary(c);
    case 'intake':
      return String(c.intakeType || '');
    case 'preferredProvider':
      return String(c.preferredProviderName || '');
    case 'assignedProvider':
      return providerSummary(c);
    case 'portal':
      return c.portalEnabled ? '1' : '0';
    case 'status':
      return statusText(c);
    case 'nextStep':
      return String(c.nextStep?.label || '');
    case 'agency':
      return agencyNames(c) || String(c.agencyName || '');
    case 'submitted':
      return new Date(c.createdAt || 0).getTime();
    default:
      return String(c.fullName || '');
  }
}

function toggleSort(key) {
  const k = String(key || '');
  if (!k) return;
  if (sort.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sort.value = k;
    sortDir.value = k === 'submitted' ? 'desc' : 'asc';
  }
}

function sortIndicator(key) {
  if (sort.value !== key) return '';
  return sortDir.value === 'asc' ? ' ▲' : ' ▼';
}

const displayRows = computed(() => {
  let rows = [...clients.value];
  if (unassignedOnly.value) rows = rows.filter((c) => !hasAssigned(c));
  const key = String(sort.value || 'submitted');
  const dir = sortDir.value === 'asc' ? 1 : -1;
  if (CLIENT_SIDE_SORTS.has(key) || key === 'name' || key === 'preferredProvider' || key === 'assignedProvider' || key === 'submitted') {
    rows.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * dir;
    });
  }
  return rows;
});

const queueRows = computed(() =>
  clients.value.filter((c) => c.bucket === 'prospective' || !hasAssigned(c))
);

const continuingRows = computed(() =>
  clients.value.filter((c) => c.bucket === 'continuing')
);

function agencyChips(c) {
  const list = Array.isArray(c?.agencies) ? c.agencies : [];
  if (list.length) return list;
  if (c?.agencyId) {
    return [{
      agencyId: c.agencyId,
      name: c.agencyName || null,
      logoUrl: c.agencyLogoUrl || null,
      isPrimary: true
    }];
  }
  return [];
}

function agencyNames(c) {
  return agencyChips(c).map((a) => a.name).filter(Boolean).join(' · ');
}

function agencyInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || '?';
}

function assignedProviders(c) {
  if (Array.isArray(c?.providers) && c.providers.length) return c.providers;
  if (c?.providerId) {
    return [{
      providerId: c.providerId,
      name: c.providerName || 'Provider',
      agencyId: c.agencyId || null,
      agencyName: c.agencyName || null,
      agencyLogoUrl: c.agencyLogoUrl || null
    }];
  }
  return [];
}

function hasAssigned(c) {
  return assignedProviders(c).length > 0;
}

/** Mini agency logo on provider when client has multiple agencies, or multiple providers. */
function showProviderAgencyLogo(c, p) {
  const agencies = agencyChips(c);
  const providersList = assignedProviders(c);
  if (providersList.length > 1) return true;
  if (agencies.length > 1 && p?.agencyId) return true;
  return false;
}

function providerSummary(c) {
  const list = assignedProviders(c);
  if (!list.length) return '—';
  return list.map((p) => p.name).filter(Boolean).join(', ') || '—';
}

function providerAgencyLabel(p) {
  if (Array.isArray(p?.agencies) && p.agencies.length) {
    return p.agencies.map((a) => a.name).filter(Boolean).join(', ');
  }
  return '';
}

function guardianSummary(c) {
  const list = c?.guardians || [];
  if (!list.length) {
    if (c?.whoFor === 'self' || c?.whoFor === 'couple') return 'Self';
    return '—';
  }
  return list.map((g) => `${g.fullName}${g.relationship ? ` (${g.relationship})` : ''}`).join(', ');
}

function statusText(c) {
  if (c.needsClinicalReview) return 'Pending clinical review';
  if (c.bucket === 'waitlisted' || c.statusKey === 'waitlist') return 'Waitlisted';
  return c.statusLabel || c.statusKey || c.status || '—';
}

function waitlistAgencyId(c) {
  return Number(c?.agencyId || agencyChips(c)[0]?.agencyId || scopeAgencyIds.value[0] || agencyId.value || 0) || null;
}

async function load() {
  if (!scopeAgencyIds.value.length) {
    error.value = 'No office agencies available for your account.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = {
      agencyIds: agencyIdsParam(),
      bucket: bucket.value,
      sort: sort.value,
      search: searchQuery.value || undefined,
      whoFor: whoFor.value || undefined,
      clinicalReview: clinicalReviewOnly.value ? '1' : undefined,
      needsAction: needsActionOnly.value ? '1' : undefined
    };
    const [rosterRes, providersRes] = await Promise.all([
      api.get('/office-clients', { params }),
      api.get('/office-clients/providers', { params: { agencyIds: agencyIdsParam() } })
    ]);
    clients.value = Array.isArray(rosterRes.data?.clients) ? rosterRes.data.clients : [];
    aggregates.value = rosterRes.data?.aggregates || {};
    providers.value = Array.isArray(providersRes.data?.providers) ? providersRes.data.providers : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load office clients.';
    clients.value = [];
  } finally {
    loading.value = false;
  }
}

async function assignSelected() {
  if (!selected.value || !assignProviderId.value) return;
  assigning.value = true;
  try {
    await api.put(`/clients/${selected.value.id}/provider`, {
      provider_id: Number(assignProviderId.value)
    });
    assignProviderId.value = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Assign failed.';
  } finally {
    assigning.value = false;
  }
}

async function setWaitlist(remove) {
  const aid = waitlistAgencyId(selected.value);
  if (!selected.value || !aid) return;
  waitlisting.value = true;
  try {
    await api.put(`/office-clients/${selected.value.id}/waitlist`, {
      agencyId: aid,
      reason: waitlistReason.value,
      remove
    });
    waitlistReason.value = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Waitlist update failed.';
  } finally {
    waitlisting.value = false;
  }
}

let searchTimer = null;
watch([bucket, whoFor, clinicalReviewOnly, needsActionOnly, tenantFilter], () => load());
watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(), 300);
});
watch(scopeAgencyIds, () => load(), { deep: true });
watch(selected, (c) => {
  waitlistReason.value = c?.waitlistReason || c?.waitlistNote || '';
  assignProviderId.value = '';
});
watch(
  () => route.query,
  (q) => {
    if (q.bucket) bucket.value = String(q.bucket);
    if (q.whoFor != null) whoFor.value = String(q.whoFor || '');
    if (q.sort) sort.value = String(q.sort);
    if (q.agencyId || q.tenant) tenantFilter.value = String(q.agencyId || q.tenant);
    if (q.clinicalReview != null) clinicalReviewOnly.value = String(q.clinicalReview) === '1';
    if (q.needsAction != null) needsActionOnly.value = String(q.needsAction) === '1';
    if (q.unassigned != null) unassignedOnly.value = String(q.unassigned) === '1';
  },
  { deep: true }
);

onMounted(load);
</script>

<style scoped>
.ocm-root { padding: 1.25rem 1.5rem 2rem; max-width: 1400px; margin: 0 auto; }
.ocm-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.25rem; }
.ocm-eyebrow { margin: 0; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: #5b6b63; }
.ocm-title { margin: 0.15rem 0; font-size: 1.75rem; color: #14352a; }
.ocm-subtitle { margin: 0; color: #5b6b63; max-width: 42rem; }
.ocm-header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ocm-th-btn {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}
.ocm-th-btn:hover { color: #0f766e; }
.ocm-sort-ind { font-size: 0.65rem; opacity: 0.85; }
.ocm-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.ocm-kpi { background: #fff; border: 1px solid #d7e3dc; border-radius: 12px; padding: 0.85rem 1rem; }
.ocm-kpi-value { font-size: 1.5rem; font-weight: 700; color: #14352a; }
.ocm-kpi-label { font-size: 0.8rem; color: #5b6b63; }
.ocm-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; align-items: center; }
.ocm-search { flex: 1; min-width: 220px; border: 1px solid #d7e3dc; border-radius: 10px; padding: 0.55rem 0.75rem; }
.ocm-select { border: 1px solid #d7e3dc; border-radius: 10px; padding: 0.5rem 0.65rem; background: #fff; }
.ocm-check { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; color: #374151; }
.ocm-banner { background: #fef3c7; color: #92400e; border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
.ocm-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 1rem; align-items: start; }
.ocm-table-wrap { overflow: auto; background: #fff; border: 1px solid #d7e3dc; border-radius: 12px; }
.ocm-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.ocm-table th { text-align: left; padding: 0.65rem 0.75rem; background: #f6f9f7; color: #4b5563; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
.ocm-table td { padding: 0.7rem 0.75rem; border-top: 1px solid #eef2f0; vertical-align: top; }
.ocm-table tr { cursor: pointer; }
.ocm-table tr.is-active, .ocm-table tr:hover { background: #f8fbf9; }
.ocm-empty { text-align: center; color: #6b7280; padding: 2rem !important; }
.ocm-client-cell { display: flex; gap: 0.55rem; align-items: flex-start; }
.ocm-agency-logos { display: flex; gap: 0.2rem; flex-shrink: 0; align-items: center; }
.ocm-agency-logos--card { margin-bottom: 0.35rem; }
.ocm-agency-logos--drawer { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0.65rem 0 0.25rem; }
.ocm-agency-chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: #374151; }
.ocm-agency-logo { width: 1.35rem; height: 1.35rem; border-radius: 6px; object-fit: contain; background: #fff; border: 1px solid #e5e7eb; }
.ocm-agency-fallback, .ocm-provider-agency-fallback {
  width: 1.35rem; height: 1.35rem; border-radius: 6px; background: #1e4d3b; color: #fff;
  display: inline-grid; place-items: center; font-size: 0.55rem; font-weight: 700;
}
.ocm-agency-names { font-weight: 600; color: #4b5563; }
.ocm-provider-stack { display: grid; gap: 0.3rem; }
.ocm-provider-row { display: flex; align-items: center; gap: 0.35rem; }
.ocm-provider-agency-logo { width: 1rem; height: 1rem; border-radius: 4px; object-fit: contain; border: 1px solid #e5e7eb; background: #fff; flex-shrink: 0; }
.ocm-muted { color: #6b7280; font-size: 0.8rem; display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.2rem; }
.ocm-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.72rem; font-weight: 600; }
.ocm-pill--status { background: #eff6ff; color: #1d4ed8; }
.ocm-pill--ok { background: #ecfdf5; color: #047857; }
.ocm-pill--muted { background: #f3f4f6; color: #6b7280; }
.ocm-pill--hold { background: #fef3c7; color: #92400e; }
.ocm-pill--unit { background: #f3e8ff; color: #6b21a8; }
.ocm-pill--dev-fill {
  display: inline-flex;
  margin-left: 0.4rem;
  vertical-align: middle;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 0.68rem;
}
.ocm-row-actions { display: flex; gap: 0.5rem; white-space: nowrap; }
.ocm-link { color: #0f766e; font-weight: 600; text-decoration: none; background: none; border: 0; cursor: pointer; padding: 0; }
.ocm-btn { border-radius: 10px; border: 1px solid #d7e3dc; background: #fff; padding: 0.45rem 0.8rem; cursor: pointer; font-weight: 600; color: #14352a; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.ocm-btn--primary { background: #1e4d3b; color: #fff; border-color: #1e4d3b; }
.ocm-btn--ghost { background: #f8faf9; }
.ocm-btn--tiny { padding: 0.25rem 0.55rem; font-size: 0.75rem; }
.ocm-btn--block { width: 100%; margin-top: 0.75rem; }
.ocm-rail { background: #fff; border: 1px solid #d7e3dc; border-radius: 12px; padding: 0.9rem; position: sticky; top: 1rem; }
.ocm-rail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.ocm-rail-head h2 { margin: 0; font-size: 1rem; }
.ocm-queue-row { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.65rem 0; border-top: 1px solid #eef2f0; cursor: pointer; }
.ocm-rail-footer { display: inline-block; margin: 0.75rem 0 1rem; }
.ocm-drawer { border-top: 1px solid #d7e3dc; padding-top: 0.85rem; margin-top: 0.5rem; }
.ocm-drawer-head { display: flex; justify-content: space-between; align-items: center; }
.ocm-drawer-head h3 { margin: 0; font-size: 1.05rem; }
.ocm-icon-btn { border: 0; background: transparent; cursor: pointer; font-size: 1rem; }
.ocm-dl { display: grid; gap: 0.55rem; margin: 0.85rem 0; }
.ocm-dl div { display: grid; gap: 0.1rem; }
.ocm-dl dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
.ocm-dl dd { margin: 0; }
.ocm-assign, .ocm-waitlist { display: grid; gap: 0.45rem; margin-bottom: 0.75rem; }
.ocm-waitlist-actions { display: flex; gap: 0.5rem; }
.ocm-section { margin-top: 1.25rem; }
.ocm-section h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
.ocm-continue-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
.ocm-continue-card { background: #fff; border: 1px solid #d7e3dc; border-radius: 12px; padding: 0.85rem; display: grid; gap: 0.25rem; }
@media (max-width: 1100px) {
  .ocm-layout { grid-template-columns: 1fr; }
  .ocm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ocm-rail { position: static; }
}
</style>
