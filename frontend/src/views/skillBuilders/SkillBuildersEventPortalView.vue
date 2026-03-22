<template>
  <div class="sbep-wrap">
    <div class="sbep-main">
      <div v-if="loading" class="sbep-state muted">Loading event…</div>
      <div v-else-if="error" class="sbep-state error-box">{{ error }}</div>
      <template v-else-if="detail">
        <SkillBuildersEventPortalLayout
          :title="detail.event?.title || 'Skill Builders event'"
          :subtitle="headerSubtitle"
          kicker="Program event · Skill Builders"
        >
          <template #actions>
            <nav v-if="crumbProgramLabel" class="sbep-crumb muted" aria-label="Breadcrumb">
              <router-link v-if="programEventsHref" :to="programEventsHref">{{ crumbProgramLabel }}</router-link>
              <template v-else>{{ crumbProgramLabel }}</template>
              <span class="sbep-crumb-sep" aria-hidden="true">·</span>
              <span>Event</span>
            </nav>
            <router-link v-if="programEventsHref" class="btn btn-secondary btn-sm" :to="programEventsHref">
              All program events
            </router-link>
            <p
              v-else-if="detail.programPortal && !detail.programPortal.slug"
              class="sbep-nav-hint muted"
            >
              Add a portal slug on the program organization to enable the public events list link.
            </p>
            <router-link v-if="dashboardHref" class="btn btn-secondary btn-sm" :to="dashboardHref">Dashboard</router-link>
            <router-link v-if="scheduleHubHref" class="btn btn-secondary btn-sm" :to="scheduleHubHref">
              Schedule hub
            </router-link>
            <router-link
              v-if="skillBuildersEventsOverlayHref"
              class="btn btn-secondary btn-sm"
              :to="skillBuildersEventsOverlayHref"
            >
              Skill Builders events
            </router-link>
            <button
              v-if="canEditEventInPortal"
              type="button"
              class="btn btn-primary btn-sm"
              @click="editEventModalOpen = true"
            >
              Edit event
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="goBack">Back</button>
          </template>

          <div class="sbep-portal-grid">
            <section
              v-if="detail.calendar && (detail.calendar.googleCalendarUrl || detail.calendar.icsUrl)"
              class="sbep-portal-card sbep-calendar-card sbep-span-2"
            >
              <h2 class="sbep-card-title">Add to calendar</h2>
              <p v-if="detail.calendar.note" class="muted small sbep-card-lead">{{ detail.calendar.note }}</p>
              <div class="sbep-calendar-actions">
                <a
                  v-if="detail.calendar.googleCalendarUrl"
                  class="btn btn-primary btn-sm"
                  :href="detail.calendar.googleCalendarUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Calendar
                </a>
                <a v-if="detail.calendar.icsUrl" class="btn btn-secondary btn-sm" :href="detail.calendar.icsUrl">
                  Download ICS
                </a>
                <button
                  v-if="detail.calendar.googleCalendarUrl"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="copyGoogleCalendarLink"
                >
                  Copy Google link
                </button>
                <button type="button" class="btn btn-secondary btn-sm" @click="copyShareBlurb">Copy share text</button>
              </div>
              <p v-if="copyHint" class="muted small sbep-copy-hint">{{ copyHint }}</p>
            </section>

            <div v-if="viewerCaps.canManageTeamSchedules && agencyId && eventId" class="sbep-span-2">
              <SkillBuildersEventProgramMeetingsCard
                :agency-id="agencyId"
                :event-id="eventId"
                :initial-meetings="meetingsForEditor"
                @saved="onMeetingsSaved"
              />
            </div>

            <section
              v-if="detail.skillsGroup"
              class="sbep-portal-card sbep-span-2 sbep-sessions-card"
            >
              <h2 class="sbep-card-title">Scheduled sessions</h2>
              <p class="muted small sbep-card-lead">
                One row per program day that matches your week pattern (e.g. every Tuesday in range). Refreshes when you
                save the pattern. Used to tie kiosk punches to a specific occurrence. Coordinators can note which roster
                providers are expected per session (migration <strong>585</strong>).
              </p>
              <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
              <p v-else-if="sessionsLoadError" class="error-box sbep-sessions-err">{{ sessionsLoadError }}</p>
              <p v-else-if="!sessions.length && sessionsLoadAttempted" class="muted">
                No sessions in the program window for this date range. If you just added the week pattern, click
                <strong>Save week pattern</strong> once to generate rows. If the program dates are in the past, they still
                appear here — if this stays empty, confirm migration <strong>584</strong> ran on the server.
              </p>
              <div v-else-if="sessions.length" class="sbep-sessions-table-wrap">
                <table class="sbep-sessions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in sessionsTableRows" :key="s.id">
                      <td>{{ s.sessionDate }}</td>
                      <td>{{ s.weekday }}</td>
                      <td>{{ formatHm(s.startTime) }}–{{ formatHm(s.endTime) }}</td>
                      <td class="sbep-sessions-staff-cell">
                        <template v-if="viewerCaps.canManageTeamSchedules && rosterProviderOptions.length">
                          <select
                            v-model="sessionStaffDraft[s.id]"
                            multiple
                            class="input sbep-session-staff-ms"
                            :disabled="sessionStaffSavingId === s.id"
                          >
                            <option v-for="p in rosterProviderOptions" :key="p.id" :value="p.id">
                              {{ p.firstName }} {{ p.lastName }}
                            </option>
                          </select>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm sbep-session-staff-save"
                            :disabled="sessionStaffSavingId === s.id"
                            @click="saveSessionStaff(s.id)"
                          >
                            {{ sessionStaffSavingId === s.id ? 'Saving…' : 'Save' }}
                          </button>
                        </template>
                        <span v-else class="sbep-sessions-staff-read">{{ formatSessionAssignedStaff(s) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="sessions.length > sessionsTableRows.length" class="muted small sbep-sessions-more">
                  Showing first {{ sessionsTableRows.length }} of {{ sessions.length }}.
                </p>
              </div>
            </section>

            <section
              v-else-if="(detail.meetings || []).length"
              class="sbep-portal-card"
            >
              <h2 class="sbep-card-title">Weekly meeting pattern</h2>
              <ul class="sbep-list">
                <li v-for="(m, i) in detail.meetings" :key="i">
                  {{ m.weekday }} · {{ formatHm(m.startTime) }}–{{ formatHm(m.endTime) }}
                </li>
              </ul>
            </section>

            <section v-if="viewerCaps.isAssignedProvider && agencyId" class="sbep-portal-card sbep-span-2">
              <h2 class="sbep-card-title">My work schedule</h2>
              <p class="muted small sbep-card-lead">Your Skill Builder availability, group meetings, and assigned program events.</p>
              <SkillBuildersWorkSchedulePanel
                :agency-id="agencyId"
                :highlight-event-id="eventId"
                :program-session-summaries="sessionsForWorkSchedulePanel"
              />
            </section>

            <div v-if="viewerCaps.canManageTeamSchedules && agencyId && eventId" class="sbep-span-2">
              <SkillBuildersEventTeamScheduleCard
                :agency-id="agencyId"
                :event-id="eventId"
                :providers="detail.providers || []"
                @updated="loadDetail"
              />
            </div>

            <section class="sbep-portal-card">
              <h2 class="sbep-card-title">Roster</h2>
              <p class="muted">Providers ({{ detail.providers?.length || 0 }})</p>
              <ul class="sbep-list">
                <li v-for="p in detail.providers" :key="p.id">{{ p.firstName }} {{ p.lastName }}</li>
              </ul>
              <p class="muted">Clients ({{ detail.clients?.length || 0 }})</p>
              <ul class="sbep-list">
                <li v-for="c in detail.clients" :key="c.id">{{ c.initials || c.identifierCode || c.id }}</li>
              </ul>
            </section>

            <section v-if="detail.showKioskClockActions" class="sbep-portal-card sbep-span-2">
              <h2 class="sbep-card-title">Kiosk / time</h2>
              <p class="muted sbep-card-lead">
                Direct hours: <strong>{{ detail.event?.skillBuilderDirectHours ?? '—' }}</strong>
              </p>
              <template v-if="sessions.length">
                <label class="sbep-label">Scheduled session</label>
                <select v-model.number="kioskSessionId" class="input sbep-kiosk-field">
                  <option :value="0">General (not tied to a generated session)</option>
                  <option v-for="s in kioskSessionChoices" :key="s.id" :value="s.id">
                    {{ formatSessionKioskLabel(s) }}
                  </option>
                </select>
              </template>
              <label class="sbep-label">Client on this punch (optional)</label>
              <select v-model.number="kioskClientId" class="input sbep-kiosk-field">
                <option :value="0">—</option>
                <option v-for="c in detail.clients || []" :key="c.id" :value="c.id">
                  {{ c.initials || c.identifierCode || `Client #${c.id}` }}
                </option>
              </select>
              <div class="sbep-inline-actions sbep-kiosk-actions">
                <button type="button" class="btn btn-primary btn-sm" :disabled="clockBusy" @click="clockIn">
                  Clock in
                </button>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="clockBusy" @click="clockOut">
                  Clock out
                </button>
              </div>
              <p v-if="clockMessage" class="muted sbep-clock-msg">{{ clockMessage }}</p>
            </section>

            <section class="sbep-portal-card sbep-span-2">
              <h2 class="sbep-card-title">Event discussion</h2>
              <p class="muted small sbep-card-lead">
                Visible to program staff and assigned providers. School-portal–only accounts cannot post here.
              </p>
              <div v-if="postsLoading" class="muted">Loading…</div>
              <ul v-else class="sbep-posts">
                <li v-for="p in posts" :key="p.id" class="sbep-post">
                  <div class="sbep-post-meta">
                    {{ p.authorFirstName }} {{ p.authorLastName }} · {{ formatPostTime(p.createdAt) }}
                  </div>
                  <div class="sbep-post-body">{{ p.body }}</div>
                </li>
              </ul>
              <template v-if="viewerCaps.canPostEventDiscussion">
                <label class="sbep-label">Add comment</label>
                <textarea v-model="newPostBody" class="input" rows="3" placeholder="Write a note…" />
                <button
                  type="button"
                  class="btn btn-primary btn-sm sbep-post-btn"
                  :disabled="!newPostBody.trim() || postSaving"
                  @click="submitPost"
                >
                  {{ postSaving ? 'Posting…' : 'Post' }}
                </button>
              </template>
              <p v-else class="muted small">You can read updates here; posting is limited to program staff in this context.</p>
            </section>

            <section v-if="detail.event?.learningProgramClassId" class="sbep-portal-card muted sbep-span-2">
              Linked learning class ID {{ detail.event.learningProgramClassId }} — open class features from Learning when wired in the admin UI.
            </section>
          </div>
        </SkillBuildersEventPortalLayout>
        <SkillBuildersEventEditModal
          v-if="agencyId && eventId"
          v-model="editEventModalOpen"
          :agency-id="agencyId"
          :event-id="eventId"
          @saved="loadDetail"
        />
      </template>
    </div>
    <aside class="sbep-chat">
      <div class="sbep-chat-inner">
        <h2 class="sbep-chat-title">Event chat</h2>
        <p class="muted sbep-chat-hint">Linked to your agency chat. Everyone with event access can post here.</p>
        <div v-if="chatLoading" class="muted">Loading chat…</div>
        <div v-else-if="chatError" class="error-box">{{ chatError }}</div>
        <template v-else>
          <ul class="sbep-chat-msgs">
            <li v-for="m in chatMessages" :key="m.id" class="sbep-chat-li">
              <div class="sbep-chat-meta">
                {{ m.sender_first_name }} {{ m.sender_last_name }} · {{ formatPostTime(m.created_at) }}
              </div>
              <div class="sbep-chat-body">{{ m.body }}</div>
            </li>
          </ul>
          <textarea v-model="chatDraft" class="input" rows="3" placeholder="Message the event group…" />
          <button type="button" class="btn btn-primary btn-sm sbep-chat-send" :disabled="!chatDraft.trim() || chatSending" @click="sendChat">
            {{ chatSending ? 'Sending…' : 'Send' }}
          </button>
        </template>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import SkillBuildersEventPortalLayout from '../../components/skillBuilders/SkillBuildersEventPortalLayout.vue';
import SkillBuildersWorkSchedulePanel from '../../components/availability/SkillBuildersWorkSchedulePanel.vue';
import SkillBuildersEventTeamScheduleCard from '../../components/skillBuilders/SkillBuildersEventTeamScheduleCard.vue';
import SkillBuildersEventProgramMeetingsCard from '../../components/skillBuilders/SkillBuildersEventProgramMeetingsCard.vue';
import SkillBuildersEventEditModal from '../../components/skillBuilders/SkillBuildersEventEditModal.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const detail = ref(null);
const meetingsForEditor = ref([]);
const editEventModalOpen = ref(false);
const sessions = ref([]);
const sessionsLoading = ref(false);
const sessionsLoadAttempted = ref(false);
const sessionsLoadError = ref('');
const kioskSessionId = ref(0);
const kioskClientId = ref(0);

/** @type {Record<number, number[]>} */
const sessionStaffDraft = reactive({});
const sessionStaffSavingId = ref(null);

const eventId = computed(() => Number(route.params.eventId));
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());

const programEventsHref = computed(() => {
  const ag = detail.value?.agencyPortalSlug;
  const ps = detail.value?.programPortal?.slug;
  if (!ag || !ps) return null;
  return `/${ag}/programs/${ps}/events`;
});

const dashboardHref = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  return `/${s}/dashboard`;
});

const crumbProgramLabel = computed(() => detail.value?.programPortal?.name || '');

const viewerCaps = computed(() => {
  const v = detail.value?.viewerCapabilities;
  if (v && typeof v === 'object') {
    return {
      isAssignedProvider: !!v.isAssignedProvider,
      canManageTeamSchedules: !!v.canManageTeamSchedules,
      canManageCompanyEvent: !!v.canManageCompanyEvent,
      canPostEventDiscussion: v.canPostEventDiscussion !== false
    };
  }
  return {
    isAssignedProvider: !!detail.value?.showKioskClockActions,
    canManageTeamSchedules: !!detail.value?.canManageCompanyEvent,
    canManageCompanyEvent: !!detail.value?.canManageCompanyEvent,
    canPostEventDiscussion: true
  };
});

watch(
  () => detail.value?.meetings,
  (m) => {
    meetingsForEditor.value = Array.isArray(m) ? m.map((x) => ({ ...x })) : [];
  },
  { immediate: true, deep: true }
);

function onMeetingsSaved(m) {
  meetingsForEditor.value = Array.isArray(m) ? m.map((x) => ({ ...x })) : [];
  if (detail.value) detail.value.meetings = Array.isArray(m) ? [...m] : [];
  loadSessions();
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

const SESSIONS_TABLE_LIMIT = 50;

const sessionsTableRows = computed(() => sessions.value.slice(0, SESSIONS_TABLE_LIMIT));

const rosterProviderOptions = computed(() => {
  const list = detail.value?.providers;
  return Array.isArray(list) ? list : [];
});

const kioskSessionChoices = computed(() => sessions.value.slice(0, 120));

/** Upcoming materialized sessions for this event (Phase 3 — work schedule context). */
const sessionsForWorkSchedulePanel = computed(() => {
  if (!detail.value?.skillsGroup || !sessions.value.length) return [];
  const today = ymdToday();
  return sessions.value
    .filter((s) => String(s.sessionDate || '') >= today)
    .slice(0, 24)
    .map((s) => ({
      sessionDate: s.sessionDate,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      assignedSummary: formatSessionAssignedStaff(s)
    }));
});

function formatSessionKioskLabel(s) {
  if (!s) return '';
  return `${s.sessionDate} · ${String(s.weekday || '').slice(0, 3)} ${formatHm(s.startTime)}–${formatHm(s.endTime)}`;
}

function formatSessionAssignedStaff(s) {
  const ap = s?.assignedProviders;
  if (!Array.isArray(ap) || !ap.length) return '—';
  return ap.map((p) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || `#${p.id}`).join(', ');
}

function syncSessionStaffDraft() {
  for (const key of Object.keys(sessionStaffDraft)) {
    delete sessionStaffDraft[key];
  }
  for (const s of sessions.value) {
    const ids = Array.isArray(s.assignedProviders)
      ? s.assignedProviders.map((p) => p.id).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    sessionStaffDraft[s.id] = [...ids];
  }
}

async function saveSessionStaff(sessionId) {
  if (!agencyId.value || !eventId.value) return;
  sessionStaffSavingId.value = sessionId;
  try {
    const raw = sessionStaffDraft[sessionId];
    const providerUserIds = Array.isArray(raw)
      ? raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const res = await api.put(
      `/skill-builders/events/${eventId.value}/sessions/${sessionId}/providers`,
      { agencyId: agencyId.value, providerUserIds },
      { skipGlobalLoading: true }
    );
    const next = res.data?.assignedProviders;
    const idx = sessions.value.findIndex((x) => x.id === sessionId);
    if (idx >= 0 && Array.isArray(next)) {
      sessions.value[idx] = { ...sessions.value[idx], assignedProviders: next };
    }
    syncSessionStaffDraft();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to save staff');
  } finally {
    sessionStaffSavingId.value = null;
  }
}

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd, delta) {
  const [y, mo, da] = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (!Number.isFinite(dt.getTime())) return ymdToday();
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

async function loadSessions() {
  sessionsLoadError.value = '';
  if (!agencyId.value || !eventId.value || !detail.value?.skillsGroup) {
    sessions.value = [];
    sessionsLoadAttempted.value = false;
    return;
  }
  sessionsLoading.value = true;
  sessionsLoadAttempted.value = true;
  try {
    const sg = detail.value.skillsGroup;
    let from = ymdAddDays(ymdToday(), -7);
    let to = ymdAddDays(ymdToday(), 365);
    const sd = sg?.startDate != null ? String(sg.startDate).slice(0, 10) : '';
    const ed = sg?.endDate != null ? String(sg.endDate).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;
    const res = await api.get(`/skill-builders/events/${eventId.value}/sessions`, {
      params: { agencyId: agencyId.value, from, to },
      skipGlobalLoading: true
    });
    sessions.value = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    syncSessionStaffDraft();
  } catch (e) {
    sessions.value = [];
    syncSessionStaffDraft();
    const msg = e.response?.data?.error?.message || e.message || '';
    sessionsLoadError.value = msg
      ? `Could not load sessions: ${msg}`
      : 'Could not load sessions. Check your connection or try again.';
  } finally {
    sessionsLoading.value = false;
  }
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_ABBR = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatWeekdayList(days) {
  const uniq = [...new Set((days || []).map((d) => String(d || '').trim()).filter(Boolean))];
  uniq.sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  return uniq.map((d) => WEEKDAY_ABBR[d] || d.slice(0, 3)).join(' & ');
}

/** Compact "Tue & Thu 3:15 PM–4:15 PM" lines for the page subtitle. */
function summarizeMeetingsSubtitle(meetings) {
  if (!Array.isArray(meetings) || !meetings.length) return '';
  const bySlot = new Map();
  for (const row of meetings) {
    const st = formatHm(row.startTime);
    const et = formatHm(row.endTime);
    const key = `${st}-${et}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(row.weekday);
  }
  const chunks = [];
  for (const [key, days] of bySlot.entries()) {
    const dashIdx = key.indexOf('-');
    const st = key.slice(0, dashIdx);
    const et = key.slice(dashIdx + 1);
    const dayStr = formatWeekdayList(days);
    const range = `${wallHmToDisplay(st)}–${wallHmToDisplay(et)}`;
    chunks.push(`${dayStr} ${range}`);
  }
  return chunks.join('; ');
}

const headerSubtitle = computed(() => {
  const parts = [];
  const d = detail.value;
  const ev = d?.event;
  const sg = d?.skillsGroup;
  const meetings = d?.meetings;

  if (sg && ev?.startsAt) {
    const tz = String(ev.timezone || '').trim();
    const a = new Date(ev.startsAt);
    const b = new Date(ev.endsAt || 0);
    if (Number.isFinite(a.getTime())) {
      let dateSpan = '';
      try {
        if (tz) {
          const df = new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium' });
          dateSpan = `${df.format(a)} – ${Number.isFinite(b.getTime()) ? df.format(b) : ''}`;
        } else {
          dateSpan = `${a.toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}`;
        }
      } catch {
        dateSpan = `${a.toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}`;
      }
      if (dateSpan) parts.push(`Program ${dateSpan}`);
    }
    const weekly = summarizeMeetingsSubtitle(meetings);
    if (weekly) parts.push(weekly);
  } else if (ev?.startsAt) {
    const a = new Date(ev.startsAt);
    const b = new Date(ev.endsAt || 0);
    if (Number.isFinite(a.getTime())) {
      const opt = { dateStyle: 'medium', timeStyle: 'short' };
      try {
        parts.push(
          `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`
        );
      } catch {
        parts.push(String(ev.startsAt || ''));
      }
    }
  }

  if (sg) {
    parts.push(`${sg.schoolName} · ${sg.name}`);
  }

  return parts.filter(Boolean).join(' · ');
});

const roleLower = computed(() => String(authStore.user?.role || '').toLowerCase());

/** Matches `SCHEDULE_HUB_ROLES` (buildings / full schedule chooser). */
const canOpenScheduleHub = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider_plus'].includes(roleLower.value)
);

/** Matches dashboard “open Skill Builders programs” from schedule (coordinator, staff, eligible provider, etc.). */
const canOpenSkillBuildersEventsOverlay = computed(() => {
  const r = roleLower.value;
  if (['super_admin', 'admin', 'staff', 'support'].includes(r)) return true;
  const coord =
    authStore.user?.has_skill_builder_coordinator_access === true ||
    authStore.user?.has_skill_builder_coordinator_access === 1 ||
    authStore.user?.has_skill_builder_coordinator_access === '1';
  if (coord) return true;
  const elig =
    authStore.user?.skill_builder_eligible === true ||
    authStore.user?.skill_builder_eligible === 1 ||
    authStore.user?.skill_builder_eligible === '1';
  const providerLike = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(r);
  return !!(elig && providerLike);
});

const scheduleHubHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !canOpenScheduleHub.value) return null;
  return `/${s}/schedule`;
});

const skillBuildersEventsOverlayHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !canOpenSkillBuildersEventsOverlay.value) return null;
  return { path: `/${s}/dashboard`, query: { tab: 'my_schedule', sbPrograms: '1' } };
});

const canEditEventInPortal = computed(
  () => !!detail.value?.canManageCompanyEvent && agencyId.value > 0 && eventId.value > 0
);

const copyHint = ref('');

function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  if (dashboardHref.value) router.push(dashboardHref.value);
  else if (programEventsHref.value) router.push(programEventsHref.value);
}
const posts = ref([]);
const postsLoading = ref(false);
const newPostBody = ref('');
const postSaving = ref(false);
const clockBusy = ref(false);
const clockMessage = ref('');

const chatThreadId = ref(null);
const chatLoading = ref(false);
const chatError = ref('');
const chatMessages = ref([]);
const chatDraft = ref('');
const chatSending = ref(false);

function formatWhen(startsAt, endsAt) {
  const a = new Date(startsAt || 0);
  const b = new Date(endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`;
  } catch {
    return String(startsAt || '');
  }
}

function formatPostTime(t) {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t || '');
  }
}

function absoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function copyGoogleCalendarLink() {
  const url = detail.value?.calendar?.googleCalendarUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyHint.value = 'Google Calendar link copied.';
  } catch {
    copyHint.value = 'Could not copy—select the link manually.';
  }
  window.setTimeout(() => {
    copyHint.value = '';
  }, 4000);
}

async function copyShareBlurb() {
  const title = detail.value?.event?.title || 'Skill Builders event';
  const when = formatWhen(detail.value?.event?.startsAt, detail.value?.event?.endsAt);
  const g = detail.value?.calendar?.googleCalendarUrl || '';
  const ics = detail.value?.calendar?.icsUrl ? absoluteUrl(detail.value.calendar.icsUrl) : '';
  const lines = [title, when, g ? `Google Calendar: ${g}` : null, ics ? `ICS: ${ics}` : null].filter(Boolean);
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copyHint.value = 'Share text copied (title, times, calendar links).';
  } catch {
    copyHint.value = 'Could not copy.';
  }
  window.setTimeout(() => {
    copyHint.value = '';
  }, 4000);
}

async function loadDetail() {
  if (!agencyId.value || !eventId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/skill-builders/events/${eventId.value}/detail`, {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    detail.value = res.data;
    await loadSessions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    detail.value = null;
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadPosts() {
  if (!agencyId.value || !eventId.value) return;
  postsLoading.value = true;
  try {
    const res = await api.get(`/skill-builders/events/${eventId.value}/posts`, {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    posts.value = Array.isArray(res.data?.posts) ? res.data.posts : [];
  } catch {
    posts.value = [];
  } finally {
    postsLoading.value = false;
  }
}

async function submitPost() {
  if (!agencyId.value || !eventId.value || !newPostBody.value.trim()) return;
  postSaving.value = true;
  try {
    await api.post(
      `/skill-builders/events/${eventId.value}/posts`,
      { agencyId: agencyId.value, body: newPostBody.value.trim() },
      { skipGlobalLoading: true }
    );
    newPostBody.value = '';
    await loadPosts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Post failed';
  } finally {
    postSaving.value = false;
  }
}

async function clockIn() {
  if (!agencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const body = { agencyId: agencyId.value };
    if (kioskSessionId.value) body.sessionId = kioskSessionId.value;
    if (kioskClientId.value) body.clientId = kioskClientId.value;
    await api.post(`/skill-builders/events/${eventId.value}/kiosk/clock-in`, body, { skipGlobalLoading: true });
    clockMessage.value = 'Clocked in.';
  } catch (e) {
    clockMessage.value = e.response?.data?.error?.message || e.message || 'Failed';
  } finally {
    clockBusy.value = false;
  }
}

async function clockOut() {
  if (!agencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const res = await api.post(
      `/skill-builders/events/${eventId.value}/kiosk/clock-out`,
      { agencyId: agencyId.value },
      { skipGlobalLoading: true }
    );
    const d = res.data?.directHours;
    const ind = res.data?.indirectHours;
    clockMessage.value = `Clocked out. Payroll claim ${res.data?.payrollTimeClaimId || ''} created (direct ${d}h, indirect ${ind}h).`;
  } catch (e) {
    clockMessage.value = e.response?.data?.error?.message || e.message || 'Failed';
  } finally {
    clockBusy.value = false;
  }
}

async function ensureChatAndLoad() {
  if (!agencyId.value || !eventId.value) return;
  chatLoading.value = true;
  chatError.value = '';
  try {
    const r = await api.get(`/skill-builders/events/${eventId.value}/chat-thread`, {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    chatThreadId.value = r.data?.threadId ? Number(r.data.threadId) : null;
    if (!chatThreadId.value) {
      chatError.value = 'Chat thread not available';
      chatMessages.value = [];
      return;
    }
    const m = await api.get(`/chat/threads/${chatThreadId.value}/messages`, {
      params: { limit: 120 },
      skipGlobalLoading: true
    });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Chat unavailable';
    chatMessages.value = [];
  } finally {
    chatLoading.value = false;
  }
}

async function sendChat() {
  const tid = chatThreadId.value;
  const body = String(chatDraft.value || '').trim();
  if (!tid || !body) return;
  chatSending.value = true;
  try {
    await api.post(`/chat/threads/${tid}/messages`, { body }, { skipGlobalLoading: true });
    chatDraft.value = '';
    const m = await api.get(`/chat/threads/${tid}/messages`, { params: { limit: 120 }, skipGlobalLoading: true });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Send failed';
  } finally {
    chatSending.value = false;
  }
}

watch(
  () => [agencyId.value, eventId.value],
  () => {
    kioskSessionId.value = 0;
    kioskClientId.value = 0;
    loadDetail();
    loadPosts();
    ensureChatAndLoad();
  },
  { immediate: true }
);
</script>

<style scoped>
.sbep-wrap {
  display: flex;
  align-items: stretch;
  min-height: calc(100vh - 48px);
}
.sbep-main {
  flex: 1;
  min-width: 0;
}
.sbep-state {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}
.sbep-portal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 860px) {
  .sbep-portal-grid {
    grid-template-columns: 1fr;
  }
  .sbep-span-2 {
    grid-column: auto;
  }
}
.sbep-span-2 {
  grid-column: span 2;
}
.sbep-portal-card {
  padding: 18px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.sbep-portal-card:hover {
  border-color: rgba(15, 118, 110, 0.35);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.sbep-card-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbep-card-lead {
  margin: 0 0 12px;
  line-height: 1.45;
}
.sbep-inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sbep-clock-msg {
  margin-top: 10px;
}
.sbep-post-btn {
  margin-top: 8px;
}
.sbep-sessions-table-wrap {
  overflow-x: auto;
}
.sbep-sessions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.sbep-sessions-table th,
.sbep-sessions-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  vertical-align: top;
}
.sbep-sessions-table th {
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.sbep-sessions-staff-cell {
  min-width: 200px;
}
.sbep-session-staff-ms {
  display: block;
  width: 100%;
  max-width: 280px;
  min-height: 72px;
  margin-bottom: 6px;
  font-size: 0.82rem;
}
.sbep-session-staff-save {
  display: inline-block;
}
.sbep-sessions-staff-read {
  font-size: 0.86rem;
  line-height: 1.35;
}
.sbep-crumb {
  font-size: 0.85rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.sbep-crumb a {
  color: var(--primary, #0f766e);
  font-weight: 600;
  text-decoration: none;
}
.sbep-crumb a:hover {
  text-decoration: underline;
}
.sbep-crumb-sep {
  opacity: 0.55;
}
.sbep-nav-hint {
  margin: 0;
  font-size: 0.8rem;
  max-width: 260px;
  line-height: 1.35;
}
.sbep-calendar-card .sbep-card-title {
  margin-top: 0;
}
.sbep-calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sbep-copy-hint {
  margin: 10px 0 0;
}
.sbep-chat {
  width: 360px;
  max-width: 40vw;
  border-left: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  position: sticky;
  top: 0;
  align-self: flex-start;
  max-height: 100vh;
  overflow-y: auto;
}
.sbep-chat-inner {
  padding: 16px;
}
.sbep-chat-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
}
.sbep-chat-hint {
  font-size: 0.8rem;
  margin: 0 0 12px;
}
.sbep-chat-msgs {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 48vh;
  overflow-y: auto;
}
.sbep-chat-li {
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
}
.sbep-chat-meta {
  font-size: 0.72rem;
  color: var(--text-secondary, #64748b);
}
.sbep-chat-body {
  margin-top: 4px;
  white-space: pre-wrap;
  font-size: 0.88rem;
}
.sbep-chat-send {
  margin-top: 8px;
}
@media (max-width: 900px) {
  .sbep-wrap {
    flex-direction: column;
  }
  .sbep-chat {
    width: 100%;
    max-width: none;
    border-left: none;
    border-top: 1px solid var(--border, #e2e8f0);
    position: relative;
    max-height: none;
  }
}
.sbep-list {
  margin: 8px 0 16px;
  padding-left: 1.2rem;
}
.sbep-posts {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}
.sbep-post {
  padding: 10px 0;
  border-bottom: 1px solid #e2e8f0;
}
.sbep-post-meta {
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
}
.sbep-post-body {
  margin-top: 4px;
  white-space: pre-wrap;
}
.sbep-label {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 6px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error-box {
  color: #b91c1c;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
}
</style>
