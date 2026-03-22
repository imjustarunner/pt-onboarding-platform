<template>
  <Teleport to="body">
    <div v-if="modelValue" class="sb-ce-modal-overlay" @click.self="close">
      <div class="sb-ce-modal" role="dialog" aria-modal="true" aria-labelledby="sb-ce-edit-title" @click.stop>
        <div class="sb-ce-modal-header">
          <h2 id="sb-ce-edit-title" class="sb-ce-modal-title">Edit event</h2>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="close">Close</button>
        </div>
        <div class="sb-ce-modal-body">
          <div v-if="loadError" class="error-box sb-ce-msg">{{ loadError }}</div>
          <div v-else-if="loading" class="muted sb-ce-msg">Loading event…</div>
          <template v-else>
            <div v-if="formError" class="error-box sb-ce-msg">{{ formError }}</div>
            <div class="sb-ce-grid">
              <div class="form-group">
                <label class="sb-ce-lbl">Title</label>
                <input v-model.trim="draft.title" class="input" maxlength="255" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Event type</label>
                <input v-model.trim="draft.eventType" class="input" maxlength="64" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Program (optional)</label>
                <select v-model.number="draft.organizationId" class="input">
                  <option :value="0">Agency-wide (all programs)</option>
                  <option v-for="o in affiliateProgramOrgs" :key="o.id" :value="o.id">{{ o.name }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Active</label>
                <select v-model="draft.isActive" class="input">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Timezone</label>
                <input v-model.trim="draft.timezone" class="input" placeholder="e.g. America/Chicago" />
                <p class="muted small sb-ce-tz-hint">
                  Start/end times use this IANA timezone (not your computer clock alone). Integrated events use the
                  agency’s first office location timezone when synced from the school portal.
                </p>
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">Start</label>
                <input v-model="draft.startsAtLocal" class="input" type="datetime-local" />
              </div>
              <div class="form-group">
                <label class="sb-ce-lbl">End</label>
                <input v-model="draft.endsAtLocal" class="input" type="datetime-local" />
              </div>
              <template v-if="!isSkillsGroupIntegrated">
                <div class="form-group">
                  <label class="sb-ce-lbl">Recurrence</label>
                  <select v-model="draft.recurrence.frequency" class="input">
                    <option value="none">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Interval</label>
                  <input v-model.number="draft.recurrence.interval" class="input" type="number" min="1" max="24" />
                </div>
              </template>
            </div>

            <div v-if="isSkillsGroupIntegrated" class="sb-ce-section muted small sb-ce-sg-recur-info">
              <p class="sb-ce-sg-recur-p">
                <strong>Integrated Skill Builders group:</strong> the start/end fields above are the <em>program date
                span</em>. Which weekdays you meet and at what times are edited with <strong>Save week pattern</strong> on
                the event page (see below). The system generates <strong>scheduled sessions</strong> from that pattern for
                kiosk and attendance.
              </p>
            </div>

            <div v-if="skillsGroupMeetingsPreview.length" class="sb-ce-section">
              <strong class="sb-ce-subhead">Program week pattern</strong>
              <p class="muted small sb-ce-pattern-lead">
                Recurring slots for this skills group (same as the Program week pattern card on this page). To change
                them, close this modal and use <strong>Save week pattern</strong> there. This modal does not edit
                meeting times.
              </p>
              <ul class="sb-ce-pattern-list">
                <li v-for="(m, i) in skillsGroupMeetingsPreview" :key="i">
                  {{ m.weekday }} · {{ formatHm(m.startTime) }}–{{ formatHm(m.endTime) }}
                </li>
              </ul>
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency === 'weekly'" class="form-group">
              <label class="sb-ce-lbl">Weekdays</label>
              <div class="sb-ce-chips">
                <label v-for="d in weekdayOptions" :key="d.value" class="sb-ce-chip">
                  <input
                    type="checkbox"
                    :checked="draft.recurrence.byWeekday.includes(d.value)"
                    @change="toggleWeekday(d.value, $event.target.checked)"
                  />
                  <span>{{ d.label }}</span>
                </label>
              </div>
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency === 'monthly'" class="form-group">
              <label class="sb-ce-lbl">Day of month</label>
              <input v-model.number="draft.recurrence.byMonthDay" class="input" type="number" min="1" max="31" />
            </div>

            <div v-if="!isSkillsGroupIntegrated && draft.recurrence.frequency !== 'none'" class="form-group">
              <label class="sb-ce-lbl">Repeat until (optional)</label>
              <input v-model="draft.recurrence.untilDate" class="input" type="date" />
            </div>

            <div class="form-group">
              <label class="sb-ce-lbl">Description</label>
              <textarea v-model.trim="draft.description" class="input" rows="2" />
            </div>
            <div class="form-group">
              <label class="sb-ce-lbl">Splash content</label>
              <textarea v-model.trim="draft.splashContent" class="input" rows="2" />
            </div>

            <div class="form-group">
              <label class="sb-ce-lbl">Skill Builders — direct hours (payroll)</label>
              <input v-model.number="draft.skillBuilderDirectHours" class="input" type="number" min="0" step="0.25" />
            </div>

            <div class="sb-ce-section">
              <strong>Guardian registration catalog</strong>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Registration eligible</label>
                  <select v-model="draft.registrationEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Medicaid eligible</label>
                  <select v-model="draft.medicaidEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Cash / self-pay</label>
                  <select v-model="draft.cashEligible" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="sb-ce-section">
              <strong>RSVP / voting</strong>
              <div class="sb-ce-grid sb-ce-grid-tight">
                <div class="form-group">
                  <label class="sb-ce-lbl">Mode</label>
                  <select v-model="draft.rsvpMode" class="input">
                    <option value="none">Disabled</option>
                    <option value="yes_no_maybe">Yes/No/Maybe</option>
                    <option value="custom_vote">Custom vote</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="sb-ce-lbl">Voting enabled</label>
                  <select v-model="draft.votingConfig.enabled" class="input">
                    <option :value="false">No</option>
                    <option :value="true">Yes</option>
                  </select>
                </div>
              </div>
              <template v-if="draft.votingConfig.enabled">
                <div class="sb-ce-grid">
                  <div class="form-group">
                    <label class="sb-ce-lbl">Question</label>
                    <input v-model.trim="draft.votingConfig.question" class="input" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">SMS voting</label>
                    <select v-model="draft.votingConfig.viaSms" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                  <div v-if="draft.votingConfig.viaSms" class="form-group">
                    <label class="sb-ce-lbl">SMS code</label>
                    <input v-model.trim="draft.smsCode" class="input" maxlength="32" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Voting closes (optional)</label>
                    <input v-model="draft.votingClosedAtLocal" class="input" type="datetime-local" />
                  </div>
                </div>
                <div
                  v-for="(opt, idx) in draft.votingConfig.options"
                  :key="`opt-${idx}`"
                  class="sb-ce-opt-row form-group"
                >
                  <label class="sb-ce-lbl">Option {{ idx + 1 }}</label>
                  <div class="sb-ce-opt-pair">
                    <input v-model.trim="opt.key" class="input sb-ce-opt-key" maxlength="8" />
                    <input v-model.trim="opt.label" class="input" maxlength="64" />
                  </div>
                </div>
                <div class="sb-ce-grid">
                  <div class="form-group">
                    <label class="sb-ce-lbl">Reminders</label>
                    <select v-model="draft.reminderConfig.enabled" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">Reminder offsets (hours, comma)</label>
                    <input v-model="draft.reminderOffsetsRaw" class="input" placeholder="24,2" />
                  </div>
                  <div class="form-group">
                    <label class="sb-ce-lbl">SMS channel</label>
                    <select v-model="draft.reminderConfig.channels.sms" class="input">
                      <option :value="false">No</option>
                      <option :value="true">Yes</option>
                    </select>
                  </div>
                </div>
              </template>
            </div>

            <p class="muted small sb-ce-hint">
              Audience targeting is unchanged here. To edit who sees this event, use Agency → Company events.
            </p>

            <div class="sb-ce-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const loading = ref(false);
const loadError = ref('');
const formError = ref('');
const saving = ref(false);
const affiliateProgramOrgs = ref([]);
/** Linked skills_group_meetings rows for display (from GET company-event-edit). */
const skillsGroupMeetingsPreview = ref([]);

const isSkillsGroupIntegrated = computed(
  () => String(draft.value.eventType || '').toLowerCase() === 'skills_group'
);

const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

function emptyDraft() {
  return {
    title: '',
    description: '',
    eventType: 'company_event',
    splashContent: '',
    timezone: 'UTC',
    isActive: true,
    organizationId: 0,
    startsAtLocal: '',
    endsAtLocal: '',
    votingClosedAtLocal: '',
    recurrence: {
      frequency: 'none',
      interval: 1,
      byWeekday: [],
      byMonthDay: null,
      untilDate: ''
    },
    rsvpMode: 'none',
    smsCode: '',
    votingConfig: {
      enabled: false,
      viaSms: false,
      question: '',
      options: [
        { key: '1', label: 'Yes' },
        { key: '2', label: 'No' },
        { key: '3', label: 'Maybe' }
      ]
    },
    reminderConfig: {
      enabled: false,
      offsetsHours: [24, 2],
      channels: { inApp: true, sms: false }
    },
    reminderOffsetsRaw: '24,2',
    audience: { userIds: [], groupIds: [], roleKeys: [] },
    skillBuilderDirectHours: null,
    registrationEligible: false,
    medicaidEligible: false,
    cashEligible: false
  };
}

const draft = ref(emptyDraft());

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function isValidTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    )
  );
  return date.getTime() - asUtc.getTime();
}

/** Format an instant as yyyy-MM-ddTHH:mm in the given IANA zone (for datetime-local inputs). */
function instantToDatetimeLocalInZone(dateLike, timeZone) {
  const date = new Date(dateLike || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  if (tz === 'UTC') {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }
  if (!isValidTimeZone(tz)) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = fmt.formatToParts(date);
    const m = {};
    for (const p of parts) {
      if (p.type !== 'literal') m[p.type] = p.value;
    }
    return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
  } catch {
    return '';
  }
}

/** Parse datetime-local string as wall time in IANA zone → ISO UTC. */
function datetimeLocalInZoneToIso(localStr, timeZone) {
  const raw = String(localStr || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  if (tz === 'UTC') {
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  }
  if (!isValidTimeZone(tz)) return null;
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(guess, tz);
    guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0) + offset);
  }
  return guess.toISOString();
}

/** Stored UTC on integrated events is misleading in the UI; prefer a real zone or the browser zone. */
function resolveEditTimeZone(event) {
  const raw = String(event?.timezone || '').trim();
  if (raw && raw.toUpperCase() !== 'UTC' && isValidTimeZone(raw)) return raw;
  return browserTimeZone();
}

function populateFromEvent(event) {
  if (!event) {
    draft.value = emptyDraft();
    return;
  }
  const editTz = resolveEditTimeZone(event);
  draft.value = {
    title: event.title || '',
    description: event.description || '',
    eventType: event.eventType || 'company_event',
    splashContent: event.splashContent || '',
    timezone: editTz,
    isActive: event.isActive !== false,
    organizationId:
      event.organizationId != null && event.organizationId !== '' && Number(event.organizationId) > 0
        ? Number(event.organizationId)
        : 0,
    startsAtLocal: instantToDatetimeLocalInZone(event.startsAt, editTz),
    endsAtLocal: instantToDatetimeLocalInZone(event.endsAt, editTz),
    votingClosedAtLocal: instantToDatetimeLocalInZone(event.votingClosedAt, editTz),
    recurrence: {
      frequency: String(event.recurrence?.frequency || 'none'),
      interval: Number(event.recurrence?.interval || 1),
      byWeekday: Array.isArray(event.recurrence?.byWeekday) ? event.recurrence.byWeekday.map((x) => Number(x)) : [],
      byMonthDay: event.recurrence?.byMonthDay ?? null,
      untilDate: event.recurrence?.untilDate || ''
    },
    rsvpMode: event.rsvpMode || 'none',
    smsCode: event.smsCode || '',
    votingConfig: {
      enabled: !!event.votingConfig?.enabled,
      viaSms: !!event.votingConfig?.viaSms,
      question: event.votingConfig?.question || '',
      options: Array.isArray(event.votingConfig?.options) && event.votingConfig.options.length
        ? event.votingConfig.options.map((o) => ({ key: String(o.key || ''), label: String(o.label || '') }))
        : [
            { key: '1', label: 'Yes' },
            { key: '2', label: 'No' },
            { key: '3', label: 'Maybe' }
          ]
    },
    reminderConfig: {
      enabled: !!event.reminderConfig?.enabled,
      offsetsHours: Array.isArray(event.reminderConfig?.offsetsHours)
        ? event.reminderConfig.offsetsHours.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
        : [24, 2],
      channels: {
        inApp: event.reminderConfig?.channels?.inApp !== false,
        sms: !!event.reminderConfig?.channels?.sms
      }
    },
    reminderOffsetsRaw: Array.isArray(event.reminderConfig?.offsetsHours) && event.reminderConfig.offsetsHours.length
      ? event.reminderConfig.offsetsHours.join(',')
      : '24,2',
    audience: {
      userIds: Array.isArray(event.audience?.userIds) ? event.audience.userIds.map((id) => Number(id)) : [],
      groupIds: Array.isArray(event.audience?.groupIds) ? event.audience.groupIds.map((id) => Number(id)) : [],
      roleKeys: Array.isArray(event.audience?.roleKeys) ? event.audience.roleKeys.map((k) => String(k)) : []
    },
    skillBuilderDirectHours:
      event.skillBuilderDirectHours != null && event.skillBuilderDirectHours !== ''
        ? Number(event.skillBuilderDirectHours)
        : null,
    registrationEligible: !!event.registrationEligible,
    medicaidEligible: !!event.medicaidEligible,
    cashEligible: !!event.cashEligible
  };
}

function normalizeRecurrenceForPayload(recurrence = {}) {
  const frequency = String(recurrence.frequency || 'none');
  const payload = { frequency };
  if (frequency === 'none') return payload;
  payload.interval = Math.max(1, Number.parseInt(String(recurrence.interval || 1), 10) || 1);
  if (frequency === 'weekly') {
    payload.byWeekday = Array.isArray(recurrence.byWeekday)
      ? recurrence.byWeekday.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : [];
  }
  if (frequency === 'monthly') {
    const monthDay = Number.parseInt(String(recurrence.byMonthDay || ''), 10);
    if (Number.isFinite(monthDay) && monthDay >= 1 && monthDay <= 31) payload.byMonthDay = monthDay;
  }
  if (recurrence.untilDate) payload.untilDate = recurrence.untilDate;
  return payload;
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function toggleWeekday(weekday, checked) {
  const set = new Set(draft.value.recurrence.byWeekday);
  if (checked) set.add(Number(weekday));
  else set.delete(Number(weekday));
  draft.value.recurrence.byWeekday = [...set].sort((a, b) => a - b);
}

async function loadAffiliateProgramOrgs() {
  affiliateProgramOrgs.value = [];
  if (!props.agencyId) return;
  try {
    const res = await api.get('/availability/admin/skill-builders/options', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const orgs = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    affiliateProgramOrgs.value = orgs.filter((o) => String(o.organizationType || '').toLowerCase() !== 'school');
  } catch {
    affiliateProgramOrgs.value = [];
  }
}

async function loadEditBundle() {
  loadError.value = '';
  loading.value = true;
  try {
    const [evRes] = await Promise.all([
      api.get(`/skill-builders/events/${props.eventId}/company-event-edit`, {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }),
      loadAffiliateProgramOrgs()
    ]);
    skillsGroupMeetingsPreview.value = Array.isArray(evRes.data?.skillsGroupMeetings)
      ? evRes.data.skillsGroupMeetings.map((x) => ({ ...x }))
      : [];
    populateFromEvent(evRes.data?.event);
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load event';
    skillsGroupMeetingsPreview.value = [];
    draft.value = emptyDraft();
  } finally {
    loading.value = false;
  }
}

function close() {
  if (saving.value) return;
  emit('update:modelValue', false);
}

async function save() {
  formError.value = '';
  const tz = String(draft.value.timezone || '').trim();
  if (!isValidTimeZone(tz)) {
    formError.value = 'Enter a valid IANA timezone (e.g. America/Chicago).';
    return;
  }
  const startsAtIso = datetimeLocalInZoneToIso(draft.value.startsAtLocal, tz);
  const endsAtIso = datetimeLocalInZoneToIso(draft.value.endsAtLocal, tz);
  const startsAt = startsAtIso ? new Date(startsAtIso) : null;
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  if (!draft.value.title.trim()) {
    formError.value = 'Title is required.';
    return;
  }
  if (!startsAt || !endsAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    formError.value = 'Start and end dates are required.';
    return;
  }
  if (endsAt <= startsAt) {
    formError.value = 'End time must be after start time.';
    return;
  }
  let votingClosedAt = null;
  if (draft.value.votingClosedAtLocal) {
    votingClosedAt = datetimeLocalInZoneToIso(draft.value.votingClosedAtLocal, tz);
  }

  saving.value = true;
  try {
    const payload = {
      title: draft.value.title,
      description: draft.value.description,
      eventType: draft.value.eventType || 'company_event',
      splashContent: draft.value.splashContent,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone: tz,
      isActive: !!draft.value.isActive,
      recurrence: normalizeRecurrenceForPayload(draft.value.recurrence),
      rsvpMode: draft.value.rsvpMode,
      smsCode: draft.value.smsCode || null,
      votingClosedAt,
      votingConfig: {
        enabled: !!draft.value.votingConfig.enabled,
        viaSms: !!draft.value.votingConfig.viaSms,
        question: String(draft.value.votingConfig.question || '').trim(),
        options: (Array.isArray(draft.value.votingConfig.options) ? draft.value.votingConfig.options : [])
          .map((o) => ({
            key: String(o.key || '').trim(),
            label: String(o.label || '').trim()
          }))
          .filter((o) => o.key && o.label)
      },
      reminderConfig: {
        enabled: !!draft.value.reminderConfig.enabled,
        offsetsHours: String(draft.value.reminderOffsetsRaw || '')
          .split(',')
          .map((n) => Number.parseInt(String(n).trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0),
        channels: {
          inApp: true,
          sms: !!draft.value.reminderConfig.channels.sms
        }
      },
      audience: {
        userIds: draft.value.audience.userIds,
        groupIds: draft.value.audience.groupIds,
        roleKeys: draft.value.audience.roleKeys
      },
      skillBuilderDirectHours:
        draft.value.skillBuilderDirectHours === '' || draft.value.skillBuilderDirectHours == null
          ? null
          : Number(draft.value.skillBuilderDirectHours),
      organizationId:
        draft.value.organizationId && Number(draft.value.organizationId) > 0
          ? Number(draft.value.organizationId)
          : null,
      registrationEligible: !!draft.value.registrationEligible,
      medicaidEligible: !!draft.value.medicaidEligible,
      cashEligible: !!draft.value.cashEligible
    };

    await api.put(
      `/skill-builders/events/${props.eventId}/company-event-edit`,
      { agencyId: props.agencyId, ...payload },
      { skipGlobalLoading: true }
    );
    emit('update:modelValue', false);
    emit('saved');
  } catch (e) {
    formError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formError.value = '';
      loadEditBundle();
    } else {
      loadError.value = '';
      skillsGroupMeetingsPreview.value = [];
      draft.value = emptyDraft();
    }
  }
);
</script>

<style scoped>
.sb-ce-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 12px;
  overflow-y: auto;
}
.sb-ce-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
  border: 1px solid var(--border, #e2e8f0);
}
.sb-ce-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sb-ce-modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sb-ce-modal-body {
  padding: 16px 18px 20px;
  overflow-y: auto;
}
.sb-ce-msg {
  margin-bottom: 12px;
}
.sb-ce-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sb-ce-grid-tight {
  margin-top: 8px;
}
.sb-ce-lbl {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-secondary, #475569);
}
.sb-ce-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sb-ce-subhead {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 6px;
  color: var(--primary, #0f766e);
}
.sb-ce-pattern-lead {
  margin: 0 0 10px;
  line-height: 1.45;
}
.sb-ce-pattern-list {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.5;
}
.sb-ce-recur-note {
  margin: 0 0 12px;
  line-height: 1.45;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.sb-ce-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sb-ce-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border, #e2e8f0);
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.85rem;
}
.sb-ce-opt-pair {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
}
.sb-ce-opt-key {
  text-transform: uppercase;
}
.sb-ce-hint {
  margin: 12px 0 0;
  line-height: 1.4;
}
.sb-ce-tz-hint {
  margin: 6px 0 0;
  line-height: 1.35;
}
.sb-ce-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.error-box {
  color: #b91c1c;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 8px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.small {
  font-size: 0.8rem;
}
@media (max-width: 640px) {
  .sb-ce-grid {
    grid-template-columns: 1fr;
  }
}
</style>
