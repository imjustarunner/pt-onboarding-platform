<template>
  <div class="pyu-admin">
    <div class="pyu-admin__head">
      <div>
        <h1 class="pyu-admin__title">Provider Fall Update</h1>
        <p class="muted">Track provider progress, materials requests, and shareable links for {{ schoolYear }}.</p>
      </div>
      <div class="pyu-admin__head-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!filteredRows.length" @click="exportCsv">
          Export Report
        </button>
        <router-link class="btn btn-secondary btn-sm" :to="materialsRequestsTo">Materials requests</router-link>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div class="pyu-admin__campaign">
      <div class="pyu-admin__campaign-status">
        <span class="pill" :class="'pill--' + (campaign.status || 'draft')">{{ campaignLabel }}</span>
        <span class="muted">
          <template v-if="campaign.isDisabled">
            Disabled {{ formatDt(campaign.disabledAt) }} — archived. Providers now see the next school year’s Provider Fall Update and can switch back to view this year.
          </template>
          <template v-else-if="campaign.isPushed">
            Pushed {{ formatDt(campaign.pushedAt) }} — providers see Year Update on My Dashboard (dismissible) and shareable links work.
          </template>
          <template v-else-if="campaign.isEnabled">
            Enabled — use <strong>Get link</strong>, then <strong>Push</strong> per provider for My Dashboard, or Push to Providers for everyone.
          </template>
          <template v-else>Not started — Enable Provider Fall Update for {{ schoolYear }}.</template>
        </span>
      </div>
      <div class="pyu-admin__campaign-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="campaignBusy || (campaign.isEnabled && !campaign.isDisabled)"
          @click="enableYearUpdate"
        >
          {{
            campaign.isDisabled
              ? 'Re-enable Year Update'
              : campaign.isEnabled
                ? 'Year Update Enabled'
                : 'Enable Provider Fall Update'
          }}
        </button>
        <button
          v-if="campaign.isEnabled || campaign.isDisabled"
          type="button"
          class="btn btn-secondary"
          :disabled="campaignBusy || campaign.isDisabled"
          @click="disableYearUpdate"
        >
          {{ campaign.isDisabled ? 'Year Update Disabled' : 'Disable Year Update' }}
        </button>
        <button
          type="button"
          class="btn btn-push"
          :disabled="campaignBusy || !campaign.isEnabled"
          @click="pushToProviders"
        >
          {{ campaign.isPushed ? 'Pushed to Providers' : 'Push to Providers' }}
        </button>
      </div>
      <p v-if="pushFlash" class="success-banner">{{ pushFlash }}</p>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="pyu-admin__metrics">
      <div class="metric">
        <span class="metric__label">Total Providers</span>
        <strong>{{ summary.totalProviders || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Completed</span>
        <strong>{{ summary.finalized || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">In Progress</span>
        <strong>{{ summary.inProgress || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Not Started</span>
        <strong>{{ summary.notStarted || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Total time in flow</span>
        <strong>{{ formatYearUpdateActiveSeconds(summary.totalActiveSeconds) }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Views</span>
        <strong>{{ summary.totalTokenViews || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Need School Cart</span>
        <strong>{{ summary.needSchoolCartCount || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Open School Needs</span>
        <strong>{{ openNeedsCount }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Pending Applications</span>
        <strong>{{ pendingAppsCount }}</strong>
      </div>
    </div>

    <section class="pyu-admin__needs">
      <div class="pyu-admin__needs-head">
        <div>
          <h3>School Needs</h3>
          <p class="muted">
            Post schools that need an additional provider. Providers see these on the right side of their Year Update and can request placement.
            Only affiliated schools with a logo on file can be posted.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="needsLoading" @click="loadNeeds">
          {{ needsLoading ? 'Loading…' : 'Refresh needs' }}
        </button>
      </div>

      <div v-if="needsError" class="error-banner">{{ needsError }}</div>

      <form class="pyu-admin__needs-form" @submit.prevent="createNeed">
        <label>
          School
          <select v-model="needForm.schoolOrganizationId" required>
            <option disabled value="">Select school…</option>
            <option v-for="s in needSchools" :key="s.schoolOrganizationId" :value="String(s.schoolOrganizationId)">
              {{ s.schoolName }}
            </option>
          </select>
        </label>
        <label>
          Title (optional)
          <input v-model="needForm.title" type="text" maxlength="255" placeholder="e.g. Need coverage Mondays" />
        </label>
        <label>
          Slots
          <input v-model.number="needForm.slotsNeeded" type="number" min="1" max="50" />
        </label>
        <fieldset class="pyu-admin__days">
          <legend>Required day(s) — leave blank if providers should pick a preferred day</legend>
          <label v-for="d in weekdays" :key="d" class="inline">
            <input v-model="needForm.days" type="checkbox" :value="d" />
            {{ d.slice(0, 3) }}
          </label>
        </fieldset>
        <label class="pyu-admin__needs-notes">
          Notes for providers (optional)
          <textarea v-model="needForm.body" rows="2" maxlength="2000" placeholder="Caseload notes, start timing, etc." />
        </label>
        <button type="submit" class="btn btn-primary" :disabled="needSaving || !needForm.schoolOrganizationId">
          {{ needSaving ? 'Posting…' : 'Post school need' }}
        </button>
      </form>

      <div v-if="!needSchools.length && !needsLoading" class="muted small" style="margin-top: 8px;">
        No affiliated schools with logos were found. Add school logos in Company Profile before posting needs.
      </div>

      <div class="pyu-admin__needs-grid">
        <article v-for="need in schoolNeeds" :key="need.id" class="pyu-admin__need-card">
          <div class="pyu-admin__need-top">
            <img
              v-if="needLogo(need)"
              :src="needLogo(need)"
              :alt="need.school?.schoolName || 'School'"
              class="pyu-admin__need-logo"
            />
            <div>
              <strong>{{ need.school?.schoolName || 'School' }}</strong>
              <div class="muted small">
                <span class="pill" :class="'pill--need-' + need.status">{{ need.status }}</span>
                · {{ need.slotsNeeded }} slot{{ need.slotsNeeded === 1 ? '' : 's' }}
                · {{ need.pendingApplicationCount || 0 }} pending / {{ need.applicationCount || 0 }} total
              </div>
              <div v-if="need.days?.length" class="muted small">Days: {{ need.days.join(', ') }}</div>
              <div v-else class="muted small">No fixed day — providers choose preferred day</div>
            </div>
          </div>
          <p v-if="need.title" class="small"><strong>{{ need.title }}</strong></p>
          <p v-if="need.body" class="muted small">{{ need.body }}</p>
          <div class="pyu-admin__row-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="toggleApps(need)">
              {{ expandedNeedId === need.id ? 'Hide applicants' : 'View applicants' }}
            </button>
            <button
              v-if="need.status === 'open'"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="needSaving"
              @click="setNeedStatus(need, 'closed')"
            >
              Close
            </button>
            <button
              v-if="need.status !== 'open'"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="needSaving"
              @click="setNeedStatus(need, 'open')"
            >
              Reopen
            </button>
            <button
              v-if="need.status === 'open'"
              type="button"
              class="btn btn-complete btn-sm"
              :disabled="needSaving"
              @click="setNeedStatus(need, 'filled')"
            >
              Mark filled
            </button>
          </div>

          <div v-if="expandedNeedId === need.id" class="pyu-admin__apps">
            <div v-if="appsLoadingId === need.id" class="muted small">Loading applicants…</div>
            <div v-else-if="!(applicationsByNeed[need.id] || []).length" class="muted small">No applications yet.</div>
            <ul v-else>
              <li v-for="app in applicationsByNeed[need.id]" :key="app.id">
                <div>
                  <strong>{{ app.providerName }}</strong>
                  <span class="muted small"> · {{ app.email }}</span>
                  <div class="small">
                    Day: {{ app.preferredDay || '—' }}
                    · RT:
                    {{
                      app.homeSchoolRoundtripMiles != null
                        ? `${Number(app.homeSchoolRoundtripMiles).toFixed(1)} mi`
                        : 'n/a'
                    }}
                    · <span class="pill" :class="'pill--app-' + app.status">{{ app.status }}</span>
                  </div>
                  <div v-if="app.notes" class="muted small">{{ app.notes }}</div>
                </div>
                <div class="pyu-admin__row-actions">
                  <button
                    v-if="app.status === 'pending'"
                    type="button"
                    class="btn btn-complete btn-sm"
                    @click="reviewApp(need, app, 'approved')"
                  >
                    Approve
                  </button>
                  <button
                    v-if="app.status === 'pending'"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="reviewApp(need, app, 'denied')"
                  >
                    Deny
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </article>
      </div>
    </section>

    <div class="pyu-admin__workspace" :class="{ 'has-detail': Boolean(selectedRow) }">
      <div class="pyu-admin__main">
        <div class="pyu-admin__filters">
          <input v-model="filterText" type="text" placeholder="Search providers…" class="pyu-admin__input" />
          <select v-model="filterStatus">
            <option value="all">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="finalized">Finalized</option>
          </select>
          <label class="inline"><input v-model="filterCart" type="checkbox" /> Needs school cart</label>
        </div>

        <div class="pyu-admin__table-wrap">
          <table class="pyu-admin__table">
            <thead>
              <tr>
                <th class="th-sort" :class="sortColClass('provider')" @click="setSort('provider')">
                  Provider <span class="sort-arrow">{{ sortArrow('provider') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('schools')" @click="setSort('schools')">
                  Schools <span class="sort-arrow">{{ sortArrow('schools') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('status')" @click="setSort('status')">
                  Status <span class="sort-arrow">{{ sortArrow('status') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('progress')" @click="setSort('progress')">
                  Progress <span class="sort-arrow">{{ sortArrow('progress') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('sections')" @click="setSort('sections')">
                  Sections <span class="sort-arrow">{{ sortArrow('sections') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('views')" @click="setSort('views')">
                  Views <span class="sort-arrow">{{ sortArrow('views') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('time')" @click="setSort('time')">
                  Time in flow <span class="sort-arrow">{{ sortArrow('time') }}</span>
                </th>
                <th class="th-sort" :class="sortColClass('activity')" @click="setSort('activity')">
                  Last activity <span class="sort-arrow">{{ sortArrow('activity') }}</span>
                </th>
                <th>Link / Push</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredRows"
                :key="row.providerUserId"
                :data-cycle-id="row.cycleId || ''"
                :class="{ selected: selectedRow?.providerUserId === row.providerUserId }"
                @click="selectRow(row)"
              >
                <td>
                  <strong>{{ row.providerName }}</strong>
                  <div class="muted small">{{ row.email }}</div>
                </td>
                <td class="muted small">{{ row.schoolNames || '—' }}</td>
                <td><span class="pill" :class="'pill--' + (row.status || 'not_started')">{{ statusLabel(row.status) }}</span></td>
                <td>{{ row.sectionPercent || 0 }}%</td>
                <td>
                  <span
                    v-for="key in rowSectionKeys(row)"
                    :key="key"
                    class="dot"
                    :class="sectionDotClass(row, key)"
                    :title="sectionTitle(key)"
                  />
                </td>
                <td>{{ row.tokenClickCount || 0 }}</td>
                <td class="muted small">
                  {{ formatYearUpdateActiveSeconds(row.activeSeconds, { estimated: row.activeSecondsIsInferred }) }}
                </td>
                <td class="muted small">{{ formatDt(row.lastActivityAt) || '—' }}</td>
                <td @click.stop>
                  <div class="pyu-admin__row-actions">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="!campaign.isEnabled || linkBusyId === row.providerUserId"
                      @click="copyLink(row)"
                    >
                      {{ linkFor(row) ? 'Copy' : 'Get link' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-push btn-sm"
                      :disabled="!canPushProvider(row) || pushBusyId === row.providerUserId"
                      :title="pushTitle(row)"
                      @click="pushOneProvider(row)"
                    >
                      {{
                        pushBusyId === row.providerUserId
                          ? 'Pushing…'
                          : row.isPushed
                            ? 'Pushed ✓'
                            : 'Push'
                      }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="!primaryToken(row) || linkBusyId === row.providerUserId"
                      @click="toggleMarkSent(row)"
                    >
                      {{ row.markedSent ? 'Sent ✓' : 'Mark sent' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-complete btn-sm"
                      :disabled="!canMarkComplete(row) || completeBusyId === row.providerUserId"
                      :title="markCompleteTitle(row)"
                      @click="markComplete(row)"
                    >
                      {{
                        completeBusyId === row.providerUserId
                          ? 'Saving…'
                          : row.status === 'finalized'
                            ? 'Complete ✓'
                            : 'Mark complete'
                      }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!filteredRows.length">
                <td colspan="9" class="muted">No providers with school assignments found for this agency.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside v-if="selectedRow" class="pyu-admin__detail">
        <button type="button" class="btn btn-secondary btn-sm" @click="selectedRow = null">Close</button>
        <h3>{{ selectedRow.providerName }}</h3>
        <p class="muted">{{ selectedRow.email }}</p>
        <p v-if="selectedRow.phone" class="muted">{{ selectedRow.phone }}</p>
        <div class="detail-block">
          <strong>Engagement</strong>
          <p>
            Time in Year Update:
            {{ formatYearUpdateActiveSeconds(selectedRow.activeSeconds, { estimated: selectedRow.activeSecondsIsInferred }) }}
          </p>
          <p v-if="selectedRow.activeSecondsIsInferred" class="muted tiny">
            Estimated from saved visits and section activity before live session tracking.
          </p>
          <p class="muted">Views: {{ selectedRow.tokenClickCount || 0 }}</p>
        </div>
        <div class="detail-block">
          <strong>Schools</strong>
          <ul>
            <li v-for="s in selectedRow.schools || []" :key="s.schoolOrganizationId">
              {{ s.schoolName }} <span class="muted">({{ s.dayCount }} day{{ s.dayCount === 1 ? '' : 's' }})</span>
            </li>
          </ul>
        </div>
        <div class="detail-block">
          <strong>Materials</strong>
          <p>School cart: {{ selectedRow.needSchoolCart ? 'Yes' : 'No' }}</p>
          <p v-if="selectedRow.materialsNotes" class="muted">{{ selectedRow.materialsNotes }}</p>
        </div>
        <div class="detail-block">
          <strong>Reminders</strong>
          <p>{{ selectedRow.remindersDone || 0 }} / {{ selectedRow.remindersTotal || 0 }} items marked</p>
        </div>
        <div class="detail-block">
          <strong>Share link</strong>
          <p class="link-box">
            {{ linkFor(selectedRow) || (campaign.isEnabled ? 'Click “Get link” to generate a shareable URL.' : 'Enable Provider Fall Update to create links.') }}
          </p>
          <div class="pyu-admin__row-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!campaign.isEnabled || linkBusyId === selectedRow.providerUserId"
              @click="copyLink(selectedRow)"
            >
              {{
                linkBusyId === selectedRow.providerUserId
                  ? 'Working…'
                  : linkFor(selectedRow)
                    ? 'Copy link'
                    : 'Get link'
              }}
            </button>
            <button
              type="button"
              class="btn btn-push btn-sm"
              :disabled="!canPushProvider(selectedRow) || pushBusyId === selectedRow.providerUserId"
              :title="pushTitle(selectedRow)"
              @click="pushOneProvider(selectedRow)"
            >
              {{
                pushBusyId === selectedRow.providerUserId
                  ? 'Pushing…'
                  : selectedRow.isPushed
                    ? 'Pushed ✓'
                    : 'Push to provider'
              }}
            </button>
            <button
              type="button"
              class="btn btn-complete btn-sm"
              :disabled="!canMarkComplete(selectedRow) || completeBusyId === selectedRow.providerUserId"
              :title="markCompleteTitle(selectedRow)"
              @click="markComplete(selectedRow)"
            >
              {{
                completeBusyId === selectedRow.providerUserId
                  ? 'Saving…'
                  : selectedRow.status === 'finalized'
                    ? 'Complete ✓'
                    : 'Mark complete'
              }}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import {
  SECTION_META,
  currentSchoolYear,
  publicProviderYearUpdateUrl,
  copyTextToClipboard,
  formatYearUpdateActiveSeconds,
} from '../../utils/providerYearUpdate';
import { logoSrc } from '../../utils/schoolReinit';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  schoolYear: { type: String, default: '' },
  organizationSlug: { type: String, default: '' },
  highlightCycleId: { type: Number, default: null },
});

const route = useRoute();
const materialsRequestsTo = computed(() => {
  const slug = props.organizationSlug || route.params.organizationSlug;
  return slug ? `/${slug}/admin/materials-requests` : '/admin/materials-requests';
});

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const schoolYear = computed(() => props.schoolYear || currentSchoolYear());
function nextYearHint() {
  const y = String(schoolYear.value || '');
  const m = y.match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (!m) return 'the next school year';
  const start = Number(m[1]) + 1;
  if (String(m[2]).length === 2) return `${start}-${String(start + 1).slice(-2)}`;
  return `${start}-${start + 1}`;
}
const loading = ref(false);
const campaignBusy = ref(false);
const linkBusyId = ref(null);
const pushBusyId = ref(null);
const completeBusyId = ref(null);
const error = ref('');
const pushFlash = ref('');
const rows = ref([]);
const summary = ref({});
const campaign = ref({ status: 'draft', isEnabled: false, isPushed: false, isDisabled: false });
const filterText = ref('');
const filterStatus = ref('all');
const filterCart = ref(false);
const sortKey = ref('progress');
const sortDir = ref('desc');
const selectedRow = ref(null);
const sectionKeys = SECTION_META.map((m) => m.key);

const needsLoading = ref(false);
const needSaving = ref(false);
const needsError = ref('');
const schoolNeeds = ref([]);
const needSchools = ref([]);
const expandedNeedId = ref(null);
const appsLoadingId = ref(0);
const applicationsByNeed = reactive({});
const needForm = reactive({
  schoolOrganizationId: '',
  title: '',
  body: '',
  slotsNeeded: 1,
  days: [],
});

const openNeedsCount = computed(
  () => (schoolNeeds.value || []).filter((n) => n.status === 'open').length
);
const pendingAppsCount = computed(
  () => (schoolNeeds.value || []).reduce((sum, n) => sum + Number(n.pendingApplicationCount || 0), 0)
);

function needLogo(need) {
  return logoSrc(need?.school || {}, { allowIcon: true });
}

async function loadNeedSchools() {
  if (!props.agencyId) return;
  try {
    const res = await api.get('/provider-year-update/school-needs/schools', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true,
    });
    needSchools.value = res.data?.schools || [];
  } catch {
    needSchools.value = [];
  }
}

async function loadNeeds() {
  if (!props.agencyId) return;
  needsLoading.value = true;
  needsError.value = '';
  try {
    await loadNeedSchools();
    const res = await api.get('/provider-year-update/school-needs', {
      params: { agencyId: props.agencyId, schoolYear: schoolYear.value },
      skipGlobalLoading: true,
    });
    schoolNeeds.value = res.data?.needs || [];
  } catch (e) {
    needsError.value = e?.response?.data?.error?.message || e.message || 'Failed to load school needs';
  } finally {
    needsLoading.value = false;
  }
}

async function createNeed() {
  if (!needForm.schoolOrganizationId || needSaving.value) return;
  needSaving.value = true;
  needsError.value = '';
  try {
    await api.post('/provider-year-update/school-needs', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
      schoolOrganizationId: Number(needForm.schoolOrganizationId),
      title: needForm.title,
      body: needForm.body,
      slotsNeeded: needForm.slotsNeeded,
      days: [...needForm.days],
    });
    needForm.schoolOrganizationId = '';
    needForm.title = '';
    needForm.body = '';
    needForm.slotsNeeded = 1;
    needForm.days = [];
    await loadNeeds();
  } catch (e) {
    needsError.value = e?.response?.data?.error?.message || e.message || 'Failed to post school need';
  } finally {
    needSaving.value = false;
  }
}

async function setNeedStatus(need, status) {
  needSaving.value = true;
  needsError.value = '';
  try {
    await api.patch(`/provider-year-update/school-needs/${need.id}`, {
      agencyId: Number(props.agencyId),
      status,
    });
    await loadNeeds();
  } catch (e) {
    needsError.value = e?.response?.data?.error?.message || e.message || 'Failed to update need';
  } finally {
    needSaving.value = false;
  }
}

async function toggleApps(need) {
  if (expandedNeedId.value === need.id) {
    expandedNeedId.value = null;
    return;
  }
  expandedNeedId.value = need.id;
  appsLoadingId.value = need.id;
  try {
    const res = await api.get(`/provider-year-update/school-needs/${need.id}/applications`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true,
    });
    applicationsByNeed[need.id] = res.data?.applications || [];
  } catch (e) {
    needsError.value = e?.response?.data?.error?.message || e.message || 'Failed to load applicants';
    applicationsByNeed[need.id] = [];
  } finally {
    appsLoadingId.value = 0;
  }
}

async function reviewApp(need, app, status) {
  needsError.value = '';
  try {
    await api.patch(`/provider-year-update/school-needs/applications/${app.id}`, {
      agencyId: Number(props.agencyId),
      status,
    });
    const res = await api.get(`/provider-year-update/school-needs/${need.id}/applications`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true,
    });
    applicationsByNeed[need.id] = res.data?.applications || [];
    await loadNeeds();
  } catch (e) {
    needsError.value = e?.response?.data?.error?.message || e.message || 'Failed to update application';
  }
}

const campaignLabel = computed(() => {
  if (campaign.value.isDisabled) return 'Disabled';
  if (campaign.value.isPushed) return 'Pushed';
  if (campaign.value.isEnabled) return 'Enabled';
  return 'Draft';
});

const filteredRows = computed(() => {
  let list = [...(rows.value || [])];
  const q = filterText.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        String(r.providerName || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.schoolNames || '').toLowerCase().includes(q)
    );
  }
  if (filterStatus.value !== 'all') {
    list = list.filter((r) => (r.status || 'not_started') === filterStatus.value);
  }
  if (filterCart.value) list = list.filter((r) => r.needSchoolCart);

  const STATUS_ORDER = { finalized: 0, in_progress: 1, not_started: 2 };
  const dir = sortDir.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let cmp = 0;
    if (sortKey.value === 'progress') {
      cmp = (a.sectionPercent || 0) - (b.sectionPercent || 0);
    } else if (sortKey.value === 'status') {
      cmp = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
    } else if (sortKey.value === 'sections') {
      cmp = (a.reviewedCount || 0) - (b.reviewedCount || 0);
    } else if (sortKey.value === 'views') {
      cmp = (a.tokenClickCount || 0) - (b.tokenClickCount || 0);
    } else if (sortKey.value === 'time') {
      cmp = Number(a.activeSeconds || 0) - Number(b.activeSeconds || 0);
    } else if (sortKey.value === 'activity') {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      cmp = ta - tb;
    } else if (sortKey.value === 'schools') {
      cmp = String(a.schoolNames || '').localeCompare(String(b.schoolNames || ''));
    } else {
      cmp = String(a.providerName || '').localeCompare(String(b.providerName || ''));
    }
    return cmp * dir;
  });
  return list;
});

function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'provider' || key === 'schools' || key === 'status' ? 'asc' : 'desc';
  }
}

function sortArrow(key) {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

function sortColClass(key) {
  return { 'th-sort--active': sortKey.value === key };
}

function statusLabel(s) {
  if (s === 'finalized') return 'Completed';
  if (s === 'in_progress') return 'In progress';
  return 'Not started';
}

function sectionTitle(key) {
  return SECTION_META.find((m) => m.key === key)?.shortTitle || key;
}

function rowSectionKeys(row) {
  if (Array.isArray(row?.sectionKeys) && row.sectionKeys.length) return row.sectionKeys;
  return sectionKeys;
}

function sectionDotClass(row, key) {
  const sec = (row.sections || []).find((s) => s.sectionKey === key);
  if (sec?.completed) return 'dot--done';
  if (sec?.reviewed) return 'dot--reviewed';
  return 'dot--empty';
}

function formatDt(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function primaryToken(row) {
  const tokens = row?.tokens || [];
  return tokens.find((t) => !t.locked_at) || tokens[0] || null;
}

function linkFor(row) {
  const t = primaryToken(row);
  return t?.token ? publicProviderYearUpdateUrl(t.token, props.organizationSlug) : '';
}

function canPushProvider(row) {
  if (!row || !campaign.value.isEnabled) return false;
  if (row.status === 'finalized') return false;
  if (row.isPushed) return false;
  return Boolean(linkFor(row));
}

function pushTitle(row) {
  if (!campaign.value.isEnabled) return 'Enable Provider Fall Update first';
  if (row?.status === 'finalized') return 'Already complete — provider no longer sees Year Update';
  if (row?.isPushed) return 'Already pushed — provider sees Year Update on My Dashboard';
  if (!linkFor(row)) return 'Get link first, then push to this provider';
  return 'Show Year Update on this provider’s My Dashboard';
}

function canMarkComplete(row) {
  if (!row || !campaign.value.isEnabled) return false;
  if (row.status === 'finalized') return false;
  return Boolean(row.isPushed || row.cycleId || row.status === 'in_progress');
}

function markCompleteTitle(row) {
  if (row?.status === 'finalized') return 'Already marked complete';
  if (!canMarkComplete(row)) return 'Push or start this provider before marking complete';
  return 'Mark complete and remove from My Dashboard / splash';
}

async function ensureLink(row) {
  if (!row || linkFor(row)) return linkFor(row);
  if (!campaign.value.isEnabled) return '';
  linkBusyId.value = row.providerUserId;
  error.value = '';
  try {
    await api.post('/provider-year-update/tokens', {
      agencyId: Number(props.agencyId),
      providerUserId: Number(row.providerUserId),
      schoolYear: schoolYear.value,
    });
    await load();
    const refreshed = rows.value.find((r) => r.providerUserId === row.providerUserId) || row;
    if (selectedRow.value?.providerUserId === row.providerUserId) selectedRow.value = refreshed;
    return linkFor(refreshed);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to generate link';
    return '';
  } finally {
    linkBusyId.value = null;
  }
}

async function copyLink(row) {
  if (!row) return;
  let url = linkFor(row);
  if (!url) url = await ensureLink(row);
  if (!url) return;
  const ok = await copyTextToClipboard(url);
  pushFlash.value = ok ? `Copied link for ${row.providerName}` : 'Could not copy — select the link manually.';
  setTimeout(() => {
    pushFlash.value = '';
  }, 2500);
}

async function selectRow(row) {
  selectedRow.value = row;
}

async function toggleMarkSent(row) {
  const t = primaryToken(row);
  if (!t?.id) return;
  const sent = !row.markedSent;
  await api.patch(`/provider-year-update/tokens/${t.id}/mark-sent`, { sent });
  row.markedSent = sent;
  if (t) t.marked_sent_at = sent ? new Date().toISOString() : null;
}

async function pushOneProvider(row) {
  if (!row || !canPushProvider(row)) return;
  pushBusyId.value = row.providerUserId;
  error.value = '';
  pushFlash.value = '';
  try {
    const res = await api.post(`/provider-year-update/providers/${row.providerUserId}/push`, {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = res.data?.alreadyPushed
      ? `${row.providerName} was already pushed.`
      : `Pushed Year Update to ${row.providerName}.`;
    await load();
    setTimeout(() => {
      pushFlash.value = '';
    }, 2500);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Push failed';
  } finally {
    pushBusyId.value = null;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/provider-year-update/report', {
      params: { agencyId: props.agencyId, schoolYear: schoolYear.value },
    });
    rows.value = res.data?.providers || [];
    summary.value = res.data?.summary || {};
    campaign.value = res.data?.campaign || { status: 'draft', isEnabled: false, isPushed: false };
    if (selectedRow.value) {
      selectedRow.value =
        rows.value.find((r) => r.providerUserId === selectedRow.value.providerUserId) || null;
    } else if (props.highlightCycleId) {
      const target = rows.value.find((r) => Number(r.cycleId) === props.highlightCycleId);
      if (target) {
        selectedRow.value = target;
        // Scroll the highlighted row into view after the next render tick
        import('vue').then(({ nextTick }) =>
          nextTick(() => {
            const el = document.querySelector(`tr[data-cycle-id="${props.highlightCycleId}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          })
        );
      }
    }
    await loadNeeds();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load report';
  } finally {
    loading.value = false;
  }
}

async function enableYearUpdate() {
  campaignBusy.value = true;
  error.value = '';
  try {
    await api.post('/provider-year-update/campaign/enable', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = campaign.value.isDisabled
      ? 'Provider Fall Update re-enabled.'
      : 'Provider Fall Update enabled.';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Enable failed';
  } finally {
    campaignBusy.value = false;
  }
}

async function disableYearUpdate() {
  if (campaignBusy.value || campaign.value.isDisabled) return;
  if (
    !window.confirm(
      `Archive Provider Fall Update for ${schoolYear.value}? This year becomes view-only, and ${nextYearHint()} opens as the current Fall Update.`
    )
  ) {
    return;
  }
  campaignBusy.value = true;
  error.value = '';
  try {
    await api.post('/provider-year-update/campaign/disable', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = 'This school year is archived. The next Provider Fall Update is now the live year.';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Disable failed';
  } finally {
    campaignBusy.value = false;
  }
}

async function markComplete(row) {
  if (!row || !canMarkComplete(row)) return;
  if (
    !window.confirm(
      `Mark ${row.providerName} complete? They will no longer see Provider Fall Update on My Dashboard.`
    )
  ) {
    return;
  }
  completeBusyId.value = row.providerUserId;
  error.value = '';
  try {
    await api.post(`/provider-year-update/providers/${row.providerUserId}/mark-complete`, {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = `Marked ${row.providerName} complete.`;
    await load();
    setTimeout(() => {
      pushFlash.value = '';
    }, 2500);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Mark complete failed';
  } finally {
    completeBusyId.value = null;
  }
}

async function pushToProviders() {
  campaignBusy.value = true;
  error.value = '';
  pushFlash.value = '';
  try {
    const res = await api.post('/provider-year-update/campaign/push', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    pushFlash.value = `Pushed to ${res.data?.providersReady || 0} providers (${res.data?.tokensCreated || 0} new links).`;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Push failed';
  } finally {
    campaignBusy.value = false;
  }
}

function exportCsv() {
  const headers = [
    'Provider',
    'Email',
    'Schools',
    'Status',
    'Progress %',
    'Clicks',
    'Time in flow (seconds)',
    'Time estimated',
    'Last activity',
    'Need school cart',
    'Materials notes',
    'Link',
  ];
  const lines = [headers.join(',')];
  for (const r of filteredRows.value) {
    const cells = [
      r.providerName,
      r.email,
      r.schoolNames,
      r.status,
      r.sectionPercent,
      r.tokenClickCount,
      r.activeSeconds || 0,
      r.activeSecondsIsInferred ? 'yes' : 'no',
      r.lastActivityAt || '',
      r.needSchoolCart ? 'yes' : 'no',
      r.materialsNotes || '',
      linkFor(r),
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`);
    lines.push(cells.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `provider-year-update-${schoolYear.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

watch(
  () => props.agencyId,
  () => load()
);

onMounted(load);
</script>

<style scoped>
.pyu-admin {
  width: 100%;
  max-width: none;
  padding: 0 0 2rem;
  box-sizing: border-box;
}
.pyu-admin__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.pyu-admin__head h1,
.pyu-admin__head .pyu-admin__title {
  margin: 0 0 4px;
  color: #0c4a6e;
  font-size: 1.5rem;
}
.pyu-admin__head h2 {
  margin: 0 0 4px;
  color: #0c4a6e;
}
.pyu-admin__head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pyu-admin__campaign {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
  margin-bottom: 16px;
}
.pyu-admin__campaign-status {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.pyu-admin__campaign-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn-push {
  background: #0c4a6e;
  color: #fff;
  border: none;
}
.btn-push:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-complete {
  background: #166534;
  color: #fff;
  border: none;
}
.btn-complete:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pyu-admin__row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #e2e8f0;
}
.pill--draft { background: #e2e8f0; }
.pill--enabled { background: #fef3c7; color: #92400e; }
.pill--pushed { background: #dcfce7; color: #166534; }
.pill--disabled { background: #fee2e2; color: #991b1b; }
.pill--not_started { background: #e2e8f0; }
.pill--in_progress { background: #dbeafe; color: #1e40af; }
.pill--finalized { background: #dcfce7; color: #166534; }
.pyu-admin__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.metric {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
}
.metric__label {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}
.metric strong {
  font-size: 1.25rem;
}
.pyu-admin__workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.pyu-admin__workspace.has-detail {
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
}
.pyu-admin__filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  align-items: center;
}
.pyu-admin__input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  min-width: 200px;
}
.pyu-admin__table-wrap {
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.pyu-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.th-sort {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.th-sort:hover {
  background: #f0f4f8;
  color: #334155;
}
.th-sort--active {
  color: #2563eb;
  background: #eff6ff;
}
.sort-arrow {
  display: inline-block;
  margin-left: 4px;
  font-size: 0.65rem;
  opacity: 0.55;
  vertical-align: middle;
}
.th-sort--active .sort-arrow {
  opacity: 1;
}
.pyu-admin__table th,
.pyu-admin__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: top;
}
.pyu-admin__table tbody tr {
  cursor: pointer;
}
.pyu-admin__table tbody tr:hover,
.pyu-admin__table tbody tr.selected {
  background: #f8fafc;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 3px;
  background: #cbd5e1;
}
.dot--done { background: #16a34a; }
.dot--reviewed { background: #2563eb; }
.dot--empty { background: #cbd5e1; }
.pyu-admin__detail {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}
.detail-block {
  margin-top: 14px;
}
.detail-block ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.link-box {
  font-size: 0.8rem;
  word-break: break-all;
  background: #f8fafc;
  padding: 8px;
  border-radius: 8px;
}
.success-banner {
  margin: 10px 0 0;
  color: #166534;
  background: #dcfce7;
  padding: 8px 10px;
  border-radius: 8px;
}
.error-banner {
  margin-bottom: 12px;
  color: #991b1b;
  background: #fee2e2;
  padding: 8px 10px;
  border-radius: 8px;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
}
.small { font-size: 0.8rem; }
.muted { color: #64748b; }
.pyu-admin__needs {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
  margin-bottom: 16px;
}
.pyu-admin__needs-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.pyu-admin__needs-head h3 {
  margin: 0 0 4px;
  color: #0c4a6e;
}
.pyu-admin__needs-form {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) minmax(140px, 1fr) 90px;
  gap: 10px;
  align-items: end;
  margin-bottom: 14px;
}
.pyu-admin__needs-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}
.pyu-admin__needs-form input,
.pyu-admin__needs-form select,
.pyu-admin__needs-form textarea {
  font-weight: 400;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
}
.pyu-admin__days {
  grid-column: 1 / -1;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.pyu-admin__days legend {
  padding: 0 4px;
  font-size: 0.78rem;
  color: #64748b;
}
.pyu-admin__needs-notes {
  grid-column: 1 / -2;
}
.pyu-admin__needs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.pyu-admin__need-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}
.pyu-admin__need-top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.pyu-admin__need-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.pill--need-open { background: #dcfce7; color: #166534; }
.pill--need-closed { background: #fee2e2; color: #991b1b; }
.pill--need-filled { background: #dbeafe; color: #1e40af; }
.pill--app-pending { background: #fef3c7; color: #92400e; }
.pill--app-approved { background: #dcfce7; color: #166534; }
.pill--app-denied { background: #fee2e2; color: #991b1b; }
.pill--app-withdrawn { background: #e2e8f0; color: #475569; }
.pyu-admin__apps {
  margin-top: 10px;
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
}
.pyu-admin__apps ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pyu-admin__apps li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}
@media (max-width: 960px) {
  .pyu-admin__workspace.has-detail {
    grid-template-columns: 1fr;
  }
  .pyu-admin__needs-form {
    grid-template-columns: 1fr;
  }
  .pyu-admin__needs-notes {
    grid-column: auto;
  }
}
</style>
