<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3 style="margin: 0;">{{ title }}</h3>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <fieldset class="lam-fields" :disabled="viewOnly">
        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="error" class="error">{{ error }}</div>

        <!-- Agency new-client intake -->
        <div v-else-if="actionKey === 'agency_intake'" class="form-grid">
          <div class="form-group">
            <label>Packet type</label>
            <select v-model="agency.packetType" class="input">
              <option value="">—</option>
              <option value="digital">Digital</option>
              <option value="paper">Paper</option>
            </select>
          </div>
          <div v-if="agency.packetType === 'paper'" class="form-group">
            <label>Paper packet complete?</label>
            <select v-model="agency.paperComplete" class="input">
              <option value="">—</option>
              <option value="true">Yes — docs/signatures complete</option>
              <option value="false">No — pending corrections</option>
            </select>
            <textarea
              v-if="agency.paperComplete === 'false'"
              v-model="agency.missingItemsText"
              class="input textarea"
              rows="3"
              placeholder="Missing items (one per line)"
            />
          </div>
          <div class="form-group">
            <label class="check-row">
              <input v-model="agency.insuranceReviewed" type="checkbox" />
              <span>Insurance / eligibility reviewed</span>
            </label>
          </div>
          <div class="form-group">
            <label class="check-row">
              <input v-model="agency.ehrTransferred" type="checkbox" />
              <span>EHR transfer complete</span>
            </label>
          </div>
          <div class="form-group">
            <label class="check-row">
              <input v-model="agency.waitlisted" type="checkbox" />
              <span>Waitlist (true barrier)</span>
            </label>
            <input
              v-if="agency.waitlisted"
              v-model="agency.waitlistReason"
              class="input"
              placeholder="Waitlist reason"
            />
          </div>
          <div class="form-group">
            <label class="check-row">
              <input v-model="agency.agencyIntakeComplete" type="checkbox" />
              <span>Agency intake complete (provider assigned + clear to schedule)</span>
            </label>
          </div>
        </div>

        <!-- Agency clearance (returning) — disclosure + insurance gate Ready to Schedule -->
        <div v-else-if="actionKey === 'agency_clearance'" class="form-grid">
          <p class="hint">
            Ready to Schedule waits on disclosure + insurance only. ROI renewal is tracked separately and does not hold this step.
            Same provider as last year is treated as disclosure-ok automatically.
          </p>
          <label class="check-row" :class="{ muted: disclosurePrechecked }">
            <input v-model="clearance.disclosureOk" type="checkbox" :disabled="disclosurePrechecked" />
            <span>
              Assigned provider on disclosure (or same provider as last year)
              <template v-if="disclosurePrechecked"> — pre-checked for continuing clients</template>
            </span>
          </label>
          <label class="check-row">
            <input v-model="clearance.insuranceOk" type="checkbox" />
            <span>Insurance / eligibility clear</span>
          </label>
        </div>

        <div v-else-if="actionKey === 'roi_followup'" class="form-grid">
          <p class="hint">
            ROI is expired or limited in the system. This does not block Ready to Schedule — it is a follow-up action item
            while school document access stays paused for expired ROIs.
          </p>
          <label class="check-row">
            <input v-model="clearance.roiNoted" type="checkbox" />
            <span>Noted — ROI renewal is in progress / tracked</span>
          </label>
        </div>

        <!-- Spring Update -->
        <div v-else-if="actionKey === 'spring_update'" class="form-grid">
          <div class="form-group">
            <label>Spring outcome</label>
            <select v-model="spring.springOutcome" class="input">
              <option value="">—</option>
              <option value="returning">Returning</option>
              <option value="not_returning">Not Returning</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div v-if="spring.springOutcome === 'returning' || spring.springOutcome === 'unknown'" class="form-group">
            <label>Summer plan (optional notes)</label>
            <textarea v-model="spring.summerNotes" class="input textarea" rows="2" />
            <label style="margin-top: 8px;">Fall plan</label>
            <select v-model="spring.fallPlanKnown" class="input">
              <option value="known">Known</option>
              <option value="unknown">Unknown</option>
            </select>
            <textarea
              v-if="spring.fallPlanKnown === 'known'"
              v-model="spring.fallNotes"
              class="input textarea"
              rows="2"
              placeholder="Fall plan details"
            />
          </div>
        </div>

        <!-- Fall confirmation -->
        <div v-else-if="actionKey === 'fall_confirmation'" class="form-grid">
          <div v-if="needsPriorYearAttest" class="form-group attest-box">
            <p class="hint warn" style="margin-bottom: 8px;">
              This client has not been marked as confirmed from last year. Attest that you saw them last year
              to close out the prior year, then complete this fall update.
            </p>
            <label class="check-row">
              <input v-model="fall.attestSawLastYear" type="checkbox" />
              <span>I attest I saw this client last year</span>
            </label>
          </div>
          <div class="form-group">
            <label>Fall confirmation</label>
            <select v-model="fall.fallOutcome" class="input">
              <option value="">—</option>
              <option value="confirmed_returning">Confirmed Returning</option>
              <option value="unable_to_reach">Unable to Reach</option>
              <option value="recommend_termination">Will Not Continue / Recommend Termination</option>
              <option value="other_transfer">Other / Transfer Needed</option>
            </select>
            <p class="hint">
              Confirmed Returning still needs agency insurance clearance after 8/16.
              Through 8/16, continuing clients can move to Ready to Schedule without that insurance block.
            </p>
          </div>

          <div v-if="fall.fallOutcome === 'confirmed_returning'" class="form-group">
            <label>Assigned day</label>
            <p class="hint">Only days on your work schedule at this school are shown, with hours and open slots.</p>
            <div v-if="loadingWorkDays" class="muted">Loading your schedule days…</div>
            <div v-else-if="workDaysError" class="error">{{ workDaysError }}</div>
            <div v-else-if="!selectableDays.length" class="error">
              No work days on your schedule at this school yet. Confirm your days and hours in Provider Schedule first.
            </div>
            <div v-else class="day-grid" role="group" aria-label="Assigned days of the week">
              <button
                v-for="day in selectableDays"
                :key="day.day_of_week"
                type="button"
                class="day-chip"
                :class="{ active: isDaySelected(day.day_of_week) }"
                :title="dayTitle(day)"
                @click="toggleWorkDay(day.day_of_week)"
              >
                <span class="day-short">{{ shortDay(day.day_of_week) }}</span>
                <span v-if="dayHours(day)" class="day-meta">{{ dayHours(day) }}</span>
                <span v-if="daySlots(day)" class="day-slots">{{ daySlots(day) }}</span>
              </button>
            </div>
          </div>

          <div v-if="fall.fallOutcome === 'unable_to_reach'" class="form-group">
            <label>Number of contact attempts</label>
            <input v-model.number="fall.contactAttempts" type="number" min="1" max="99" class="input" />
          </div>

          <div v-if="fall.fallOutcome === 'other_transfer'" class="form-group">
            <label>Other reason</label>
            <select v-model="fall.otherReasonKey" class="input">
              <option value="">—</option>
              <option value="patient_discontinued_services">Patient Discontinued Services with Provider</option>
              <option value="custom">Other (private note — not shown to school)</option>
            </select>
          </div>

          <div v-if="fall.fallOutcome && fall.fallOutcome !== 'confirmed_returning'" class="form-group">
            <label>Private comment (admin/support)</label>
            <textarea v-model="fall.privateComment" class="input textarea" rows="3" required />
            <label class="check-row">
              <input v-model="fall.supportFollowUp" type="checkbox" />
              <span>Request support follow-up ticket (only creates a ticket if checked)</span>
            </label>
            <label class="check-row">
              <input v-model="fall.removeFromAssignment" type="checkbox" />
              <span>Remove from my assignment</span>
            </label>
          </div>

          <div v-if="fall.fallOutcome === 'other_transfer'" class="form-group">
            <label class="check-row">
              <input v-model="fall.recommendTerminate" type="checkbox" />
              <span>Recommend / initiate termination</span>
            </label>
          </div>

          <div
            v-if="fall.fallOutcome === 'recommend_termination' || (fall.fallOutcome === 'other_transfer' && fall.recommendTerminate)"
            class="form-group"
          >
            <label>Termination note (school staff can see this on hover)</label>
            <textarea
              v-model="fall.schoolVisibleNote"
              class="input textarea"
              rows="2"
              placeholder="Shown to school staff when they hover Terminated"
            />
            <p class="hint warn">
              School staff will see this termination note when they hover the Terminated status.
            </p>
          </div>
        </div>

        <!-- Confirm returning client is being seen -->
        <div v-else-if="actionKey === 'confirm_services_started'" class="form-grid">
          <p class="hint">
            This returning client is on the schedule. Confirm you are seeing them this year to mark status as Being Seen.
          </p>
          <div class="form-group">
            <label>Date being seen (this year)</label>
            <div class="input-with-today">
              <input v-model="services.serviceDate" type="date" class="input" />
              <button type="button" class="btn-today" @click="services.serviceDate = todayYmd()">Today</button>
            </div>
          </div>
        </div>

        <div v-else class="muted">No action available.</div>

        <div v-if="saveError" class="error" style="margin-top: 10px;">{{ saveError }}</div>
        <div class="actions" style="margin-top: 14px;">
          <button v-if="!viewOnly" class="btn btn-primary" type="button" :disabled="saving || loading" @click="save">
            {{ saving ? 'Saving…' : (isFallUpdate ? 'Update' : 'Save') }}
          </button>
          <button class="btn btn-secondary" type="button" :disabled="saving" @click="$emit('close')">
            {{ viewOnly ? 'Close' : 'Cancel' }}
          </button>
        </div>
      </fieldset>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  client: { type: Object, required: true },
  actionKey: { type: String, required: true },
  actionLabel: { type: String, default: '' },
  viewOnly: { type: Boolean, default: false },
  schoolYear: { type: String, default: '' },
  apiBase: { type: String, default: '' },
  actorUserId: { type: [Number, String], default: 0 }
});
const emit = defineEmits(['close', 'saved']);
const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveError = ref('');
const workDays = ref([]);
const loadingWorkDays = ref(false);
const workDaysError = ref('');

const agency = reactive({
  packetType: '',
  paperComplete: '',
  missingItemsText: '',
  insuranceReviewed: false,
  ehrTransferred: false,
  waitlisted: false,
  waitlistReason: '',
  agencyIntakeComplete: false
});
const clearance = reactive({
  disclosureOk: false,
  insuranceOk: false,
  roiNoted: false
});
const spring = reactive({
  springOutcome: '',
  summerNotes: '',
  fallPlanKnown: 'unknown',
  fallNotes: ''
});
const fall = reactive({
  fallOutcome: '',
  privateComment: '',
  supportFollowUp: false,
  removeFromAssignment: false,
  contactAttempts: 1,
  otherReasonKey: '',
  recommendTerminate: false,
  schoolVisibleNote: '',
  attestSawLastYear: false,
  serviceDays: []
});
const services = reactive({ serviceDate: '' });

const isFallUpdate = computed(() =>
  props.actionKey === 'fall_confirmation'
  && (!!props.client?.fall_completed_at || String(props.actionLabel || '').toLowerCase() === 'update')
);
const title = computed(() => {
  if (props.viewOnly) {
    if (props.actionKey === 'fall_confirmation') return 'View fall confirmation';
    if (props.actionKey === 'spring_update') return 'View spring update';
    if (props.actionKey === 'agency_intake') return 'View agency intake';
    return props.actionLabel || 'View submission';
  }
  if (props.actionKey === 'fall_confirmation' && isFallUpdate.value) {
    return props.actionLabel || 'Update fall confirmation';
  }
  return props.actionLabel || 'Next Step';
});
const clientId = computed(() => Number(props.client?.id || 0));
const actorId = computed(() => Number(props.actorUserId || authStore.user?.id || 0));
function reqOpts(extra = {}) {
  return props.apiBase
    ? { skipAuthRedirect: true, skipGlobalLoading: true, ...extra }
    : extra;
}
function clientApiPath(suffix) {
  const id = clientId.value;
  if (props.apiBase) return `${props.apiBase}/clients/${id}${suffix}`;
  return `/clients/${id}${suffix}`;
}
const disclosurePrechecked = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  const newIntake = ['received', 'packet', 'pending_corrections', 'in_process', 'screener', 'ready_to_schedule'].includes(key);
  return !newIntake && String(props.client?.client_type || 'school').toLowerCase() === 'school';
});
const needsPriorYearAttest = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase();
  if (['ready_to_schedule', 'received', 'packet', 'screener', 'terminated'].includes(key)) return false;
  return !props.client?.parents_contacted_at || !(props.client?.first_service_at || props.client?.services_started_at);
});
const selectableDays = computed(() =>
  (Array.isArray(workDays.value) ? workDays.value : []).filter((d) => d?.day_of_week)
);

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDay(day) {
  const map = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };
  return map[String(day)] || String(day || '').slice(0, 3);
}

function formatTime(t) {
  const s = String(t || '').slice(0, 8);
  const m = s.match(/^(\d{2}):(\d{2})/);
  if (!m) return '';
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${ampm}`;
}

function dayHours(day) {
  const a = formatTime(day?.start_time);
  const b = formatTime(day?.end_time);
  if (a && b) return `${a}–${b}`;
  return '';
}

function daySlots(day) {
  if (day?.slots_available == null && day?.slots_total == null) return '';
  const open = day?.slots_available == null ? null : Number(day.slots_available);
  const total = day?.slots_total == null ? null : Number(day.slots_total);
  if (open != null && total != null) return `${open} of ${total} slots open`;
  if (open != null) return `${open} slot${open === 1 ? '' : 's'} open`;
  return '';
}

function dayTitle(day) {
  const hours = dayHours(day);
  const slots = daySlots(day);
  return [day?.day_of_week, hours, slots].filter(Boolean).join(' · ');
}

function isDaySelected(day) {
  return (fall.serviceDays || []).includes(String(day));
}

function toggleWorkDay(day) {
  const d = String(day || '');
  if (!d) return;
  if (!selectableDays.value.some((item) => String(item.day_of_week) === d)) return;
  const current = Array.isArray(fall.serviceDays) ? [...fall.serviceDays] : [];
  const idx = current.indexOf(d);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(d);
  fall.serviceDays = current;
}

async function fetchWorkDays() {
  const orgId = Number(props.client?.organization_id || 0);
  const cid = clientId.value;
  const providerId = actorId.value;
  if (!orgId || !cid || !providerId) {
    workDays.value = [];
    return;
  }
  loadingWorkDays.value = true;
  workDaysError.value = '';
  try {
    if (props.apiBase) {
      workDays.value = [];
      return;
    }
    const r = await api.get(`/school-portal/${orgId}/clients/${cid}/day-assignment-context`, {
      params: { providerUserId: providerId },
      skipGlobalLoading: true
    });
    const providers = Array.isArray(r.data?.providers) ? r.data.providers : [];
    const match = providers.find((p) => Number(p.provider_user_id) === providerId);
    workDays.value = Array.isArray(match?.work_days)
      ? match.work_days
      : (Array.isArray(r.data?.work_days) ? r.data.work_days : []);
    const assigned = Array.isArray(match?.assigned_days)
      ? match.assigned_days
      : (Array.isArray(r.data?.assigned_days) ? r.data.assigned_days : []);
    const allowed = new Set(workDays.value.map((d) => String(d?.day_of_week || '')));
    if (assigned.length && !fall.serviceDays.length) {
      fall.serviceDays = assigned.filter((d) => allowed.has(String(d)));
    }
  } catch (e) {
    workDays.value = [];
    workDaysError.value = e?.response?.data?.error?.message || 'Could not load schedule days';
  } finally {
    loadingWorkDays.value = false;
  }
}

async function assignFallDays() {
  const orgId = Number(props.client?.organization_id || 0);
  const cid = clientId.value;
  const providerId = actorId.value;
  const days = fall.serviceDays || [];
  if (!cid || !providerId || !days.length) return;
  for (const serviceDay of days) {
    if (props.apiBase) {
      await api.post(
        `${props.apiBase}/clients/${cid}/assigned-day`,
        { providerUserId: providerId, serviceDay, assigned: true, schoolId: orgId },
        reqOpts()
      );
    } else if (orgId) {
      await api.post(
        `/school-portal/${orgId}/clients/${cid}/assigned-day`,
        { providerUserId: providerId, serviceDay, assigned: true },
        { skipGlobalLoading: true }
      );
    }
  }
}

onMounted(async () => {
  if (!clientId.value) return;
  if (props.actionKey === 'agency_clearance' && disclosurePrechecked.value) {
    clearance.disclosureOk = true;
  }
  if (props.actionKey === 'agency_intake') {
    loading.value = true;
    try {
      const { data } = await api.get(`/clients/${clientId.value}/agency-intake`);
      const intake = data?.intake || {};
      agency.packetType = intake.packetType || '';
      agency.paperComplete =
        intake.paperComplete === true ? 'true' : intake.paperComplete === false ? 'false' : '';
      agency.missingItemsText = Array.isArray(intake.missingItems) ? intake.missingItems.join('\n') : '';
      agency.insuranceReviewed = !!intake.insuranceReviewed;
      agency.ehrTransferred = !!intake.ehrTransferred;
      agency.agencyIntakeComplete = !!intake.agencyIntakeComplete;
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load agency intake';
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'confirm_services_started') {
    services.serviceDate = todayYmd();
  }
  if (props.actionKey === 'fall_confirmation') {
    const prior = String(props.client?.fall_outcome || '').trim();
    if (prior && !fall.fallOutcome) fall.fallOutcome = prior;
    fetchWorkDays();
    loading.value = true;
    try {
      const params = {};
      if (props.schoolYear) params.schoolYear = props.schoolYear;
      const { data } = await api.get(clientApiPath('/year-disposition'), {
        params,
        ...reqOpts()
      });
      const disp = data?.disposition || {};
      if (disp.fall_outcome) fall.fallOutcome = disp.fall_outcome;
      if (disp.fall_comment) fall.privateComment = disp.fall_comment;
      fall.supportFollowUp = !!(disp.fall_support_follow_up === 1 || disp.fall_support_follow_up === true);
      fall.removeFromAssignment = !!(disp.fall_remove_from_assignment === 1 || disp.fall_remove_from_assignment === true);
    } catch {
      // keep roster preload
    } finally {
      loading.value = false;
    }
  }
  if (props.actionKey === 'spring_update') {
    loading.value = true;
    try {
      const params = {};
      if (props.schoolYear) params.schoolYear = props.schoolYear;
      const { data } = await api.get(clientApiPath('/year-disposition'), {
        params,
        ...reqOpts()
      });
      const disp = data?.disposition || {};
      spring.springOutcome = disp.spring_outcome || '';
      const summer = typeof disp.summer_plan_json === 'string'
        ? JSON.parse(disp.summer_plan_json || '{}')
        : (disp.summer_plan_json || {});
      const fallPlan = typeof disp.fall_plan_json === 'string'
        ? JSON.parse(disp.fall_plan_json || '{}')
        : (disp.fall_plan_json || {});
      spring.summerNotes = summer.notes || summer.summerNotes || '';
      const known = fallPlan.known === true || fallPlan.known === 'known' || fallPlan.status === 'known';
      spring.fallPlanKnown = known ? 'known' : 'unknown';
      spring.fallNotes = fallPlan.notes || fallPlan.fallNotes || '';
    } catch (e) {
      error.value = e.response?.data?.error?.message || 'Failed to load spring update';
    } finally {
      loading.value = false;
    }
  }
});

watch(
  () => fall.fallOutcome,
  (outcome) => {
    if (outcome === 'confirmed_returning') fetchWorkDays();
  }
);

async function save() {
  saveError.value = '';
  saving.value = true;
  try {
    const id = clientId.value;
    if (props.actionKey === 'agency_intake') {
      await api.put(`/clients/${id}/agency-intake`, {
        packetType: agency.packetType || null,
        paperComplete: agency.paperComplete === '' ? null : agency.paperComplete === 'true',
        missingItems: String(agency.missingItemsText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        insuranceReviewed: !!agency.insuranceReviewed,
        ehrTransferred: !!agency.ehrTransferred,
        waitlisted: !!agency.waitlisted,
        waitlistReason: agency.waitlistReason || '',
        agencyIntakeComplete: !!agency.agencyIntakeComplete
      });
    } else if (props.actionKey === 'agency_clearance') {
      if (!clearance.disclosureOk || !clearance.insuranceOk) {
        saveError.value = 'Disclosure and insurance checks are required';
        return;
      }
      await api.put(`/clients/${id}/agency-clearance`, {
        clearance: {
          disclosureOk: !!clearance.disclosureOk,
          insuranceOk: !!clearance.insuranceOk
        }
      });
    } else if (props.actionKey === 'roi_followup') {
      if (!clearance.roiNoted) {
        saveError.value = 'Mark ROI noted to dismiss this action item';
        return;
      }
      await api.put(`/clients/${id}/roi-followup`, {});
    } else if (props.actionKey === 'spring_update') {
      await api.put(clientApiPath('/spring-update'), {
        springOutcome: spring.springOutcome,
        summerPlan: { notes: spring.summerNotes || '' },
        fallPlan: {
          known: spring.fallPlanKnown === 'known',
          notes: spring.fallNotes || ''
        }
      }, reqOpts());
    } else if (props.actionKey === 'fall_confirmation') {
      if (needsPriorYearAttest.value && !fall.attestSawLastYear) {
        saveError.value = 'Attest that you saw this client last year before completing the fall update';
        return;
      }
      if (!fall.fallOutcome) {
        saveError.value = 'Select a fall confirmation outcome';
        return;
      }
      if (fall.fallOutcome === 'confirmed_returning' && !(fall.serviceDays || []).length) {
        if (!props.apiBase || selectableDays.value.length) {
          saveError.value = selectableDays.value.length
            ? 'Select at least one assigned day'
            : 'No work days on your schedule at this school. Confirm your days in Provider Schedule first.';
          return;
        }
      }
      if (fall.fallOutcome === 'unable_to_reach' && !(Number(fall.contactAttempts) > 0)) {
        saveError.value = 'Enter how many contact attempts were made';
        return;
      }
      if (fall.fallOutcome === 'other_transfer' && !fall.otherReasonKey) {
        saveError.value = 'Select an other reason';
        return;
      }
      const recommendTerminate =
        fall.fallOutcome === 'recommend_termination' || !!fall.recommendTerminate;
      if (fall.fallOutcome === 'confirmed_returning') {
        await assignFallDays();
      }
      await api.put(clientApiPath('/fall-confirmation'), {
        fallOutcome: fall.fallOutcome,
        privateComment: fall.privateComment,
        supportFollowUp: !!fall.supportFollowUp,
        removeFromAssignment: !!fall.removeFromAssignment || recommendTerminate,
        recommendTerminate,
        contactAttempts: fall.fallOutcome === 'unable_to_reach' ? Number(fall.contactAttempts) : null,
        otherReasonKey: fall.fallOutcome === 'other_transfer' ? fall.otherReasonKey : null,
        schoolVisibleNote: recommendTerminate ? String(fall.schoolVisibleNote || '').trim() : null,
        attestSawLastYear: !!fall.attestSawLastYear,
        serviceDays: fall.serviceDays || []
      }, reqOpts());
    } else if (props.actionKey === 'confirm_services_started') {
      await api.post(`/clients/${id}/confirm-services-started`, {
        serviceDate: services.serviceDate || todayYmd()
      });
    }
    emit('saved');
    emit('close');
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
  padding: 16px;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: min(560px, 100%);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.modal-body { padding: 16px; }
.form-grid { display: grid; gap: 12px; }
.form-group { display: grid; gap: 6px; }
.input, .textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.check-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
}
.hint { font-size: 12px; color: #6b7280; margin: 0; }
.hint.warn { color: #92400e; }
.error { color: #b91c1c; font-size: 13px; }
.muted { color: #6b7280; }
.actions { display: flex; gap: 8px; }
.input-with-today { display: flex; gap: 8px; align-items: center; }
.btn-today {
  border: 1px solid #d1d5db;
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
.day-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.day-chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 108px;
}
.day-chip.active {
  border-color: var(--primary, #2f6f4e);
  background: rgba(47, 111, 78, 0.12);
  font-weight: 700;
}
.day-short { font-weight: 700; }
.day-meta, .day-slots {
  font-size: 11px;
  font-weight: 500;
  color: #4b5563;
}
.attest-box {
  padding: 10px 12px;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  background: #fffbeb;
}
.lam-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
</style>
