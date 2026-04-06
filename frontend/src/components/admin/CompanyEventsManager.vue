<template>
  <section class="company-events-manager">
    <div class="header-row">
      <div>
        <h4>{{ title }}</h4>
        <small class="hint">{{ subtitle }}</small>
        <div class="hint" :class="{ 'status-ready': smsReadiness.ready, 'status-not-ready': !smsReadiness.ready }" style="margin-top: 4px;">
          Company Events SMS: {{ smsReadiness.message }}
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="loadAll" :disabled="loading || !agencyId">
          {{ loading ? 'Loading…' : reloadLabel }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="startCreate" :disabled="saving || !agencyId">
          {{ newEventLabel }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="startDirectMessage" :disabled="saving || !agencyId">
          {{ newDirectMessageLabel }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-modal"><strong>Error:</strong> {{ error }}</div>

    <div class="template-bar">
      <label class="lbl" for="direct-template">Direct message template</label>
      <select id="direct-template" v-model="selectedTemplateId" class="input">
        <option value="">Select template…</option>
        <option v-for="tpl in directMessageTemplates" :key="tpl.id" :value="String(tpl.id)">{{ tpl.name || tpl.label }}</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!selectedTemplateId" @click="applyDirectTemplate">
        Apply template
      </button>
    </div>

    <div class="editor-card">
      <h5 style="margin: 0 0 10px 0;">{{ draft.id ? editEventLabel : createEventLabel }}</h5>
      <div class="grid">
        <div class="form-group">
          <label class="lbl">Title</label>
          <input v-model.trim="draft.title" class="input" maxlength="255" placeholder="Monthly Book Club" />
        </div>
        <div class="form-group">
          <label class="lbl">Event type</label>
          <select v-model="eventTypeSelection" class="input">
            <option v-for="opt in EVENT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            <option value="__custom__">Custom</option>
          </select>
          <input
            v-if="eventTypeSelection === '__custom__'"
            v-model.trim="draft.eventType"
            class="input"
            maxlength="64"
            placeholder="book_club"
            style="margin-top:6px;"
          />
        </div>
        <div class="form-group">
          <label class="lbl">Program (optional)</label>
          <select v-model.number="draft.organizationId" class="input">
            <option :value="0">Agency-wide (all programs)</option>
            <option v-for="o in affiliateProgramOrgs" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <small class="hint">Link this event to a specific affiliated program for sub-coordinator dashboards.</small>
        </div>
        <div class="form-group">
          <label class="lbl">Timezone</label>
          <select v-model="draft.timezone" class="input">
            <option v-for="tz in TIMEZONE_OPTIONS" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="lbl">Start</label>
          <input v-model="draft.startsAtLocal" class="input" type="datetime-local" />
        </div>
        <div class="form-group">
          <label class="lbl">End</label>
          <input v-model="draft.endsAtLocal" class="input" type="datetime-local" />
        </div>
        <div class="form-group">
          <label class="lbl">Recurrence</label>
          <select v-model="draft.recurrence.frequency" class="input">
            <option value="none">One-time</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div class="form-group">
          <label class="lbl">Interval</label>
          <input v-model.number="draft.recurrence.interval" class="input" type="number" min="1" max="24" />
        </div>
      </div>

      <div v-if="draft.recurrence.frequency === 'weekly'" class="form-group">
        <label class="lbl">Weekdays</label>
        <div class="chips">
          <label v-for="d in weekdayOptions" :key="d.value" class="chip-toggle">
            <input type="checkbox" :checked="draft.recurrence.byWeekday.includes(d.value)" @change="toggleWeekday(d.value, $event.target.checked)" />
            <span>{{ d.label }}</span>
          </label>
        </div>
      </div>

      <div v-if="draft.recurrence.frequency === 'monthly'" class="grid">
        <div class="form-group">
          <label class="lbl">Day of month</label>
          <input v-model.number="draft.recurrence.byMonthDay" class="input" type="number" min="1" max="31" />
        </div>
      </div>

      <div v-if="draft.recurrence.frequency !== 'none'" class="form-group">
        <label class="lbl">Repeat until (optional)</label>
        <input v-model="draft.recurrence.untilDate" class="input" type="date" />
      </div>

      <div class="form-group">
        <label class="lbl">Description</label>
        <textarea v-model.trim="draft.description" class="input" rows="2" placeholder="Event details shown in calendar invite." />
      </div>

      <div class="form-group">
        <label class="lbl">Splash content</label>
        <textarea v-model.trim="draft.splashContent" class="input" rows="3" placeholder="Reminder details for dashboard splash." />
      </div>

      <div class="form-group">
        <label class="lbl">Skill Builders — direct hours (payroll)</label>
        <input
          v-model.number="draft.skillBuilderDirectHours"
          class="input"
          type="number"
          min="0"
          step="0.25"
          placeholder="e.g. 2"
        />
        <small class="hint">Optional. Used on kiosk clock-out for Skill Builders payroll claims. Leave empty if not applicable.</small>
      </div>

      <div class="form-group">
        <label class="lbl">Guardian registration catalog</label>
        <div class="grid" style="margin-top: 6px;">
          <div class="form-group">
            <label class="lbl">Registration eligible</label>
            <select v-model="draft.registrationEligible" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
          <div class="form-group">
            <label class="lbl">Medicaid eligible</label>
            <select v-model="draft.medicaidEligible" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
          <div class="form-group">
            <label class="lbl">Cash / self-pay eligible</label>
            <select v-model="draft.cashEligible" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
        <small class="hint">When registration is eligible, guardians can see this event in the portal catalog (after migration 583).</small>
      </div>

      <div class="form-group">
        <label class="lbl">Public registration page</label>
        <small class="hint" style="display: block; margin-bottom: 8px;">
          Listed on the agency public events page when the event is registration-eligible and has an active Smart
          Registration link for this event.
        </small>
        <label class="lbl" style="font-weight: 500;">Hero image URL</label>
        <input v-model.trim="draft.publicHeroImageUrl" class="input" type="url" placeholder="https://…" />
        <label class="lbl" style="font-weight: 500; margin-top: 8px;">Extra public details</label>
        <textarea v-model.trim="draft.publicListingDetails" class="input" rows="2" placeholder="Plain text for families" />
        <div class="grid" style="margin-top: 8px;">
          <div class="form-group">
            <label class="lbl">In person on public page</label>
            <select v-model="draft.inPersonPublic" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
        <div v-if="draft.inPersonPublic" class="form-group">
          <label class="lbl">Venue address</label>
          <textarea v-model.trim="draft.publicLocationAddress" class="input" rows="2" placeholder="Full address" />
        </div>
      </div>

      <div v-if="!isServiceProgramEventType" class="voting-block">
        <strong>RSVP / voting</strong>
        <div class="grid" style="margin-top: 8px;">
          <div class="form-group">
            <label class="lbl">Mode</label>
            <select v-model="draft.rsvpMode" class="input">
              <option value="none">Disabled</option>
              <option value="yes_no_maybe">Yes/No/Maybe</option>
              <option value="custom_vote">Custom vote</option>
            </select>
          </div>
          <div class="form-group">
            <label class="lbl">Voting enabled</label>
            <select v-model="draft.votingConfig.enabled" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
        <div v-if="draft.votingConfig.enabled" class="grid">
          <div class="form-group">
            <label class="lbl">Question</label>
            <input v-model.trim="draft.votingConfig.question" class="input" placeholder="Will you attend?" />
          </div>
          <div class="form-group">
            <label class="lbl">SMS voting</label>
            <select v-model="draft.votingConfig.viaSms" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
          <div v-if="draft.votingConfig.viaSms" class="form-group">
            <label class="lbl">SMS code</label>
            <input v-model.trim="draft.smsCode" class="input" maxlength="32" placeholder="BOOKCLUB" />
          </div>
        </div>
        <div v-if="draft.votingConfig.enabled" class="grid">
          <div v-for="(opt, idx) in draft.votingConfig.options" :key="`opt-${idx}`" class="form-group">
            <label class="lbl">Option {{ idx + 1 }}</label>
            <div class="option-row">
              <input v-model.trim="opt.key" class="input opt-key" maxlength="8" placeholder="1" />
              <input v-model.trim="opt.label" class="input" maxlength="64" placeholder="Yes" />
            </div>
          </div>
        </div>
        <div v-if="draft.votingConfig.enabled" class="grid" style="margin-top: 6px;">
          <div class="form-group">
            <label class="lbl">Reminders enabled</label>
            <select v-model="draft.reminderConfig.enabled" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
          <div v-if="draft.reminderConfig.enabled" class="form-group">
            <label class="lbl">Offsets (hours before)</label>
            <input v-model.trim="draft.reminderOffsetsRaw" class="input" placeholder="24,2" />
          </div>
          <div v-if="draft.reminderConfig.enabled" class="form-group">
            <label class="lbl">Reminder SMS</label>
            <select v-model="draft.reminderConfig.channels.sms" class="input">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
      </div>

      <div class="audience-block">
        <div class="audience-head">
          <strong>Audience targeting</strong>
          <button type="button" class="btn-link" @click="clearAudience">Clear</button>
        </div>
        <small class="hint">If no users/groups are selected, the event is visible to the full agency.</small>
        <div class="audience-grid">
          <div>
            <div class="audience-title">Individuals ({{ draft.audience.userIds.length }} selected)</div>
            <div class="select-list">
              <label v-for="user in audienceUsers" :key="`u-${user.id}`" class="select-item">
                <input type="checkbox" :checked="draft.audience.userIds.includes(user.id)" @change="toggleUser(user.id, $event.target.checked)" />
                <span>{{ user.name }}</span>
              </label>
            </div>
          </div>
          <div>
            <div class="audience-title">Groups ({{ draft.audience.groupIds.length }} selected)</div>
            <div class="select-list">
              <label v-for="group in audienceGroups" :key="`g-${group.id}`" class="select-item">
                <input type="checkbox" :checked="draft.audience.groupIds.includes(group.id)" @change="toggleGroup(group.id, $event.target.checked)" />
                <span>{{ group.name }}</span>
              </label>
            </div>
          </div>
          <div>
            <div class="audience-title">Roles ({{ draft.audience.roleKeys.length }} selected)</div>
            <div class="select-list">
              <label v-for="role in audienceRoles" :key="`r-${role.key}`" class="select-item">
                <input type="checkbox" :checked="draft.audience.roleKeys.includes(role.key)" @change="toggleRole(role.key, $event.target.checked)" />
                <span>{{ role.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top: 10px;">
        <button type="button" class="btn btn-secondary btn-sm" @click="resetDraft" :disabled="saving">Reset</button>
        <button type="button" class="btn btn-primary btn-sm" @click="saveEvent" :disabled="saving || !agencyId">
          {{ saving ? 'Saving…' : (draft.id ? 'Update event' : 'Create event') }}
        </button>
      </div>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Program</th>
            <th>When</th>
            <th>Audience</th>
            <th>Voting</th>
            <th>Calendar</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td>
              <div style="font-weight: 600;">{{ event.title }}</div>
              <div class="hint">{{ (event.eventType || 'company_event') === 'direct_notice' ? 'direct_message' : (event.eventType || 'company_event') }}</div>
            </td>
            <td class="hint">{{ programLabelForEvent(event) }}</td>
            <td>
              <div>{{ formatDate(event.startsAt) }} - {{ formatDate(event.endsAt) }}</div>
              <div class="hint">{{ recurrenceLabel(event.recurrence) }}</div>
            </td>
            <td class="hint">{{ audienceLabel(event.audience) }}</td>
            <td>
              <div class="hint">{{ event.votingConfig?.enabled ? 'Enabled' : 'Disabled' }}<span v-if="event.votingClosedAt"> (closed)</span></div>
              <div class="hint" v-if="event.responseSummary?.length">
                <span v-for="(s, idx) in event.responseSummary" :key="`${event.id}-s-${idx}`">
                  {{ s.label }}: {{ s.total }}<span v-if="idx < event.responseSummary.length - 1"> · </span>
                </span>
              </div>
            </td>
            <td>
              <a v-if="event.googleCalendarUrl" :href="event.googleCalendarUrl" target="_blank" rel="noopener">Google</a>
              <span v-if="event.googleCalendarUrl"> · </span>
              <a :href="event.icsUrl">ICS</a>
            </td>
            <td class="row-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="editEvent(event)">Edit</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="sendDirectMessage(event)" :disabled="saving">Send message</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="sendSmsVote(event)" :disabled="saving || !event.votingConfig?.enabled || !event.votingConfig?.viaSms || !!event.votingClosedAt">Send SMS</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="viewDeliveryLogs(event)" :disabled="saving">Delivery</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="downloadResponsesCsv(event)" :disabled="saving">CSV</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="closeVoting(event)" :disabled="saving || !event.votingConfig?.enabled || !!event.votingClosedAt">Close</button>
              <button type="button" class="btn btn-danger btn-sm" @click="removeEvent(event)" :disabled="saving">Delete</button>
            </td>
          </tr>
          <tr v-if="!events.length">
            <td colspan="7" class="hint">{{ emptyEventsLabel }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const affiliateProgramOrgs = ref([]);

const props = defineProps({
  agencyId: {
    type: Number,
    default: null
  },
  title: {
    type: String,
    default: 'Company events'
  },
  subtitle: {
    type: String,
    default: 'Phase 2: RSVP + SMS voting for targeted internal events.'
  },
  reloadLabel: {
    type: String,
    default: 'Reload'
  },
  newEventLabel: {
    type: String,
    default: 'New event'
  },
  newDirectMessageLabel: {
    type: String,
    default: 'New direct message'
  },
  createEventLabel: {
    type: String,
    default: 'Create event'
  },
  editEventLabel: {
    type: String,
    default: 'Edit event'
  },
  emptyEventsLabel: {
    type: String,
    default: 'No company events yet.'
  }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const events = ref([]);
const audienceUsers = ref([]);
const audienceGroups = ref([]);
const audienceRoles = ref([]);
const selectedTemplateId = ref('');
const directMessageTemplates = ref([
  {
    id: 'congrats',
    name: 'Congrats',
    titleTemplate: 'Congratulations!',
    messageTemplate: "Congratulations on your achievement. We are proud of your work."
  },
  {
    id: 'pickup-prize',
    name: 'Prize pickup',
    titleTemplate: 'Prize pickup',
    messageTemplate: 'Please come by the office this week to pick up your prize.'
  },
  {
    id: 'come-to-office',
    name: 'Come to office',
    titleTemplate: 'Office visit request',
    messageTemplate: 'Please come to the office when you can. See front desk on arrival.'
  }
]);
const smsReadiness = ref({
  ready: false,
  message: 'Not configured'
});

const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'UTC', label: 'UTC' }
];

const EVENT_TYPE_OPTIONS = [
  { value: 'company_event', label: 'Company Event' },
  { value: 'staff_event', label: 'Staff/Internal Event' }
];

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const emptyDraft = () => ({
  id: null,
  organizationId: 0,
  title: '',
  description: '',
  eventType: 'company_event',
  timezone: browserTimeZone(),
  splashContent: '',
  startsAtLocal: '',
  endsAtLocal: '',
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
    channels: {
      inApp: true,
      sms: false
    }
  },
  reminderOffsetsRaw: '24,2',
  audience: {
    userIds: [],
    groupIds: [],
    roleKeys: []
  },
  skillBuilderDirectHours: null,
  registrationEligible: false,
  medicaidEligible: false,
  cashEligible: false,
  publicHeroImageUrl: '',
  publicListingDetails: '',
  inPersonPublic: false,
  publicLocationAddress: ''
});

const draft = ref(emptyDraft());
const eventTypeSelection = computed({
  get() {
    const raw = String(draft.value.eventType || '').trim();
    return EVENT_TYPE_OPTIONS.some((opt) => opt.value === raw) ? raw : '__custom__';
  },
  set(next) {
    const value = String(next || '').trim();
    if (value === '__custom__') {
      if (!draft.value.eventType || EVENT_TYPE_OPTIONS.some((opt) => opt.value === draft.value.eventType)) {
        draft.value.eventType = '';
      }
      return;
    }
    draft.value.eventType = value;
  }
});
const isServiceProgramEventType = computed(() => {
  const t = String(draft.value.eventType || '').trim().toLowerCase();
  return t === 'guardian_program_class' || t === 'program_event' || t.startsWith('program_');
});

const formatDate = (dateLike) => {
  const date = new Date(dateLike || 0);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

const toLocalInput = (dateLike) => {
  const date = new Date(dateLike || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

const recurrenceLabel = (recurrence) => {
  const frequency = String(recurrence?.frequency || 'none');
  if (frequency === 'none') return 'One-time';
  if (frequency === 'weekly') return `Weekly (every ${Number(recurrence?.interval || 1)} week${Number(recurrence?.interval || 1) > 1 ? 's' : ''})`;
  if (frequency === 'monthly') return `Monthly (every ${Number(recurrence?.interval || 1)} month${Number(recurrence?.interval || 1) > 1 ? 's' : ''})`;
  return 'Recurring';
};

const audienceLabel = (audience) => {
  const users = Array.isArray(audience?.userIds) ? audience.userIds.length : 0;
  const groups = Array.isArray(audience?.groupIds) ? audience.groupIds.length : 0;
  const roles = Array.isArray(audience?.roleKeys) ? audience.roleKeys.length : 0;
  if (!users && !groups && !roles) return 'All agency users';
  return `${users} user(s), ${groups} group(s), ${roles} role(s)`;
};

const programLabelForEvent = (event) => {
  const id = event?.organizationId;
  if (id === null || id === undefined || id === '') return '—';
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const o = affiliateProgramOrgs.value.find((x) => Number(x.id) === n);
  return o?.name ? String(o.name) : `Org ${n}`;
};

const normalizeRecurrenceForPayload = (recurrence = {}) => {
  const frequency = String(recurrence.frequency || 'none');
  const payload = { frequency };
  if (frequency === 'none') return payload;
  payload.interval = Math.max(1, Number.parseInt(String(recurrence.interval || 1), 10) || 1);
  if (frequency === 'weekly') {
    payload.byWeekday = Array.isArray(recurrence.byWeekday) ? recurrence.byWeekday.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6) : [];
  }
  if (frequency === 'monthly') {
    const monthDay = Number.parseInt(String(recurrence.byMonthDay || ''), 10);
    if (Number.isFinite(monthDay) && monthDay >= 1 && monthDay <= 31) payload.byMonthDay = monthDay;
  }
  if (recurrence.untilDate) payload.untilDate = recurrence.untilDate;
  return payload;
};

const resetDraft = () => {
  draft.value = emptyDraft();
};

const startCreate = () => {
  resetDraft();
};

const startDirectMessage = () => {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  draft.value = {
    ...emptyDraft(),
    eventType: 'direct_notice',
    title: 'Direct message',
    startsAtLocal: toLocalInput(now),
    endsAtLocal: toLocalInput(end),
    recurrence: {
      frequency: 'none',
      interval: 1,
      byWeekday: [],
      byMonthDay: null,
      untilDate: ''
    }
  };
};

const applyDirectTemplate = () => {
  const template = directMessageTemplates.value.find((item) => String(item.id) === String(selectedTemplateId.value));
  if (!template) return;
  startDirectMessage();
  draft.value.title = template.titleTemplate || template.name || 'Direct message';
  draft.value.description = template.messageTemplate || '';
  draft.value.splashContent = template.messageTemplate || '';
  draft.value.eventType = 'direct_notice';
};

const clearAudience = () => {
  draft.value.audience.userIds = [];
  draft.value.audience.groupIds = [];
  draft.value.audience.roleKeys = [];
};

const toggleUser = (userId, checked) => {
  const set = new Set(draft.value.audience.userIds);
  if (checked) set.add(Number(userId));
  else set.delete(Number(userId));
  draft.value.audience.userIds = [...set];
};

const toggleGroup = (groupId, checked) => {
  const set = new Set(draft.value.audience.groupIds);
  if (checked) set.add(Number(groupId));
  else set.delete(Number(groupId));
  draft.value.audience.groupIds = [...set];
};

const toggleRole = (roleKey, checked) => {
  const set = new Set(draft.value.audience.roleKeys);
  if (checked) set.add(String(roleKey));
  else set.delete(String(roleKey));
  draft.value.audience.roleKeys = [...set];
};

const toggleWeekday = (weekday, checked) => {
  const set = new Set(draft.value.recurrence.byWeekday);
  if (checked) set.add(Number(weekday));
  else set.delete(Number(weekday));
  draft.value.recurrence.byWeekday = [...set].sort((a, b) => a - b);
};

const editEvent = (event) => {
  draft.value = {
    id: event.id,
    organizationId:
      event.organizationId != null && event.organizationId !== '' && Number(event.organizationId) > 0
        ? Number(event.organizationId)
        : 0,
    title: event.title || '',
    description: event.description || '',
    eventType: event.eventType || 'company_event',
    timezone: String(event.timezone || '').trim() || browserTimeZone(),
    splashContent: event.splashContent || '',
    startsAtLocal: toLocalInput(event.startsAt),
    endsAtLocal: toLocalInput(event.endsAt),
    recurrence: {
      frequency: String(event.recurrence?.frequency || 'none'),
      interval: Number(event.recurrence?.interval || 1),
      byWeekday: Array.isArray(event.recurrence?.byWeekday) ? event.recurrence.byWeekday.map((d) => Number(d)) : [],
      byMonthDay: event.recurrence?.byMonthDay || null,
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
    cashEligible: !!event.cashEligible,
    publicHeroImageUrl: String(event.publicHeroImageUrl || '').trim(),
    publicListingDetails: String(event.publicListingDetails || '').trim(),
    inPersonPublic: !!event.inPersonPublic,
    publicLocationAddress: String(event.publicLocationAddress || '').trim()
  };
};

const loadAffiliateProgramOrgs = async () => {
  affiliateProgramOrgs.value = [];
  if (!props.agencyId) return;
  try {
    const res = await api.get('/availability/admin/skill-builders/options', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const orgs = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    affiliateProgramOrgs.value = orgs.filter(
      (o) => String(o.organizationType || '').toLowerCase() !== 'school'
    );
  } catch {
    affiliateProgramOrgs.value = [];
  }
};

const saveEvent = async () => {
  if (!props.agencyId) return;
  const startsAt = new Date(draft.value.startsAtLocal);
  const endsAt = new Date(draft.value.endsAtLocal);
  if (!draft.value.title.trim()) {
    error.value = 'Title is required.';
    return;
  }
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    error.value = 'Start and end dates are required.';
    return;
  }
  if (endsAt <= startsAt) {
    error.value = 'End time must be after start time.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      title: draft.value.title,
      description: draft.value.description,
      eventType: draft.value.eventType || 'company_event',
      splashContent: draft.value.splashContent,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: String(draft.value.timezone || '').trim() || browserTimeZone(),
      recurrence: normalizeRecurrenceForPayload(draft.value.recurrence),
      rsvpMode: isServiceProgramEventType.value ? 'none' : draft.value.rsvpMode,
      smsCode: draft.value.smsCode || null,
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
      audience: isServiceProgramEventType.value
        ? { userIds: [], groupIds: [], roleKeys: [] }
        : {
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
      cashEligible: !!draft.value.cashEligible,
      publicHeroImageUrl: String(draft.value.publicHeroImageUrl || '').trim() || null,
      publicListingDetails: String(draft.value.publicListingDetails || '').trim() || null,
      inPersonPublic: !!draft.value.inPersonPublic,
      publicLocationAddress: draft.value.inPersonPublic
        ? String(draft.value.publicLocationAddress || '').trim() || null
        : null
    };
    if (draft.value.id) {
      await api.put(`/agencies/${props.agencyId}/company-events/${draft.value.id}`, payload);
    } else {
      await api.post(`/agencies/${props.agencyId}/company-events`, payload);
    }
    await loadEvents();
    resetDraft();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save event';
  } finally {
    saving.value = false;
  }
};

const removeEvent = async (event) => {
  if (!props.agencyId || !event?.id) return;
  if (!window.confirm(`Delete "${event.title}"?`)) return;
  saving.value = true;
  error.value = '';
  try {
    await api.delete(`/agencies/${props.agencyId}/company-events/${event.id}`);
    await loadEvents();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to delete event';
  } finally {
    saving.value = false;
  }
};

const sendDirectMessage = async (event) => {
  if (!props.agencyId || !event?.id) return;
  const defaultMessage = String(event.splashContent || event.description || '').trim();
  const customMessage = window.prompt('Message to send (in-app + SMS):', defaultMessage);
  if (customMessage === null) return;
  const message = String(customMessage || '').trim();
  if (!message) {
    error.value = 'Message is required to send.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const sendSms = window.confirm('Also send as SMS? Select Cancel for in-app only.');
    await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/send-direct-message`, {
      title: event.title,
      message,
      templateId: selectedTemplateId.value ? Number(selectedTemplateId.value) : undefined,
      sendInApp: true,
      sendSms
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send direct message';
  } finally {
    saving.value = false;
  }
};

const sendSmsVote = async (event) => {
  if (!props.agencyId || !event?.id) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/send-sms-vote`);
    await loadEvents();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send SMS voting message';
  } finally {
    saving.value = false;
  }
};

const viewDeliveryLogs = async (event) => {
  if (!props.agencyId || !event?.id) return;
  saving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/agencies/${props.agencyId}/company-events/${event.id}/delivery-logs`);
    const summary = resp.data?.summary || {};
    window.alert(`Delivery summary\nIn-app sent: ${summary.inAppSent || 0}\nIn-app failed: ${summary.inAppFailed || 0}\nSMS sent: ${summary.smsSent || 0}\nSMS failed: ${summary.smsFailed || 0}\nSMS skipped: ${summary.smsSkipped || 0}`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load delivery logs';
  } finally {
    saving.value = false;
  }
};

const downloadResponsesCsv = (event) => {
  if (!props.agencyId || !event?.id) return;
  window.open(`/api/agencies/${props.agencyId}/company-events/${event.id}/responses.csv`, '_blank', 'noopener');
};

const closeVoting = async (event) => {
  if (!props.agencyId || !event?.id) return;
  if (!window.confirm(`Close voting for "${event.title}"?`)) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/close-voting`);
    await loadEvents();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to close voting';
  } finally {
    saving.value = false;
  }
};

const loadEvents = async () => {
  if (!props.agencyId) {
    events.value = [];
    return;
  }
  const resp = await api.get(`/agencies/${props.agencyId}/company-events`);
  events.value = Array.isArray(resp.data) ? resp.data : [];
};

const loadAudienceOptions = async () => {
  if (!props.agencyId) {
    audienceUsers.value = [];
    audienceGroups.value = [];
    audienceRoles.value = [];
    return;
  }
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/audience-options`);
  audienceUsers.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  audienceGroups.value = Array.isArray(resp.data?.groups) ? resp.data.groups : [];
  audienceRoles.value = Array.isArray(resp.data?.roles) ? resp.data.roles : [];
};

const loadTemplates = async () => {
  if (!props.agencyId) return;
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/templates`);
  const templates = Array.isArray(resp.data) ? resp.data : [];
  if (templates.length) directMessageTemplates.value = templates;
};

const loadSmsReadiness = async () => {
  if (!props.agencyId) {
    smsReadiness.value = { ready: false, message: 'Select an agency' };
    return;
  }
  try {
    const resp = await api.get(`/sms-numbers/agency/${props.agencyId}/settings`);
    const settings = resp.data || {};
    if (settings.smsNumbersEnabled !== true) {
      smsReadiness.value = { ready: false, message: 'SMS numbers disabled in agency settings' };
      return;
    }
    if (settings.companyEventsEnabled !== true) {
      smsReadiness.value = { ready: false, message: 'Company Events SMS disabled in agency settings' };
      return;
    }
    if (!settings.companyEventsSenderNumberId) {
      smsReadiness.value = { ready: false, message: 'Select Company Events sender number in Texting Numbers' };
      return;
    }
    smsReadiness.value = { ready: true, message: 'Ready' };
  } catch {
    smsReadiness.value = { ready: false, message: 'Could not verify settings' };
  }
};

const loadAll = async () => {
  if (!props.agencyId) {
    events.value = [];
    audienceUsers.value = [];
    audienceGroups.value = [];
    audienceRoles.value = [];
    smsReadiness.value = { ready: false, message: 'Select an agency' };
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadEvents(), loadAudienceOptions(), loadTemplates(), loadAffiliateProgramOrgs()]);
    await loadSmsReadiness();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load company events';
  } finally {
    loading.value = false;
  }
};

watch(() => props.agencyId, async () => {
  resetDraft();
  await loadAll();
}, { immediate: true });
</script>

<style scoped>
.company-events-manager {
  display: grid;
  gap: 12px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.header-row h4 {
  margin: 0;
}
.status-ready {
  color: #0a7f40;
}
.status-not-ready {
  color: #8f4a00;
}
.editor-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-secondary);
}
.template-bar {
  display: grid;
  grid-template-columns: 220px minmax(260px, 1fr) auto;
  gap: 8px;
  align-items: end;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.audience-block {
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 8px;
}
.voting-block {
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 8px;
}
.option-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
}
.opt-key {
  text-transform: uppercase;
}
.audience-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.audience-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.audience-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.select-list {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  max-height: 180px;
  overflow: auto;
  padding: 6px;
  background: var(--surface-primary);
}
.select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 2px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip-toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border-color);
  padding: 3px 8px;
  border-radius: 999px;
}
.table-wrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border-color);
  padding: 8px;
  text-align: left;
  vertical-align: top;
}
.row-actions {
  display: flex;
  gap: 6px;
}
@media (max-width: 900px) {
  .template-bar,
  .grid,
  .audience-grid {
    grid-template-columns: 1fr;
  }
}
</style>
