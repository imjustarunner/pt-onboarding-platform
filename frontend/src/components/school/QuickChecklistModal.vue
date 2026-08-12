<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 style="margin: 0;">Quick Checklist — {{ clientLabel }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div v-if="saving" class="muted">Saving…</div>
        <div v-else class="form-grid">
          <div class="form-group">
            <label>Parents Contacted</label>
            <input v-model="form.parentsContactedAt" type="date" class="input" />
          </div>
          <div class="form-group">
            <label>Contact Successful?</label>
            <select v-model="form.parentsContactedSuccessful" class="input">
              <option value="">—</option>
              <option value="true">Successful</option>
              <option value="false">Unsuccessful</option>
            </select>
          </div>
          <div class="form-group">
            <label>First Date of Service</label>
            <div class="input-with-today">
              <input v-model="form.firstServiceAt" type="date" class="input" />
              <button type="button" class="btn-today" @click="setFirstServiceToday">Today</button>
            </div>
            <p class="hint" style="margin-top: 6px; font-size: 12px;">
              Do not list the date of first service unless the appointment has actually occurred.
              For returning fall clients, use Continuation of Services (assign a weekday) instead of a continuation date.
            </p>
          </div>
          <div v-if="showContinuationServices" class="form-group continuation-section">
            <label>Continuation of Services</label>
            <select v-model="form.continuation.plan" class="input">
              <option value="">—</option>
              <option value="continue_school">Continuing Services</option>
              <option value="not_continue_school">Not Continuing Services</option>
              <option value="unable_to_contact_parent">Not able to contact parent</option>
              <option value="other">Other</option>
            </select>

            <div v-if="form.continuation.plan === 'continue_school'" class="nested-fields">
              <p class="hint">
                Select the weekday(s) you see this client. Saving assigns those days and marks the client Current with Fall readiness complete.
              </p>
              <div v-if="loadingWorkDays" class="muted">Loading your schedule days…</div>
              <div v-else-if="workDaysError" class="error">{{ workDaysError }}</div>
              <div class="day-grid" role="group" aria-label="Assigned days of the week">
                <button
                  v-for="day in selectableDays"
                  :key="day.day_of_week"
                  type="button"
                  class="day-chip"
                  :class="{ active: isDaySelected(day.day_of_week) }"
                  @click="toggleWorkDay(day.day_of_week)"
                >
                  <span class="day-short">{{ shortDay(day.day_of_week) }}</span>
                  <span v-if="dayHours(day)" class="day-meta">{{ dayHours(day) }}</span>
                </button>
              </div>
              <p v-if="!workDays.length && !loadingWorkDays" class="hint">
                No school schedule days found — Monday–Friday are available (same as Assign day).
              </p>
            </div>

            <div
              v-else-if="['not_continue_school', 'unable_to_contact_parent', 'other'].includes(form.continuation.plan)"
              class="nested-fields"
            >
              <label class="field-label">Private comment (admin / support only)</label>
              <textarea
                v-model="form.continuation.privateComment"
                class="input textarea"
                rows="3"
                placeholder="Required — visible to admin, super_admin, and support only"
              />

              <label class="check-row">
                <input v-model="form.continuation.supportFollowUp" type="checkbox" />
                <span>Request support follow-up (creates a ticket with all continuation details)</span>
              </label>
              <label class="check-row">
                <input v-model="form.continuation.removeFromAssignment" type="checkbox" />
                <span>Remove this client from my assignment (they can be reassigned later)</span>
              </label>

              <template v-if="form.continuation.plan === 'not_continue_school'">
                <p class="hint warn">
                  This will terminate the client and remove them from your caseload.
                  Please submit a termination note on the EHR if you have not already.
                </p>
                <p class="hint thank-you">
                  Thank you for what you do and we appreciate your time and attention to your clients.
                </p>
              </template>

              <template v-else>
                <label class="field-label">Recommend termination?</label>
                <select v-model="form.continuation.recommendTerminate" class="input">
                  <option value="">—</option>
                  <option value="false">No — flag Fall Readiness only</option>
                  <option value="true">Yes — terminate and remove from caseload</option>
                </select>
                <template v-if="form.continuation.recommendTerminate === 'true'">
                  <p class="hint warn">
                    This removes the client from your caseload. Please submit a termination note on the EHR if you have not already.
                  </p>
                  <p class="hint thank-you">
                    Thank you for what you do and we appreciate your time and attention to your clients.
                  </p>
                </template>
              </template>
            </div>
          </div>
        </div>
        <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
        <div class="actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="$emit('close')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const DEFAULT_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const props = defineProps({
  client: { type: Object, required: true },
  parentAgencyId: { type: Number, default: null }
});
const emit = defineEmits(['close', 'saved']);

const authStore = useAuthStore();

const emptyContinuation = () => ({
  plan: '',
  serviceDays: [],
  privateComment: '',
  supportFollowUp: false,
  removeFromAssignment: false,
  recommendTerminate: ''
});

const form = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  firstServiceAt: '',
  continuation: emptyContinuation()
});

const saving = ref(false);
const error = ref('');
const workDays = ref([]);
const loadingWorkDays = ref(false);
const workDaysError = ref('');

const providerUserId = computed(() => Number(authStore.user?.id || 0) || null);
const schoolOrganizationId = computed(() =>
  Number(props.client?.organization_id || props.client?.school_organization_id || 0) || null
);

const clientLabel = ref('');
const isContinuationServicesSeason = (value = new Date()) => {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const start = new Date(d.getFullYear(), 4, 1);
  const end = new Date(d.getFullYear(), 8, 1);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
};
const showContinuationServices = computed(() => isContinuationServicesSeason());

const selectableDays = computed(() => {
  if (workDays.value.length) return workDays.value;
  return DEFAULT_WEEKDAYS.map((day_of_week) => ({ day_of_week, start_time: null, end_time: null }));
});

const parseContinuationServices = (value) => {
  if (!value) return emptyContinuation();
  let data = value;
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value);
    } catch {
      return emptyContinuation();
    }
  }
  if (!data || typeof data !== 'object') return emptyContinuation();
  const recommend =
    data.recommendTerminate === true || data.recommendTerminate === 'true' || data.recommendTerminate === 1
      ? 'true'
      : data.recommendTerminate === false || data.recommendTerminate === 'false' || data.recommendTerminate === 0
        ? 'false'
        : '';
  return {
    ...emptyContinuation(),
    plan: String(data.plan || ''),
    serviceDays: Array.isArray(data.serviceDays)
      ? data.serviceDays.map((d) => String(d || '').trim()).filter(Boolean)
      : [],
    privateComment: String(data.privateComment || data.comment || ''),
    supportFollowUp: data.supportFollowUp === true || data.supportFollowUp === 1 || data.supportFollowUp === 'true',
    removeFromAssignment:
      data.removeFromAssignment === true || data.removeFromAssignment === 1 || data.removeFromAssignment === 'true',
    recommendTerminate: recommend
  };
};

const syncForm = () => {
  const c = props.client;
  if (!c) return;
  clientLabel.value = c.initials || c.identifier_code || `Client ${c.id}` || '—';
  form.value = {
    parentsContactedAt: c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '',
    parentsContactedSuccessful:
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : c.parents_contacted_successful
          ? 'true'
          : 'false',
    firstServiceAt: c.first_service_at ? String(c.first_service_at).slice(0, 10) : '',
    continuation: parseContinuationServices(c.continuation_services_json)
  };
};

watch(() => props.client?.id, syncForm, { immediate: true });

const onKeydown = (e) => {
  if (e.key === 'Escape') emit('close');
};
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

const fetchWorkDays = async () => {
  const orgId = schoolOrganizationId.value;
  const clientId = Number(props.client?.id || 0);
  const providerId = providerUserId.value;
  if (!orgId || !clientId || !providerId) {
    workDays.value = [];
    return;
  }
  loadingWorkDays.value = true;
  workDaysError.value = '';
  try {
    const r = await api.get(`/school-portal/${orgId}/clients/${clientId}/day-assignment-context`, {
      params: { providerUserId: providerId },
      skipGlobalLoading: true
    });
    const providers = Array.isArray(r.data?.providers) ? r.data.providers : [];
    const match =
      providers.find((p) => Number(p.provider_user_id) === providerId) ||
      (r.data?.provider
        ? {
            work_days: r.data.work_days,
            assigned_days: r.data.assigned_days
          }
        : null);
    workDays.value = Array.isArray(match?.work_days) ? match.work_days : [];
    const assigned = Array.isArray(match?.assigned_days) ? match.assigned_days : [];
    if (assigned.length && !form.value.continuation.serviceDays?.length) {
      form.value.continuation.serviceDays = [...assigned];
    }
  } catch (e) {
    workDays.value = [];
    workDaysError.value = e?.response?.data?.error?.message || 'Could not load your school schedule days';
  } finally {
    loadingWorkDays.value = false;
  }
};

const shortDay = (day) => {
  const map = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  return map[String(day)] || String(day || '').slice(0, 3);
};

const formatTime = (t) => {
  const s = String(t || '').slice(0, 8);
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return '';
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${ampm}`;
};

const dayHours = (day) => {
  const a = formatTime(day?.start_time);
  const b = formatTime(day?.end_time);
  if (a && b) return `${a}–${b}`;
  return '';
};

const isDaySelected = (day) => (form.value.continuation.serviceDays || []).includes(String(day));

const toggleWorkDay = (day) => {
  const d = String(day || '');
  if (!d) return;
  const current = Array.isArray(form.value.continuation.serviceDays) ? [...form.value.continuation.serviceDays] : [];
  const idx = current.indexOf(d);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(d);
  form.value.continuation.serviceDays = current;
};

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const setFirstServiceToday = () => {
  form.value.firstServiceAt = todayYmd();
};

const continuationPayload = () => {
  const c = form.value.continuation || emptyContinuation();
  if (!showContinuationServices.value || !c.plan) return null;
  if (c.plan === 'continue_school') {
    return {
      plan: c.plan,
      serviceDays: Array.isArray(c.serviceDays) ? c.serviceDays.filter(Boolean) : []
    };
  }
  return {
    plan: c.plan,
    privateComment: String(c.privateComment || '').trim(),
    supportFollowUp: !!c.supportFollowUp,
    removeFromAssignment: !!c.removeFromAssignment,
    recommendTerminate: c.plan === 'not_continue_school' ? true : c.recommendTerminate === 'true'
  };
};

const assignContinuationDays = async () => {
  const orgId = schoolOrganizationId.value;
  const clientId = Number(props.client?.id || 0);
  const providerId = providerUserId.value;
  const days = form.value.continuation?.serviceDays || [];
  if (!orgId || !clientId || !providerId || !days.length) return;
  for (const serviceDay of days) {
    await api.post(
      `/school-portal/${orgId}/clients/${clientId}/assigned-day`,
      { providerUserId: providerId, serviceDay, assigned: true },
      { skipGlobalLoading: true }
    );
  }
};

const save = async () => {
  if (!props.client?.id) return;
  const plan = form.value.continuation?.plan || '';
  if (showContinuationServices.value && plan === 'continue_school') {
    if (!(form.value.continuation.serviceDays || []).length) {
      error.value = 'Select at least one day of the week for this client.';
      return;
    }
  }
  if (
    showContinuationServices.value
    && ['not_continue_school', 'unable_to_contact_parent', 'other'].includes(plan)
  ) {
    if (!String(form.value.continuation.privateComment || '').trim()) {
      error.value = 'A private comment for admin/support is required.';
      return;
    }
    if (plan !== 'not_continue_school' && form.value.continuation.recommendTerminate === '') {
      error.value = 'Indicate whether you recommend termination.';
      return;
    }
  }
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      parentsContactedAt: form.value.parentsContactedAt || null,
      parentsContactedSuccessful:
        form.value.parentsContactedSuccessful === '' ? null : form.value.parentsContactedSuccessful === 'true',
      firstServiceAt: form.value.firstServiceAt || null
    };
    if (showContinuationServices.value) {
      payload.continuationServices = continuationPayload();
    }
    // Assign days before checklist save so promotion sees weekday + continuation together.
    if (showContinuationServices.value && plan === 'continue_school') {
      await assignContinuationDays();
    }
    await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

watch(
  () => [props.client?.id, form.value.continuation.plan, schoolOrganizationId.value],
  ([, plan]) => {
    if (plan === 'continue_school') fetchWorkDays();
    else {
      workDays.value = [];
      workDaysError.value = '';
    }
  },
  { immediate: true }
);

watch(
  () => form.value.continuation.plan,
  (plan, prev) => {
    if (plan === prev) return;
    if (plan !== 'continue_school') {
      form.value.continuation.serviceDays = [];
    }
    if (!['not_continue_school', 'unable_to_contact_parent', 'other'].includes(plan)) {
      form.value.continuation.privateComment = '';
      form.value.continuation.supportFollowUp = false;
      form.value.continuation.removeFromAssignment = false;
      form.value.continuation.recommendTerminate = '';
    }
  }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
.modal {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  min-width: 280px;
  max-width: 95vw;
  width: 100%;
  margin: 12px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-header .btn {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 12px;
}
.modal-body {
  padding: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-group > label:not(.choice-card):not(.check-row) {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.continuation-section {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, #f8fafc);
}
.nested-fields {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.day-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.day-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid #166534;
  border-radius: 10px;
  background: #fff;
  color: #166534;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.day-chip.active {
  background: #166534;
  color: #fff;
}
.day-short {
  font-size: 13px;
  font-weight: 800;
}
.day-meta {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
  margin-top: 2px;
}
.hint.warn {
  color: #9a3412;
  background: rgba(234, 88, 12, 0.08);
  border: 1px solid rgba(234, 88, 12, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
}
.hint.thank-you {
  color: #166534;
  font-weight: 600;
}
.check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
}
.check-row input {
  margin-top: 2px;
}
.textarea {
  resize: vertical;
  min-height: 72px;
}
.input-with-today {
  display: flex;
  gap: 8px;
  align-items: center;
}
.input-with-today .input {
  flex: 1;
  min-width: 0;
}
.btn-today {
  flex-shrink: 0;
  padding: 10px 14px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary);
}
.btn-today:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.actions .btn {
  min-height: 44px;
  padding: 10px 16px;
}
.error {
  color: #c33;
  font-size: 13px;
}
.hint {
  color: var(--text-secondary, #666);
  margin: 0;
}

@media (max-width: 640px) {
  .modal {
    min-width: 0;
    margin: 8px;
    max-height: 85vh;
  }
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .input-with-today {
    flex-wrap: wrap;
  }
  .input-with-today .input {
    width: 100%;
  }
}
</style>
