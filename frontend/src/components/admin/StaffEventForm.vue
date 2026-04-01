<template>
  <div class="staff-event-form">
    <div class="modal-header">
      <h3>Event &amp; Program Setup</h3>
      <button class="btn btn-secondary btn-sm" type="button" @click="requestClose">Close</button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="toolbar">
      <select v-model="selectedEventId" class="input">
        <option value="">Create new event…</option>
        <option v-for="evt in events" :key="evt.id" :value="String(evt.id)">
          {{ evt.title }} ({{ formatDate(evt.startsAt) }})
        </option>
      </select>
      <button class="btn btn-secondary btn-sm" type="button" @click="resetForm">New</button>
      <button class="btn btn-secondary btn-sm" type="button" @click="reloadEvents">Reload</button>
    </div>

    <div class="section">
      <h4>1) Identity</h4>
      <div class="grid two">
        <div>
          <label class="lbl">Event category</label>
          <select v-model="selectedEventCategory" class="input" @change="applyEventCategory">
            <option v-for="opt in eventCategoryOptions" :key="`cat-${opt.value}`" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="lbl">Event preset</label>
          <select v-model="selectedPreset" class="input" @change="applyPreset">
            <option value="">Custom</option>
            <option v-for="p in eventTypePresets" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="lbl">Event type</label>
          <input v-model.trim="draft.eventType" class="input" placeholder="staff_get_together" />
        </div>
      </div>
      <div class="grid two">
        <div>
          <label class="lbl">Title</label>
          <input v-model.trim="draft.title" class="input" placeholder="Team Night at RoadHouse Cinemas" />
        </div>
        <div />
      </div>
      <div class="grid two">
        <div>
          <label class="lbl">Card/primary photo URL</label>
          <input v-model.trim="draft.eventImageUrl" class="input" placeholder="/uploads/logos/..." />
        </div>
        <div>
          <label class="lbl">Banner photo URL (hero)</label>
          <input v-model.trim="draft.publicHeroImageUrl" class="input" placeholder="/uploads/logos/... (optional)" />
        </div>
      </div>
      <div class="grid two">
        <div>
          <label class="lbl">Upload photo(s)</label>
          <input type="file" accept="image/*" multiple @change="onPhotoUpload" />
        </div>
        <div class="muted" style="align-self:end;">
          Tip: choose one banner image (hero) and keep multiple album images below.
        </div>
      </div>
      <div class="tag-list" v-if="draft.eventImageUrls.length > 0">
        <span class="tag" v-for="(url, idx) in draft.eventImageUrls" :key="`img-${idx}`">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            style="padding:0 6px;line-height:1.3;"
            :disabled="idx === 0"
            title="Move left"
            @click="moveEventImageLeft(idx)"
          >
            ←
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            style="padding:0 6px;line-height:1.3;"
            :disabled="idx === draft.eventImageUrls.length - 1"
            title="Move right"
            @click="moveEventImageRight(idx)"
          >
            →
          </button>
          {{ shortUrl(url) }}
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            style="padding:0 6px;line-height:1.3;"
            @click="setBannerFromAlbum(url)"
            :title="draft.publicHeroImageUrl === url ? 'Current banner image' : 'Set as banner image'"
          >
            {{ draft.publicHeroImageUrl === url ? 'Banner' : 'Set banner' }}
          </button>
          <button type="button" class="x" @click="removeEventImage(idx)">x</button>
        </span>
      </div>
      <label class="lbl">Description/details</label>
      <textarea v-model.trim="draft.description" class="input" rows="3" placeholder="Event details for invitees" />
      <label class="lbl">Splash content</label>
      <textarea v-model.trim="draft.splashContent" class="input" rows="2" />
    </div>

    <div class="section">
      <h4>2) Schedule & Location</h4>
      <div class="grid three">
        <div>
          <label class="lbl">Start</label>
          <input v-model="draft.startsAtLocal" class="input" type="datetime-local" />
        </div>
        <div>
          <label class="lbl">End</label>
          <input v-model="draft.endsAtLocal" class="input" type="datetime-local" />
        </div>
        <div>
          <label class="lbl">RSVP deadline</label>
          <input v-model="draft.rsvpDeadlineLocal" class="input" type="datetime-local" />
        </div>
      </div>
      <div class="grid two">
        <div>
          <label class="lbl">Venue</label>
          <input v-model.trim="draft.eventLocationName" class="input" placeholder="RoadHouse Cinemas (Railyard Lounge)" />
        </div>
        <div>
          <label class="lbl">Address</label>
          <input v-model.trim="draft.eventLocationAddress" class="input" placeholder="3030 N Nevada Ave, Colorado Springs, CO" />
        </div>
      </div>
      <div class="grid two">
        <div>
          <label class="lbl">Venue phone (optional)</label>
          <input v-model.trim="draft.eventLocationPhone" class="input" placeholder="(719) 123-4567" />
        </div>
      </div>
    </div>

    <div v-if="!isServiceProgramDraft" class="section">
      <h4>3) Who's Invited</h4>
      <div class="chips">
        <label v-for="role in audienceRoles" :key="role.key" class="chip-toggle">
          <input type="checkbox" :checked="draft.audience.roleKeys.includes(role.key)" @change="toggleRole(role.key, $event.target.checked)" />
          <span>{{ role.label }}</span>
        </label>
      </div>
      <label class="lbl" style="margin-top:8px;">Individual users</label>
      <div class="select-list">
        <label v-for="u in audienceUsers" :key="u.id" class="select-item">
          <input type="checkbox" :checked="draft.audience.userIds.includes(u.id)" @change="toggleUser(u.id, $event.target.checked)" />
          <span>{{ u.name }} <small class="muted">({{ u.role || 'user' }})</small></span>
        </label>
      </div>
    </div>

    <div class="section">
      <h4>4) Guest Policy</h4>
      <div class="grid three">
        <label class="chip-toggle"><input type="radio" value="staff_only" v-model="draft.guestPolicy" /> <span>Staff only</span></label>
        <label class="chip-toggle"><input type="radio" value="family_invited" v-model="draft.guestPolicy" /> <span>Family invited</span></label>
        <label class="chip-toggle"><input type="radio" value="plus_one" v-model="draft.guestPolicy" /> <span>Plus one</span></label>
      </div>
      <label class="lbl">Family provision note</label>
      <textarea v-model.trim="draft.familyProvisionNote" class="input" rows="2" placeholder="What is included for families/guests" />
    </div>

    <div class="section">
      <h4>5) What We're Providing</h4>
      <p class="muted">These items save to this event and display on the public event page under "For staff/attendees".</p>
      <div class="inline-row">
        <input
          v-model.trim="organizerItemInput"
          class="input"
          placeholder="Add provided item(s) (e.g. drinks, appetizers, dessert)"
          @keydown.enter.prevent="addOrganizerItem"
        />
        <button class="btn btn-secondary btn-sm" type="button" @click="addOrganizerItem" :disabled="!organizerItemInput">Add</button>
      </div>
      <div class="tag-list">
        <span class="tag" v-for="(item, idx) in draft.organizerProviding" :key="`org-item-${idx}`">
          {{ item }}
          <button type="button" class="x" @click="removeOrganizerItem(idx)">x</button>
        </span>
      </div>
    </div>

    <div class="section">
      <h4>6) Potluck / Need List</h4>
      <label class="chip-toggle">
        <input type="checkbox" v-model="draft.potluckEnabled" />
        <span>Potluck style enabled</span>
      </label>
      <p class="muted">Need-list setup and claims are managed in the Invitees panel after saving this event.</p>
    </div>

    <div class="section">
      <h4>7) RSVP & Registration</h4>
      <div class="grid two">
        <div v-if="!isServiceProgramDraft">
          <label class="lbl">RSVP mode</label>
          <select v-model="draft.rsvpMode" class="input">
            <option value="yes_no_maybe">Yes / No / Maybe</option>
            <option value="custom_vote">Custom vote</option>
            <option value="none">Disabled</option>
          </select>
        </div>
        <div>
          <label class="lbl">Manual registration form URL (optional)</label>
          <input v-model.trim="draft.registrationFormUrl" class="input" placeholder="https://forms..." />
        </div>
      </div>
      <div v-if="!isServiceProgramDraft" class="grid two">
        <div>
          <label class="lbl">RSVP question</label>
          <input v-model.trim="draft.votingQuestion" class="input" placeholder="Will you attend?" />
        </div>
      </div>
      <p v-if="isServiceProgramDraft" class="muted">
        Program service events disable staff RSVP/invite flows automatically. Families register through the linked program intake flow.
      </p>
    </div>

    <div class="section section-disabled">
      <h4>8) SMS (framed; disabled send)</h4>
      <p class="muted">SMS targeting will be available when texting is approved.</p>
      <div class="grid two">
        <div>
          <label class="lbl">Target</label>
          <select v-model="smsDraft.target" class="input">
            <option value="all_invitees">All invitees</option>
            <option value="non_responders">Non-responders</option>
            <option value="attending">Attending only</option>
            <option value="all">All in audience</option>
          </select>
        </div>
        <div>
          <label class="lbl">Schedule (optional)</label>
          <input v-model="smsDraft.scheduledFor" class="input" type="datetime-local" />
        </div>
      </div>
      <label class="lbl">Message draft</label>
      <textarea v-model.trim="smsDraft.message" class="input" rows="2" />
      <div class="inline-row">
        <button class="btn btn-secondary btn-sm" type="button" @click="saveSmsDraft" :disabled="!selectedEventId || smsSaving">
          {{ smsSaving ? 'Saving…' : 'Save draft' }}
        </button>
        <small class="muted">No text messages are sent from this action.</small>
      </div>
    </div>

    <div class="save-row">
      <button class="btn btn-primary" type="button" @click="saveEvent" :disabled="saving || !canSave">
        {{ saving ? 'Saving…' : (selectedEventId ? 'Update event' : 'Create event') }}
      </button>
    </div>

    <!-- Public event page + registration link — visible once an event is saved -->
    <div v-if="selectedEventIdNum > 0" class="section reg-link-hint">
      <h4>Public event page</h4>
      <p class="muted" style="margin: 0 0 10px;">
        Share this URL so anyone can view event details. Employees who received a tokenized email invitation
        will see a personalised <strong>"Can't wait to see you there!"</strong> confirmation when they visit
        after RSVPing.
      </p>
      <div class="reg-url-row">
        <code class="reg-url">{{ eventPublicUrl }}</code>
        <button type="button" class="btn btn-secondary btn-sm" @click="copyEventUrl">
          {{ copied ? '✓ Copied' : 'Copy link' }}
        </button>
        <a :href="eventPublicUrl" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;">
          Open &rarr;
        </a>
      </div>
      <p class="muted" style="margin: 14px 0 8px;">
        To let staff register and auto-enroll in this event, create a
        <strong>Smart Registration</strong> digital form and lock it to this event.
      </p>
      <a href="/admin/digital-forms" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none;">
        Open Digital Forms &rarr;
      </a>
    </div>

    <StaffEventInviteePanel
      v-if="selectedEventIdNum > 0"
      :agency-id="agencyId"
      :event-id="selectedEventIdNum"
      :potluck-enabled="draft.potluckEnabled"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import StaffEventInviteePanel from './StaffEventInviteePanel.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  /** Pre-select an existing event by id when the modal opens (e.g. from clicking a card). */
  initialEventId: { type: Number, default: null }
});

const emit = defineEmits(['saved', 'close']);

const events = ref([]);
const audienceUsers = ref([]);
const audienceRoles = ref([]);
const selectedEventId = ref('');
const saving = ref(false);
const smsSaving = ref(false);
const error = ref('');
const organizerItemInput = ref('');
const selectedPreset = ref('');
const selectedEventCategory = ref('company_event');

const eventCategoryOptions = [
  { value: 'company_event', label: 'Company Event' },
  { value: 'program_event', label: 'Program Event' },
  { value: 'staff_event', label: 'Staff/Internal Event' },
  { value: 'custom', label: 'Custom Type' }
];

const eventTypePresets = [
  {
    value: 'program_orientation',
    label: 'Program Orientation',
    eventType: 'program_orientation',
    title: 'Program Orientation',
    votingQuestion: 'Will you attend this program orientation?'
  },
  {
    value: 'program_workshop',
    label: 'Program Workshop',
    eventType: 'program_workshop',
    title: 'Program Workshop',
    votingQuestion: 'Will you attend this program workshop?'
  },
  {
    value: 'program_open_house',
    label: 'Program Open House',
    eventType: 'program_open_house',
    title: 'Program Open House',
    votingQuestion: 'Will you attend this program open house?'
  },
  {
    value: 'guardian_program_class',
    label: 'Guardian Program Class',
    eventType: 'guardian_program_class',
    title: 'Guardian Program Class',
    votingQuestion: ''
  },
  {
    value: 'staff_get_together',
    label: 'Staff Get-Together',
    eventType: 'staff_get_together',
    title: 'Staff Get-Together',
    votingQuestion: 'Will you join us for this staff get-together?'
  },
  {
    value: 'team_training',
    label: 'Team Training',
    eventType: 'team_training',
    title: 'Team Training Session',
    votingQuestion: 'Can you attend this team training session?'
  },
  {
    value: 'celebration',
    label: 'Team Celebration',
    eventType: 'team_celebration',
    title: 'Team Celebration',
    votingQuestion: 'Will you attend this team celebration?'
  },
  {
    value: 'retreat',
    label: 'Team Retreat',
    eventType: 'team_retreat',
    title: 'Team Retreat',
    votingQuestion: 'Will you attend this team retreat?'
  }
];

const smsDraft = reactive({
  target: 'all_invitees',
  message: '',
  scheduledFor: ''
});

const defaultDraft = () => ({
  title: '',
  eventType: 'company_event',
  description: '',
  splashContent: '',
  startsAtLocal: '',
  endsAtLocal: '',
  rsvpDeadlineLocal: '',
  eventLocationName: '',
  eventLocationAddress: '',
  eventLocationPhone: '',
  guestPolicy: 'staff_only',
  familyProvisionNote: '',
  organizerProviding: [],
  eventImageUrls: [],
  publicHeroImageUrl: '',
  potluckEnabled: false,
  rsvpMode: 'yes_no_maybe',
  votingQuestion: 'Will you attend?',
  registrationFormUrl: '',
  eventImageUrl: '',
  audience: { userIds: [], roleKeys: [], groupIds: [] }
});
const draft = reactive(defaultDraft());
const baselineSnapshot = ref('');

const selectedEventIdNum = computed(() => {
  const n = Number(selectedEventId.value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
});
const isServiceProgramDraft = computed(() => {
  const t = String(draft.eventType || '').trim().toLowerCase();
  return t === 'guardian_program_class' || t === 'program_event' || t.startsWith('program_');
});

const canSave = computed(() => !!(draft.title && draft.startsAtLocal && draft.endsAtLocal));

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '-';
  return d.toLocaleDateString();
};

const isoForApi = (localValue) => (localValue ? new Date(localValue).toISOString() : null);

const toLocalInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const resetForm = () => {
  if (hasUnsavedChanges.value) {
    const ok = window.confirm('You have unsaved changes. Exit this create form and discard them?');
    if (!ok) return;
  }
  Object.assign(draft, defaultDraft());
  selectedEventCategory.value = deriveCategoryFromEventType(draft.eventType);
  selectedPreset.value = '';
  Object.assign(smsDraft, { target: 'all_invitees', message: '', scheduledFor: '' });
  selectedEventId.value = '';
  error.value = '';
  markClean();
};

const deriveCategoryFromEventType = (rawType) => {
  const t = String(rawType || '').trim().toLowerCase();
  if (!t || t === 'company_event') return 'company_event';
  if (t === 'program_event' || t.startsWith('program_')) return 'program_event';
  if (t === 'staff_event' || t.startsWith('staff_') || t.startsWith('team_')) return 'staff_event';
  return 'custom';
};

const populateFromEvent = (evt) => {
  if (!evt) return;
  Object.assign(draft, {
    title: evt.title || '',
    eventType: evt.eventType || 'company_event',
    description: evt.description || '',
    splashContent: evt.splashContent || '',
    startsAtLocal: toLocalInput(evt.startsAt),
    endsAtLocal: toLocalInput(evt.endsAt),
    rsvpDeadlineLocal: toLocalInput(evt.rsvpDeadline),
    eventLocationName: evt.eventLocationName || '',
    eventLocationAddress: evt.eventLocationAddress || '',
    eventLocationPhone: evt.eventLocationPhone || '',
    guestPolicy: evt.guestPolicy || 'staff_only',
    familyProvisionNote: evt.familyProvisionNote || '',
    organizerProviding: Array.isArray(evt.organizerProviding) ? [...evt.organizerProviding] : [],
    eventImageUrls: Array.isArray(evt.eventImageUrls) ? [...evt.eventImageUrls] : [],
    publicHeroImageUrl: evt.publicHeroImageUrl || '',
    potluckEnabled: !!evt.potluckEnabled,
    rsvpMode: evt.rsvpMode || 'yes_no_maybe',
    votingQuestion: evt.votingConfig?.question || 'Will you attend?',
    registrationFormUrl: evt.registrationFormUrl || '',
    eventImageUrl: evt.eventImageUrl || '',
    audience: {
      userIds: Array.isArray(evt.audience?.userIds) ? [...evt.audience.userIds] : [],
      roleKeys: Array.isArray(evt.audience?.roleKeys) ? [...evt.audience.roleKeys] : [],
      groupIds: []
    }
  });
  selectedEventCategory.value = deriveCategoryFromEventType(evt.eventType);
  selectedPreset.value = '';
  Object.assign(smsDraft, {
    target: evt.smsDraft?.target || 'all_invitees',
    message: evt.smsDraft?.message || '',
    scheduledFor: toLocalInput(evt.smsDraft?.scheduledFor || '')
  });
  markClean();
};

const serializeFormState = () => JSON.stringify({
  selectedEventId: String(selectedEventId.value || ''),
  selectedEventCategory: String(selectedEventCategory.value || ''),
  selectedPreset: String(selectedPreset.value || ''),
  draft: {
    title: draft.title || '',
    eventType: draft.eventType || '',
    description: draft.description || '',
    splashContent: draft.splashContent || '',
    startsAtLocal: draft.startsAtLocal || '',
    endsAtLocal: draft.endsAtLocal || '',
    rsvpDeadlineLocal: draft.rsvpDeadlineLocal || '',
    eventLocationName: draft.eventLocationName || '',
    eventLocationAddress: draft.eventLocationAddress || '',
    eventLocationPhone: draft.eventLocationPhone || '',
    guestPolicy: draft.guestPolicy || '',
    familyProvisionNote: draft.familyProvisionNote || '',
    organizerProviding: Array.isArray(draft.organizerProviding) ? [...draft.organizerProviding] : [],
    eventImageUrls: Array.isArray(draft.eventImageUrls) ? [...draft.eventImageUrls] : [],
    publicHeroImageUrl: draft.publicHeroImageUrl || '',
    potluckEnabled: !!draft.potluckEnabled,
    rsvpMode: draft.rsvpMode || '',
    votingQuestion: draft.votingQuestion || '',
    registrationFormUrl: draft.registrationFormUrl || '',
    eventImageUrl: draft.eventImageUrl || '',
    audience: {
      userIds: Array.isArray(draft.audience?.userIds) ? [...draft.audience.userIds] : [],
      roleKeys: Array.isArray(draft.audience?.roleKeys) ? [...draft.audience.roleKeys] : [],
      groupIds: Array.isArray(draft.audience?.groupIds) ? [...draft.audience.groupIds] : []
    }
  },
  smsDraft: {
    target: smsDraft.target || '',
    message: smsDraft.message || '',
    scheduledFor: smsDraft.scheduledFor || ''
  }
});

const markClean = () => {
  baselineSnapshot.value = serializeFormState();
};

const hasUnsavedChanges = computed(() => serializeFormState() !== baselineSnapshot.value);

const confirmDiscardIfNeeded = () => {
  if (!hasUnsavedChanges.value) return true;
  return window.confirm('You have unsaved changes. Are you sure you want to close this form?');
};

const requestClose = () => {
  if (!confirmDiscardIfNeeded()) return false;
  emit('close');
  return true;
};

const reloadEvents = async () => {
  if (!props.agencyId) return;
  const resp = await api.get(`/agencies/${props.agencyId}/company-events`);
  events.value = Array.isArray(resp.data) ? resp.data : [];
};

const loadAudienceOptions = async () => {
  if (!props.agencyId) return;
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/audience-options`);
  audienceUsers.value = resp.data?.users || [];
  audienceRoles.value = resp.data?.roles || [];
};

const saveEvent = async () => {
  if (!canSave.value) return;
  // Ensure anything still typed in the organizer item input is persisted.
  flushOrganizerItemInput();
  saving.value = true;
  error.value = '';
  try {
    // Extra guard: recompute a merged list from chips + any residual input text.
    const mergedOrganizerProviding = (() => {
      const prior = Array.isArray(draft.organizerProviding) ? draft.organizerProviding : [];
      const typed = normalizeOrganizerItems(organizerItemInput.value);
      if (!typed.length) return prior;
      const seen = new Set(prior.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean));
      const out = [...prior];
      for (const item of typed) {
        const key = String(item || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        out.push(item);
        seen.add(key);
      }
      return out;
    })();

    const payload = {
      title: draft.title,
      eventType: draft.eventType || selectedEventCategory.value || 'company_event',
      description: draft.description,
      splashContent: draft.splashContent,
      startsAt: isoForApi(draft.startsAtLocal),
      endsAt: isoForApi(draft.endsAtLocal),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      recurrence: { frequency: 'none', interval: 1, byWeekday: [] },
      rsvpMode: isServiceProgramDraft.value ? 'none' : (draft.rsvpMode || 'yes_no_maybe'),
      votingConfig: isServiceProgramDraft.value
        ? { enabled: false, viaSms: false, question: '', options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }, { key: 'maybe', label: 'Maybe' }] }
        : { enabled: true, viaSms: false, question: draft.votingQuestion || 'Will you attend?', options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }, { key: 'maybe', label: 'Maybe' }] },
      reminderConfig: { enabled: false, channels: { sms: false }, offsetsHours: [] },
      audience: {
        userIds: isServiceProgramDraft.value ? [] : (draft.audience.userIds || []),
        roleKeys: isServiceProgramDraft.value ? [] : (draft.audience.roleKeys || []),
        groupIds: []
      },
      guestPolicy: draft.guestPolicy,
      potluckEnabled: !!draft.potluckEnabled,
      organizerProviding: mergedOrganizerProviding,
      eventImageUrl: draft.eventImageUrl || null,
      eventImageUrls: draft.eventImageUrls || [],
      publicHeroImageUrl: draft.publicHeroImageUrl || null,
      rsvpDeadline: isoForApi(draft.rsvpDeadlineLocal),
      eventLocationName: draft.eventLocationName || null,
      eventLocationAddress: draft.eventLocationAddress || null,
      eventLocationPhone: draft.eventLocationPhone || null,
      familyProvisionNote: draft.familyProvisionNote || null,
      registrationFormUrl: draft.registrationFormUrl || null,
      smsDraft: {
        target: smsDraft.target || 'all_invitees',
        message: smsDraft.message || '',
        scheduledFor: isoForApi(smsDraft.scheduledFor)
      }
    };
    let savedEventId = selectedEventIdNum.value;
    let savedEventPayload = null;
    if (savedEventId > 0) {
      const putResp = await api.put(`/agencies/${props.agencyId}/company-events/${savedEventId}`, payload);
      savedEventPayload = putResp?.data || null;
    } else {
      const postResp = await api.post(`/agencies/${props.agencyId}/company-events`, payload);
      savedEventPayload = postResp?.data || null;
      savedEventId = Number(savedEventPayload?.id || 0);
      selectedEventId.value = String(savedEventId || '');
    }
    await reloadEvents();
    if (savedEventPayload && typeof savedEventPayload === 'object') {
      // Rehydrate directly from save response (no extra detail endpoint required).
      populateFromEvent(savedEventPayload);
    } else if (savedEventId > 0) {
      // Fallback to refreshed list payload.
      const updated = events.value.find((e) => Number(e.id) === savedEventId);
      if (updated) populateFromEvent(updated);
    }
    markClean();
    emit('saved', {
      agencyId: Number(props.agencyId || 0),
      eventId: Number(selectedEventIdNum.value || selectedEventId.value || 0)
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save event';
  } finally {
    saving.value = false;
  }
};

const saveSmsDraft = async () => {
  if (selectedEventIdNum.value < 1) return;
  smsSaving.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${selectedEventIdNum.value}/sms-compose`, {
      target: smsDraft.target || 'all_invitees',
      message: smsDraft.message || '',
      scheduledFor: isoForApi(smsDraft.scheduledFor)
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save SMS draft';
  } finally {
    smsSaving.value = false;
  }
};

const normalizeOrganizerItems = (raw) => {
  const parts = String(raw || '')
    .split(/[\n,;]+/)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts;
};

const flushOrganizerItemInput = () => {
  const typedItems = normalizeOrganizerItems(organizerItemInput.value);
  if (!typedItems.length) return;
  const prior = Array.isArray(draft.organizerProviding) ? draft.organizerProviding : [];
  const seen = new Set(prior.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean));
  const merged = [...prior];
  for (const item of typedItems) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  draft.organizerProviding = merged;
  organizerItemInput.value = '';
};

const addOrganizerItem = () => {
  flushOrganizerItemInput();
};
const removeOrganizerItem = (idx) => {
  draft.organizerProviding = (draft.organizerProviding || []).filter((_, i) => i !== idx);
};

const toggleUser = (id, checked) => {
  const set = new Set(draft.audience.userIds || []);
  if (checked) set.add(Number(id)); else set.delete(Number(id));
  draft.audience.userIds = [...set];
};
const toggleRole = (key, checked) => {
  const set = new Set(draft.audience.roleKeys || []);
  if (checked) set.add(String(key)); else set.delete(String(key));
  draft.audience.roleKeys = [...set];
};

const onPhotoUpload = async (event) => {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  error.value = '';
  try {
    for (const file of files) {
      const fd = new FormData();
      fd.append('logo', file);
      const resp = await api.post('/logos/upload', fd);
      const url = String(resp.data?.url || '').trim();
      if (!url) continue;
      if (!draft.eventImageUrl) draft.eventImageUrl = url;
      if (!draft.publicHeroImageUrl) draft.publicHeroImageUrl = url;
      draft.eventImageUrls = [...(draft.eventImageUrls || []), url];
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Photo upload failed';
  } finally {
    if (event?.target) event.target.value = '';
  }
};

const removeEventImage = (idx) => {
  const removed = (draft.eventImageUrls || [])[idx];
  draft.eventImageUrls = (draft.eventImageUrls || []).filter((_, i) => i !== idx);
  if (removed && draft.publicHeroImageUrl === removed) {
    draft.publicHeroImageUrl = draft.eventImageUrls[0] || '';
  }
};

const setBannerFromAlbum = (url) => {
  draft.publicHeroImageUrl = String(url || '').trim();
};

const moveEventImageLeft = (idx) => {
  const list = Array.isArray(draft.eventImageUrls) ? [...draft.eventImageUrls] : [];
  if (idx <= 0 || idx >= list.length) return;
  const tmp = list[idx - 1];
  list[idx - 1] = list[idx];
  list[idx] = tmp;
  draft.eventImageUrls = list;
};

const moveEventImageRight = (idx) => {
  const list = Array.isArray(draft.eventImageUrls) ? [...draft.eventImageUrls] : [];
  if (idx < 0 || idx >= list.length - 1) return;
  const tmp = list[idx + 1];
  list[idx + 1] = list[idx];
  list[idx] = tmp;
  draft.eventImageUrls = list;
};

const shortUrl = (value) => {
  const s = String(value || '');
  if (s.length <= 42) return s;
  return `${s.slice(0, 36)}...`;
};

const applyPreset = () => {
  const preset = eventTypePresets.find((p) => p.value === selectedPreset.value);
  if (!preset) return;
  draft.eventType = preset.eventType;
  selectedEventCategory.value = deriveCategoryFromEventType(preset.eventType);
  if (!draft.title) draft.title = preset.title;
  draft.votingQuestion = preset.votingQuestion;
};

const applyEventCategory = () => {
  const cat = String(selectedEventCategory.value || '').trim().toLowerCase();
  if (cat === 'custom') return;
  draft.eventType = cat;
};

watch(selectedEventId, (value) => {
  const id = Number(value || 0);
  if (!id) return;
  const evt = events.value.find((e) => Number(e.id) === id);
  populateFromEvent(evt);
});

onMounted(async () => {
  try {
    await Promise.all([reloadEvents(), loadAudienceOptions()]);
    // Pre-select event when opened from a card click (initialEventId prop).
    if (props.initialEventId && !selectedEventId.value) {
      const found = events.value.find((e) => Number(e.id) === Number(props.initialEventId));
      if (found) selectedEventId.value = String(found.id);
    }
    selectedEventCategory.value = deriveCategoryFromEventType(draft.eventType);
    markClean();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load event tools';
  }
});

const eventPublicUrl = computed(() => {
  if (!selectedEventIdNum.value) return '';
  const base = String(window.location.origin).replace(/\/$/, '');
  return `${base}/company-events/${selectedEventIdNum.value}`;
});

const copied = ref(false);
const copyEventUrl = async () => {
  try {
    await navigator.clipboard.writeText(eventPublicUrl.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    /* fallback: select text */
  }
};

defineExpose({
  requestClose
});
</script>

<style scoped>
.staff-event-form { background: #fff; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 16px; max-height: 85vh; overflow: auto; }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.modal-header h3 { margin: 0; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.section { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 12px; margin-top: 12px; background: #fafafa; }
.section h4 { margin: 0 0 8px; font-size: 14px; }
.section-disabled { opacity: 0.92; }
.grid { display: grid; gap: 10px; }
.grid.two { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
.grid.three { grid-template-columns: repeat(3, minmax(160px, 1fr)); }
.lbl { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; color: #475569; }
.input { width: 100%; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-toggle { display: inline-flex; gap: 6px; align-items: center; border: 1px solid #d8dee8; border-radius: 999px; padding: 4px 10px; background: #fff; }
.select-list { max-height: 180px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; padding: 8px; display: grid; gap: 6px; }
.select-item { display: flex; align-items: center; gap: 8px; }
.inline-row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.tag-list { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { background: #eef2ff; border: 1px solid #c7d2fe; padding: 2px 8px; border-radius: 999px; display: inline-flex; gap: 6px; align-items: center; }
.x { border: none; background: transparent; cursor: pointer; font-size: 12px; color: #475569; }
.save-row { margin-top: 12px; display: flex; justify-content: flex-end; }
.muted { color: #64748b; font-size: 12px; }
.error { margin: 8px 0; color: #b91c1c; }
.reg-url-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.reg-url { font-size: 12px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; color: #0f172a; word-break: break-all; flex: 1 1 0; min-width: 0; }
</style>
