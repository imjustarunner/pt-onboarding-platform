<template>
  <div class="oiq-root">
    <!-- Header -->
    <div class="oiq-header">
      <div class="oiq-header-copy">
        <h1 class="oiq-title">New Intakes</h1>
        <p class="oiq-subtitle">
          Prospective clients from interest forms and office intake awaiting a first provider assignment.
        </p>
      </div>
      <div class="oiq-header-actions">
        <ClientDisplayModeToggle />
        <button class="oiq-btn oiq-btn--ghost" type="button" @click="loadAll" :disabled="loading">
          {{ loading ? 'Loading…' : '↺ Refresh' }}
        </button>
      </div>
    </div>

    <!-- Stats row -->
    <div class="oiq-stats-row">
      <div class="oiq-stat-card">
        <div class="oiq-stat-value">{{ clients.length }}</div>
        <div class="oiq-stat-label">Awaiting assignment</div>
      </div>
      <div class="oiq-stat-card oiq-stat-card--green">
        <div class="oiq-stat-value">{{ recentCount }}</div>
        <div class="oiq-stat-label">Last 7 days</div>
      </div>
      <div v-if="acceptance?.agency" class="oiq-stat-card">
        <div class="oiq-stat-value">{{ acceptance.agency.acceptanceLabel }}</div>
        <div class="oiq-stat-label">Provider acceptance rate</div>
      </div>
      <div v-if="acceptance?.agency" class="oiq-stat-card">
        <div class="oiq-stat-value">{{ acceptance.agency.assignedCount || 0 }}</div>
        <div class="oiq-stat-label">Referred to providers</div>
      </div>
    </div>

    <!-- Referred: Awaiting acceptance -->
    <div class="oiq-referred-section">
      <button type="button" class="oiq-referred-toggle" @click="showReferred = !showReferred">
        <div class="oiq-referred-toggle-left">
          <span class="oiq-referred-label">Referred: Awaiting acceptance</span>
          <span v-if="recentlyReferred.length" class="oiq-referred-count">{{ recentlyReferred.length }}</span>
          <span v-else class="oiq-referred-empty-note">none pending within 30 days</span>
        </div>
        <span class="oiq-referred-caret">{{ showReferred ? '▲' : '▼' }}</span>
      </button>
      <div v-if="showReferred" class="oiq-referred-list">
        <div v-if="!recentlyReferred.length" class="oiq-referred-none">
          No clients are currently awaiting acceptance — all referred clients have been accepted or declined within the review window.
        </div>
        <div v-for="c in recentlyReferred" :key="c.eventId || c.id" class="oiq-referred-row">
          <div class="oiq-referred-name">
            <strong>{{ getClientLabel(c) }}</strong>
            <span class="oiq-pill oiq-pill--type">{{ clientTypeLabel(c.clientType) }}</span>
          </div>
          <div class="oiq-referred-to">
            Referred to <strong>{{ c.providerName || '—' }}</strong>
          </div>
          <div class="oiq-referred-date">{{ formatDate(c.assignedAt) }}</div>
          <a :href="clientProfilePath(c)" class="oiq-referred-open" target="_blank" rel="noopener">Open ↗</a>
        </div>
      </div>
    </div>

    <!-- Search + sort toolbar -->
    <div class="oiq-toolbar">
      <div class="oiq-search-wrap">
        <span class="oiq-search-icon" aria-hidden="true">⌕</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name, age, teen, adult, email, phone, concern…"
          class="oiq-search-input"
        />
        <button v-if="searchQuery" type="button" class="oiq-search-clear" @click="searchQuery = ''">✕</button>
      </div>

      <div class="oiq-sort-wrap">
        <label class="oiq-sort-label">Sort:</label>
        <select v-model="sortField" class="oiq-sort-select">
          <option value="createdAt">Date submitted</option>
          <option value="fullName">Name</option>
          <option value="clientType">Type</option>
          <option value="pathway">Pathway</option>
        </select>
        <button type="button" class="oiq-sort-dir" @click="sortAsc = !sortAsc" :title="sortAsc ? 'Ascending' : 'Descending'">
          {{ sortAsc ? '↑' : '↓' }}
        </button>
      </div>

      <div class="oiq-filter-wrap">
        <select v-model="filterType" class="oiq-sort-select">
          <option value="">All types</option>
          <option value="clinical">Office / Clinical</option>
          <option value="learning">Learning</option>
          <option value="basic_nonclinical">Coaching / Consulting</option>
        </select>
      </div>
    </div>

    <!-- Error / empty -->
    <div v-if="error" class="oiq-banner oiq-banner--warn">{{ error }}</div>
    <div v-else-if="!loading && filtered.length === 0" class="oiq-empty">
      <span>{{ searchQuery ? 'No results for your search.' : 'No pending office clients right now.' }}</span>
    </div>

    <!-- Two-column layout: list + detail panel -->
    <div class="oiq-layout" :class="{ 'oiq-layout--split': !!selected }" v-if="filtered.length || loading">
      <!-- List column -->
      <div class="oiq-list" ref="listEl">
        <div
          v-for="c in filtered"
          :key="c.id"
          class="oiq-card"
          :class="{
            'oiq-card--active': selectedId === c.id,
            'oiq-card--compact': selected
          }"
          @click="select(c)"
        >
          <div class="oiq-card-top">
            <div class="oiq-card-initials" :style="initialsStyle(c)">{{ getAvatarLetters(c) }}</div>

            <template v-if="selected">
              <strong class="oiq-card-name oiq-card-name--compact">{{ getClientLabel(c) }}</strong>
            </template>

            <template v-else>
              <div class="oiq-card-info">
                <div class="oiq-card-row-main">
                  <strong class="oiq-card-name">{{ getClientLabel(c) }}</strong>
                  <span class="oiq-pill oiq-pill--type">{{ clientTypeLabel(c.clientType) }}</span>
                  <span class="oiq-pill oiq-pill--pathway">{{ pathwayLabel(c) }}</span>
                  <span
                    v-if="needsClinicalReview(c)"
                    class="oiq-pill oiq-pill--clinical-hold"
                    title="Safety or relationship flags require clinical review before routine matching"
                  >Clinical review</span>
                  <span v-if="intakeAge(c) != null" class="oiq-inline-age">Age {{ intakeAge(c) }}</span>
                </div>
                <div class="oiq-card-row-details">
                  <span
                    v-if="c.intakePreferences?.presentingConcern || c.adaptiveMeta?.concerns?.length"
                    class="oiq-detail-chip"
                  >
                    {{ c.intakePreferences?.presentingConcern || c.adaptiveMeta?.concerns?.slice(0, 3).join(', ') }}
                  </span>
                  <span v-if="c.contactPhone" class="oiq-detail-chip">{{ c.contactPhone }}</span>
                  <span v-if="c.adaptiveMeta?.respondent?.email" class="oiq-detail-chip">{{ c.adaptiveMeta.respondent.email }}</span>
                  <span v-if="c.intakePreferences?.preferredModality" class="oiq-detail-chip">
                    {{ labelModality(c.intakePreferences.preferredModality) }}
                  </span>
                  <span v-if="c.intakePreferences?.insuranceOrPayment" class="oiq-detail-chip">
                    {{ c.intakePreferences.insuranceOrPayment }}
                  </span>
                </div>
              </div>
              <div class="oiq-card-date">
                <div>{{ formatDate(c.createdAt) }}</div>
                <div class="oiq-card-date-label">submitted</div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Detail panel -->
      <div v-if="selected" class="oiq-detail" role="complementary" aria-label="Client detail">
        <div class="oiq-detail-header">
          <div class="oiq-detail-initials" :style="initialsStyle(selected)">{{ getAvatarLetters(selected) }}</div>
          <div class="oiq-detail-title">
            <h2>{{ getClientLabel(selected) }}</h2>
            <div class="oiq-detail-id">
              <span v-if="selected.identifierCode"># {{ selected.identifierCode }}</span>
              <span class="oiq-pill oiq-pill--type">{{ clientTypeLabel(selected.clientType) }}</span>
              <span class="oiq-pill oiq-pill--pathway">{{ pathwayLabel(selected) }}</span>
              <span
                v-if="needsClinicalReview(selected)"
                class="oiq-pill oiq-pill--clinical-hold"
              >Clinical review</span>
            </div>
          </div>
          <div class="oiq-detail-header-actions">
            <a
              :href="clientProfilePath(selected)"
              class="oiq-open-client"
              title="Open client profile"
              target="_blank"
              rel="noopener"
            >Open ↗</a>
            <button type="button" class="oiq-close-detail" @click="selectedId = null" title="Close">✕</button>
          </div>
        </div>

        <!-- Contact section -->
        <section class="oiq-section">
          <div class="oiq-section-title">Contact</div>
          <div class="oiq-detail-grid">
            <div v-if="selected.contactPhone">
              <span class="oiq-detail-label">Phone</span>
              <a :href="`tel:${selected.contactPhone}`" class="oiq-detail-value">{{ selected.contactPhone }}</a>
            </div>
            <div v-if="selected.adaptiveMeta?.respondent?.email">
              <span class="oiq-detail-label">Email</span>
              <a :href="`mailto:${selected.adaptiveMeta.respondent.email}`" class="oiq-detail-value">{{ selected.adaptiveMeta.respondent.email }}</a>
            </div>
            <div v-if="selected.adaptiveMeta?.respondent?.relationship && selected.adaptiveMeta.whoFor !== 'myself'">
              <span class="oiq-detail-label">Relationship</span>
              <span class="oiq-detail-value">{{ selected.adaptiveMeta.respondent.relationship }}</span>
            </div>
            <div v-if="selected.adaptiveMeta?.birthdate || selected.dateOfBirth">
              <span class="oiq-detail-label">Date of birth</span>
              <span class="oiq-detail-value">{{ formatBirthdate(selected.adaptiveMeta?.birthdate || selected.dateOfBirth) }}</span>
            </div>
            <div v-if="selected.adaptiveMeta?.homeAddress">
              <span class="oiq-detail-label">Home address</span>
              <span class="oiq-detail-value">{{ selected.adaptiveMeta.homeAddress }}</span>
            </div>
          </div>
        </section>

        <!-- Interests & goals -->
        <section class="oiq-section" v-if="selected.adaptiveMeta?.concerns?.length || selected.adaptiveMeta?.accomplishGoal || selected.intakePreferences?.presentingConcern">
          <div class="oiq-section-title">Interests & Goals</div>
          <div v-if="selected.adaptiveMeta?.concerns?.length" class="oiq-chips">
            <span v-for="c in selected.adaptiveMeta.concerns" :key="c" class="oiq-chip">{{ c }}</span>
          </div>
          <p v-if="selected.adaptiveMeta?.accomplishGoal" class="oiq-detail-text">
            <strong>Goals:</strong> {{ selected.adaptiveMeta.accomplishGoal }}
          </p>
          <p v-if="selected.intakePreferences?.presentingConcern" class="oiq-detail-text">
            <strong>Concern:</strong> {{ selected.intakePreferences.presentingConcern }}
          </p>
          <p v-if="selected.adaptiveMeta?.notes" class="oiq-detail-text">
            <strong>Notes:</strong> {{ selected.adaptiveMeta.notes }}
          </p>
        </section>

        <!-- Preferences -->
        <section class="oiq-section" v-if="hasPreferences(selected)">
          <div class="oiq-section-title">Preferences</div>
          <div class="oiq-detail-grid">
            <div v-if="selected.intakePreferences?.preferredModality">
              <span class="oiq-detail-label">Format</span>
              <span class="oiq-detail-value">{{ labelModality(selected.intakePreferences.preferredModality) }}</span>
            </div>
            <div v-if="selected.intakePreferences?.preferredTimeOfDay">
              <span class="oiq-detail-label">Time of day</span>
              <span class="oiq-detail-value">{{ labelTime(selected.intakePreferences.preferredTimeOfDay) }}</span>
            </div>
            <div v-if="selected.intakePreferences?.preferredDays?.length">
              <span class="oiq-detail-label">Days</span>
              <span class="oiq-detail-value">{{ selected.intakePreferences.preferredDays.join(', ') }}</span>
            </div>
            <div v-if="selected.intakePreferences?.insuranceOrPayment">
              <span class="oiq-detail-label">Insurance / payment</span>
              <span class="oiq-detail-value">{{ selected.intakePreferences.insuranceOrPayment }}</span>
            </div>
          </div>
        </section>

        <!-- Submission info -->
        <section class="oiq-section">
          <div class="oiq-section-title">Submission</div>
          <div class="oiq-detail-grid">
            <div>
              <span class="oiq-detail-label">Submitted</span>
              <span class="oiq-detail-value">{{ formatDate(selected.createdAt) }}</span>
            </div>
            <div>
              <span class="oiq-detail-label">Pathway</span>
              <span class="oiq-detail-value">{{ pathwayLabel(selected) }}</span>
            </div>
            <div>
              <span class="oiq-detail-label">For</span>
              <span class="oiq-detail-value">{{ whoForLabel(selected) }}</span>
            </div>
            <div>
              <span class="oiq-detail-label">Status</span>
              <span class="oiq-detail-value">
                {{ needsClinicalReview(selected) ? 'Needs clinical review before routine matching' : 'Awaiting provider assignment' }}
              </span>
            </div>
          </div>
        </section>

        <!-- Contact notes -->
        <section v-if="selected" class="oiq-section oiq-section--notes">
          <div class="oiq-section-title">Contact notes</div>
          <p class="oiq-convert-hint">
            Internal notes for outreach before a full file is built — calls, voicemails, scheduling attempts.
          </p>
          <div v-if="notesLoadingId === selected.id" class="oiq-notes-muted">Loading notes…</div>
          <ul v-else-if="(notesByClient[selected.id] || []).length" class="oiq-notes-list">
            <li v-for="n in notesByClient[selected.id]" :key="n.id" class="oiq-note-item">
              <div class="oiq-note-meta">
                <strong>{{ n.author_name || 'Team' }}</strong>
                <span>{{ formatDate(n.created_at) }}</span>
                <span v-if="n.is_internal_only" class="oiq-pill">Internal</span>
              </div>
              <p class="oiq-note-body">{{ n.message }}</p>
            </li>
          </ul>
          <p v-else class="oiq-notes-muted">No contact notes yet.</p>
          <textarea
            v-model="noteDrafts[selected.id]"
            class="oiq-note-input"
            rows="3"
            placeholder="Add a contact note (call outcome, next step, etc.)"
          />
          <button
            type="button"
            class="oiq-btn oiq-btn--ghost"
            :disabled="notesSavingId === selected.id || !String(noteDrafts[selected.id] || '').trim()"
            @click="saveContactNote(selected)"
          >
            {{ notesSavingId === selected.id ? 'Saving…' : 'Save contact note' }}
          </button>
        </section>

        <!-- Assign + actions -->
        <section class="oiq-section oiq-section--assign">
          <div class="oiq-section-title">Assign to provider</div>
          <div class="oiq-assign-row">
            <select v-model="assignSelections[selected.id]" class="oiq-select">
              <option value="">Select provider…</option>
              <option v-for="p in providerOptions" :key="p.id" :value="String(p.id)">
                {{ p.first_name }} {{ p.last_name }}
              </option>
            </select>
            <button
              type="button"
              class="oiq-btn oiq-btn--primary"
              :disabled="!assignSelections[selected.id] || assigningId === selected.id"
              @click="assign(selected)"
            >
              {{ assigningId === selected.id ? 'Assigning…' : 'Assign provider' }}
            </button>
          </div>
          <div v-if="isProspectivePathway(selected)" class="oiq-convert-section">
            <p class="oiq-convert-hint">
              Email a full intake link that opens with their interest-form details already filled in.
            </p>
            <div class="oiq-convert-actions">
              <button
                type="button"
                class="oiq-btn oiq-btn--primary"
                :disabled="convertingId === selected.id"
                @click="convertToFull(selected, true)"
              >
                {{ convertingId === selected.id ? 'Sending…' : 'Email full intake link' }}
              </button>
              <button
                type="button"
                class="oiq-btn oiq-btn--ghost"
                :disabled="convertingId === selected.id"
                @click="convertToFull(selected, false)"
              >
                Prepare link only
              </button>
            </div>
            <p v-if="conversionMessages[selected.id]" class="oiq-convert-ok">{{ conversionMessages[selected.id] }}</p>
            <div v-if="conversionLinks[selected.id]" class="oiq-convert-link">
              <a :href="conversionLinks[selected.id]" target="_blank" rel="noopener">Open full intake →</a>
              <button type="button" class="oiq-btn oiq-btn--ghost" @click="copyConversionLink(selected.id)">Copy link</button>
            </div>
          </div>
        </section>

        <!-- Provider acceptance -->
        <div v-if="acceptance?.agency" class="oiq-section oiq-section--acceptance">
          <div class="oiq-section-title">Agency referral acceptance</div>
          <div class="oiq-accept-stats">
            <div><span>Referred</span><strong>{{ acceptance.agency.assignedCount || 0 }}</strong></div>
            <div><span>Accepted</span><strong>{{ acceptance.agency.acceptedCount || 0 }}</strong></div>
            <div><span>Declined</span><strong>{{ acceptance.agency.declinedCount || 0 }}</strong></div>
            <div><span>Rate</span><strong>{{ acceptance.agency.acceptanceLabel }}</strong></div>
          </div>
        </div>
      </div>

      <!-- No selection placeholder - only shown in split mode which won't happen without a selection -->
      
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useClientDisplayMode } from '../../composables/useClientDisplayMode';
import {
  buildIntakeClientSearchContext,
  intakeClientAge,
  matchesQueueSearch
} from '../../utils/clientQueueSearch.js';
import api from '../../services/api';
import ClientDisplayModeToggle from './ClientDisplayModeToggle.vue';

const { getClientLabel, getAvatarLetters } = useClientDisplayMode();

const agencyStore = useAgencyStore();
const route = useRoute();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const loading = ref(false);
const error = ref('');
const clients = ref([]);
const recentlyReferred = ref([]);
const providerOptions = ref([]);
const assignSelections = reactive({});
const assigningId = ref(null);
const convertingId = ref(null);
const conversionLinks = reactive({});
const conversionMessages = reactive({});
const notesByClient = reactive({});
const noteDrafts = reactive({});
const notesLoadingId = ref(null);
const notesSavingId = ref(null);
const acceptance = ref(null);
const selectedId = ref(null);
const listEl = ref(null);
const searchQuery = ref('');
const sortField = ref('createdAt');
const sortAsc = ref(false);
const filterType = ref('');
const showReferred = ref(false);

const selected = computed(() => clients.value.find((c) => c.id === selectedId.value) || null);

const orgSlug = computed(() => String(route.params?.organizationSlug || '').trim());

function clientProfilePath(c) {
  return orgSlug.value ? `/${orgSlug.value}/admin/clients/${c.id}` : `/admin/clients/${c.id}`;
}

function select(c) {
  selectedId.value = c.id;
}

const recentCount = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return clients.value.filter((c) => new Date(c.createdAt).getTime() > cutoff).length;
});

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(v);
  }
}

function formatBirthdate(v) {
  if (!v) return '—';
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function clientTypeLabel(t) {
  if (t === 'clinical') return 'Office / Clinical';
  if (t === 'learning') return 'Learning';
  if (t === 'basic_nonclinical') return 'Coaching / Consulting';
  return t || '—';
}

function pathwayLabel(c) {
  if (c.pathway === 'quick_prospective' || c.source === 'ADAPTIVE_QUICK_PROSPECTIVE') return 'Quick Prospective';
  if (c.source === 'PUBLIC_BOOKING_INQUIRY') return 'Booking inquiry';
  if (c.source === 'PUBLIC_OFFICE_INTAKE') return 'Office intake';
  return c.source || '—';
}

function needsClinicalReview(c) {
  return !!(
    c?.adaptiveMeta?.needsClinicalReview
    || c?.adaptiveMeta?.clinicalSafetyAlert
    || c?.intakePreferences?.needsClinicalReview
    || c?.intakePreferences?.clinicalSafetyAlert
  );
}

function whoForLabel(c) {
  const who = c.adaptiveMeta?.whoFor;
  if (who === 'myself' || !who) return 'Self';
  if (who === 'child') return 'Child / dependent';
  if (who === 'couple') return 'Couple';
  if (who === 'family') return 'Family';
  if (who === 'legal') return 'Legal representative';
  return String(who).replace(/_/g, ' ');
}

function labelModality(v) {
  const map = { in_person: 'In person', virtual: 'Virtual', either: 'No preference' };
  return map[v] || v;
}

function labelTime(v) {
  const map = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', flexible: 'Flexible' };
  return map[v] || v;
}

function hasPreferences(c) {
  const p = c.intakePreferences;
  return p && (p.preferredModality || p.preferredTimeOfDay || p.preferredDays?.length || p.insuranceOrPayment);
}

function isProspectivePathway(c) {
  return (
    c.pathway === 'quick_prospective' ||
    ['ADAPTIVE_QUICK_PROSPECTIVE', 'PUBLIC_OFFICE_INTAKE', 'PUBLIC_BOOKING_INQUIRY'].includes(c.source)
  );
}

const HUE_MAP = ['#2d6a4f', '#1d6b9b', '#7c3aed', '#b45309', '#0f766e', '#9333ea', '#b91c1c'];

function initialsStyle(c) {
  const idx = Math.abs(String(c.id || c.initials || c.fullName || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % HUE_MAP.length;
  return { background: HUE_MAP[idx] };
}

const searchTokens = computed(() => {
  return String(searchQuery.value || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
});

function intakeAge(c) {
  return intakeClientAge(c);
}

function matchesSearch(c) {
  if (!searchTokens.value.length) return true;
  const ctx = buildIntakeClientSearchContext(c);
  return matchesQueueSearch(ctx.haystack, searchTokens.value, {
    ageBands: ctx.ageBands,
    numericAges: ctx.numericAges
  });
}

const filtered = computed(() => {
  let list = clients.value;
  if (filterType.value) list = list.filter((c) => c.clientType === filterType.value);
  if (searchTokens.value.length) list = list.filter(matchesSearch);
  list = [...list].sort((a, b) => {
    let va = a[sortField.value] || '';
    let vb = b[sortField.value] || '';
    if (sortField.value === 'createdAt') {
      va = new Date(va).getTime() || 0;
      vb = new Date(vb).getTime() || 0;
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }
    if (va < vb) return sortAsc.value ? -1 : 1;
    if (va > vb) return sortAsc.value ? 1 : -1;
    return 0;
  });
  return list;
});

async function loadProviders() {
  try {
    const res = await api.get('/users');
    const all = res.data || [];
    providerOptions.value = all
      .filter((u) => ['provider', 'provider_plus'].includes(String(u.role || '').toLowerCase()))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  } catch {
    providerOptions.value = [];
  }
}

async function loadAcceptance() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/client-exchange/acceptance-metrics', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    acceptance.value = res.data || null;
  } catch {
    acceptance.value = null;
  }
}

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/client-exchange/pending-office-clients', { params: { agencyId: agencyId.value } });
    clients.value = res.data?.clients || [];
    // Do not auto-select; user clicks to open detail
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending clients';
  } finally {
    loading.value = false;
  }
}

async function loadRecentlyReferred() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/client-exchange/recently-referred', { params: { agencyId: agencyId.value } });
    recentlyReferred.value = res.data?.clients || [];
  } catch {
    recentlyReferred.value = [];
  }
}

async function loadAll() {
  await Promise.all([load(), loadAcceptance(), loadRecentlyReferred()]);
}

async function assign(client) {
  const providerId = assignSelections[client.id];
  if (!providerId) return;
  assigningId.value = client.id;
  try {
    await api.put(`/clients/${client.id}/provider`, { provider_id: Number(providerId) });
    await loadAll();
    selectedId.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to assign provider';
  } finally {
    assigningId.value = null;
  }
}

async function convertToFull(client, sendEmail = true) {
  if (!agencyId.value) return;
  convertingId.value = client.id;
  error.value = '';
  conversionMessages[client.id] = '';
  try {
    const res = await api.post('/client-exchange/adaptive-convert', {
      clientId: client.id,
      agencyId: agencyId.value,
      sendEmail: !!sendEmail
    });
    const path = res.data?.inviteUrl || res.data?.intakeUrlPath;
    if (path) conversionLinks[client.id] = path;
    if (res.data?.emailed) {
      conversionMessages[client.id] = `Intake link emailed to ${res.data.emailedTo}.`;
      await loadContactNotes(client.id);
    } else {
      conversionMessages[client.id] = 'Intake link ready — copy or open below.';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to prepare full intake link';
  } finally {
    convertingId.value = null;
  }
}

function copyConversionLink(clientId) {
  const url = conversionLinks[clientId];
  if (!url) return;
  navigator.clipboard?.writeText(url).then(() => {
    conversionMessages[clientId] = 'Link copied to clipboard.';
  }).catch(() => {});
}

async function loadContactNotes(clientId) {
  if (!clientId) return;
  notesLoadingId.value = clientId;
  try {
    const { data } = await api.get(`/clients/${clientId}/notes`);
    notesByClient[clientId] = Array.isArray(data) ? data : (data?.notes || []);
  } catch {
    notesByClient[clientId] = notesByClient[clientId] || [];
  } finally {
    notesLoadingId.value = null;
  }
}

async function saveContactNote(client) {
  const message = String(noteDrafts[client.id] || '').trim();
  if (!message) return;
  notesSavingId.value = client.id;
  error.value = '';
  try {
    await api.post(`/clients/${client.id}/notes`, {
      message,
      is_internal_only: true,
      category: 'administrative',
      urgency: 'low'
    });
    noteDrafts[client.id] = '';
    await loadContactNotes(client.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save contact note';
  } finally {
    notesSavingId.value = null;
  }
}

watch(selectedId, (id) => {
  if (id && !notesByClient[id]) loadContactNotes(id);
});

onMounted(() => {
  loadAll();
  loadProviders();
});
</script>

<style scoped>
/* ── Root ──────────────────────────────────────────── */
.oiq-root {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

/* ── Header ────────────────────────────────────────── */
.oiq-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.oiq-title {
  font-size: 1.45rem;
  font-weight: 700;
  margin: 0 0 0.2rem;
}
.oiq-subtitle {
  margin: 0;
  color: var(--text-secondary, #64748b);
  font-size: 0.85rem;
}
.oiq-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* ── Stats row ─────────────────────────────────────── */
.oiq-stats-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.oiq-stat-card {
  flex: 1 1 120px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  min-width: 0;
}
.oiq-stat-card--green {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.oiq-stat-value {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--primary, #2d6a4f);
  line-height: 1;
}
.oiq-stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
  margin-top: 0.2rem;
}

/* ── Toolbar ───────────────────────────────────────── */
.oiq-toolbar {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  flex-wrap: wrap;
}
.oiq-search-wrap {
  flex: 1 1 200px;
  position: relative;
  display: flex;
  align-items: center;
}
.oiq-search-icon {
  position: absolute;
  left: 0.65rem;
  color: var(--text-secondary, #9ca3af);
  font-size: 1rem;
  pointer-events: none;
}
.oiq-search-input {
  width: 100%;
  padding: 0.45rem 2rem 0.45rem 2.1rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--card-bg, #fff);
}
.oiq-search-input:focus {
  outline: 2px solid var(--primary, #2d6a4f);
  outline-offset: -1px;
  border-color: transparent;
}
.oiq-search-clear {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.85rem;
  padding: 0.2rem;
}
.oiq-sort-wrap,
.oiq-filter-wrap {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.oiq-sort-label {
  font-size: 0.82rem;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}
.oiq-sort-select {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 7px;
  font-size: 0.85rem;
  background: var(--card-bg, #fff);
}
.oiq-sort-dir {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 7px;
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  font-size: 0.9rem;
}

/* ── Banner / empty ────────────────────────────────── */
.oiq-banner { border-radius: 8px; padding: 0.65rem 0.85rem; }
.oiq-banner--warn { background: #fef9c3; color: #713f12; border: 1px solid #fde68a; }
.oiq-empty {
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary, #6b7280);
}

/* ── Two-column layout ─────────────────────────────── */
.oiq-layout {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  overflow: hidden;
  background: var(--card-bg, #fff);
}
.oiq-layout--split {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 500px;
}
@media (max-width: 860px) {
  .oiq-layout--split { grid-template-columns: 1fr; }
}

/* ── List column ───────────────────────────────────── */
.oiq-list {
  overflow-y: auto;
  max-height: 76vh;
  display: flex;
  flex-direction: column;
}
.oiq-layout--split .oiq-list {
  border-right: 1px solid var(--border, #e5e7eb);
  max-height: 76vh;
}
/* In non-split mode (full-width list), cards expand freely */
.oiq-layout:not(.oiq-layout--split) .oiq-card {
  padding: 0.75rem 1rem;
}

/* ── Card ──────────────────────────────────────────── */
.oiq-card {
  padding: 0.85rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--border, #f1f5f9);
  transition: background 0.1s;
}
.oiq-card--compact {
  padding: 0.45rem 0.65rem;
}
.oiq-card:hover { background: #f8fafc; }
.oiq-card--active { background: #f0fdf4 !important; border-left: 3px solid var(--primary, #2d6a4f); }
.oiq-card-top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.oiq-card-initials {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}
.oiq-card--compact .oiq-card-initials {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.68rem;
}
.oiq-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.oiq-card-row-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  min-width: 0;
}
.oiq-card-row-details {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  min-width: 0;
  font-size: 0.78rem;
  color: var(--text-secondary, #64748b);
}
.oiq-detail-chip {
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.oiq-inline-age {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary, #475569);
  background: #f1f5f9;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
}
.oiq-card-name {
  font-size: 0.875rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.oiq-card-name--compact {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
}
.oiq-card-date {
  text-align: right;
  font-size: 0.78rem;
  color: var(--text-secondary, #9ca3af);
  flex-shrink: 0;
}
.oiq-card-date-label {
  font-size: 0.7rem;
  color: var(--text-secondary, #b0bac7);
}

/* ── Pills ─────────────────────────────────────────── */
.oiq-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.5;
}
.oiq-pill--type { background: #eff6ff; color: #1d4ed8; }
.oiq-pill--pathway { background: #ecfdf5; color: #14532d; }
.oiq-pill--clinical-hold { background: #fef3c7; color: #92400e; font-weight: 600; }

/* ── Detail panel ──────────────────────────────────── */
.oiq-detail {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 76vh;
  border-left: 1px solid var(--border, #e5e7eb);
}
.oiq-detail-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--border, #e5e7eb);
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
}
.oiq-detail-initials {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 700;
  flex-shrink: 0;
}
.oiq-detail-title {
  flex: 1;
  min-width: 0;
}
.oiq-detail-title h2 {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0 0 0.2rem;
}
.oiq-detail-id {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.78rem;
  color: var(--text-secondary, #6b7280);
}
.oiq-detail-header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.oiq-open-client {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary, #2d6a4f);
  text-decoration: none;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--primary, #2d6a4f);
  border-radius: 6px;
  transition: background 0.12s;
  white-space: nowrap;
}
.oiq-open-client:hover { background: #f0fdf4; }
.oiq-close-detail {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #9ca3af);
  font-size: 0.9rem;
  padding: 0.2rem 0.3rem;
  line-height: 1;
  border-radius: 4px;
}
.oiq-close-detail:hover { background: #f3f4f6; color: #374151; }

/* ── Sections ──────────────────────────────────────── */
.oiq-section {
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.oiq-section-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #94a3b8);
  margin-bottom: 0.4rem;
}
.oiq-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.45rem;
}
.oiq-detail-label {
  display: block;
  font-size: 0.72rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.1rem;
}
.oiq-detail-value {
  font-size: 0.85rem;
  color: var(--text, #111827);
  word-break: break-word;
}
a.oiq-detail-value {
  color: var(--primary, #2d6a4f);
}
.oiq-detail-text {
  font-size: 0.83rem;
  margin: 0.25rem 0 0;
  line-height: 1.5;
}
.oiq-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.oiq-chip {
  background: #ecfdf5;
  color: #14532d;
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
}

/* ── Assign section ────────────────────────────────── */
.oiq-section--assign { background: #f8fafc; }
.oiq-assign-row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}
.oiq-select {
  flex: 1 1 160px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.88rem;
  background: #fff;
}
.oiq-convert-section {
  margin-top: 0.85rem;
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: 0.85rem;
}
.oiq-convert-hint {
  font-size: 0.82rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.5rem;
}
.oiq-convert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.oiq-convert-ok {
  margin: 0.5rem 0 0;
  font-size: 0.82rem;
  color: #166534;
}
.oiq-convert-link {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.oiq-convert-link a {
  color: var(--primary, #2d6a4f);
}
.oiq-section--notes {
  background: #fafafa;
}
.oiq-notes-list {
  list-style: none;
  margin: 0 0 0.65rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  max-height: 14rem;
  overflow: auto;
}
.oiq-note-item {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
}
.oiq-note-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.25rem;
}
.oiq-note-body {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  white-space: pre-wrap;
}
.oiq-note-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.88rem;
  margin-bottom: 0.5rem;
  resize: vertical;
  background: #fff;
}
.oiq-notes-muted {
  font-size: 0.82rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.55rem;
}

/* ── Acceptance ────────────────────────────────────── */
.oiq-section--acceptance { background: #f0f9ff; }
.oiq-accept-stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.oiq-accept-stats div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.oiq-accept-stats span {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}
.oiq-accept-stats strong {
  font-size: 1rem;
  color: var(--text, #111827);
}

/* ── Buttons ───────────────────────────────────────── */
.oiq-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}
.oiq-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.oiq-btn--primary {
  background: var(--primary, #2d6a4f);
  color: #fff;
  border-color: var(--primary, #2d6a4f);
}
.oiq-btn--primary:not(:disabled):hover { filter: brightness(1.07); }
.oiq-btn--ghost {
  background: transparent;
  color: var(--primary, #2d6a4f);
  border-color: var(--primary, #2d6a4f);
}
.oiq-btn--ghost:not(:disabled):hover { background: #f0fdf4; }

/* ── Recently referred section ─────────────────────── */
.oiq-referred-section {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  background: var(--card-bg, #fff);
}
.oiq-referred-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.65rem 1rem;
  background: #f8fafc;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 0.875rem;
}
.oiq-referred-toggle:hover { background: #f0fdf4; }
.oiq-referred-toggle-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.oiq-referred-label { font-weight: 600; color: var(--text, #111827); }
.oiq-referred-count {
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 0 7px;
  font-size: 11px;
  font-weight: 800;
}
.oiq-referred-empty-note {
  font-size: 0.78rem;
  color: var(--text-secondary, #9ca3af);
  font-weight: 400;
}
.oiq-referred-caret { color: var(--text-secondary, #6b7280); font-size: 0.7rem; }
.oiq-referred-none {
  padding: 0.9rem 1rem;
  font-size: 0.83rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
}
.oiq-referred-list { border-top: 1px solid var(--border, #e5e7eb); }
.oiq-referred-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border, #f1f5f9);
  font-size: 0.88rem;
  flex-wrap: wrap;
}
.oiq-referred-name {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.oiq-referred-to {
  flex: 1 1 160px;
  color: var(--text-secondary, #374151);
}
.oiq-referred-to strong { color: var(--text, #111827); }
.oiq-referred-date {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
}
.oiq-referred-open {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary, #2d6a4f);
  text-decoration: none;
  flex-shrink: 0;
}
</style>
