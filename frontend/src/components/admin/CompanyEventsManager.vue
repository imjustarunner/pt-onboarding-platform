<template>
  <section class="company-events-manager">
    <div class="header-row">
      <div>
        <h4>Company events</h4>
        <small class="hint">Phase 2: RSVP + SMS voting for targeted internal events.</small>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="loadAll" :disabled="loading || !agencyId">
          {{ loading ? 'Loading…' : 'Reload' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="startCreate" :disabled="saving || !agencyId">
          New event
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="startDirectMessage" :disabled="saving || !agencyId">
          New direct message
        </button>
      </div>
    </div>

    <div v-if="error" class="error-modal"><strong>Error:</strong> {{ error }}</div>

    <div class="template-bar">
      <label class="lbl" for="direct-template">Direct message template</label>
      <select id="direct-template" v-model="selectedTemplateId" class="input">
        <option value="">Select template…</option>
        <option v-for="tpl in directMessageTemplates" :key="tpl.id" :value="tpl.id">{{ tpl.label }}</option>
      </select>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="!selectedTemplateId" @click="applyDirectTemplate">
        Apply template
      </button>
    </div>

    <div class="editor-card">
      <h5 style="margin: 0 0 10px 0;">{{ draft.id ? 'Edit event' : 'Create event' }}</h5>
      <div class="grid">
        <div class="form-group">
          <label class="lbl">Title</label>
          <input v-model.trim="draft.title" class="input" maxlength="255" placeholder="Monthly Book Club" />
        </div>
        <div class="form-group">
          <label class="lbl">Event type</label>
          <input v-model.trim="draft.eventType" class="input" maxlength="64" placeholder="book_club" />
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

      <div class="voting-block">
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
              <button type="button" class="btn btn-secondary btn-sm" @click="closeVoting(event)" :disabled="saving || !event.votingConfig?.enabled || !!event.votingClosedAt">Close</button>
              <button type="button" class="btn btn-danger btn-sm" @click="removeEvent(event)" :disabled="saving">Delete</button>
            </td>
          </tr>
          <tr v-if="!events.length">
            <td colspan="6" class="hint">No company events yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: Number,
    default: null
  }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const events = ref([]);
const audienceUsers = ref([]);
const audienceGroups = ref([]);
const selectedTemplateId = ref('');

const directMessageTemplates = [
  {
    id: 'congrats',
    label: 'Congrats',
    title: 'Congratulations!',
    message: "Congratulations on your achievement. We are proud of your work."
  },
  {
    id: 'pickup-prize',
    label: 'Prize pickup',
    title: 'Prize pickup',
    message: 'Please come by the office this week to pick up your prize.'
  },
  {
    id: 'come-to-office',
    label: 'Come to office',
    title: 'Office visit request',
    message: 'Please come to the office when you can. See front desk on arrival.'
  }
];

const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const emptyDraft = () => ({
  id: null,
  title: '',
  description: '',
  eventType: 'company_event',
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
  audience: {
    userIds: [],
    groupIds: []
  }
});

const draft = ref(emptyDraft());

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
  if (!users && !groups) return 'All agency users';
  return `${users} user(s), ${groups} group(s)`;
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
  const template = directMessageTemplates.find((item) => item.id === selectedTemplateId.value);
  if (!template) return;
  startDirectMessage();
  draft.value.title = template.title;
  draft.value.description = template.message;
  draft.value.splashContent = template.message;
  draft.value.eventType = 'direct_notice';
};

const clearAudience = () => {
  draft.value.audience.userIds = [];
  draft.value.audience.groupIds = [];
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

const toggleWeekday = (weekday, checked) => {
  const set = new Set(draft.value.recurrence.byWeekday);
  if (checked) set.add(Number(weekday));
  else set.delete(Number(weekday));
  draft.value.recurrence.byWeekday = [...set].sort((a, b) => a - b);
};

const editEvent = (event) => {
  draft.value = {
    id: event.id,
    title: event.title || '',
    description: event.description || '',
    eventType: event.eventType || 'company_event',
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
    audience: {
      userIds: Array.isArray(event.audience?.userIds) ? event.audience.userIds.map((id) => Number(id)) : [],
      groupIds: Array.isArray(event.audience?.groupIds) ? event.audience.groupIds.map((id) => Number(id)) : []
    }
  };
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
      recurrence: normalizeRecurrenceForPayload(draft.value.recurrence),
      rsvpMode: draft.value.rsvpMode,
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
      audience: {
        userIds: draft.value.audience.userIds,
        groupIds: draft.value.audience.groupIds
      }
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
    return;
  }
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/audience-options`);
  audienceUsers.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  audienceGroups.value = Array.isArray(resp.data?.groups) ? resp.data.groups : [];
};

const loadAll = async () => {
  if (!props.agencyId) {
    events.value = [];
    audienceUsers.value = [];
    audienceGroups.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadEvents(), loadAudienceOptions()]);
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
