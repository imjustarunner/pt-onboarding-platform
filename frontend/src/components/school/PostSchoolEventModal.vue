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
              <option value="back_to_school">Back to School</option>
              <option value="fall_check_in">Fall School Check-in</option>
              <option value="spring">Spring School Check-in</option>
              <option value="open_house">Open House</option>
              <option value="resource_fair">Resource Fair</option>
              <option value="family_night">Family Night</option>
              <option value="orientation">Orientation</option>
              <option value="holiday">Holiday</option>
              <option value="day_off">Day off</option>
              <option value="other">Other school event</option>
            </select>
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
            <label class="field">
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
            Report by is when staff should arrive. Times are saved in {{ timezoneLabel }} ({{ timezoneAbbrev }}).
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
          <p v-else class="hint">Holidays and days off do not open provider staffing.</p>

          <label v-if="canEditPayrollFields" class="field">
            <span class="lbl">Direct hours cap (payroll)</span>
            <input
              v-model.number="form.skillBuilderDirectHours"
              type="number"
              min="0"
              step="0.25"
              class="input"
            />
            <span class="hint">
              Defaults to 0 (all time posts as indirect). Only payroll and admin can change this.
            </span>
          </label>

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

          <label class="checkbox-row">
            <input v-model="form.outreachTableInvited" type="checkbox" />
            <span>ITSCO is invited to attend via an outreach table</span>
          </label>

          <div v-if="error" class="error">{{ error }}</div>
          <div v-if="success" class="success">{{ success }}</div>
        </div>

        <footer class="pse-actions">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="submitting || uploading" @click="submit">
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
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  detectLocalTimezone,
  SCHOOL_EVENT_FALLBACK_TIMEZONE,
  schoolEventTimezoneLabel,
  timezoneAbbrevAt
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
  editEvent: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);
const authStore = useAuthStore();

const submitting = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');

const isDistrictCreate = computed(() => !!String(props.districtName || '').trim() && !props.editEvent);

const displaySchoolName = computed(() => {
  const fromProp = String(props.schoolName || '').trim();
  if (fromProp) return fromProp;
  const fromEdit = String(props.editEvent?.schoolName || '').trim();
  return fromEdit || '';
});

const canEditPayrollFields = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin') return true;
  return !!authStore.user?.capabilities?.canManagePayroll;
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
  skillBuilderDirectHours: 0,
  schoolEventStatus: 'scheduled',
  outreachTableInvited: false,
  flierFileUrl: '',
  eventImageUrl: '',
  detailsUrl: '',
  timezone: SCHOOL_EVENT_FALLBACK_TIMEZONE
});

const isCalendarOnlyCategory = computed(() => {
  const c = String(form.category || '').toLowerCase();
  return c === 'holiday' || c === 'day_off';
});

const wallTimeToInput = (value) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
};

const timezoneLabel = computed(() => schoolEventTimezoneLabel(form.timezone));
const timezoneAbbrev = computed(() => {
  const d = form.date ? new Date(`${form.date}T${form.startTime || '12:00'}:00`) : new Date();
  return timezoneAbbrevAt(d, form.timezone) || 'MT';
});

const displayFlierUrl = computed(() => {
  const raw = form.flierFileUrl || form.eventImageUrl;
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return toUploadsUrl(raw);
});

const toLocalDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toLocalTimeInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buildIsoRange = () => {
  if (!form.date || !form.startTime || !form.endTime) return null;
  const startsAt = new Date(`${form.date}T${form.startTime}:00`);
  const endsAt = new Date(`${form.date}T${form.endTime}:00`);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
};

const onFileChange = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    uploading.value = true;
    error.value = '';
    if (!props.schoolOrganizationId) {
      error.value = 'Flier upload requires a single school. Create the district event first, then edit one school.';
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(`/school-portal/${props.schoolOrganizationId}/school-events/upload-flier`, fd, {
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
    const payload = {
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      timezone: form.timezone || detectLocalTimezone() || SCHOOL_EVENT_FALLBACK_TIMEZONE,
      schoolEventStatus: form.schoolEventStatus || 'scheduled',
      employeeReportTime: form.reportTime ? `${form.reportTime}:00` : null,
      outreachTableInvited: form.outreachTableInvited,
      flierFileUrl: form.flierFileUrl || null,
      eventImageUrl: form.eventImageUrl || null,
      detailsUrl: String(form.detailsUrl || '').trim() || null,
      postToken: props.postToken || undefined
    };
    if (!isCalendarOnlyCategory.value) {
      payload.minProvidersPerSession = Math.max(1, Math.min(99, Number(form.minProvidersPerSession) || 2));
    }
    if (canEditPayrollFields.value) {
      payload.skillBuilderDirectHours = Number(form.skillBuilderDirectHours) || 0;
    }
    let res;
    if (props.editEvent?.id) {
      res = await api.put(
        `/school-portal/${props.schoolOrganizationId}/school-events/${props.editEvent.id}`,
        payload
      );
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
      if (!props.schoolOrganizationId) {
        error.value = 'School is required';
        return;
      }
      res = await api.post(`/school-portal/${props.schoolOrganizationId}/school-events`, payload);
    }
    success.value = props.editEvent?.id
      ? form.schoolEventStatus === 'canceled'
        ? 'Event marked canceled.'
        : form.schoolEventStatus === 'rescheduled'
          ? 'Event rescheduled. New date/time is live and the portal banner will update.'
          : 'Event updated.'
      : isDistrictCreate.value
        ? `Created for ${res.data?.createdCount || 0} school(s) in the district.`
        : 'Event posted. It will appear on the portal banner the week of the event.';
    emit('saved', res.data);
    setTimeout(() => emit('close'), 1100);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save event';
  } finally {
    submitting.value = false;
  }
};

const hydrateFromEdit = () => {
  const e = props.editEvent;
  if (!e) return;
  form.category = e.category || 'back_to_school';
  form.title = e.title || '';
  form.description = e.description || '';
  form.date = toLocalDateInput(e.startsAt);
  form.reportTime = wallTimeToInput(e.employeeReportTime);
  form.startTime = toLocalTimeInput(e.startsAt) || '17:00';
  form.endTime = toLocalTimeInput(e.endsAt) || '19:00';
  form.skillBuilderDirectHours =
    e.skillBuilderDirectHours != null && e.skillBuilderDirectHours !== ''
      ? Number(e.skillBuilderDirectHours)
      : 0;
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
  form.timezone = e.timezone || detectLocalTimezone() || SCHOOL_EVENT_FALLBACK_TIMEZONE;
};

onMounted(() => {
  form.category = props.initialCategory || 'back_to_school';
  form.timezone = detectLocalTimezone() || SCHOOL_EVENT_FALLBACK_TIMEZONE;
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
});

watch(
  () => props.editEvent,
  () => hydrateFromEdit()
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
.pse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
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
