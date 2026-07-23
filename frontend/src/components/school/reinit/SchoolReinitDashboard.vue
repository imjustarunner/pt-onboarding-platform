<template>
  <div class="cua" :class="{ 'cua--embedded': embedded }" :style="brandStyle">
    <div v-if="loading" class="cua__muted">Loading collaborative update…</div>
    <div v-else-if="error" class="cua__error">{{ error }}</div>

    <template v-else-if="isFinalized && viewMode === 'hub'">
      <SchoolReinitReceipt
        :cycle="cycle"
        :agency="agency"
        :school="school"
        :addendums="addendums"
        :pending-change-count="pendingChangeCount"
        :identity-label="identityBanner || cycle?.finalized_by_display_name || ''"
        :submitting="saving"
        @submit-addendum="onReceiptAddendum"
        @return-portal="onExit"
      />
    </template>

    <template v-else>
      <!-- Identity gate for token guests -->
      <div v-if="needsIdentity" class="cua__identity">
        <h2>Who is making updates?</h2>
        <p class="cua__muted">We’ll record your name on reviews and finalization.</p>
        <label>Your name <input v-model="identityName" type="text" autocomplete="name" /></label>
        <label>Role / title <input v-model="identityTitle" type="text" /></label>
        <button type="button" class="btn btn-primary" :disabled="!identityName.trim()" @click="saveIdentity">Continue</button>
      </div>

      <template v-else>
        <header class="cua__top">
          <div class="cua__brand-block">
            <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="cua__logo" />
            <div v-else class="cua__logo-text">{{ tenantName }}</div>
          </div>
          <div class="cua__title-block">
            <div class="cua__school">{{ schoolName }}</div>
            <h1 class="cua__h1">Collaborative Update &amp; Approval</h1>
            <p class="cua__sub">
              Help us prepare for a successful year together. Review each section, confirm your information, and submit when complete.
            </p>
          </div>
          <div class="cua__user-block">
            <button type="button" class="cua__copy-token" @click="copyShareToken">
              {{ copyFlash ? 'Copied!' : 'Copy Token' }}
            </button>
            <a v-if="embedded || mode === 'staff'" class="cua__help" href="#" @click.prevent="$emit('dismiss-request')">Need help?</a>
            <div class="cua__user-chip">
              <span class="cua__avatar">{{ userInitials }}</span>
              <span>{{ identityBanner || 'Collaborator' }}</span>
            </div>
          </div>
        </header>

        <div class="cua__layout">
          <!-- Sidebar -->
          <aside class="cua__sidebar">
            <div class="cua__progress-label">{{ doneCount }} of {{ sectionMeta.length }} sections complete</div>
            <div class="cua__progress-track" aria-hidden="true">
              <div class="cua__progress-fill" :style="{ width: percentComplete + '%' }" />
            </div>

            <nav class="cua__steps" aria-label="Sections">
              <button
                v-for="(sec, idx) in sectionMeta"
                :key="sec.key"
                type="button"
                class="cua__step"
                :class="{
                  'is-done': isSectionDone(sec.key),
                  'is-active': activeSection === sec.key && viewMode === 'detail',
                  'is-current': !isSectionDone(sec.key) && firstIncompleteKey === sec.key,
                }"
                @click="openSection(sec.key)"
              >
                <span class="cua__step-marker">
                  <span v-if="isSectionDone(sec.key)" class="cua__step-check">✓</span>
                  <span v-else>{{ idx + 1 }}</span>
                </span>
                <span class="cua__step-label">{{ sec.shortTitle }}</span>
              </button>
              <button
                type="button"
                class="cua__step cua__step--finalize"
                :class="{ 'is-disabled': !canFinalize }"
                :disabled="!canFinalize"
                @click="scrollFinalize"
              >
                <span class="cua__step-marker">🔒</span>
                <span class="cua__step-label">Review &amp; Finalize</span>
              </button>
            </nav>

            <div class="cua__exit-box">
              <div class="cua__exit-title">Need to complete later?</div>
              <button type="button" class="cua__exit-btn" @click="onExit">
                Exit to Portal
              </button>
            </div>
          </aside>

          <!-- Main -->
          <main class="cua__main">
            <div class="cua__autosave">
              Your responses are saved automatically as you go. You can return and finish later.
              Changes to existing items will require admin approval.
            </div>

            <!-- Hub grid -->
            <div v-if="viewMode === 'hub'" class="cua__grid">
              <button
                v-for="(sec, idx) in sectionMeta"
                :key="sec.key"
                type="button"
                class="cua__card"
                :class="{
                  'is-done': isSectionDone(sec.key),
                  'is-progress': !isSectionDone(sec.key) && firstIncompleteKey === sec.key,
                  'is-todo': !isSectionDone(sec.key) && firstIncompleteKey !== sec.key,
                }"
                @click="openSection(sec.key)"
              >
                <div class="cua__card-top">
                  <span class="cua__card-icon" v-html="sectionIcon(sec.icon)" />
                  <span class="cua__card-chevron">›</span>
                </div>
                <div class="cua__card-num">{{ idx + 1 }}</div>
                <div class="cua__card-title">{{ sec.title }}</div>
                <div class="cua__card-desc">{{ sec.description }}</div>
                <div class="cua__card-status">
                  <span v-if="isSectionDone(sec.key)" class="status status--done">
                    <span class="dot">✓</span> Completed
                  </span>
                  <span v-else-if="firstIncompleteKey === sec.key" class="status status--progress">
                    <span class="dot" /> In Progress
                  </span>
                  <span v-else class="status status--todo">
                    <span class="dot" /> Not Started
                  </span>
                </div>
              </button>
            </div>

            <!-- Section detail -->
            <div v-else class="cua__detail">
              <button type="button" class="cua__back" @click="viewMode = 'hub'">← All sections</button>
              <h2>{{ sectionTitle(activeSection) }}</h2>
              <p class="cua__muted">{{ sectionHint(activeSection) }}</p>

              <!-- School information -->
              <section v-if="activeSection === 'school_information'" class="cua__section-body">
                <div class="cua__panel">
                  <p><strong>School:</strong> {{ schoolName }}</p>
                  <p v-if="school?.slug || school?.portal_url" class="cua__muted">
                    Portal: {{ school.portal_url || school.slug }}
                  </p>
                  <label class="cua__check">
                    <input v-model="formData.school_information.confirmed" type="checkbox" />
                    School information looks accurate for the upcoming year
                  </label>
                  <label>
                    Notes (optional)
                    <textarea v-model="formData.school_information.notes" rows="2" />
                  </label>
                </div>
              </section>

              <section v-else-if="activeSection === 'school_events'" class="cua__section-body">
                <div class="cua__panel">
                  <label>First day of school
                    <input v-model="formData.school_events.first_day_of_school" type="date" />
                  </label>
                  <p v-if="events?.firstDay" class="cua__muted">Portal record: {{ formatDate(events.firstDay.startsAt) }}</p>
                </div>
                <div class="cua__panel">
                  <h4>Back-to-School event</h4>
                  <label class="cua__check"><input v-model="formData.school_events.bts_partner_invited" type="checkbox" /> {{ tenantName }} is invited</label>
                  <label class="cua__check"><input v-model="formData.school_events.bts_marketing_table" type="checkbox" /> Marketing table can be set up</label>
                  <label class="cua__check"><input v-model="formData.school_events.bts_active_signups" type="checkbox" /> Active sign-ups are permitted</label>
                </div>
                <DynamicQuestions section-key="school_events" :questions="questionsFor('school_events')" v-model="formData.school_events" />
              </section>

              <section v-else-if="activeSection === 'assigned_providers'" class="cua__section-body">
                <ul class="cua__list">
                  <li v-for="p in providers" :key="p.id" class="cua__list-item">
                    <img v-if="p.photoUrl" :src="p.photoUrl" alt="" class="cua__photo" />
                    <div>
                      <strong>{{ p.name }}</strong>
                      <span class="cua__muted">{{ p.dayOfWeek }}{{ p.startTime ? ` · ${p.startTime}` : '' }}</span>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" @click="requestDelete('provider_assignment', p)">Request remove</button>
                  </li>
                </ul>
                <p v-if="!providers.length" class="cua__muted">No provider day assignments on file.</p>
                <label class="cua__check"><input v-model="formData.assigned_providers.same_arrangements" type="checkbox" /> Same arrangements work for the upcoming year</label>
                <label>Notes / requested changes<textarea v-model="formData.assigned_providers.notes" rows="2" /></label>
              </section>

              <section v-else-if="activeSection === 'school_staff'" class="cua__section-body">
                <ul class="cua__list">
                  <li v-for="s in staff" :key="s.id" class="cua__list-item">
                    <div>
                      <strong>{{ s.name }}</strong>
                      <span class="cua__muted">{{ s.title || s.email }}</span>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" @click="requestDelete('school_staff', s)">Request remove</button>
                  </li>
                </ul>
                <div class="cua__panel">
                  <h4>Add staff contact</h4>
                  <div class="cua__fields">
                    <label>Name <input v-model="newStaff.name" type="text" /></label>
                    <label>Email <input v-model="newStaff.email" type="email" /></label>
                    <label>Title <input v-model="newStaff.title" type="text" /></label>
                    <button type="button" class="btn btn-secondary" :disabled="!newStaff.name || !newStaff.email" @click="addStaff">Add (auto-approved)</button>
                  </div>
                </div>
                <label class="cua__check"><input v-model="formData.school_staff.staff_accurate" type="checkbox" /> Staff list looks accurate</label>
              </section>

              <section v-else class="cua__section-body">
                <template v-if="activeSection === 'fall_check_in'">
                  <div class="cua__panel">
                    <h4>Available check-in slots</h4>
                    <p v-if="!checkinSlots.length" class="cua__muted">No preset slots yet — share a preferred time below.</p>
                    <label v-for="slot in checkinSlots" :key="slot.id" class="cua__check">
                      <input v-model="formData.fall_check_in.fall_checkin_slot_id" type="radio" :value="String(slot.id)" />
                      {{ formatSlot(slot) }}
                    </label>
                  </div>
                </template>
                <template v-if="activeSection === 'growth_feedback'">
                  <div class="cua__panel cua__panel--warn">
                    <h4>Annual feedback (please view)</h4>
                    <p class="cua__muted">What should {{ tenantName }} do more or less of? Mark “All good” if you have nothing to add.</p>
                  </div>
                </template>
                <DynamicQuestions
                  :section-key="activeSection"
                  :questions="questionsFor(activeSection)"
                  v-model="formData[activeSection]"
                />
              </section>

              <SectionActions
                :done="isSectionDone(activeSection)"
                :saving="saving"
                @save="saveSection(activeSection, false)"
                @confirm="onConfirmSection(activeSection)"
              />
            </div>

            <!-- Finalize footer -->
            <div ref="finalizeEl" class="cua__finalize">
              <div class="cua__finalize-left">
                <span class="cua__finalize-lock">🔒</span>
                <div>
                  <strong>Finalize &amp; Submit</strong>
                  <p>Complete all sections above to unlock final review and submission.</p>
                </div>
              </div>
              <button
                type="button"
                class="btn cua__finalize-btn"
                :disabled="!canFinalize || saving"
                @click="finalize"
              >
                🔒 Finalize &amp; Submit
              </button>
            </div>
            <p v-if="pendingChangeCount" class="cua__muted" style="margin-top: 8px;">
              {{ pendingChangeCount }} change request(s) pending admin approval (finalize still allowed).
            </p>
          </main>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import {
  SECTION_META,
  logoSrc,
  parseAgencyPalette,
  agencyDisplayName,
  sectionProgressMap,
  loadStoredIdentity,
  storeIdentity,
  publicReinitUrl,
  copyTextToClipboard,
} from '../../../utils/schoolReinit';
import SchoolReinitReceipt from './SchoolReinitReceipt.vue';
import DynamicQuestions from './SchoolReinitDynamicQuestions.vue';
import SectionActions from './SchoolReinitSectionActions.vue';

const props = defineProps({
  mode: { type: String, default: 'staff' }, // staff | token | admin
  token: { type: String, default: null },
  schoolOrganizationId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], default: null },
  embedded: { type: Boolean, default: false },
  initialPayload: { type: Object, default: null },
});

const emit = defineEmits(['finalized', 'dismiss-request', 'loaded']);

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const cycle = ref(null);
const agency = ref(null);
const school = ref(null);
const sections = ref([]);
const providers = ref([]);
const staff = ref([]);
const events = ref(null);
const questions = ref([]);
const checkinSlots = ref([]);
const changeRequests = ref([]);
const addendums = ref([]);
const shareToken = ref(null);
const viewMode = ref('hub'); // hub | detail
const activeSection = ref('school_information');
const identityName = ref('');
const identityTitle = ref('');
const identityConfirmed = ref(false);
const copyFlash = ref(false);
const finalizeEl = ref(null);
const newStaff = reactive({ name: '', email: '', title: '' });

const sectionMeta = SECTION_META;

const formData = reactive({
  school_information: { confirmed: false, notes: '' },
  school_events: {
    first_day_of_school: '',
    bts_partner_invited: false,
    bts_marketing_table: false,
    bts_active_signups: false,
  },
  assigned_providers: { same_arrangements: true, notes: '' },
  school_staff: { staff_accurate: false },
  materials: {},
  needs_assessment: {},
  fall_check_in: {
    fall_checkin_slot_id: '',
    fall_checkin_preferred_week: '',
    fall_checkin_preferred_day: '',
    fall_checkin_preferred_time: '',
  },
  growth_feedback: {},
});

const ICONS = {
  calendar: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  confetti: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l5 5M14 4l-2 4M20 8l-4 2M4 14l4 2M9 20l2-4M16 16l4 4"/><circle cx="12" cy="12" r="3"/></svg>',
  providers: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
  staff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  box: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  heart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
};

const isFinalized = computed(() => String(cycle.value?.status || '') === 'finalized');
const progressMap = computed(() => sectionProgressMap(sections.value));
const doneCount = computed(() => sectionMeta.filter((s) => isSectionDone(s.key)).length);
const percentComplete = computed(() => Math.round((doneCount.value / sectionMeta.length) * 100));
const canFinalize = computed(() => sectionMeta.every((s) => isSectionDone(s.key)));
const pendingChangeCount = computed(
  () => (changeRequests.value || []).filter((c) => c.status === 'pending').length
);
const firstIncompleteKey = computed(() => sectionMeta.find((s) => !isSectionDone(s.key))?.key || null);
const schoolName = computed(() => school.value?.name || 'School');
const tenantLogo = computed(() => logoSrc(agency.value));
const tenantName = computed(() => agencyDisplayName(agency.value, 'Partner'));
const brandStyle = computed(() => {
  const p = parseAgencyPalette(agency.value);
  return {
    '--cua-primary': p.primary,
    '--cua-secondary': p.secondary,
    '--cua-accent': p.accent,
  };
});
const needsIdentity = computed(
  () => props.mode === 'token' && !identityConfirmed.value && !isFinalized.value
);
const identityBanner = computed(() => {
  if (props.mode === 'token') {
    return [identityName.value, identityTitle.value].filter(Boolean).join(', ') || '';
  }
  return '';
});
const userInitials = computed(() => {
  const name = identityBanner.value || schoolName.value || 'S';
  const parts = name.split(/[\s,]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
});

function isSectionDone(key) {
  const s = progressMap.value[key];
  return Boolean(s?.reviewed || s?.completed);
}
function sectionTitle(key) {
  return sectionMeta.find((s) => s.key === key)?.title || key;
}
function sectionHint(key) {
  return sectionMeta.find((s) => s.key === key)?.hint || '';
}
function sectionIcon(name) {
  return ICONS[name] || ICONS.calendar;
}
function questionsFor(sectionKey) {
  return (questions.value || []).filter((q) => q.section_key === sectionKey);
}
function formatDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatSlot(slot) {
  const label = slot.label ? `${slot.label} — ` : '';
  return `${label}${formatDate(slot.starts_at)}`;
}

function openSection(key) {
  activeSection.value = key;
  viewMode.value = 'detail';
}
function scrollFinalize() {
  viewMode.value = 'hub';
  setTimeout(() => finalizeEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}
function onExit() {
  if (props.embedded || props.mode === 'staff' || props.mode === 'admin') {
    emit('dismiss-request');
    return;
  }
  const slug = school.value?.portal_url || school.value?.slug;
  if (slug) router.push(`/${slug}/dashboard`);
  else emit('dismiss-request');
}

function applyPayload(data) {
  cycle.value = data.cycle;
  agency.value = data.agency;
  school.value = data.school;
  sections.value = data.sections || [];
  providers.value = data.providers || [];
  staff.value = data.staff || [];
  events.value = data.events || null;
  questions.value = data.questions || [];
  checkinSlots.value = data.checkinSlots || [];
  changeRequests.value = data.changeRequests || [];
  addendums.value = data.addendums || [];
  shareToken.value = data.shareToken || (data.token ? { token: data.token, path: `/school-reinit/${data.token}` } : null);

  for (const s of sections.value) {
    if (s.data && formData[s.sectionKey]) {
      Object.assign(formData[s.sectionKey], s.data);
    }
  }
  if (events.value?.firstDay?.startsAt && !formData.school_events.first_day_of_school) {
    formData.school_events.first_day_of_school = String(events.value.firstDay.startsAt).slice(0, 10);
  }
  if (events.value?.backToSchool?.outreachTableInvited) {
    formData.school_events.bts_marketing_table = true;
    formData.school_events.bts_partner_invited = true;
  }
  // Migrate older answer key if present
  if (formData.school_events.bts_itsco_invited && !formData.school_events.bts_partner_invited) {
    formData.school_events.bts_partner_invited = Boolean(formData.school_events.bts_itsco_invited);
  }

  const stored = loadStoredIdentity(cycle.value?.id);
  if (stored?.name) {
    identityName.value = stored.name;
    identityTitle.value = stored.title || '';
    identityConfirmed.value = true;
  }
  emit('loaded', data);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (props.initialPayload) {
      applyPayload(props.initialPayload);
      return;
    }
    let data;
    if (props.mode === 'token') {
      const res = await api.get(`/public/school-reinit/${props.token}`);
      data = res.data;
    } else if (props.mode === 'admin') {
      const res = await api.get(`/school-reinit/schools/${props.schoolOrganizationId}`, {
        params: { agencyId: props.agencyId },
      });
      data = res.data;
    } else {
      const res = await api.get('/school-reinit/me', {
        params: {
          schoolOrganizationId: props.schoolOrganizationId,
          agencyId: props.agencyId || undefined,
        },
      });
      data = res.data;
    }
    applyPayload(data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function saveIdentity() {
  if (!identityName.value.trim()) return;
  storeIdentity(cycle.value?.id, { name: identityName.value.trim(), title: identityTitle.value.trim() });
  identityConfirmed.value = true;
}

function actorPayload() {
  if (props.mode === 'token') {
    return { displayName: identityName.value.trim(), identityTitle: identityTitle.value.trim() };
  }
  return {};
}

async function copyShareToken() {
  let token = shareToken.value?.token || props.token;
  if (!token && props.mode !== 'token') {
    try {
      if (props.mode === 'admin') {
        const res = await api.post('/school-reinit/tokens', {
          agencyId: Number(props.agencyId),
          schoolOrganizationId: Number(props.schoolOrganizationId),
          ensure: true,
        });
        shareToken.value = res.data;
        token = res.data.token;
      } else {
        const res = await api.post('/school-reinit/me/ensure-token', {
          schoolOrganizationId: Number(props.schoolOrganizationId),
          agencyId: props.agencyId ? Number(props.agencyId) : undefined,
        });
        shareToken.value = res.data;
        token = res.data.token;
      }
    } catch (e) {
      error.value = e?.response?.data?.error?.message || 'Could not get share token';
      return;
    }
  }
  const url = publicReinitUrl(token);
  const ok = await copyTextToClipboard(url);
  if (ok) {
    copyFlash.value = true;
    setTimeout(() => {
      copyFlash.value = false;
    }, 2000);
  } else {
    error.value = 'Could not copy — link: ' + url;
  }
}

async function saveSection(sectionKey, reviewed) {
  saving.value = true;
  error.value = '';
  try {
    const body = {
      cycleId: cycle.value.id,
      data: formData[sectionKey],
      reviewed,
      completed: reviewed,
      ...actorPayload(),
    };
    let res;
    if (props.mode === 'token') {
      res = await api.put(`/public/school-reinit/${props.token}/sections/${sectionKey}`, body);
    } else if (props.mode === 'admin') {
      // Admin saves via staff-equivalent path using cycle detail mutation — use public token if available
      if (shareToken.value?.token) {
        res = await api.put(`/public/school-reinit/${shareToken.value.token}/sections/${sectionKey}`, {
          ...body,
          displayName: 'Agency admin',
        });
      } else {
        throw new Error('No share token available for admin save');
      }
    } else {
      res = await api.put(`/school-reinit/me/sections/${sectionKey}`, body);
    }
    sections.value = res.data.sections || sections.value;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function onConfirmSection(sectionKey) {
  await saveSection(sectionKey, true);
  if (isSectionDone(sectionKey) || true) {
    const next = sectionMeta.find((s) => !isSectionDone(s.key) && s.key !== sectionKey);
    if (next) openSection(next.key);
    else viewMode.value = 'hub';
  }
}

async function requestDelete(entityType, entity) {
  if (!window.confirm(`Request removal of ${entity.name}? An admin must approve this change.`)) return;
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      entityType,
      entityId: entity.id,
      action: 'delete',
      before: entity,
      ...actorPayload(),
    };
    const path =
      props.mode === 'token'
        ? `/public/school-reinit/${props.token}/change-requests`
        : props.mode === 'admin' && shareToken.value?.token
          ? `/public/school-reinit/${shareToken.value.token}/change-requests`
          : '/school-reinit/me/change-requests';
    if (props.mode === 'admin' && shareToken.value?.token) {
      body.displayName = 'Agency admin';
    }
    const res = await api.post(path, body);
    if (res.data.changeRequest) {
      changeRequests.value = [res.data.changeRequest, ...changeRequests.value];
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Request failed';
  } finally {
    saving.value = false;
  }
}

async function addStaff() {
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      entityType: 'school_staff',
      action: 'add',
      payload: { ...newStaff },
      ...actorPayload(),
    };
    const path =
      props.mode === 'token'
        ? `/public/school-reinit/${props.token}/change-requests`
        : props.mode === 'admin' && shareToken.value?.token
          ? `/public/school-reinit/${shareToken.value.token}/change-requests`
          : '/school-reinit/me/change-requests';
    if (props.mode === 'admin') body.displayName = 'Agency admin';
    await api.post(path, body);
    newStaff.name = '';
    newStaff.email = '';
    newStaff.title = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Add failed';
  } finally {
    saving.value = false;
  }
}

async function finalize() {
  if (!window.confirm('Finalize this school’s fall re-initiation? The summary will be locked.')) return;
  saving.value = true;
  try {
    const body = { cycleId: cycle.value.id, ...actorPayload() };
    let res;
    if (props.mode === 'token') {
      res = await api.post(`/public/school-reinit/${props.token}/finalize`, body);
    } else if (props.mode === 'admin' && shareToken.value?.token) {
      res = await api.post(`/public/school-reinit/${shareToken.value.token}/finalize`, {
        ...body,
        displayName: 'Agency admin',
      });
    } else {
      res = await api.post('/school-reinit/me/finalize', body);
    }
    cycle.value = res.data.cycle;
    viewMode.value = 'hub';
    emit('finalized', cycle.value);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Finalize failed';
  } finally {
    saving.value = false;
  }
}

async function onReceiptAddendum(summaryText) {
  const text = String(summaryText || '').trim();
  if (!text) return;
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      summaryText: text,
      changes: { note: text },
      ...actorPayload(),
    };
    let res;
    if (props.mode === 'token') {
      res = await api.post(`/public/school-reinit/${props.token}/addendums`, body);
    } else if (props.mode === 'admin' && shareToken.value?.token) {
      res = await api.post(`/public/school-reinit/${shareToken.value.token}/addendums`, {
        ...body,
        displayName: 'Agency admin',
      });
    } else {
      res = await api.post('/school-reinit/me/addendums', body);
    }
    addendums.value = [res.data.addendum, ...addendums.value];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Addendum failed';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.token, props.schoolOrganizationId, props.agencyId, props.mode],
  () => {
    void load();
  }
);

onMounted(() => {
  void load();
});

defineExpose({ reload: load, copyShareToken });
</script>

<style scoped>
.cua {
  --cua-primary: #0c4a6e;
  --cua-secondary: #15803d;
  --cua-accent: #2563eb;
  --green: var(--cua-secondary);
  --green-dark: var(--cua-secondary);
  --blue: var(--cua-accent);
  --navy: var(--cua-primary);
  --ink: #1e293b;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--ink);
  background: var(--bg);
  min-height: 100%;
}
.cua--embedded {
  max-height: min(90vh, 960px);
  overflow: auto;
  border-radius: 12px;
}
.cua__top {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 16px;
  align-items: start;
  padding: 18px 22px 12px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.cua__logo {
  height: 40px;
  width: auto;
  object-fit: contain;
}
.cua__logo-text {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--navy);
  line-height: 1.25;
}
.cua__logo-mark {
  display: block;
  color: var(--green);
  font-size: 18px;
}
.cua__school {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
}
.cua__h1 {
  margin: 2px 0 6px;
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--green-dark);
  letter-spacing: -0.02em;
}
.cua__sub {
  margin: 0;
  max-width: 520px;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.4;
}
.cua__user-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.cua__copy-token {
  background: var(--navy);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 800;
  font-size: 0.8rem;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.cua__copy-token:hover {
  filter: brightness(1.08);
}
.cua__help {
  font-size: 0.8rem;
  color: var(--blue);
}
.cua__user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink);
}
.cua__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--blue);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}
.cua__layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 0;
  min-height: 520px;
}
.cua__sidebar {
  background: #fff;
  border-right: 1px solid var(--line);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cua__progress-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
}
.cua__progress-track {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.cua__progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.2s ease;
}
.cua__steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.cua__step {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
}
.cua__step:hover {
  background: #f1f5f9;
}
.cua__step.is-active,
.cua__step.is-current {
  background: #eff6ff;
}
.cua__step-marker {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--muted);
  flex-shrink: 0;
}
.cua__step.is-done .cua__step-marker {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}
.cua__step.is-current .cua__step-marker,
.cua__step.is-active .cua__step-marker {
  border-color: var(--blue);
  color: var(--blue);
  background: #dbeafe;
}
.cua__step-label {
  font-size: 0.82rem;
  font-weight: 600;
}
.cua__step--finalize {
  margin-top: 8px;
  border-top: 1px solid var(--line);
  border-radius: 0;
  padding-top: 12px;
}
.cua__step--finalize.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cua__exit-box {
  margin-top: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}
.cua__exit-title {
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--muted);
}
.cua__exit-btn {
  width: 100%;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.cua__main {
  padding: 18px 22px 28px;
}
.cua__autosave {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.82rem;
  margin-bottom: 16px;
  line-height: 1.4;
}
.cua__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.cua__card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 16px 12px;
  text-align: left;
  cursor: pointer;
  min-height: 168px;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  font: inherit;
  color: inherit;
}
.cua__card:hover {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  border-color: #cbd5e1;
}
.cua__card.is-progress {
  border-color: #93c5fd;
  box-shadow: 0 0 0 1px #93c5fd;
}
.cua__card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  color: var(--blue);
}
.cua__card.is-done .cua__card-top {
  color: var(--green);
}
.cua__card-chevron {
  color: #94a3b8;
  font-size: 1.4rem;
  line-height: 1;
}
.cua__card-num {
  margin-top: 8px;
  font-size: 0.75rem;
  font-weight: 800;
  color: #94a3b8;
}
.cua__card-title {
  font-size: 1rem;
  font-weight: 800;
  margin: 2px 0 6px;
}
.cua__card-desc {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.35;
  flex: 1;
}
.cua__card-status {
  margin-top: 12px;
  font-size: 0.78rem;
  font-weight: 700;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.status--done {
  color: var(--green);
}
.status--progress {
  color: var(--blue);
}
.status--todo {
  color: #94a3b8;
}
.status .dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
}
.status--done .dot {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.status--progress .dot {
  background: var(--blue);
  border-color: var(--blue);
}
.cua__finalize {
  margin-top: 20px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cua__finalize-left {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.cua__finalize-left p {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.cua__finalize-lock {
  font-size: 1.4rem;
}
.cua__finalize-btn {
  background: #e2e8f0;
  color: #64748b;
  border: none;
  border-radius: 10px;
  padding: 12px 18px;
  font-weight: 800;
  cursor: not-allowed;
}
.cua__finalize-btn:not(:disabled) {
  background: var(--green);
  color: #fff;
  cursor: pointer;
}
.cua__detail {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px 20px;
}
.cua__back {
  border: none;
  background: none;
  color: var(--blue);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
  font-size: 0.85rem;
}
.cua__detail h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
}
.cua__panel {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}
.cua__panel--warn {
  background: #fffbeb;
  border-color: #fcd34d;
}
.cua__panel label,
.cua__section-body > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.cua__panel input[type='text'],
.cua__panel input[type='email'],
.cua__panel input[type='date'],
.cua__panel textarea,
.cua__section-body textarea,
.cua__identity input,
.cua__addendum textarea,
.cua__fields input {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.cua__check {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}
.cua__check input {
  width: 18px;
  height: 18px;
}
.cua__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cua__list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}
.cua__list-item > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}
.cua__photo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.cua__fields {
  display: grid;
  gap: 8px;
  max-width: 420px;
}
.cua__muted {
  color: var(--muted);
  font-size: 0.88rem;
}
.cua__error {
  margin: 12px 22px;
  padding: 10px 12px;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
}
.cua__identity {
  max-width: 420px;
  margin: 40px auto;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cua__addendum {
  margin: 16px 22px;
  padding: 16px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.cua__row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.btn {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
}
.btn-primary {
  background: var(--navy);
  color: #fff;
}
.btn-secondary {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}
.btn-sm {
  font-size: 0.75rem;
  padding: 4px 8px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 960px) {
  .cua__top {
    grid-template-columns: 1fr;
  }
  .cua__user-block {
    align-items: flex-start;
  }
  .cua__layout {
    grid-template-columns: 1fr;
  }
  .cua__grid {
    grid-template-columns: 1fr;
  }
}
</style>
