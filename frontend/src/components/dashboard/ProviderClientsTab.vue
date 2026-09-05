<template>
  <div class="provider-clients-tab">
    <nav class="pct-cat-nav" role="tablist" aria-label="Clients sections">
      <button
        v-for="sec in allSections"
        :key="sec.id"
        type="button"
        role="tab"
        :aria-selected="activeSection === sec.id"
        :class="['pct-cat-tab', { 'is-active': activeSection === sec.id }]"
        @click="setSection(sec.id)"
      >
        <span class="pct-cat-icon" aria-hidden="true" v-html="sectionIcons[sec.iconKey]" />
        <span class="pct-cat-label">{{ sec.label }}</span>
        <span v-if="sec.badge" class="pct-cat-badge">{{ sec.badge }}</span>
      </button>
    </nav>

    <ReferralDirectoryPanel v-if="!profileEmbed && activeSection === 'referrals'" embedded />

    <ClientExchangePanel v-else-if="!profileEmbed && activeSection === 'exchange'" />

    <template v-else-if="!profileEmbed || activeSection === 'all' || activeSection === 'school' || activeSection === 'office' || activeSection === 'new'">
      <header class="pct-page-header">
        <div class="pct-page-header__text">
          <h2 class="pct-page-title">{{ sectionTitle }}</h2>
          <p v-if="sectionHint" class="pct-page-subtitle">{{ sectionHint }}</p>
        </div>
      </header>

      <div class="pct-toolbar">
        <template v-if="activeSection === 'school'">
          <label class="pct-field">
            <span class="pct-field__label">School</span>
            <select class="pct-control" v-model="selectedSchoolOrgId">
              <option value="all">All schools</option>
              <option v-for="s in schools" :key="s.schoolOrganizationId" :value="Number(s.schoolOrganizationId)">
                {{ s.name }}
              </option>
            </select>
          </label>
          <label class="pct-field">
            <span class="pct-field__label">Fiscal year</span>
            <select class="pct-control" v-model="selectedFiscalYearStart">
              <option v-for="fy in fiscalYearOptions" :key="fy.startYmd" :value="fy.startYmd">
                {{ fy.label }}
              </option>
            </select>
          </label>
          <label v-if="showSkillBuildersRosterToggle" class="pct-check">
            <input v-model="skillBuildersOnlyFilter" type="checkbox" />
            <span>Skill Builders clients only</span>
          </label>
        </template>
        <label class="pct-check" v-if="activeSection === 'all' || activeSection === 'school' || activeSection === 'office'">
          <input v-model="showTerminated" type="checkbox" />
          <span>Show terminated</span>
        </label>
        <button class="pct-link-btn" type="button" @click="toggleCodesMode" :disabled="loading || officeLoading">
          {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
        </button>
        <button
          class="pct-btn pct-btn--ghost"
          type="button"
          @click="toggleFullNames"
          :disabled="loading || officeLoading"
        >
          {{ clientLabelMode === 'full_name' ? 'Show initials' : 'Show full names' }}
        </button>
        <div
          v-if="activeSection === 'all'"
          class="pct-columns-control"
          @keydown.escape="allColumnsOpen = false"
        >
          <button
            class="pct-btn pct-btn--ghost"
            type="button"
            :aria-expanded="allColumnsOpen"
            @click="allColumnsOpen = !allColumnsOpen"
          >
            Columns
          </button>
          <div v-if="allColumnsOpen" class="pct-columns-menu" @click.stop>
            <label v-for="col in ALL_CLIENT_OPTIONAL_COLUMNS" :key="col.key" class="pct-columns-item">
              <input v-model="allColumnPrefs[col.key]" type="checkbox" />
              <span>{{ col.label }}</span>
            </label>
          </div>
        </div>
        <button
          v-if="canEhrPatientImport"
          class="pct-btn pct-btn--ghost"
          type="button"
          @click="showEhrPatientListModal = true"
        >
          Paste patient list
        </button>
        <button
          class="pct-btn pct-btn--primary"
          type="button"
          @click="refreshCurrentScope"
          :disabled="loading || officeLoading"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {{ (loading || officeLoading) ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <!-- All Clients -->
      <template v-if="activeSection === 'all'">
        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="officeError" class="error">{{ officeError }}</div>
        <div v-else-if="!loading && !officeLoading && sortedCombinedClientsList.length === 0" class="muted empty-state">
          No clients assigned to this provider yet.
        </div>
        <div v-else class="office-clients-table-wrap">
          <table class="office-clients-table">
            <thead>
              <tr>
                <th
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('client')"
                  @click="toggleAllColumnSort('client')"
                >
                  Client
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('client') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.setting"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('setting')"
                  @click="toggleAllColumnSort('setting')"
                >
                  Setting
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('setting') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.school"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('school')"
                  @click="toggleAllColumnSort('school')"
                >
                  School
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('school') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.type"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('type')"
                  @click="toggleAllColumnSort('type')"
                >
                  Type
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('type') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.insurance"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('insurance')"
                  @click="toggleAllColumnSort('insurance')"
                >
                  Insurance Type
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('insurance') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.status"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('status')"
                  @click="toggleAllColumnSort('status')"
                >
                  Status
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('status') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.sessions"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('sessions')"
                  @click="toggleAllColumnSort('sessions')"
                >
                  Sessions (FY)
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('sessions') }}</span>
                </th>
                <th
                  v-if="allColumnPrefs.since"
                  class="pct-sortable"
                  :aria-sort="allAriaSortFor('since')"
                  @click="toggleAllColumnSort('since')"
                >
                  Since
                  <span class="pct-sort-indicator" aria-hidden="true">{{ allSortIndicatorFor('since') }}</span>
                </th>
                <th v-if="canEhrPatientImport">Chart setup</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in sortedCombinedClientsList" :key="c.id" :class="{ 'is-terminated': isTerminatedClient(c) }">
                <td>
                  <button
                    type="button"
                    class="pct-client-link"
                    :title="officeHoverTitle(c)"
                    @click="openClientProfile(c, sortedCombinedClientsList)"
                  >
                    {{ formatOfficeClientLabel(c) }}
                  </button>
                </td>
                <td v-if="allColumnPrefs.setting">{{ c.setting || '—' }}</td>
                <td v-if="allColumnPrefs.school">{{ c.schoolName || '—' }}</td>
                <td v-if="allColumnPrefs.type">{{ formatClientTypeLabel(c) }}</td>
                <td v-if="allColumnPrefs.insurance">{{ formatInsuranceTypeLabel(c) }}</td>
                <td v-if="allColumnPrefs.status">{{ officeStatusLabel(c) }}</td>
                <td v-if="allColumnPrefs.sessions">{{ officeSessionTotal(c) }}</td>
                <td v-if="allColumnPrefs.since">{{ formatSinceDate(c.submission_date) }}</td>
                <td v-if="canEhrPatientImport">
                  <button
                    type="button"
                    class="pct-link-btn"
                    @click="openBringUpToDate(c)"
                  >
                    Bring up to date
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- School Clients -->
      <template v-else-if="activeSection === 'school'">
        <div v-if="error" class="error">{{ error }}</div>
        <div v-else-if="officeError" class="error">{{ officeError }}</div>

        <ClientListGrid
          v-if="selectedSchoolOrgId && schools.length"
          :organization-slug="organizationSlug"
          :organization-id="Number(selectedSchoolOrgId) || null"
          :organization-name="selectedSchoolName"
          :clients-override="schoolClientsForGrid"
          roster-scope="provider"
          :roster-provider-user-id="rosterProviderUserId"
          :skill-builders-only="skillBuildersOnlyFilter"
          :client-label-mode="clientLabelMode"
          :psychotherapy-totals-by-client-id="sessionTotalsByClientId"
          :hide-terminated="!showTerminated"
          :show-terminated-toggle="false"
          :show-search="true"
          search-placeholder="Search school clients…"
          edit-mode="inline"
          @edit-client="onSchoolRosterEditClient"
          @update:needsAttentionCount="(count) => emit('update:needsAttentionCount', count)"
        />

        <div
          v-if="schoolBillingTableClients.length"
          class="office-clients-table-wrap"
          :style="schools.length ? 'margin-top: 16px;' : ''"
        >
          <div v-if="schools.length" class="hint muted" style="margin-bottom: 8px;">
            Billing import — Place of Service 03 (not on school roster)
          </div>
          <table class="office-clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Sessions (FY)</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in schoolBillingTableClients" :key="c.id" :class="{ 'is-terminated': isTerminatedClient(c) }">
                <td>
                  <button
                    type="button"
                    class="pct-client-link"
                    :title="officeHoverTitle(c)"
                    @click="openClientProfile(c, schoolBillingTableClients)"
                  >
                    {{ formatOfficeClientLabel(c) }}
                  </button>
                </td>
                <td>{{ formatClientTypeLabel(c) }}</td>
                <td>{{ officeStatusLabel(c) }}</td>
                <td>{{ officeSessionTotal(c) }}</td>
                <td>{{ formatSinceDate(c.submission_date) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-else-if="!schools.length && !loading && !officeLoading && !schoolBillingTableClients.length"
          class="muted empty-state"
        >
          No in-school clients yet. Clients with Place of Service 03 on a billing import appear here.
        </div>
      </template>

      <!-- Office Clients -->
      <template v-else-if="activeSection === 'office'">
        <div v-if="officeAcceptance" class="pct-acceptance">
          <strong>{{ officeAcceptance.acceptanceLabel }}</strong>
          <span class="muted tiny">
            Declined if posted to Client Exchange within {{ officeAcceptance.windowDays || 30 }} days of assignment.
            <template v-if="officeAcceptance.declinedCount">
              · {{ officeAcceptance.declinedCount }} declined via exchange
            </template>
            <template v-if="officeAcceptance.pendingCount">
              · {{ officeAcceptance.pendingCount }} still in review window
            </template>
          </span>
        </div>
        <div v-if="officeError" class="error">{{ officeError }}</div>
        <div v-else-if="!officeLoading && currentOfficeClients.length === 0" class="muted empty-state">
          No in-office clients yet (non–Place of Service 03 billing lines).
        </div>
        <div v-else class="office-clients-table-wrap">
          <table class="office-clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Sessions (FY)</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in currentOfficeClients" :key="c.id" :class="{ 'is-terminated': isTerminatedClient(c) }">
                <td>
                  <button
                    type="button"
                    class="pct-client-link"
                    :title="officeHoverTitle(c)"
                    @click="openClientProfile(c, currentOfficeClients)"
                  >
                    {{ formatOfficeClientLabel(c) }}
                  </button>
                </td>
                <td>{{ formatClientTypeLabel(c) }}</td>
                <td>{{ officeStatusLabel(c) }}</td>
                <td>{{ officeSessionTotal(c) }}</td>
                <td>{{ formatSinceDate(c.submission_date) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- New Clients (pending school + pending office) -->
      <template v-else-if="activeSection === 'new'">
        <div v-if="pendingError" class="error">{{ pendingError }}</div>
        <div v-if="officeError" class="error">{{ officeError }}</div>

        <section class="new-block">
          <div class="new-block-head">
            <strong>School client actions</strong>
          </div>
          <p class="muted tiny">
            Use Action / Next Step on your school roster, or
            <router-link class="pct-inline-link" :to="providerOnboardingTo">
              Open Client Action Needed
            </router-link>
            for fall confirmation and new-client steps.
          </p>
        </section>

        <section class="new-block">
          <div class="new-block-head">
            <strong>Pending office clients</strong>
            <span class="pending-count-badge" :class="{ pulse: pendingOfficeClients.length }">
              {{ pendingOfficeClients.length }}
            </span>
          </div>
          <p class="muted tiny">
            New intakes assigned to you outside school affiliations that are still pending. Mark current after you accept them.
            Posting to Client Exchange within 30 days of assignment counts as not accepting the referral.
            <template v-if="officeAcceptance?.acceptanceLabel">
              Your ratio: {{ officeAcceptance.acceptanceLabel }}.
            </template>
          </p>
          <div v-if="officeLoading" class="muted">Loading…</div>
          <div v-else-if="!pendingOfficeClients.length" class="muted empty-state compact">No pending office clients.</div>
          <div v-else class="office-clients-table-wrap">
            <table class="office-clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Preferred</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in pendingOfficeClients" :key="c.id">
                  <td>
                    <button
                      type="button"
                      class="pct-client-link"
                      :title="officeHoverTitle(c)"
                      @click="openClientProfile(c, pendingOfficeClients)"
                    >
                      {{ formatOfficeClientLabel(c) }}
                    </button>
                  </td>
                  <td>{{ formatClientTypeLabel(c) }}</td>
                  <td>{{ formatPreferred(c) }}</td>
                  <td>{{ c.submission_date || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>

    <Teleport to="body">
      <div v-if="profileLoading" class="pct-profile-loading-overlay" role="status" aria-live="polite">
        <div class="pct-profile-loading-card muted">Loading client…</div>
      </div>
      <div v-if="profileClient" class="pct-client-detail-lift">
        <ClientDetailPanel
          :key="`pct-client-${profileClient.id}`"
          :client="profileClient"
          :school-organization-id="profileClient.organization_id"
          :current-client-index="profileClientIndex"
          :navigation-count="profileNavClients.length"
          @close="closeClientProfile"
          @updated="onClientProfileUpdated"
          @navigate="onProfileNavigate"
        />
      </div>
    </Teleport>

    <EhrPatientListImportModal
      :open="showEhrPatientListModal"
      :provider-user-id="currentUserId"
      :provider-label="subjectUserName"
      :agency-id="agencyId"
      @close="showEhrPatientListModal = false"
      @imported="onEhrPatientListImported"
    />
    <ClientEhrBringUpToDatePanel
      :open="!!bringUpClient"
      :client-id="bringUpClient?.id || 0"
      :agency-id="agencyId || bringUpClient?.agency_id || 0"
      :client-label="bringUpClientLabel"
      @close="bringUpClient = null"
      @done="onBringUpDone"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ClientListGrid from '../school/ClientListGrid.vue';
import ClientDetailPanel from '../admin/ClientDetailPanel.vue';
import ReferralDirectoryPanel from '../referralDirectory/ReferralDirectoryPanel.vue';
import ClientExchangePanel from '../clientExchange/ClientExchangePanel.vue';
import EhrPatientListImportModal from '../admin/EhrPatientListImportModal.vue';
import ClientEhrBringUpToDatePanel from '../admin/clientChart/ClientEhrBringUpToDatePanel.vue';
import { displaySchoolClientStatusLabel } from '../../utils/schoolClientStatusDisplay.js';

const props = defineProps({
  /** school | office | new | exchange | referrals */
  initialSection: { type: String, default: '' },
  /** Profile tab: load caseload for this user instead of signed-in user */
  subjectUserId: { type: Number, default: null },
  subjectAgencyId: { type: Number, default: null },
  /** Display name for the profile provider (patient-list paste copy) */
  subjectUserName: { type: String, default: '' },
  /** Profile embed: only In School + In Office (no exchange/referrals/new) */
  profileEmbed: { type: Boolean, default: false },
});

const emit = defineEmits(['update:needsAttentionCount', 'update:pendingClientsCount']);

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const VALID_SECTIONS = new Set(['all', 'school', 'office', 'new', 'exchange', 'referrals']);

function normalizeSection(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'caseload' || s === 'all-clients' || s === 'all clients') return 'all';
  if (s === 'in-school' || s === 'school-clients') return 'school';
  if (s === 'in-office' || s === 'office-clients') return 'office';
  if (s === 'new-clients' || s === 'pending') return 'new';
  if (s === 'client-exchange') return 'exchange';
  if (VALID_SECTIONS.has(s)) return s;
  return props.profileEmbed ? 'all' : 'school';
}

const activeSection = ref(
  normalizeSection(
    props.initialSection ||
      route.query.clients ||
      route.query.clientsSection ||
      (props.profileEmbed ? 'all' : 'school')
  )
);

const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const providerOnboardingTo = computed(() => {
  if (organizationSlug.value) {
    return { path: `/${organizationSlug.value}/provider/client-onboarding` };
  }
  return { path: '/provider/client-onboarding' };
});
const agencyId = computed(() => {
  if (props.subjectAgencyId) return Number(props.subjectAgencyId);
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const schools = ref([]);
const schoolAffiliatedClientIds = ref(new Set());
const selectedSchoolOrgId = ref(null);
const selectedFiscalYearStart = ref('');
const clientLabelMode = ref('initials');
const officeClients = ref([]);
const assignedProviderClients = ref([]);
const billingPosByClientId = ref({});
const officeLoading = ref(false);
const officeError = ref('');
const officeAcceptance = ref(null);

const isAllSchools = computed(() => selectedSchoolOrgId.value === 'all');

const selectedSchoolName = computed(() => {
  const id = selectedSchoolOrgId.value;
  if (!id || id === 'all') return '';
  const s = (schools.value || []).find((x) => Number(x.schoolOrganizationId) === Number(id));
  return s?.name || '';
});
const loading = ref(false);
const allClients = ref([]);
const skillBuildersOnlyFilter = ref(false);
const error = ref('');
const sessionTotalsByClientId = ref(null);
const showTerminated = ref(true);
const pendingClients = ref([]);
const pendingError = ref('');
const MIN_PENDING_DATE = '2026-02-01';
const terminatedOfficeExtras = ref([]);
const profileClient = ref(null);
const profileLoading = ref(false);
const profileNavClients = ref([]);

const profileClientIndex = computed(() => {
  const id = Number(profileClient.value?.id || 0);
  if (!id) return -1;
  return profileNavClients.value.findIndex((c) => Number(c?.id) === id);
});

const currentUserId = computed(() => {
  const subject = Number(props.subjectUserId || 0);
  if (subject > 0) return subject;
  return Number(authStore.user?.id || 0) || null;
});

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const canEhrPatientImport = computed(
  () =>
    props.profileEmbed === true &&
    (actorRole.value === 'admin' || actorRole.value === 'super_admin') &&
    Number(currentUserId.value || 0) > 0
);

const showEhrPatientListModal = ref(false);
const bringUpClient = ref(null);
const bringUpClientLabel = computed(() => {
  const c = bringUpClient.value;
  if (!c) return '';
  return String(c.full_name || c.fullName || c.initials || `Client ${c.id}` || '').trim();
});

function openBringUpToDate(client) {
  if (!client?.id) return;
  bringUpClient.value = client;
}

async function onEhrPatientListImported() {
  await refreshCurrentScope();
}

function onBringUpDone() {
  bringUpClient.value = null;
}

const rosterProviderUserId = computed(() => {
  const uid = Number(currentUserId.value || 0);
  const me = Number(authStore.user?.id || 0);
  if (!uid) return null;
  if (props.profileEmbed || (me && uid !== me)) return uid;
  return null;
});

const showSkillBuildersRosterToggle = computed(() => {
  const u = authStore.user;
  return u?.skill_builder_eligible === true || u?.skill_builder_eligible === 1 || u?.skill_builder_eligible === '1';
});

const pendingClientsFiltered = computed(() => {
  const selected = selectedSchoolOrgId.value;
  const base = Array.isArray(pendingClients.value) ? pendingClients.value : [];
  const rows =
    !selected || selected === 'all'
      ? base
      : base.filter((r) => Number(r?.organization_id || 0) === Number(selected || 0));
  return rows.slice().sort((a, b) => Number(b?.tracking_days || 0) - Number(a?.tracking_days || 0));
});

const isPendingStatus = (status) => {
  const s = String(status || '').toLowerCase();
  return s === 'pending' || s === 'packet' || s === 'prospective' || s === 'waitlist' || s === 'screener';
};

const isTerminatedClient = (c) =>
  String(c?.client_status_key || c?.status || '').toLowerCase() === 'terminated';

const mergedAssignedClients = computed(() => {
  const byId = new Map();
  for (const c of assignedProviderClients.value || []) byId.set(Number(c.id), c);
  if (showTerminated.value) {
    for (const c of terminatedOfficeExtras.value || []) {
      if (!byId.has(Number(c.id))) byId.set(Number(c.id), c);
    }
  }
  return Array.from(byId.values());
});

const mergedOfficeClients = computed(() => mergedAssignedClients);

const clientPosFlags = (clientId) => {
  const key = String(clientId || '');
  return billingPosByClientId.value[key] || billingPosByClientId.value[Number(clientId)] || {};
};

const isOnSchoolRoster = (clientId) => schoolAffiliatedClientIds.value?.has?.(Number(clientId));

const isPosSchoolClient = (c) => !!clientPosFlags(c?.id).seenAtSchool;

/** True when the client record itself is school-affiliated (independent of my-roster sync). */
const hasSchoolOrganizationOnRecord = (c) => {
  const type = String(c?.client_type || '').toLowerCase();
  const orgType = String(c?.organization_type || c?.organizationType || '').toLowerCase();
  const orgId = Number(c?.organization_id || 0);
  const orgName = String(c?.organization_name || '').trim();
  if (['school', 'program', 'learning'].includes(orgType)) return true;
  // School/learning client types are school-setting even before roster/POS sync catches up.
  if (['school', 'learning'].includes(type)) return true;
  // Any assigned school-named org on a caseload client counts as affiliation.
  if (orgId || orgName) {
    // Prefer typed orgs; name alone is not enough unless client_type already matched above.
    if (['school', 'program', 'learning'].includes(orgType)) return true;
  }
  return false;
};

const isSchoolSettingClient = (c) =>
  isOnSchoolRoster(c?.id) || isPosSchoolClient(c) || hasSchoolOrganizationOnRecord(c);

const isPosOfficeClient = (c) => {
  const flags = clientPosFlags(c?.id);
  if (flags.seenAtOffice) return true;
  if (flags.seenAtSchool) return false;
  // Do not default school-affiliated clients to office when my-roster is empty/out of sync.
  if (isSchoolSettingClient(c)) return false;
  return true;
};

const filterActiveAssignedClients = (rows) =>
  (rows || []).filter((c) => {
    if (isPendingStatus(c.status) || isPendingStatus(c.client_status_key)) return false;
    if (!showTerminated.value && isTerminatedClient(c)) return false;
    return true;
  });

const currentSchoolBillingClients = computed(() =>
  filterActiveAssignedClients(mergedAssignedClients.value).filter((c) => isSchoolSettingClient(c))
);

const schoolBillingTableClients = computed(() =>
  currentSchoolBillingClients.value.filter((c) => !isOnSchoolRoster(c?.id) || !schools.value.length)
);

const currentOfficeClients = computed(() =>
  filterActiveAssignedClients(mergedAssignedClients.value).filter((c) => isPosOfficeClient(c))
);

const combinedClientsList = computed(() => {
  const rows = [];
  const byId = new Map();

  for (const c of currentSchoolBillingClients.value || []) {
    const id = Number(c?.id);
    if (!id) continue;
    const flags = clientPosFlags(id);
    byId.set(id, {
      ...c,
      setting: flags.seenAtOffice ? 'In School & Office' : 'In School',
      schoolName: c.organization_name || '—',
    });
  }

  for (const c of currentOfficeClients.value || []) {
    const id = Number(c?.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      existing.setting = 'In School & Office';
      continue;
    }
    byId.set(id, {
      ...c,
      setting: 'In Office',
      schoolName: c.organization_name || '—',
    });
  }

  // School roster clients from loadAllRosters() — merge by id so All Clients includes them
  for (const c of filterActiveAssignedClients(allClients.value) || []) {
    const id = Number(c?.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      if (!existing.schoolName || existing.schoolName === '—') {
        existing.schoolName = c.organization_name || existing.schoolName;
      }
      if (existing.setting === 'In Office') existing.setting = 'In School & Office';
      continue;
    }
    const flags = clientPosFlags(id);
    byId.set(id, {
      ...c,
      setting: flags.seenAtOffice ? 'In School & Office' : 'In School',
      schoolName: c.organization_name || '—',
    });
  }

  for (const c of byId.values()) rows.push(c);
  return rows;
});

const ALL_CLIENT_OPTIONAL_COLUMNS = [
  { key: 'setting', label: 'Setting' },
  { key: 'school', label: 'School' },
  { key: 'type', label: 'Type' },
  { key: 'insurance', label: 'Insurance Type' },
  { key: 'status', label: 'Status' },
  { key: 'sessions', label: 'Sessions (FY)' },
  { key: 'since', label: 'Since' },
];

const allColumnsOpen = ref(false);
const allColumnPrefs = ref({
  setting: true,
  school: true,
  type: true,
  insurance: true,
  status: true,
  sessions: false,
  since: false,
});
const allSortBy = ref('client');
const allSortDir = ref('asc');

const allColumnsStorageKey = computed(
  () => `provider_all_clients_columns_v1_${authStore.user?.id || 'anon'}`
);

function loadAllColumnPrefs() {
  try {
    const raw = window.localStorage.getItem(allColumnsStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      allColumnPrefs.value = { ...allColumnPrefs.value, ...parsed };
    }
  } catch {
    /* ignore */
  }
}

watch(
  allColumnPrefs,
  (v) => {
    try {
      window.localStorage.setItem(allColumnsStorageKey.value, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
  { deep: true }
);

function allAriaSortFor(field) {
  if (allSortBy.value !== field) return 'none';
  return allSortDir.value === 'asc' ? 'ascending' : 'descending';
}

function allSortIndicatorFor(field) {
  if (allSortBy.value !== field) return '↕';
  return allSortDir.value === 'asc' ? '▲' : '▼';
}

function toggleAllColumnSort(field) {
  if (allSortBy.value === field) {
    allSortDir.value = allSortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  allSortBy.value = field;
  allSortDir.value = field === 'sessions' || field === 'since' ? 'desc' : 'asc';
}

function allClientSortValue(c, field) {
  if (field === 'client') return formatOfficeClientLabel(c);
  if (field === 'setting') return String(c?.setting || '');
  if (field === 'school') return String(c?.schoolName || c?.organization_name || '');
  if (field === 'type') return formatClientTypeLabel(c);
  if (field === 'insurance') return formatInsuranceTypeLabel(c);
  if (field === 'status') return officeStatusLabel(c);
  if (field === 'sessions') {
    const m = sessionTotalsByClientId.value;
    if (!m || !c?.id) return -1;
    const rec = m[String(c.id)] || m[Number(c.id)];
    const t = Number(rec?.total);
    return Number.isFinite(t) ? t : -1;
  }
  if (field === 'since') {
    const d = c?.submission_date ? new Date(c.submission_date).getTime() : 0;
    return Number.isFinite(d) ? d : 0;
  }
  return '';
}

const sortedCombinedClientsList = computed(() => {
  const field = allSortBy.value;
  const dir = allSortDir.value === 'desc' ? -1 : 1;
  const rows = [...(combinedClientsList.value || [])];
  rows.sort((a, b) => {
    const av = allClientSortValue(a, field);
    const bv = allClientSortValue(b, field);
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av === bv) return formatOfficeClientLabel(a).localeCompare(formatOfficeClientLabel(b));
      return (av - bv) * dir;
    }
    const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp * dir;
    return formatOfficeClientLabel(a).localeCompare(formatOfficeClientLabel(b));
  });
  return rows;
});

const schoolClientsForGrid = computed(() => {
  // Always pass an override so hideTerminated filtering is consistent in All schools and single-school mode.
  if (isAllSchools.value) return allClients.value;
  return null;
});

const officeStatusLabel = (c) => displaySchoolClientStatusLabel(c) || c?.client_status_label || c?.status || '—';

const officeSessionTotal = (c) => {
  const m = sessionTotalsByClientId.value;
  if (!m || !c?.id) return '—';
  const rec = m[String(c.id)] || m[Number(c.id)];
  if (!rec) return '—';
  const t = Number(rec.total);
  return Number.isFinite(t) ? t : '—';
};

const pendingOfficeClients = computed(() =>
  (officeClients.value || []).filter((c) => isPendingStatus(c.status))
);

const newClientsCount = computed(
  () => pendingClientsFiltered.value.length + pendingOfficeClients.value.length
);

const sectionIcons = {
  all: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  school: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  office: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>',
  new: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  exchange: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  referrals: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
};

const primarySections = computed(() => {
  const list = [{ id: 'all', label: 'All Clients', iconKey: 'all', badge: 0 }];
  list.push({ id: 'school', label: 'School Clients', iconKey: 'school', badge: 0 });
  list.push({ id: 'office', label: 'Office Clients', iconKey: 'office', badge: 0 });
  list.push({ id: 'new', label: 'New Clients', iconKey: 'new', badge: newClientsCount.value || 0 });
  list.push({ id: 'exchange', label: 'Client Exchange', iconKey: 'exchange', badge: 0 });
  return list;
});

const allSections = computed(() => {
  if (props.profileEmbed) {
    const list = [{ id: 'all', label: 'All Clients', iconKey: 'all', badge: 0 }];
    list.push({ id: 'school', label: 'In School', iconKey: 'school', badge: 0 });
    list.push({ id: 'office', label: 'In Office', iconKey: 'office', badge: 0 });
    return list;
  }
  return [
    ...primarySections.value,
    { id: 'referrals', label: 'Referral directory', iconKey: 'referrals', badge: 0 },
  ];
});

const sectionTitle = computed(() => {
  if (activeSection.value === 'all') return 'All Clients';
  if (activeSection.value === 'school') return props.profileEmbed ? 'In School Clients' : 'School Clients';
  if (activeSection.value === 'office') return props.profileEmbed ? 'In Office Clients' : 'Office Clients';
  if (activeSection.value === 'new') return 'New Clients';
  return 'Clients';
});

const sectionHint = computed(() => {
  if (activeSection.value === 'all') {
    return props.profileEmbed
      ? 'Every client assigned to this provider. Use In School or In Office to filter by setting.'
      : 'All clients on your caseload across school and office settings.';
  }
  if (activeSection.value === 'school') {
    return props.profileEmbed
      ? 'Clients with school billing (Place of Service 03) or on a school roster.'
      : 'School roster clients plus billing lines with Place of Service 03.';
  }
  if (activeSection.value === 'office') {
    return props.profileEmbed
      ? 'Clients assigned to you outside school affiliations — office, virtual, tutoring, and other non-school settings.'
      : 'In-office, virtual, tutoring, and other clients not on a school affiliation roster.';
  }
  if (activeSection.value === 'new') {
    return 'Pending school and office clients that still need a day, acceptance, or paperwork progress.';
  }
  return '';
});

function setSection(id) {
  const next = normalizeSection(id);
  activeSection.value = next;
  const q = { ...route.query, tab: 'clients', clients: activeSection.value };
  if (!props.profileEmbed) {
    router.replace({ query: q }).catch(() => {});
  }
  if (activeSection.value === 'office' || activeSection.value === 'new') {
    loadOfficeClients();
  }
}

/** Fiscal year Jul 1 – Jun 30 (psychotherapy compliance aligned) */
const computeFiscalYearStartYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
};

const fiscalYearOptions = computed(() => {
  const now = new Date();
  const currentStart = computeFiscalYearStartYmd(now);
  const startYear = Number(currentStart.slice(0, 4));
  const years = [startYear, startYear - 1, startYear - 2];
  return years.map((y) => ({
    startYmd: `${y}-07-01`,
    label: `Jul ${y} – Jun ${y + 1}`,
  }));
});

const persistClientLabelMode = () => {
  try {
    window.localStorage.setItem('dashboardClientLabelMode', clientLabelMode.value);
  } catch {
    /* ignore */
  }
};

const toggleFullNames = () => {
  clientLabelMode.value = clientLabelMode.value === 'full_name' ? 'initials' : 'full_name';
  persistClientLabelMode();
};

const toggleCodesMode = () => {
  clientLabelMode.value = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  persistClientLabelMode();
};

const emitPendingCount = () => {
  emit('update:pendingClientsCount', Number(newClientsCount.value || 0));
};

const formatPendingClientLabel = (row) => {
  const code = String(row?.client_identifier_code || '').trim();
  const initials = String(row?.client_initials || '').trim();
  const fullName = String(row?.client_full_name || '').trim();
  if (clientLabelMode.value === 'full_name') return fullName || initials || code || `Client #${row?.client_id || '?'}`;
  if (clientLabelMode.value === 'initials') return initials || code || `Client #${row?.client_id || '?'}`;
  return code || initials || `Client #${row?.client_id || '?'}`;
};

const formatSinceDate = (raw) => {
  if (!raw) return '—';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
};

function onSchoolRosterEditClient(payload) {
  const client = payload?.client || payload;
  const list = Array.isArray(schoolClientsForGrid.value) && schoolClientsForGrid.value.length
    ? schoolClientsForGrid.value
    : (client ? [client] : null);
  openClientProfile(client, list);
}

async function openClientProfile(client, navList = null) {
  const id = Number(client?.id || client?.client_id || 0);
  if (!id) return;
  const rosterSnap = client && typeof client === 'object' ? client : null;
  if (Array.isArray(navList)) {
    profileNavClients.value = navList;
  } else if (!profileNavClients.value.some((c) => Number(c?.id) === id)) {
    profileNavClients.value = client?.id ? [client] : [{ id }];
  }
  profileLoading.value = true;
  try {
    const r = await api.get(`/clients/${id}`, { skipGlobalLoading: true });
    const full = r.data ? { ...r.data } : null;
    if (full && rosterSnap) {
      full.organization_id = full.organization_id || rosterSnap.organization_id;
      full.organization_name = full.organization_name || rosterSnap.organization_name;
      full.service_day = full.service_day || rosterSnap.service_day;
      full.provider_day_pairs = full.provider_day_pairs || rosterSnap.provider_day_pairs;
      full.provider_name = full.provider_name || rosterSnap.provider_name;
      full.school_year = full.school_year || rosterSnap.school_year;
      if (full.grade == null) full.grade = rosterSnap.grade;
    }
    profileClient.value = full;
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to load client');
  } finally {
    profileLoading.value = false;
  }
}

function closeClientProfile() {
  profileClient.value = null;
}

async function onProfileNavigate({ direction }) {
  const idx = profileClientIndex.value;
  const list = profileNavClients.value;
  const nextIdx = direction === 'previous' ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= list.length) return;
  await openClientProfile(list[nextIdx], list);
}

function onClientProfileUpdated(payload) {
  refreshCurrentScope();
  if (payload?.keepOpen && payload?.client) {
    profileClient.value = { ...payload.client };
  } else if (!payload?.keepOpen) {
    closeClientProfile();
  }
}

const formatOfficeClientLabel = (c) => {
  if (clientLabelMode.value === 'full_name') return c?.full_name || c?.initials || `Client #${c?.id}`;
  if (clientLabelMode.value === 'codes') return c?.identifier_code || c?.initials || `Client #${c?.id}`;
  return c?.initials || c?.identifier_code || `Client #${c?.id}`;
};

const officeHoverTitle = (c) => {
  const full = String(c?.full_name || '').trim();
  const initials = String(c?.initials || '').trim();
  return full || initials || '';
};

const formatClientTypeLabel = (c) => {
  const t = String(c?.client_type || '').toLowerCase();
  if (t === 'clinical') return 'Clinical';
  if (t === 'learning') return 'Learning';
  if (t === 'school') return 'School';
  if (t === 'basic_nonclinical') return 'Non-clinical';
  return t ? t.replace(/_/g, ' ') : '—';
};

const formatInsuranceTypeLabel = (c) =>
  String(c?.insurance_type_label || c?.primary_insurer_name || '').trim() || '—';

const loadBillingPosFlags = async () => {
  if (!agencyId.value || !currentUserId.value) {
    billingPosByClientId.value = {};
    return;
  }
  try {
    const r = await api.get('/billing-reports/provider-client-pos', {
      params: {
        agencyId: agencyId.value,
        providerUserId: currentUserId.value,
      },
      skipGlobalLoading: true,
    });
    billingPosByClientId.value = r.data?.byClientId || {};
    // Merge lifetime school affiliations (COA/CPA/client_type) into roster set.
    const affiliated = Array.isArray(r.data?.schoolAffiliatedClientIds)
      ? r.data.schoolAffiliatedClientIds
      : [];
    if (affiliated.length) {
      const next = new Set(schoolAffiliatedClientIds.value || []);
      for (const raw of affiliated) {
        const id = Number(raw);
        if (id) next.add(id);
      }
      schoolAffiliatedClientIds.value = next;
    }
  } catch {
    billingPosByClientId.value = {};
  }
};

const pendingStageLabel = (row) => {
  if (row.pending_stage === 'no_parent_contact') return 'No parent contact date';
  if (row.pending_stage === 'no_first_session') return 'No first session date';
  if (!row.service_day && row.no_service_day) return 'No assigned day';
  return row.pending_stage || 'Pending';
};

const formatPreferred = (c) => {
  const prefs = c?.intake_preferences || c?.intake_preferences_json || null;
  let p = prefs;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = null;
    }
  }
  if (!p || typeof p !== 'object') return '—';
  const parts = [p.preferredDay || p.day, p.preferredTime || p.time, p.modality || p.place].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};

const loadOfficeAcceptance = async () => {
  if (!agencyId.value || !currentUserId.value) {
    officeAcceptance.value = null;
    return;
  }
  try {
    const r = await api.get('/client-exchange/acceptance-metrics', {
      params: {
        agencyId: agencyId.value,
        providerUserId: currentUserId.value,
      },
      skipGlobalLoading: true,
    });
    officeAcceptance.value = r.data?.provider || null;
    if (officeAcceptance.value && !officeAcceptance.value.windowDays) {
      officeAcceptance.value.windowDays = r.data?.windowDays || 30;
    }
  } catch {
    officeAcceptance.value = null;
  }
};

const loadOfficeClients = async () => {
  if (!agencyId.value || !currentUserId.value) {
    officeClients.value = [];
    assignedProviderClients.value = [];
    billingPosByClientId.value = {};
    return;
  }
  officeLoading.value = true;
  officeError.value = '';
  try {
    await refreshSchoolAffiliatedClientIds();
    const [r] = await Promise.all([
      api.get('/clients', {
        params: {
          agency_id: agencyId.value,
          provider_id: currentUserId.value,
        },
        skipGlobalLoading: true,
      }),
      loadOfficeAcceptance(),
      loadBillingPosFlags(),
    ]);
    const rows = Array.isArray(r.data) ? r.data : r.data?.items || [];
    assignedProviderClients.value = rows.filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
    officeClients.value = assignedProviderClients.value.filter((c) => isPosOfficeClient(c));
  } catch (e) {
    officeClients.value = [];
    officeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load office clients';
  } finally {
    officeLoading.value = false;
    emitPendingCount();
  }
};

async function refreshSchoolAffiliatedClientIds() {
  // Preserve affiliation IDs already discovered via billing/COA so my-roster gaps
  // do not wipe "In School" for historically school-affiliated clients.
  const ids = new Set(schoolAffiliatedClientIds.value || []);
  const list = schools.value || [];
  if (!list.length || !currentUserId.value) {
    schoolAffiliatedClientIds.value = ids;
    return ids;
  }
  const rosterParams = {
    ...(rosterProviderUserId.value ? { providerUserId: rosterProviderUserId.value } : {}),
  };
  const results = await Promise.all(
    list.map((s) =>
      api
        .get(`/school-portal/${encodeURIComponent(s.schoolOrganizationId)}/my-roster`, {
          params: rosterParams,
          skipGlobalLoading: true,
        })
        .then((res) => (Array.isArray(res?.data) ? res.data : []))
        .catch(() => [])
    )
  );
  for (const rows of results) {
    for (const c of rows) {
      const id = Number(c?.id);
      if (id) ids.add(id);
    }
  }
  schoolAffiliatedClientIds.value = ids;
  return ids;
}

const loadSchools = async () => {
  if (!agencyId.value || !currentUserId.value) return;
  const params = { agencyId: agencyId.value };
  try {
    const r = props.profileEmbed
      ? await api.get(`/payroll/users/${currentUserId.value}/assigned-schools`, { params })
      : await api.get('/payroll/me/assigned-schools', { params });
    schools.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    schools.value = [];
    // Surface on All/School views; office clients can still load via /clients.
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load assigned schools';
  }
  if (!selectedSchoolOrgId.value) {
    selectedSchoolOrgId.value = 'all';
  }
};

const loadAllRosters = async () => {
  const list = schools.value || [];
  if (list.length === 0) {
    allClients.value = [];
    return;
  }
  try {
    const sbParams = skillBuildersOnlyFilter.value ? { skillBuildersOnly: true } : {};
    const results = await Promise.all(
        list.map((s) =>
        api
          .get(`/school-portal/${encodeURIComponent(s.schoolOrganizationId)}/my-roster`, {
            params: {
              ...sbParams,
              ...(rosterProviderUserId.value ? { providerUserId: rosterProviderUserId.value } : {}),
            },
            skipGlobalLoading: true,
          })
          .then((res) => ({ school: s, rows: Array.isArray(res?.data) ? res.data : [] }))
          .catch(() => ({ school: s, rows: [] }))
      )
    );
    const byId = new Map();
    for (const { school, rows } of results) {
      for (const c of rows) {
        const id = c?.id;
        if (!id || byId.has(id)) continue;
        byId.set(id, {
          ...c,
          organization_id: c.organization_id ?? Number(school.schoolOrganizationId),
          organization_name: c.organization_name ?? school.name,
        });
      }
    }
    allClients.value = Array.from(byId.values());
  } catch {
    allClients.value = [];
  }
};

const loadSessionTotals = async () => {
  if (!agencyId.value) return;
  try {
    const params = {
      agencyId: agencyId.value,
      fiscalYearStart: selectedFiscalYearStart.value,
    };
    if (rosterProviderUserId.value) params.providerUserId = rosterProviderUserId.value;
    const r = await api.get('/billing-reports/session-totals', { params, skipGlobalLoading: true });
    sessionTotalsByClientId.value = r.data?.byClientId || {};
  } catch {
    sessionTotalsByClientId.value = {};
  }
};

const loadTerminatedOfficeExtras = async () => {
  if (!showTerminated.value || !agencyId.value || !currentUserId.value) {
    terminatedOfficeExtras.value = [];
    return;
  }
  try {
    const r = await api.get('/billing-reports/provider-clients', {
      params: {
        agencyId: agencyId.value,
        providerUserId: currentUserId.value,
        includeTerminated: 1,
      },
      skipGlobalLoading: true,
    });
    const rows = Array.isArray(r.data?.clients) ? r.data.clients : [];
    terminatedOfficeExtras.value = rows.filter((c) => {
      if (!isTerminatedClient(c)) return false;
      return isPosOfficeClient(c) && !isOnSchoolRoster(c?.id);
    });
  } catch {
    terminatedOfficeExtras.value = [];
  }
};

const loadPendingClients = async () => {
  if (!agencyId.value || !currentUserId.value) {
    pendingClients.value = [];
    pendingError.value = '';
    emitPendingCount();
    return;
  }
  try {
    pendingError.value = '';
    const r = await api.get('/compliance-corner/pending-clients', {
      params: {
        agencyId: Number(agencyId.value),
        providerUserId: Number(currentUserId.value),
        minPendingEnteredAt: MIN_PENDING_DATE,
      },
      skipGlobalLoading: true,
    });
    pendingClients.value = Array.isArray(r.data?.results) ? r.data.results : [];
  } catch (e) {
    pendingClients.value = [];
    pendingError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending school clients';
  } finally {
    emitPendingCount();
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    sessionTotalsByClientId.value = null;

    if (!selectedFiscalYearStart.value) {
      selectedFiscalYearStart.value = fiscalYearOptions.value[0]?.startYmd || '';
    }

    await loadSchools();
    const tasks = [loadOfficeClients(), loadSessionTotals()];
    if (!props.profileEmbed) {
      tasks.push(loadPendingClients());
    }
    await Promise.all(tasks);
    if (isAllSchools.value || activeSection.value === 'all') await loadAllRosters();
    await loadTerminatedOfficeExtras();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

const refreshCurrentScope = () => {
  if (activeSection.value === 'office' || activeSection.value === 'new') {
    return Promise.all([loadOfficeClients(), loadPendingClients(), loadSessionTotals(), loadTerminatedOfficeExtras()]);
  }
  if (activeSection.value === 'all') {
    return load();
  }
  if (activeSection.value === 'exchange') return Promise.resolve();
  return load();
};

onMounted(() => {
  try {
    const saved = window.localStorage.getItem('dashboardClientLabelMode');
    if (saved === 'codes' || saved === 'initials' || saved === 'full_name') clientLabelMode.value = saved;
  } catch {
    /* ignore */
  }
  loadAllColumnPrefs();
  const fromQuery = normalizeSection(
    route.query.clients || props.initialSection || (props.profileEmbed ? 'all' : 'school')
  );
  activeSection.value = fromQuery;
  load();
});

onUnmounted(() => {
  allColumnsOpen.value = false;
});

watch(() => agencyId.value, load);
watch(
  () => route.query.clients,
  (v) => {
    if (v) activeSection.value = normalizeSection(v);
  }
);
watch(
  () => props.initialSection,
  (v) => {
    if (v) activeSection.value = normalizeSection(v);
  }
);
watch(() => selectedFiscalYearStart.value, () => loadSessionTotals().catch(() => {}));
watch(showTerminated, () => {
  loadTerminatedOfficeExtras().catch(() => {});
});
watch(() => currentUserId.value, () => {
  loadPendingClients().catch(() => {});
  loadOfficeClients().catch(() => {});
});
watch(() => newClientsCount.value, () => emitPendingCount());

watch(
  () => selectedSchoolOrgId.value,
  async (id) => {
    if (!id) emit('update:needsAttentionCount', 0);
    if (id === 'all') await loadAllRosters();
    emitPendingCount();
  },
  { immediate: true }
);

watch(skillBuildersOnlyFilter, async () => {
  if (isAllSchools.value) await loadAllRosters();
});
</script>

<style scoped>
.provider-clients-tab {
  --pct-green: #166534;
  --pct-border: #e5e7eb;
  --pct-muted: #6b7280;
  display: grid;
  gap: 20px;
  min-width: 0;
  max-width: 100%;
  font-family: var(--font-body, 'Inter', system-ui, sans-serif);
  color: #111827;
}

.pct-cat-nav {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--pct-border);
  padding-bottom: 0;
  margin-bottom: 4px;
}

.pct-cat-tab {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 108px;
  padding: 12px 16px 14px;
  border: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--pct-muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  position: relative;
}

.pct-cat-tab:hover {
  color: #374151;
}

.pct-cat-tab.is-active {
  color: var(--pct-green);
  border-bottom-color: var(--pct-green);
}

.pct-cat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.pct-cat-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.pct-cat-tab.is-active .pct-cat-label {
  font-weight: 700;
}

.pct-cat-badge {
  position: absolute;
  top: 6px;
  right: 10px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #c2410c;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pct-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pct-page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #111827;
}

.pct-page-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--pct-muted);
  max-width: 42rem;
  line-height: 1.5;
}

.pct-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid var(--pct-border);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.pct-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.pct-field__label {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.pct-control {
  border: 1px solid var(--pct-border);
  border-radius: 8px;
  background: #fff;
  padding: 0 12px;
  min-width: 180px;
  min-height: 42px;
  font-size: 14px;
  color: #111827;
}

.pct-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 4px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}

.pct-check input {
  margin: 0;
  width: 16px;
  height: 16px;
  accent-color: var(--pct-green);
}

.pct-link-btn {
  align-self: flex-end;
  border: none;
  background: transparent;
  padding: 10px 4px;
  min-height: 42px;
  color: var(--pct-muted);
  text-decoration: underline;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.pct-link-btn:hover:not(:disabled) {
  color: var(--pct-green);
}

.pct-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}

.pct-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pct-btn--ghost {
  background: #fff;
  color: #374151;
  border-color: var(--pct-border);
}

.pct-btn--ghost:hover:not(:disabled) {
  background: #f9fafb;
}

.pct-columns-control {
  position: relative;
}

.pct-columns-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  background: #fff;
  border: 1px solid var(--pct-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 10px 12px;
  min-width: 200px;
}

.pct-columns-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #111827;
  padding: 4px 0;
  cursor: pointer;
}

.pct-sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.pct-sortable:hover {
  color: var(--pct-green);
}

.pct-sort-indicator {
  display: inline-block;
  margin-left: 0.25rem;
  font-size: 0.65rem;
  opacity: 0.7;
}

.pct-btn--primary {
  background: var(--pct-green);
  color: #fff;
  margin-left: auto;
}

.pct-btn--primary:hover:not(:disabled) {
  background: #14532d;
}

.tiny { font-size: 0.8rem; }
.pct-inline-link {
  color: #0e7490;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pct-acceptance {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 12px;
  margin-bottom: 12px;
}
.pct-acceptance strong {
  color: #1e3a8a;
  font-size: 0.95rem;
}
.new-block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
}
.new-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.pending-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(217, 45, 32, 0.4);
  background: rgba(217, 45, 32, 0.16);
  color: #9a1f14;
  font-weight: 900;
  font-size: 12px;
}
.pending-count-badge.pulse {
  animation: pendingPulse 1.1s ease-in-out infinite;
}
.pending-strip-table-wrap { overflow-x: auto; }
.pending-strip-table,
.office-clients-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pending-strip-table th,
.pending-strip-table td,
.office-clients-table th,
.office-clients-table td {
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  font-size: 12px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}
@keyframes pendingPulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.72; }
  100% { transform: scale(1); opacity: 1; }
}
.error { color: #c33; }
.muted { color: var(--text-secondary); }
.office-clients-table-wrap { overflow-x: auto; }
.office-clients-table tr.is-terminated td { color: #9a1f14; opacity: 0.9; }
.pct-client-link {
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--primary, #2563eb);
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pct-client-link:hover {
  color: var(--primary-dark, #1d4ed8);
}
.pct-profile-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 3999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.28);
}
.pct-profile-loading-card {
  padding: 16px 22px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
  font-weight: 600;
}
.pct-client-detail-lift :deep(.modal-overlay) {
  z-index: 4000;
}
.empty-state {
  border: 1px dashed var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.empty-state.compact { padding: 12px; }
@media (max-width: 900px) {
  .pct-cat-tab {
    min-width: 88px;
    padding: 10px 10px 12px;
  }
  .pct-cat-label {
    font-size: 12px;
    white-space: normal;
    max-width: 88px;
  }
}

@media (max-width: 640px) {
  .pct-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .pct-field,
  .pct-control {
    min-width: 0;
    width: 100%;
  }
  .pct-btn--primary {
    margin-left: 0;
    width: 100%;
  }
  .pct-link-btn,
  .pct-btn--ghost {
    width: 100%;
  }
}
</style>
