<template>
  <div class="ann-hub">
    <header class="ann-hub__header">
      <div>
        <h1>Splashes &amp; Announcements</h1>
        <p class="muted">Create in-app banners and splashes, track engagement, and review the birthday / anniversary queue.</p>
      </div>
      <div class="ann-hub__actions">
        <button type="button" class="btn btn-primary" @click="typeChooserOpen = true">+ New Announcement</button>
      </div>
    </header>

    <div v-if="typeChooserOpen" class="ann-modal-overlay" @click.self="typeChooserOpen = false">
      <div class="ann-modal" role="dialog" aria-modal="true" aria-labelledby="ann-type-chooser-title">
        <h2 id="ann-type-chooser-title">What do you want to create?</h2>
        <p class="muted">Choose a delivery format, then fill in the details.</p>
        <div class="ann-modal__choices">
          <button type="button" class="ann-modal__choice" @click="chooseComposeType('announcement')">
            <strong>Announcement</strong>
            <span>Scrolling in-app banner</span>
          </button>
          <button type="button" class="ann-modal__choice" @click="chooseComposeType('splash')">
            <strong>Splash</strong>
            <span>Full-screen modal on login / dashboard</span>
          </button>
        </div>
        <button type="button" class="btn btn-secondary" @click="typeChooserOpen = false">Cancel</button>
      </div>
    </div>

    <div v-if="!agencyId" class="error">Select an agency to manage announcements.</div>
    <div v-else-if="loading && !items.length" class="loading">Loading announcements…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <section class="ann-quick">
        <div class="ann-quick__head">
          <h3>Quick Announcement / Splash</h3>
          <button type="button" class="btn btn-primary btn-sm" @click="quickOpen = !quickOpen">
            {{ quickOpen ? 'Collapse' : 'Expand' }}
          </button>
        </div>
        <div v-if="quickOpen" class="ann-quick__body">
          <div class="ann-form-grid">
            <label>
              <span>Type</span>
              <select v-model="form.displayType" class="filter-select">
                <option value="announcement">Announcement</option>
                <option value="splash">Splash</option>
              </select>
            </label>
            <label>
              <span>Audience</span>
              <select v-model="form.audience" class="filter-select">
                <option v-for="opt in audienceOptions" :key="`q-aud-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label v-if="needsUserPicker">
              <span>User</span>
              <select v-model="form.recipientUserId" class="filter-select">
                <option value="">Select user</option>
                <option v-for="u in recipientUserOptions" :key="`q-user-${u.id}`" :value="String(u.id)">{{ u.label }}</option>
              </select>
            </label>
            <label>
              <span>Starts</span>
              <input v-model="form.startsAt" type="datetime-local" class="filter-input" />
            </label>
            <label>
              <span>Ends</span>
              <input v-model="form.endsAt" type="datetime-local" class="filter-input" />
            </label>
          </div>
          <div class="ann-quick__row">
            <input v-model="form.title" class="filter-input" maxlength="80" placeholder="Title" />
            <input v-model="form.message" class="filter-input" maxlength="300" placeholder="Message…" />
            <button type="button" class="btn btn-secondary" :disabled="saving" @click="submitForm('draft')">
              {{ saving ? 'Saving…' : 'Save Draft' }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="saving" @click="submitForm('published')">
              {{ saving ? 'Submitting…' : 'Submit' }}
            </button>
          </div>
        </div>
      </section>

      <section class="ann-stats">
        <article class="ann-stat">
          <span>Active Splashes</span>
          <strong>{{ counts.activeSplashes }}</strong>
          <em>currently live</em>
        </article>
        <article class="ann-stat">
          <span>Scheduled</span>
          <strong>{{ counts.scheduled }}</strong>
          <em>upcoming in the next 7 days</em>
        </article>
        <article class="ann-stat">
          <span>Drafts</span>
          <strong>{{ counts.drafts }}</strong>
          <em>not yet scheduled</em>
        </article>
        <article class="ann-stat">
          <span>Viewed Rate</span>
          <strong>{{ counts.viewedRate }}%</strong>
          <em>average over the last 30 days</em>
        </article>
      </section>

      <section class="ann-queue">
        <div class="ann-queue__head">
          <h2>Auto announcements</h2>
          <p class="muted">Birthdays and work anniversaries (first client date) send automatically when enabled in Agency Management.</p>
        </div>
        <div class="ann-queue__grid">
          <div class="ann-queue__card">
            <h3>Birthday queue <span class="ann-chip" :class="queue.birthdayEnabled ? 'is-on' : 'is-off'">{{ queue.birthdayEnabled ? 'On' : 'Off' }}</span></h3>
            <ul v-if="queue.birthdays?.length">
              <li v-for="p in queue.birthdays" :key="`b-${p.id}`">
                <strong>{{ p.fullName }}</strong>
                <span>{{ formatQueueDate(p.nextOn) }}</span>
              </li>
            </ul>
            <p v-else class="muted">No birthdays in the next {{ queue.daysAhead || 30 }} days.</p>
          </div>
          <div class="ann-queue__card">
            <h3>Work anniversary queue <span class="ann-chip" :class="queue.anniversaryEnabled ? 'is-on' : 'is-off'">{{ queue.anniversaryEnabled ? 'On' : 'Off' }}</span></h3>
            <ul v-if="queue.anniversaries?.length">
              <li v-for="p in queue.anniversaries" :key="`a-${p.id}`">
                <strong>{{ p.fullName }}</strong>
                <span>{{ formatQueueDate(p.nextOn) }}{{ p.years ? ` · ${p.years} yr` : '' }}</span>
              </li>
            </ul>
            <p v-else class="muted">No work anniversaries in the next {{ queue.daysAhead || 30 }} days.</p>
          </div>
          <div class="ann-queue__card ann-queue__card--flag">
            <h3>Won’t be announced</h3>
            <p class="muted">Providers missing a birthday or first-client date.</p>
            <ul v-if="queue.missing?.length">
              <li v-for="p in queue.missing" :key="`m-${p.id}`">
                <router-link :to="userLink(p.id)">{{ p.fullName }}</router-link>
                <span class="ann-flags">
                  <em v-if="p.missingBirthday">No birthday</em>
                  <em v-if="p.missingAnniversary">No work anniversary</em>
                </span>
              </li>
            </ul>
            <p v-else class="muted">All active providers have both dates on file.</p>
          </div>
        </div>
      </section>

      <div class="ann-layout" :class="{ 'has-side': editorOpen }">
        <div class="ann-main">
          <div class="ann-filters">
            <input v-model="search" class="filter-input" type="search" placeholder="Search announcements…" />
            <select v-model="statusFilter" class="filter-select">
              <option value="">Status</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="draft">Draft</option>
              <option value="expired">Expired</option>
            </select>
            <select v-model="audienceFilter" class="filter-select">
              <option value="">Audience</option>
              <option v-for="opt in audienceOptions" :key="`f-aud-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
            </select>
            <select v-model="typeFilter" class="filter-select">
              <option value="">Type</option>
              <option value="splash">Splash</option>
              <option value="announcement">Announcement</option>
            </select>
          </div>

          <div class="ann-table-wrap">
            <table class="ann-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Delivery</th>
                  <th>Priority</th>
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedItems"
                  :key="row.id"
                  :class="{ 'is-selected': selectedId === row.id }"
                  @click="selectRow(row)"
                >
                  <td>
                    <div class="ann-title">{{ row.title || 'Untitled' }}</div>
                    <div class="muted ann-preview">{{ row.message }}</div>
                  </td>
                  <td>{{ audienceLabel(row) }}</td>
                  <td><span class="ann-status" :class="`is-${row.status}`">{{ statusLabel(row.status) }}</span></td>
                  <td>{{ row.display_type === 'splash' ? 'Splash' : 'Announcement' }}</td>
                  <td>{{ formatDelivery(row) }}</td>
                  <td><span class="ann-priority" :class="`is-${row.priority}`">{{ priorityLabel(row.priority) }}</span></td>
                  <td>{{ row.engagement?.viewedRate || 0 }}% Viewed</td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td colspan="7" class="muted">No announcements match these filters.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ann-pager">
            <span>{{ pageRangeLabel }}</span>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="page <= 1" @click="page -= 1">Prev</button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="page >= pageCount" @click="page += 1">Next</button>
          </div>

          <section class="ann-engagement">
            <h2>Engagement overview</h2>
            <div class="ann-eng-stats">
              <div><span>Impressions</span><strong>{{ engagement.impressions || 0 }}</strong><em>{{ trend(engagement.trends?.impressions) }}</em></div>
              <div><span>Opens</span><strong>{{ engagement.opens || 0 }}</strong><em>{{ trend(engagement.trends?.opens) }}</em></div>
              <div><span>Dismissals</span><strong>{{ engagement.dismissals || 0 }}</strong><em>{{ trend(engagement.trends?.dismissals) }}</em></div>
              <div><span>Viewed rate</span><strong>{{ engagement.viewedRate || 0 }}%</strong><em>{{ trend(engagement.trends?.opens) }}</em></div>
            </div>
            <svg v-if="chartPoints.length" class="ann-chart" viewBox="0 0 640 160" role="img" aria-label="Engagement over time">
              <polyline fill="none" stroke="#94a3b8" stroke-width="2" :points="linePoints('impressions')" />
              <polyline fill="none" stroke="#0d9488" stroke-width="2.5" :points="linePoints('opens')" />
              <polyline fill="none" stroke="#1d4ed8" stroke-width="2" :points="linePoints('acknowledgements')" />
            </svg>
            <p v-else class="muted">Engagement will appear here after staff see splashes and banners.</p>
          </section>
        </div>

        <aside v-if="editorOpen" class="ann-side">
          <div class="ann-side__tabs">
            <button type="button" :class="{ active: sideTab === 'details' }" @click="sideTab = 'details'">Details</button>
            <button type="button" :class="{ active: sideTab === 'preview' }" @click="sideTab = 'preview'">Preview</button>
            <button type="button" :class="{ active: sideTab === 'analytics' }" @click="sideTab = 'analytics'">Analytics</button>
            <button type="button" class="ann-side__close" @click="closeEditor">✕</button>
          </div>

          <div v-if="sideTab === 'details'" class="ann-side__body">
            <h3>{{ form.title || (form.displayType === 'splash' ? 'New splash' : 'New announcement') }}</h3>
            <label>
              <span>Title <em>{{ (form.title || '').length }}/80</em></span>
              <input v-model="form.title" class="filter-input" maxlength="80" />
            </label>
            <label>
              <span>Message <em>{{ (form.message || '').length }}/300</em></span>
              <textarea v-model="form.message" class="filter-input" rows="4" maxlength="300" />
            </label>
            <label>
              <span>Audience</span>
              <select v-model="form.audience" class="filter-select">
                <option v-for="opt in audienceOptions" :key="`s-aud-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label v-if="needsUserPicker">
              <span>User</span>
              <select v-model="form.recipientUserId" class="filter-select">
                <option value="">Select user</option>
                <option v-for="u in recipientUserOptions" :key="`s-user-${u.id}`" :value="String(u.id)">{{ u.label }}</option>
              </select>
            </label>
            <label>
              <span>Delivery method</span>
              <select v-model="form.displayType" class="filter-select">
                <option value="announcement">In-app banner</option>
                <option value="splash">In-app splash (modal)</option>
              </select>
            </label>
            <label>
              <span>Start</span>
              <input v-model="form.startsAt" type="datetime-local" class="filter-input" />
            </label>
            <label>
              <span>End</span>
              <input v-model="form.endsAt" type="datetime-local" class="filter-input" />
            </label>
            <label>
              <span>Priority</span>
              <select v-model="form.priority" class="filter-select">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <p v-if="formError" class="error">{{ formError }}</p>
            <div class="ann-side__actions">
              <button type="button" class="btn btn-secondary" :disabled="saving" @click="submitForm('draft')">Save Draft</button>
              <button type="button" class="btn btn-primary" :disabled="saving" @click="submitForm('published')">Submit</button>
              <button type="button" class="btn btn-secondary" :disabled="saving" @click="sendNow">Send Now</button>
            </div>
            <button
              v-if="form.id"
              type="button"
              class="btn btn-secondary"
              :disabled="saving"
              @click="deleteCurrent"
            >
              Delete
            </button>
          </div>

          <div v-else-if="sideTab === 'preview'" class="ann-side__body">
            <div class="ann-phone">
              <div class="ann-phone__modal">
                <div class="ann-phone__icon" aria-hidden="true">📣</div>
                <h4>{{ form.title || 'Announcement' }}</h4>
                <p>{{ form.message || 'Your message will appear here.' }}</p>
                <button type="button" class="btn btn-primary">Got it</button>
              </div>
            </div>
          </div>

          <div v-else class="ann-side__body">
            <h3>Analytics</h3>
            <p v-if="!selectedRow">Save this item to start collecting engagement.</p>
            <template v-else>
              <ul class="ann-analytics">
                <li>Impressions: {{ selectedRow.engagement?.impressions || 0 }}</li>
                <li>Opens: {{ selectedRow.engagement?.opens || 0 }}</li>
                <li>Dismissals: {{ selectedRow.engagement?.dismissals || 0 }}</li>
                <li>Acknowledged: {{ selectedRow.engagement?.acknowledgements || 0 }}</li>
                <li>Viewed rate: {{ selectedRow.engagement?.viewedRate || 0 }}%</li>
              </ul>
              <h4 class="ann-viewers-title">Users Who Viewed</h4>
              <p v-if="viewersLoading" class="muted">Loading viewers…</p>
              <p v-else-if="!viewers.length" class="muted">No users have viewed this yet.</p>
              <ul v-else class="ann-viewers">
                <li v-for="v in viewers" :key="`viewer-${v.userId}`">
                  <div>
                    <strong>{{ v.fullName }}</strong>
                    <span class="muted">{{ formatViewerTime(v.viewedAt) }}</span>
                  </div>
                  <div class="ann-viewer-flags">
                    <em v-if="v.acknowledgedAt">Acknowledged</em>
                    <em v-else-if="v.dismissedAt">Dismissed</em>
                  </div>
                </li>
              </ul>
            </template>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import {
  ANNOUNCEMENT_AUDIENCE_OPTIONS,
  announcementAudienceLabel,
  needsAnnouncementUserPicker
} from '../../constants/announcementAudiences.js';

const route = useRoute();
const agencyStore = useAgencyStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());
const audienceOptions = ANNOUNCEMENT_AUDIENCE_OPTIONS;

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const formError = ref('');
const items = ref([]);
const counts = ref({ activeSplashes: 0, scheduled: 0, drafts: 0, viewedRate: 0 });
const engagement = ref({ impressions: 0, opens: 0, dismissals: 0, viewedRate: 0, series: [], trends: {} });
const queue = ref({ birthdays: [], anniversaries: [], missing: [], birthdayEnabled: false, anniversaryEnabled: false, daysAhead: 30 });

const search = ref('');
const statusFilter = ref('');
const audienceFilter = ref('');
const typeFilter = ref('');
const page = ref(1);
const pageSize = 8;
const selectedId = ref(null);
const editorOpen = ref(false);
const sideTab = ref('details');
const quickOpen = ref(false);
const typeChooserOpen = ref(false);
const agencyUsers = ref([]);
const viewers = ref([]);
const viewersLoading = ref(false);

const emptyForm = () => {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: null,
    title: '',
    message: '',
    displayType: 'announcement',
    audience: 'everyone',
    recipientUserId: '',
    priority: 'medium',
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(end)
  };
};
const form = ref(emptyForm());
const needsUserPicker = computed(() => needsAnnouncementUserPicker(form.value.audience));

const recipientUserOptions = computed(() => {
  const aid = Number(agencyId.value || 0);
  return (agencyUsers.value || [])
    .filter((u) => {
      if (!aid) return true;
      const ids = Array.isArray(u.agencyIds)
        ? u.agencyIds.map((v) => Number(v)).filter((n) => n > 0)
        : String(u.agency_ids || '')
          .split(',')
          .map((v) => parseInt(String(v).trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
      return !ids.length || ids.includes(aid);
    })
    .map((u) => {
      const id = Number(u.id || 0);
      const name = `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim();
      const email = String(u.email || '').trim();
      return { id, label: name ? `${name}${email ? ` (${email})` : ''}` : (email || `User ${id}`) };
    })
    .filter((u) => u.id > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
});

function toLocalInput(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function userLink(userId) {
  const path = `/admin/users/${userId}`;
  return orgSlug.value ? `/${orgSlug.value}${path}` : path;
}

function audienceLabel(row) {
  const n = Array.isArray(row?.recipient_user_ids) ? row.recipient_user_ids.length : 0;
  return announcementAudienceLabel(row?.audience || 'everyone', n);
}

function statusLabel(s) {
  const v = String(s || '');
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
}

function priorityLabel(p) {
  const v = String(p || 'medium');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatDelivery(row) {
  const d = new Date(row?.starts_at || 0);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatQueueDate(ymd) {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return String(ymd);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatViewerTime(raw) {
  const d = new Date(raw || 0);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function trend(n) {
  const v = Number(n || 0);
  if (!v) return 'vs prior 30 days';
  return `${v > 0 ? '+' : ''}${v}% vs prior 30 days`;
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (items.value || []).filter((row) => {
    if (statusFilter.value && row.status !== statusFilter.value) return false;
    if (audienceFilter.value && row.audience !== audienceFilter.value) return false;
    if (typeFilter.value && row.display_type !== typeFilter.value) return false;
    if (!q) return true;
    const hay = `${row.title || ''} ${row.message || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)));
const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize;
  return filteredItems.value.slice(start, start + pageSize);
});
const pageRangeLabel = computed(() => {
  const total = filteredItems.value.length;
  if (!total) return '0 of 0';
  const start = (page.value - 1) * pageSize + 1;
  const end = Math.min(total, page.value * pageSize);
  return `${start}–${end} of ${total}`;
});

const selectedRow = computed(() => (items.value || []).find((r) => r.id === selectedId.value) || null);

const chartPoints = computed(() => Array.isArray(engagement.value?.series) ? engagement.value.series : []);

function linePoints(key) {
  const rows = chartPoints.value;
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map((r) => Number(r[key] || 0)));
  const w = 640;
  const h = 160;
  return rows.map((r, i) => {
    const x = rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * (w - 16) + 8;
    const y = h - 12 - (Number(r[key] || 0) / max) * (h - 24);
    return `${x},${y}`;
  }).join(' ');
}

async function loadAgencyUsers() {
  if (!agencyId.value) {
    agencyUsers.value = [];
    return;
  }
  try {
    const res = await api.get('/users', { skipGlobalLoading: true });
    agencyUsers.value = Array.isArray(res.data) ? res.data : (res.data?.users || []);
  } catch {
    agencyUsers.value = [];
  }
}

async function loadViewers(announcementId) {
  const id = Number(announcementId || 0);
  if (!agencyId.value || !id) {
    viewers.value = [];
    return;
  }
  viewersLoading.value = true;
  try {
    const res = await api.get(`/agencies/${agencyId.value}/announcements/${id}/viewers`, { skipGlobalLoading: true });
    viewers.value = Array.isArray(res.data?.viewers) ? res.data.viewers : [];
  } catch {
    viewers.value = [];
  } finally {
    viewersLoading.value = false;
  }
}

async function loadAll() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [listRes, hubRes] = await Promise.all([
      api.get(`/agencies/${agencyId.value}/announcements/list`, { skipGlobalLoading: true }),
      api.get(`/agencies/${agencyId.value}/announcements/hub`, { skipGlobalLoading: true })
    ]);
    items.value = Array.isArray(listRes.data) ? listRes.data : [];
    counts.value = hubRes.data?.counts || counts.value;
    engagement.value = hubRes.data?.engagement || engagement.value;
    queue.value = hubRes.data?.queue || queue.value;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load announcements';
  } finally {
    loading.value = false;
  }
}

function chooseComposeType(type) {
  typeChooserOpen.value = false;
  startCompose(type);
}

function startCompose(type) {
  form.value = { ...emptyForm(), displayType: type === 'splash' ? 'splash' : 'announcement' };
  selectedId.value = null;
  editorOpen.value = true;
  sideTab.value = 'details';
  formError.value = '';
  viewers.value = [];
  loadAgencyUsers();
}

function selectRow(row) {
  selectedId.value = row.id;
  editorOpen.value = true;
  sideTab.value = 'details';
  const recipients = Array.isArray(row.recipient_user_ids) ? row.recipient_user_ids : [];
  form.value = {
    id: row.id,
    title: row.title || '',
    message: row.message || '',
    displayType: row.display_type === 'splash' ? 'splash' : 'announcement',
    audience: row.audience || 'everyone',
    recipientUserId: recipients[0] ? String(recipients[0]) : '',
    priority: row.priority || 'medium',
    startsAt: toLocalInput(row.starts_at),
    endsAt: toLocalInput(row.ends_at)
  };
  loadAgencyUsers();
}

function closeEditor() {
  editorOpen.value = false;
  selectedId.value = null;
  form.value = emptyForm();
  viewers.value = [];
}

function payloadFor(status) {
  const audience = form.value.audience || 'everyone';
  const uid = parseInt(String(form.value.recipientUserId || ''), 10);
  const recipientUserIds = audience === 'specific_users' && Number.isFinite(uid) && uid > 0 ? [uid] : [];
  return {
    title: String(form.value.title || '').trim() || null,
    message: String(form.value.message || '').trim(),
    display_type: form.value.displayType,
    audience,
    priority: form.value.priority,
    publish_status: status,
    recipient_user_ids: recipientUserIds,
    starts_at: new Date(form.value.startsAt),
    ends_at: new Date(form.value.endsAt)
  };
}

async function submitForm(status) {
  if (!agencyId.value) return;
  formError.value = '';
  if (status !== 'draft' && !String(form.value.message || '').trim()) {
    formError.value = 'Message is required to submit';
    return;
  }
  if (form.value.audience === 'specific_users' && status !== 'draft') {
    const uid = parseInt(String(form.value.recipientUserId || ''), 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      formError.value = 'Select a user for Specific User audience';
      return;
    }
  }
  saving.value = true;
  try {
    const body = payloadFor(status);
    if (form.value.id) {
      await api.put(`/agencies/${agencyId.value}/announcements/${form.value.id}`, body);
    } else {
      const res = await api.post(`/agencies/${agencyId.value}/announcements`, body);
      form.value.id = res.data?.announcement?.id || null;
    }
    await loadAll();
    if (form.value.id) {
      const next = items.value.find((r) => r.id === form.value.id);
      if (next) selectRow(next);
    }
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Could not save announcement';
  } finally {
    saving.value = false;
  }
}

async function sendNow() {
  const now = new Date();
  form.value.startsAt = toLocalInput(now);
  if (!form.value.endsAt || new Date(form.value.endsAt).getTime() <= now.getTime()) {
    form.value.endsAt = toLocalInput(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  }
  await submitForm('published');
}

async function deleteCurrent() {
  if (!agencyId.value || !form.value.id) return;
  if (!window.confirm('Delete this announcement?')) return;
  saving.value = true;
  try {
    await api.delete(`/agencies/${agencyId.value}/announcements/${form.value.id}`);
    closeEditor();
    await loadAll();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Could not delete';
  } finally {
    saving.value = false;
  }
}

watch([search, statusFilter, audienceFilter, typeFilter], () => { page.value = 1; });
watch(agencyId, () => { loadAll(); loadAgencyUsers(); });
watch([sideTab, selectedId], ([tab, id]) => {
  if (tab === 'analytics' && id) loadViewers(id);
});
onMounted(() => {
  loadAll();
  loadAgencyUsers();
});
</script>

<style scoped>
.ann-hub { max-width: 1400px; margin: 0 auto; padding: 16px 20px 40px; }
.ann-hub__header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
.ann-hub__header h1 { margin: 0 0 4px; font-size: 1.6rem; }
.ann-hub__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ann-quick { border: 1px solid var(--border, #d7dde5); border-radius: 12px; padding: 8px 12px; background: var(--bg, #fff); margin-bottom: 16px; }
.ann-quick__head { display: flex; justify-content: space-between; align-items: center; }
.ann-quick__head h3 { margin: 0; font-size: 14px; font-weight: 700; color: #3d8b74; }
.ann-quick__body { padding: 10px 0 6px; }
.ann-form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
.ann-form-grid label, .ann-side__body label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; }
.ann-quick__row { display: flex; gap: 8px; }
.ann-quick__row .filter-input { flex: 1; }
.ann-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.ann-stat { border: 1px solid var(--border, #d7dde5); border-radius: 12px; padding: 14px 16px; background: var(--bg, #fff); }
.ann-stat span { display: block; color: var(--text-muted, #64748b); font-size: 13px; }
.ann-stat strong { display: block; font-size: 1.8rem; margin: 4px 0; }
.ann-stat em { font-style: normal; color: var(--text-muted, #64748b); font-size: 12px; }
.ann-queue { margin-bottom: 18px; }
.ann-queue__head h2 { margin: 0 0 4px; font-size: 1.1rem; }
.ann-queue__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ann-queue__card { border: 1px solid var(--border, #d7dde5); border-radius: 12px; padding: 12px 14px; background: var(--bg, #fff); }
.ann-queue__card h3 { margin: 0 0 8px; font-size: 14px; display: flex; gap: 8px; align-items: center; }
.ann-queue__card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ann-queue__card li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.ann-queue__card--flag { border-color: #f4c7a5; background: #fffaf5; }
.ann-flags { display: flex; gap: 6px; flex-wrap: wrap; }
.ann-flags em { font-style: normal; font-size: 11px; background: #fee2e2; color: #991b1b; border-radius: 999px; padding: 1px 7px; }
.ann-chip { font-size: 11px; border-radius: 999px; padding: 1px 8px; font-weight: 700; }
.ann-chip.is-on { background: #d1fae5; color: #065f46; }
.ann-chip.is-off { background: #e2e8f0; color: #475569; }
.ann-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.ann-layout.has-side { grid-template-columns: minmax(0, 1fr) 340px; }
.ann-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.ann-filters .filter-input { min-width: 220px; flex: 1; }
.ann-table-wrap { overflow: auto; border: 1px solid var(--border, #d7dde5); border-radius: 12px; background: var(--bg, #fff); }
.ann-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ann-table th, .ann-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border, #edf0f4); vertical-align: top; }
.ann-table tbody tr { cursor: pointer; }
.ann-table tbody tr:hover, .ann-table tbody tr.is-selected { background: #f0fdfa; }
.ann-title { font-weight: 700; }
.ann-preview { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ann-status, .ann-priority { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
.ann-status.is-active { background: #d1fae5; color: #065f46; }
.ann-status.is-scheduled { background: #ccfbf1; color: #0f766e; }
.ann-status.is-draft { background: #e2e8f0; color: #475569; }
.ann-status.is-expired { background: #f1f5f9; color: #64748b; }
.ann-priority.is-high { background: #fee2e2; color: #991b1b; }
.ann-priority.is-medium { background: #ffedd5; color: #9a3412; }
.ann-priority.is-low { background: #dbeafe; color: #1e40af; }
.ann-pager { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 10px 0; font-size: 13px; }
.ann-engagement { margin-top: 18px; border: 1px solid var(--border, #d7dde5); border-radius: 12px; padding: 14px; background: var(--bg, #fff); }
.ann-engagement h2 { margin: 0 0 12px; font-size: 1.05rem; }
.ann-eng-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.ann-eng-stats span { display: block; font-size: 12px; color: var(--text-muted, #64748b); }
.ann-eng-stats strong { font-size: 1.2rem; }
.ann-eng-stats em { display: block; font-style: normal; font-size: 11px; color: #0f766e; }
.ann-chart { width: 100%; height: 160px; }
.ann-side { border: 1px solid var(--border, #d7dde5); border-radius: 12px; background: var(--bg, #fff); position: sticky; top: 12px; }
.ann-side__tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border, #edf0f4); padding: 8px; align-items: center; }
.ann-side__tabs button { border: 0; background: transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: 600; }
.ann-side__tabs button.active { background: #ccfbf1; color: #115e59; }
.ann-side__close { margin-left: auto; }
.ann-side__body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.ann-side__body h3 { margin: 0; }
.ann-side__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.ann-phone { background: #111827; border-radius: 28px; padding: 18px 12px 24px; min-height: 360px; }
.ann-phone__modal { background: #fff; border-radius: 16px; padding: 18px; text-align: center; }
.ann-phone__icon { font-size: 28px; margin-bottom: 8px; }
.ann-analytics { margin: 0; padding-left: 16px; }
.ann-viewers-title { margin: 12px 0 6px; font-size: 14px; }
.ann-viewers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow: auto; }
.ann-viewers li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 8px; border: 1px solid var(--border, #edf0f4); border-radius: 8px; }
.ann-viewers li > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.ann-viewer-flags em { font-style: normal; font-size: 11px; background: #ecfeff; color: #0f766e; border-radius: 999px; padding: 1px 7px; }
.ann-modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 80; padding: 16px;
}
.ann-modal {
  width: min(440px, 100%); background: #fff; border-radius: 14px; padding: 20px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2); display: flex; flex-direction: column; gap: 12px;
}
.ann-modal h2 { margin: 0; font-size: 1.2rem; }
.ann-modal__choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ann-modal__choice {
  border: 1px solid #d7dde5; border-radius: 12px; background: #f8fafc; padding: 14px;
  text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px;
}
.ann-modal__choice:hover { border-color: #0d9488; background: #f0fdfa; }
.ann-modal__choice strong { font-size: 15px; }
.ann-modal__choice span { font-size: 12px; color: #64748b; }
@media (max-width: 1100px) {
  .ann-layout, .ann-stats, .ann-queue__grid, .ann-form-grid, .ann-eng-stats { grid-template-columns: 1fr; }
  .ann-hub__header { flex-direction: column; }
  .ann-modal__choices { grid-template-columns: 1fr; }
}
</style>
