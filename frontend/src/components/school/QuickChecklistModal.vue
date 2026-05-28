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
              Do not list the date of first service unless the appointment has actually occurred, as this will mark the client as current.
            </p>
          </div>
          <div v-if="showContinuationServices" class="form-group continuation-section">
            <label>Continuation of Services</label>
            <select v-model="form.continuation.plan" class="input">
              <option value="">—</option>
              <option value="continue_school">Continuing for in-school services in the fall</option>
              <option value="not_continue_school">Not continuing for in-school services in the fall</option>
              <option value="unable_to_contact_parent">Not able to contact parent/guardian</option>
            </select>

            <div v-if="form.continuation.plan === 'continue_school'" class="nested-fields">
              <div class="choice-row">
                <label class="choice-card">
                  <input v-model="form.continuation.schoolChoice" type="radio" value="current_school" />
                  <span class="choice-card-label">Current school</span>
                </label>
                <label class="choice-card">
                  <input v-model="form.continuation.schoolChoice" type="radio" value="new_school" />
                  <span class="choice-card-label">New school</span>
                </label>
              </div>

              <div v-if="form.continuation.schoolChoice === 'current_school'" class="nested-fields">
                <label class="choice-card">
                  <input v-model="form.continuation.currentSchoolAction" type="radio" value="continuing_with_me" />
                  <span class="choice-card-label">Continuing with me</span>
                </label>
                <label class="choice-card">
                  <input v-model="form.continuation.currentSchoolAction" type="radio" value="requesting_transfer" />
                  <span class="choice-card-label">Requesting transfer</span>
                </label>
              </div>

              <div v-if="form.continuation.schoolChoice === 'new_school'" class="nested-fields">
                <label>New school</label>
                <select v-model="form.continuation.newSchoolOrganizationId" class="input">
                  <option value="">Select affiliated school…</option>
                  <option
                    v-for="school in agencySchools"
                    :key="school.school_organization_id"
                    :value="String(school.school_organization_id)"
                  >
                    {{ school.school_name }}
                  </option>
                </select>
                <input
                  v-if="!form.continuation.newSchoolOrganizationId"
                  v-model="form.continuation.newSchoolName"
                  class="input"
                  type="text"
                  placeholder="Type school if it is not listed"
                />
                <p v-if="agencySchoolsError" class="hint" style="font-size: 12px;">{{ agencySchoolsError }}</p>

                <div v-if="form.continuation.newSchoolOrganizationId" class="nested-fields">
                  <label class="choice-card">
                    <input
                      v-model="form.continuation.newSchoolAction"
                      type="radio"
                      value="continue_at_new_school_if_possible"
                    />
                    <span class="choice-card-label">I would like to continue to see them at their new school if possible</span>
                  </label>
                  <label class="choice-card">
                    <input
                      v-model="form.continuation.newSchoolAction"
                      type="radio"
                      value="pursue_in_office_support"
                    />
                    <span class="choice-card-label">I will pursue in-office support at the client's request</span>
                  </label>
                </div>
              </div>
            </div>

            <div v-if="form.continuation.plan === 'not_continue_school'" class="nested-fields">
              <label class="choice-card">
                <input
                  v-model="form.continuation.notContinuingAction"
                  type="radio"
                  value="transferring_terminating_client"
                />
                <span class="choice-card-label">Transferring/terminating the client</span>
              </label>
              <label class="choice-card">
                <input
                  v-model="form.continuation.notContinuingAction"
                  type="radio"
                  value="continuing_office_virtual"
                />
                <span class="choice-card-label">Continuing as an in-office/virtual client</span>
              </label>
            </div>

            <div
              v-if="form.continuation.plan === 'unable_to_contact_parent'"
              class="sub-prompt-overlay"
              role="dialog"
              aria-labelledby="unable-contact-prompt-title"
            >
              <div class="sub-prompt">
                <h4 id="unable-contact-prompt-title">Not able to contact parent/guardian</h4>
                <p class="sub-prompt-lead">Select a recommendation:</p>
                <div class="choice-row">
                  <label class="choice-card">
                    <input
                      v-model="form.continuation.unableToContactRecommendation"
                      type="radio"
                      value="recommend_continue"
                    />
                    <span class="choice-card-label">Recommend Continue</span>
                  </label>
                  <label class="choice-card">
                    <input
                      v-model="form.continuation.unableToContactRecommendation"
                      type="radio"
                      value="recommend_terminate"
                    />
                    <span class="choice-card-label">Recommend Terminate</span>
                  </label>
                </div>
              </div>
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

const props = defineProps({
  client: { type: Object, required: true },
  parentAgencyId: { type: Number, default: null }
});
const emit = defineEmits(['close', 'saved']);

const emptyContinuation = () => ({
  plan: '',
  schoolChoice: '',
  currentSchoolAction: '',
  newSchoolOrganizationId: '',
  newSchoolName: '',
  newSchoolAction: '',
  notContinuingAction: '',
  unableToContactRecommendation: ''
});

const form = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  firstServiceAt: '',
  continuation: emptyContinuation()
});

const saving = ref(false);
const error = ref('');
const agencySchools = ref([]);
const agencySchoolsError = ref('');

const clientLabel = ref('');
const isContinuationServicesSeason = (value = new Date()) => {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const start = new Date(d.getFullYear(), 4, 1);
  const end = new Date(d.getFullYear(), 8, 1);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
};
const showContinuationServices = computed(() => isContinuationServicesSeason());

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
  return {
    ...emptyContinuation(),
    plan: String(data.plan || ''),
    schoolChoice: String(data.schoolChoice || ''),
    currentSchoolAction: String(data.currentSchoolAction || ''),
    newSchoolOrganizationId: data.newSchoolOrganizationId ? String(data.newSchoolOrganizationId) : '',
    newSchoolName: String(data.newSchoolName || ''),
    newSchoolAction: String(data.newSchoolAction || ''),
    notContinuingAction: String(data.notContinuingAction || ''),
    unableToContactRecommendation: String(data.unableToContactRecommendation || '')
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

const fetchAgencySchools = async () => {
  if (!props.parentAgencyId || !showContinuationServices.value) return;
  try {
    agencySchoolsError.value = '';
    const response = await api.get(`/agencies/${props.parentAgencyId}/schools`, { skipGlobalLoading: true });
    agencySchools.value = Array.isArray(response.data) ? response.data : [];
  } catch {
    agencySchools.value = [];
    agencySchoolsError.value = 'Affiliated schools could not be loaded. Type the school if it is not listed.';
  }
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
  const payload = { plan: c.plan };
  if (c.plan === 'continue_school') {
    payload.schoolChoice = c.schoolChoice || '';
    if (c.schoolChoice === 'current_school') {
      payload.currentSchoolAction = c.currentSchoolAction || '';
    } else if (c.schoolChoice === 'new_school') {
      payload.newSchoolOrganizationId = c.newSchoolOrganizationId ? Number(c.newSchoolOrganizationId) : null;
      payload.newSchoolName = c.newSchoolOrganizationId ? null : (String(c.newSchoolName || '').trim() || null);
      if (c.newSchoolOrganizationId) payload.newSchoolAction = c.newSchoolAction || '';
    }
  } else if (c.plan === 'not_continue_school') {
    payload.notContinuingAction = c.notContinuingAction || '';
  } else if (c.plan === 'unable_to_contact_parent') {
    payload.unableToContactRecommendation = c.unableToContactRecommendation || '';
  }
  return payload;
};

const save = async () => {
  if (!props.client?.id) return;
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      parentsContactedAt: form.value.parentsContactedAt || null,
      parentsContactedSuccessful:
        form.value.parentsContactedSuccessful === '' ? null : form.value.parentsContactedSuccessful === 'true',
      firstServiceAt: form.value.firstServiceAt || null
    };
    if (showContinuationServices.value) payload.continuationServices = continuationPayload();
    await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

watch(() => props.parentAgencyId, fetchAgencySchools, { immediate: true });

watch(
  () => form.value.continuation.plan,
  (plan) => {
    if (plan !== 'continue_school') {
      form.value.continuation.schoolChoice = '';
      form.value.continuation.currentSchoolAction = '';
      form.value.continuation.newSchoolOrganizationId = '';
      form.value.continuation.newSchoolName = '';
      form.value.continuation.newSchoolAction = '';
    }
    if (plan !== 'not_continue_school') form.value.continuation.notContinuingAction = '';
    if (plan !== 'unable_to_contact_parent') form.value.continuation.unableToContactRecommendation = '';
  }
);

watch(
  () => form.value.continuation.schoolChoice,
  (choice) => {
    if (choice !== 'current_school') form.value.continuation.currentSchoolAction = '';
    if (choice !== 'new_school') {
      form.value.continuation.newSchoolOrganizationId = '';
      form.value.continuation.newSchoolName = '';
      form.value.continuation.newSchoolAction = '';
    }
  }
);

watch(
  () => form.value.continuation.newSchoolOrganizationId,
  (schoolId) => {
    if (schoolId) form.value.continuation.newSchoolName = '';
    if (!schoolId) form.value.continuation.newSchoolAction = '';
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
.form-group > label:not(.choice-card) {
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
.choice-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.choice-card {
  display: flex !important;
  align-items: flex-start;
  gap: 8px;
  margin: 0 !important;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: #1d2633 !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  line-height: 1.3;
  cursor: pointer;
}
.choice-card-label {
  color: #1d2633;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}
.choice-card input {
  margin-top: 2px;
  flex-shrink: 0;
}
.sub-prompt-overlay {
  position: relative;
  margin-top: 10px;
}
.sub-prompt {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow);
}
.sub-prompt h4 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: #1d2633;
}
.sub-prompt-lead {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
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
  .choice-row {
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
