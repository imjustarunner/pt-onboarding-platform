<template>
  <Teleport to="body">
    <div class="pse-overlay" @click.self="$emit('close')">
      <div class="pse-modal" role="dialog" aria-modal="true" :aria-label="editEvent ? 'Edit school event' : 'Post school event'" @click.stop>
        <header class="pse-header">
          <div>
            <h2>
              {{ editEvent
                ? 'Edit school event'
                : isDistrictCreate
                  ? 'Add district event'
                  : 'Post school event' }}
            </h2>
            <p class="pse-sub">
              {{ editEvent
                ? 'Update details, status, or timing. Rescheduling replaces the previous date/time.'
                : isDistrictCreate
                  ? `Creates this event for every school in ${districtName}.`
                  : "Share your school's parent event. It will appear on the portal banner the week of the event." }}
            </p>
            <p v-if="displaySchoolName && !isDistrictCreate" class="pse-school">
              {{ editEvent ? 'School' : 'Adding for' }}:
              <strong>{{ displaySchoolName }}</strong>
            </p>
          </div>
          <button class="pse-close" type="button" aria-label="Close" @click="$emit('close')">×</button>
        </header>

        <div class="pse-body">
          <label class="field">
            <span class="lbl">Event type</span>
            <select v-model="form.category" class="input" :disabled="!!lockedCategory">
              <option value="back_to_school">Back to School (attendable event)</option>
              <option value="open_house">Open House</option>
              <option value="resource_fair">Resource Fair</option>
              <option value="family_night">Family Night</option>
              <option value="orientation">Orientation</option>
              <option value="other">Other school event</option>
              <option value="fall_check_in">Fall School Check-in (calendar only)</option>
              <option value="spring">Spring School Check-in (calendar only)</option>
              <option value="first_day">First Day of School (calendar only)</option>
              <option value="holiday">Holiday (calendar only)</option>
              <option value="day_off">Day off (calendar only)</option>
            </select>
            <span v-if="isCalendarOnlyCategory" class="hint">
              Calendar date only — not an attendable event and not open for provider staffing.
            </span>
            <span v-else-if="form.category === 'back_to_school'" class="hint">
              Use for open houses / nights families and providers attend (not the first day of school).
            </span>
          </label>

          <label class="field">
            <span class="lbl">Event name</span>
            <input v-model="form.title" type="text" class="input" maxlength="255" placeholder="e.g., Open House Night" />
          </label>

          <label class="field">
            <span class="lbl">Event details</span>
            <textarea v-model="form.description" rows="3" class="textarea" placeholder="Location, what families should expect, etc." />
          </label>

          <label v-if="editEvent" class="field">
            <span class="lbl">Status</span>
            <select v-model="form.schoolEventStatus" class="input">
              <option value="scheduled">Scheduled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="canceled">Canceled</option>
            </select>
            <span v-if="form.schoolEventStatus === 'rescheduled'" class="hint">
              Set the new date and time below — they replace the previous schedule.
            </span>
            <span v-else-if="form.schoolEventStatus === 'canceled'" class="hint warn">
              The event stays listed as canceled and the portal banner will note the cancellation.
            </span>
          </label>

          <div class="field-row">
            <label class="field">
              <span class="lbl">{{ form.schoolEventStatus === 'rescheduled' ? 'New date' : 'Date' }}</span>
              <input v-model="form.date" type="date" class="input" />
            </label>
            <label v-if="!isCalendarOnlyCategory" class="field">
              <span class="lbl">Report by</span>
              <input v-model="form.reportTime" type="time" class="input" />
            </label>
            <label class="field">
              <span class="lbl">Start time</span>
              <input v-model="form.startTime" type="time" class="input" />
            </label>
            <label class="field">
              <span class="lbl">End time</span>
              <input v-model="form.endTime" type="time" class="input" />
            </label>
          </div>
          <p class="tz-hint">
            <template v-if="!isCalendarOnlyCategory">Report by is when staff should arrive. </template>
            Times are saved in {{ timezoneLabel }} ({{ timezoneAbbrev }}).
          </p>

          <label v-if="!isCalendarOnlyCategory" class="field">
            <span class="lbl">Providers needed</span>
            <input
              v-model.number="form.minProvidersPerSession"
              type="number"
              min="1"
              max="99"
              step="1"
              class="input"
            />
            <span class="hint">How many providers to staff for this event (default 2 — raise for larger schools).</span>
          </label>
          <p v-else class="hint">
            Calendar-only types (fall/spring check-in, first day, holidays, days off) are not attendable and do not open provider staffing.
          </p>

          <label class="field">
            <span class="lbl">Event details link (optional)</span>
            <input
              v-model="form.detailsUrl"
              type="url"
              class="input"
              maxlength="1000"
              placeholder="https://… flier, webpage, or event details"
            />
            <span class="hint">If the school has a public flier or webpage for this event, paste the link.</span>
          </label>

          <label v-if="!isDistrictCreate" class="field">
            <span class="lbl">Flier file (optional)</span>
            <input type="file" accept=".pdf,image/jpeg,image/png,image/jpg" @change="onFileChange" />
            <div v-if="uploading" class="hint">Uploading…</div>
            <div v-if="form.flierFileUrl || form.eventImageUrl" class="flier-preview">
              <a :href="displayFlierUrl" target="_blank" rel="noopener">View uploaded flier</a>
            </div>
          </label>
          <p v-else class="hint">Flier files can be attached per school after the district event is created.</p>

          <label v-if="!isCalendarOnlyCategory" class="checkbox-row">
            <input v-model="form.outreachTableInvited" type="checkbox" />
            <span>{{ partnerLabel }} is invited to attend via an outreach table</span>
          </label>

          <div v-if="canAssignOnCreate" class="assign-now">
            <div class="lbl">Assign providers now (optional)</div>
            <p class="hint">
              Pick people you already know should staff this event. They’ll be assigned as soon as it’s posted.
              School staff and providers cannot use this.
            </p>
            <div v-if="providersLoading" class="hint">Loading providers…</div>
            <div v-else-if="!assignProviderOptions.length" class="hint">No providers found for this agency/school.</div>
            <template v-else>
              <div v-if="selectedAssignProviders.length" class="assign-chips">
                <span v-for="p in selectedAssignProviders" :key="p.id" class="assign-chip">
                  {{ p.name }}
                  <button type="button" class="chip-x" aria-label="Remove" @click="toggleAssignProvider(p.id)">×</button>
                </span>
              </div>
              <select v-model="assignPick" class="input" @change="onAssignPick">
                <option value="">Add a provider…</option>
                <option
                  v-for="p in unselectedAssignProviders"
                  :key="p.id"
                  :value="String(p.id)"
                >
                  {{ p.name }}{{ p.atSchool ? ' · assigned to this school' : '' }}
                </option>
              </select>
            </template>
          </div>

          <label v-if="canEditDistrictWide" class="checkbox-row district-wide">
            <input v-model="form.applyToDistrict" type="checkbox" />
            <span>
              Apply these changes to <strong>all schools</strong> in this district-wide event
              <span v-if="districtBroadcastLabel" class="hint-inline">({{ districtBroadcastLabel }})</span>
            </span>
          </label>
          <p v-if="canEditDistrictWide && form.applyToDistrict" class="hint warn">
            Title, type, date/time, and details will update for every school copy created with this district event.
          </p>

          <div v-if="error" class="error">{{ error }}</div>
          <div v-if="success" class="success">{{ success }}</div>
        </div>

        <footer class="pse-actions">
          <button
            v-if="canDeleteEvent"
            type="button"
            class="btn btn-danger"
            :disabled="submitting || uploading || deleting"
            @click="deleteEvent"
          >
            {{ deleting ? 'Deleting…' : 'Delete event' }}
          </button>
          <span class="pse-actions-spacer" />
          <button type="button" class="btn btn-secondary" @click="$emit('close')" :disabled="deleting">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="submitting || uploading || deleting" @click="submit">
            {{ submitting ? (editEvent ? 'Saving…' : 'Posting…') : (editEvent ? 'Save changes' : 'Post event') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { fetchProviderCoverageSummary } from '../../services/schoolCoverageApi';
import {
  SCHOOL_EVENT_FALLBACK_TIMEZONE,
  schoolEventTimezoneLabel,
  timezoneAbbrevAt,
  isoToZonedDatetimeLocal,
  zonedDatetimeLocalToIso
} from '../../utils/timezones';

const props = defineProps({
  schoolOrganizationId: { type: Number, default: null },
  /** Display name for the school this event is for (e.g. filter selection). */
  schoolName: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  /** When set, create fans out to every school in this district (agency admin). */
  districtName: { type: String, default: '' },
  initialCategory: { type: String, default: 'back_to_school' },
  /** Prefill date (YYYY-MM-DD) when creating from a calendar day click. */
  initialDate: { type: String, default: '' },
  initialStartTime: { type: String, default: '' },
  initialEndTime: { type: String, default: '' },
  lockedCategory: { type: Boolean, default: false },
  postToken: { type: String, default: '' },
  /** When set, posts via /public/school-reinit/:token/school-events (year-update guests). */
  reinitToken: { type: String, default: '' },
  reinitIdentity: { type: Object, default: null },
  /** Partner name for outreach-table checkbox (defaults to ITSCO). */
  partnerLabel: { type: String, default: 'ITSCO' },
  editEvent: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved', 'deleted']);
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

/**
 * Resolve the school's IANA timezone from the agency store (agencies.timezone column),
 * trying the school org first then the parent agency. Falls back to Mountain Time.
 */
const schoolTimezone = computed(() => {
  const agencies = agencyStore.agencies || [];
  // Prefer the school org's own timezone (schoolOrganizationId), then the parent agency.
  for (const id of [props.schoolOrganizationId, Number(props.agencyId)]) {
    if (!id) continue;
    const match = agencies.find((a) => Number(a.id) === Number(id));
    const tz = String(match?.timezone || '').trim();
    if (tz && tz !== 'UTC') return tz;
  }
  return SCHOOL_EVENT_FALLBACK_TIMEZONE;
});

const submitting = ref(false);
const uploading = ref(false);
const deleting = ref(false);
const error = ref('');
const success = ref('');

const canDeleteEvent = computed(() => {
  if (!props.editEvent?.id || props.reinitToken) return false;
  if (!props.schoolOrganizationId) return false;
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support'].includes(role);
});

const isDistrictCreate = computed(() => !!String(props.districtName || '').trim() && !props.editEvent);

const districtBroadcastId = computed(() =>
  String(props.editEvent?.districtBroadcastId || props.editEvent?.district_broadcast_id || '').trim()
);
const canManageDistrictBroadcast = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
});
const canEditDistrictWide = computed(
  () =>
    !!props.editEvent?.id &&
    !!districtBroadcastId.value &&
    !!props.agencyId &&
    canManageDistrictBroadcast.value
);
const districtBroadcastLabel = computed(() => {
  const d = String(props.editEvent?.districtName || props.districtName || '').trim();
  return d ? `${d} district` : 'district broadcast';
});

const displaySchoolName = computed(() => {
  const fromProp = String(props.schoolName || '').trim();
  if (fromProp) return fromProp;
  const fromEdit = String(props.editEvent?.schoolName || '').trim();
  return fromEdit || '';
});

function schoolEventUploadUrl() {
  if (props.reinitToken) return `/public/school-reinit/${props.reinitToken}/school-events/upload-flier`;
  return `/school-portal/${props.schoolOrganizationId}/school-events/upload-flier`;
}

function schoolEventCreateUrl() {
  if (props.reinitToken) return `/public/school-reinit/${props.reinitToken}/school-events`;
  return `/school-portal/${props.schoolOrganizationId}/school-events`;
}

function schoolEventUpdateUrl(eventId) {
  if (props.reinitToken) return `/public/school-reinit/${props.reinitToken}/school-events/${eventId}`;
  return `/school-portal/${props.schoolOrganizationId}/school-events/${eventId}`;
}

function schoolEventDeleteUrl(eventId) {
  return `/school-portal/${props.schoolOrganizationId}/school-events/${eventId}`;
}

function withReinitIdentity(payload) {
  if (!props.reinitToken || !props.reinitIdentity) return payload;
  return {
    ...payload,
    displayName: props.reinitIdentity.displayName || props.reinitIdentity.name || '',
    identityTitle: props.reinitIdentity.identityTitle || props.reinitIdentity.title || '',
  };
}

/** Direct assign-on-create: admin / support / super_admin only (not school staff or providers). */
const canDirectAssignRole = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support'].includes(role);
});

const form = reactive({
  category: 'back_to_school',
  title: '',
  description: '',
  date: '',
  reportTime: '',
  startTime: '17:00',
  endTime: '19:00',
  minProvidersPerSession: 2,
  schoolEventStatus: 'scheduled',
  outreachTableInvited: false,
  flierFileUrl: '',
  eventImageUrl: '',
  detailsUrl: '',
  applyToDistrict: true,
  timezone: SCHOOL_EVENT_FALLBACK_TIMEZONE
});

const isCalendarOnlyCategory = computed(() => {
  const c = String(form.category || '').toLowerCase();
  return c === 'holiday' || c === 'day_off' || c === 'first_day' || c === 'fall_check_in' || c === 'spring';
});

const canAssignOnCreate = computed(
  () =>
    canDirectAssignRole.value &&
    !props.editEvent &&
    !isDistrictCreate.value &&
    !isCalendarOnlyCategory.value &&
    !!props.agencyId &&
    !!props.schoolOrganizationId
);

const assignProviderOptions = ref([]);
const providersLoading = ref(false);
const selectedAssignIds = ref([]);
const assignPick = ref('');

const selectedAssignProviders = computed(() =>
  selectedAssignIds.value
    .map((id) => assignProviderOptions.value.find((p) => Number(p.id) === Number(id)))
    .filter(Boolean)
);
const unselectedAssignProviders = computed(() =>
  assignProviderOptions.value.filter((p) => !selectedAssignIds.value.includes(Number(p.id)))
);

function toggleAssignProvider(id) {
  const n = Number(id);
  if (!n) return;
  if (selectedAssignIds.value.includes(n)) {
    selectedAssignIds.value = selectedAssignIds.value.filter((x) => x !== n);
  } else {
    selectedAssignIds.value = [...selectedAssignIds.value, n];
  }
}

function onAssignPick() {
  const id = Number(assignPick.value);
  assignPick.value = '';
  if (id) toggleAssignProvider(id);
}

async function loadAssignProviders() {
  if (!canAssignOnCreate.value) {
    assignProviderOptions.value = [];
    selectedAssignIds.value = [];
    return;
  }
  providersLoading.value = true;
  try {
    const data = await fetchProviderCoverageSummary(props.agencyId);
    const schoolId = Number(props.schoolOrganizationId);
    const list = (data.providers || []).map((p) => {
      const id = Number(p.providerId || p.id);
      const atSchool = schoolId
        ? (p.schools || []).some((s) => Number(s.schoolId) === schoolId)
        : false;
      return {
        id,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Provider ${id}`,
        atSchool
      };
    }).filter((p) => p.id);
    list.sort((a, b) => {
      if (a.atSchool !== b.atSchool) return a.atSchool ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
    assignProviderOptions.value = list;
  } catch {
    assignProviderOptions.value = [];
  } finally {
    providersLoading.value = false;
  }
}

async function assignProvidersAfterCreate(eventId) {
  const ids = selectedAssignIds.value.slice();
  const agencyId = Number(props.agencyId);
  const eid = Number(eventId);
  if (!ids.length || !agencyId || !eid) return { assigned: 0, failed: 0 };

  const summaryRes = await api.get(`/company-events/${eid}/session-staffing-summary`, {
    params: { agencyId },
    skipGlobalLoading: true
  });
  const sessionDateId = Number(summaryRes.data?.sessions?.[0]?.sessionDateId || 0);
  if (!sessionDateId) return { assigned: 0, failed: ids.length };

  let assigned = 0;
  let failed = 0;
  for (const providerUserId of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await api.post(
        `/company-events/${eid}/session-providers/assign`,
        { agencyId, sessionDateId, providerUserId },
        { skipGlobalLoading: true }
      );
      assigned += 1;
    } catch {
      failed += 1;
    }
  }
  return { assigned, failed };
}

const wallTimeToInput = (value) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
};

const timezoneLabel = computed(() => schoolEventTimezoneLabel(form.timezone));
const timezoneAbbrev = computed(() => {
  // Use a wall-time date in the school's timezone so the abbreviation (e.g. MDT vs MST) reflects DST correctly.
  const refIso = form.date
    ? zonedDatetimeLocalToIso(`${form.date}T${form.startTime || '12:00'}`, form.timezone)
    : null;
  const d = refIso ? new Date(refIso) : new Date();
  return timezoneAbbrevAt(d, form.timezone) || 'MT';
});

const displayFlierUrl = computed(() => {
  const raw = form.flierFileUrl || form.eventImageUrl;
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return toUploadsUrl(raw);
});

/**
 * Extract YYYY-MM-DD from a UTC ISO string in the given IANA timezone.
 * Falls back to the school's timezone if none provided.
 */
const toZonedDateInput = (value, tz) => {
  const dt = isoToZonedDatetimeLocal(value, tz || schoolTimezone.value);
  return dt ? dt.slice(0, 10) : '';
};

/**
 * Extract HH:mm wall time from a UTC ISO string in the given IANA timezone.
 */
const toZonedTimeInput = (value, tz) => {
  const dt = isoToZonedDatetimeLocal(value, tz || schoolTimezone.value);
  return dt ? dt.slice(11, 16) : '';
};

/**
 * Build UTC ISO instants from the form's wall-time inputs, interpreted in
 * form.timezone (the school's timezone) — NOT the browser's local timezone.
 */
const buildIsoRange = () => {
  if (!form.date || !form.startTime || !form.endTime) return null;
  const tz = form.timezone || SCHOOL_EVENT_FALLBACK_TIMEZONE;
  const startsAt = zonedDatetimeLocalToIso(`${form.date}T${form.startTime}`, tz);
  const endsAt = zonedDatetimeLocalToIso(`${form.date}T${form.endTime}`, tz);
  if (!startsAt || !endsAt) return null;
  return { startsAt, endsAt };
};

const onFileChange = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    uploading.value = true;
    error.value = '';
    if (!props.schoolOrganizationId && !props.reinitToken) {
      error.value = 'Flier upload requires a single school. Create the district event first, then edit one school.';
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(schoolEventUploadUrl(), fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    form.flierFileUrl = res.data?.flierFileUrl || res.data?.url || '';
    if (res.data?.eventImageUrl) form.eventImageUrl = res.data.eventImageUrl;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to upload flier';
  } finally {
    uploading.value = false;
  }
};

const submit = async () => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const range = buildIsoRange();
    if (!form.title.trim()) {
      error.value = 'Event name is required';
      return;
    }
    if (!range) {
      error.value = 'Date and times are required';
      return;
    }
    const payload = withReinitIdentity({
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      timezone: form.timezone || schoolTimezone.value || SCHOOL_EVENT_FALLBACK_TIMEZONE,
      schoolEventStatus: form.schoolEventStatus || 'scheduled',
      employeeReportTime: isCalendarOnlyCategory.value
        ? null
        : (form.reportTime ? `${form.reportTime}:00` : null),
      outreachTableInvited: isCalendarOnlyCategory.value ? false : form.outreachTableInvited,
      flierFileUrl: form.flierFileUrl || null,
      eventImageUrl: form.eventImageUrl || null,
      detailsUrl: String(form.detailsUrl || '').trim() || null,
      postToken: props.postToken || undefined
    });
    if (!isCalendarOnlyCategory.value) {
      payload.minProvidersPerSession = Math.max(1, Math.min(99, Number(form.minProvidersPerSession) || 2));
    }
    let res;
    if (props.editEvent?.id && form.applyToDistrict && canEditDistrictWide.value) {
      res = await api.put(`/school-portal/school-events/district/${encodeURIComponent(districtBroadcastId.value)}`, {
        ...payload,
        agencyId: Number(props.agencyId)
      });
    } else if (props.editEvent?.id) {
      if (!props.schoolOrganizationId && !props.reinitToken) {
        error.value = 'School is required';
        return;
      }
      res = await api.put(schoolEventUpdateUrl(props.editEvent.id), payload);
    } else if (isDistrictCreate.value) {
      if (!props.agencyId) {
        error.value = 'Agency is required for district events';
        return;
      }
      res = await api.post('/school-portal/school-events/district', {
        ...payload,
        agencyId: Number(props.agencyId),
        districtName: String(props.districtName).trim()
      });
    } else {
      if (!props.schoolOrganizationId && !props.reinitToken) {
        error.value = 'School is required';
        return;
      }
      res = await api.post(schoolEventCreateUrl(), payload);
    }

    let assignNote = '';
    const createdEventId = !props.editEvent && !isDistrictCreate.value ? Number(res.data?.id || 0) : 0;
    if (createdEventId && canAssignOnCreate.value && selectedAssignIds.value.length) {
      const assignResult = await assignProvidersAfterCreate(createdEventId);
      if (assignResult.assigned) {
        assignNote = ` Assigned ${assignResult.assigned} provider${assignResult.assigned === 1 ? '' : 's'}.`;
      }
      if (assignResult.failed) {
        assignNote += ` ${assignResult.failed} assignment${assignResult.failed === 1 ? '' : 's'} failed.`;
      }
    }

    success.value = props.editEvent?.id
      ? form.applyToDistrict && canEditDistrictWide.value
        ? `Updated ${res.data?.updatedCount || 0} school(s) in this district event.`
        : form.schoolEventStatus === 'canceled'
          ? 'Event marked canceled.'
          : form.schoolEventStatus === 'rescheduled'
            ? 'Event rescheduled. New date/time is live and the portal banner will update.'
            : 'Event updated.'
      : isDistrictCreate.value
        ? `Created for ${res.data?.createdCount || 0} school(s) in the district.`
        : `Event posted.${assignNote || ' It will appear on the portal banner the week of the event.'}`;
    emit('saved', res.data);
    setTimeout(() => emit('close'), assignNote ? 1600 : 1100);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save event';
  } finally {
    submitting.value = false;
  }
};

const deleteEvent = async () => {
  if (!canDeleteEvent.value || !props.editEvent?.id) return;
  const title = String(props.editEvent.title || 'this event').trim();
  const ok = window.confirm(
    `Delete "${title}"? It will be removed from the school portal, calendar, and kiosk.`
  );
  if (!ok) return;
  deleting.value = true;
  error.value = '';
  success.value = '';
  try {
    await api.delete(schoolEventDeleteUrl(props.editEvent.id));
    success.value = 'Event deleted.';
    emit('deleted', { id: props.editEvent.id });
    setTimeout(() => emit('close'), 700);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete event';
  } finally {
    deleting.value = false;
  }
};

const hydrateFromEdit = () => {
  const e = props.editEvent;
  if (!e) return;
  // Always display (and re-save) school events in the school's timezone (Mountain by default),
  // even if the event was originally created in a different timezone. This ensures consistency
  // regardless of which user's browser timezone the event was entered from.
  const tz = schoolTimezone.value;
  form.timezone = tz;
  form.category = e.category || 'back_to_school';
  form.title = e.title || '';
  form.description = e.description || '';
  form.date = toZonedDateInput(e.startsAt, tz);
  form.reportTime = wallTimeToInput(e.employeeReportTime);
  form.startTime = toZonedTimeInput(e.startsAt, tz) || '17:00';
  form.endTime = toZonedTimeInput(e.endsAt, tz) || '19:00';
  form.minProvidersPerSession =
    e.minProvidersPerSession != null && e.minProvidersPerSession !== ''
      ? Math.max(1, Number(e.minProvidersPerSession) || 2)
      : e.providersRequested != null
        ? Math.max(1, Number(e.providersRequested) || 2)
        : 2;
  form.schoolEventStatus = e.schoolEventStatus || e.status || 'scheduled';
  form.outreachTableInvited = !!e.outreachTableInvited;
  form.flierFileUrl = e.flierFileUrl || '';
  form.eventImageUrl = e.eventImageUrl || '';
  form.detailsUrl = e.detailsUrl || '';
  form.applyToDistrict = !!String(e.districtBroadcastId || e.district_broadcast_id || '').trim();
};

onMounted(() => {
  form.category = props.initialCategory || 'back_to_school';
  // Default to the school's timezone (Mountain Time for most ITSCO schools) so that
  // wall times entered in the form are always interpreted correctly regardless of the
  // browser/user timezone.
  form.timezone = schoolTimezone.value;
  if (props.editEvent) {
    hydrateFromEdit();
    return;
  }
  const d = String(props.initialDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) form.date = d;
  const st = String(props.initialStartTime || '').trim();
  if (/^\d{2}:\d{2}$/.test(st)) form.startTime = st;
  const et = String(props.initialEndTime || '').trim();
  if (/^\d{2}:\d{2}$/.test(et)) form.endTime = et;
  loadAssignProviders();
});

watch(
  () => props.editEvent,
  () => hydrateFromEdit()
);

watch(
  () => [
    canAssignOnCreate.value,
    props.agencyId,
    props.schoolOrganizationId,
    form.category
  ],
  () => {
    if (canAssignOnCreate.value) loadAssignProviders();
    else {
      assignProviderOptions.value = [];
      selectedAssignIds.value = [];
    }
  }
);
</script>

<style scoped>
.pse-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: rgba(15, 23, 42, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(2px);
}
.pse-modal {
  width: min(560px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: #ffffff;
  color: #0f172a;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
.pse-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.pse-school {
  margin: 0.45rem 0 0;
  font-size: 0.88rem;
  color: #334155;
}
.pse-school strong {
  color: #0f766e;
  font-weight: 700;
}
.pse-header h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}
.pse-sub {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.35;
  max-width: 40ch;
}
.pse-close {
  border: none;
  background: transparent;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  padding: 0 4px;
}
.pse-body {
  padding: 14px 18px 8px;
  background: #fff;
}
.field {
  display: block;
  margin-bottom: 12px;
}
.lbl {
  display: block;
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 4px;
  color: #334155;
}
.input,
.textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.textarea { resize: vertical; min-height: 72px; }
.field-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr 1fr;
  gap: 10px;
}
.hint {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #64748b;
}
.hint.warn { color: #b45309; }
.tz-hint {
  margin: -0.35rem 0 0.85rem;
  font-size: 0.75rem;
  color: #475569;
  font-weight: 600;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 14px;
  font-size: 0.9rem;
  color: #334155;
}
.checkbox-row.district-wide {
  padding: 0.55rem 0.65rem;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
}
.hint-inline {
  color: #92400e;
  font-weight: 600;
}
.assign-now {
  margin: 0.35rem 0 1rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
}
.assign-now .lbl {
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.assign-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.45rem 0 0.55rem;
}
.assign-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
  font-size: 0.78rem;
  font-weight: 650;
}
.assign-chip .chip-x {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.1rem;
}
.pse-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 18px 16px;
  flex-wrap: wrap;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.pse-actions-spacer {
  flex: 1;
  min-width: 0.5rem;
}
.btn-danger {
  background: #b91c1c;
  color: #fff;
  border: 1px solid #991b1b;
}
.btn-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary { background: #0f766e; color: #fff; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #334155; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.error { color: #b91c1c; margin: 8px 0; font-size: 0.875rem; }
.success { color: #047857; margin: 8px 0; font-size: 0.875rem; }
.flier-preview { margin-top: 6px; font-size: 0.85rem; }
@media (max-width: 640px) {
  .field-row { grid-template-columns: 1fr; }
}
</style>
