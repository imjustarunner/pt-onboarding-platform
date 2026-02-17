<template>
  <div class="kiosk">
    <div class="kiosk-card">
      <h2>{{ modeTitle }}</h2>
      <p class="subtitle">{{ modeSubtitle }}</p>

      <div v-if="!modeSelected && showModeSelector" class="step">
        <h3>What would you like to do?</h3>
        <div class="mode-buttons">
          <button v-if="allowedModes.includes('event')" type="button" class="mode-btn" @click="selectMode('event')">
            <span class="mode-icon">📅</span>
            <span class="mode-label">Office Event Check-in</span>
            <span class="mode-desc">Select your appointment and complete questionnaire</span>
          </button>
          <button v-if="allowedModes.includes('client_check_in')" type="button" class="mode-btn" @click="selectMode('client_check_in')">
            <span class="mode-icon">✓</span>
            <span class="mode-label">Client Check-in</span>
            <span class="mode-desc">Select your appointment and check in</span>
          </button>
          <button v-if="allowedModes.includes('clock') && programSites.length > 0" type="button" class="mode-btn" @click="selectMode('clock')">
            <span class="mode-icon">⏱️</span>
            <span class="mode-label">Clock In / Out</span>
            <span class="mode-desc">Record your shift start or end time</span>
          </button>
          <button v-if="allowedModes.includes('guardian') && programSites.length > 0" type="button" class="mode-btn" @click="selectMode('guardian')">
            <span class="mode-icon">👤</span>
            <span class="mode-label">Guardian Check-in</span>
            <span class="mode-desc">Check in or out as a guardian</span>
          </button>
        </div>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 1" class="step">
        <h3>Guardian Check-in — Select Site</h3>
        <div class="grid">
          <button v-for="s in programSites" :key="s.id" class="pick" @click="selectGuardianSite(s)">
            <div style="font-weight: 800;">{{ s.name }}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">{{ s.program_name }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="selectMode(null)">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 2" class="step">
        <h3>Guardian Check-in — Select Your Name</h3>
        <div v-if="loadingGuardians" class="loading">Loading…</div>
        <div v-else class="grid">
          <button v-for="g in guardians" :key="g.id" class="pick" @click="selectGuardian(g)">
            <div style="font-weight: 800;">{{ g.display_name || `${g.first_name} ${g.last_name}` }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 1">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 3" class="step">
        <h3>Guardian Check-in — Select Client</h3>
        <div v-if="loadingGuardianClients" class="loading">Loading clients…</div>
        <div v-else class="grid">
          <button v-for="c in guardianClients" :key="c.id" class="pick" @click="selectedGuardianClient = c; guardianStep = 4">
            <div style="font-weight: 800;">{{ c.display_name || c.initials || `Client ${c.id}` }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 2">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 4" class="step">
        <h3>Check In or Check Out</h3>
        <p>Client: {{ selectedGuardianClient?.display_name || selectedGuardianClient?.initials }}</p>
        <div class="mode-buttons">
          <button type="button" class="mode-btn" @click="guardianCheckIn = true; guardianStep = 5">
            <span class="mode-icon">▶</span>
            <span class="mode-label">Check In</span>
          </button>
          <button type="button" class="mode-btn" @click="guardianCheckIn = false; guardianStep = 5">
            <span class="mode-icon">⏹</span>
            <span class="mode-label">Check Out</span>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 3">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 5" class="step">
        <h3>Confirm</h3>
        <p>{{ guardianCheckIn ? 'Check in' : 'Check out' }} for {{ selectedGuardianClient?.display_name || selectedGuardianClient?.initials }}?</p>
        <div class="actions">
          <button class="btn btn-secondary" @click="guardianStep = 4">Back</button>
          <button class="btn btn-primary" :disabled="saving" @click="submitGuardianCheckin">
            {{ saving ? 'Submitting…' : 'Confirm' }}
          </button>
        </div>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 6" class="step">
        <h3>Done</h3>
        <p>Guardian {{ guardianCheckIn ? 'check-in' : 'check-out' }} recorded.</p>
        <button class="btn btn-primary" @click="resetGuardian">Start Over</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 1" class="step">
        <h3>Clock In or Clock Out</h3>
        <div class="mode-buttons">
          <button type="button" class="mode-btn" @click="clockAction = 'in'; clockStep = 2">
            <span class="mode-icon">▶</span>
            <span class="mode-label">Clock In</span>
          </button>
          <button type="button" class="mode-btn" @click="clockAction = 'out'; clockStep = 2">
            <span class="mode-icon">⏹</span>
            <span class="mode-label">Clock Out</span>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="selectMode(null)">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 2" class="step">
        <h3>{{ clockAction === 'in' ? 'Clock In' : 'Clock Out' }} — Select Site</h3>
        <div class="grid">
          <button v-for="s in programSites" :key="s.id" class="pick" @click="selectClockSite(s)">
            <div style="font-weight: 800;">{{ s.name }}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">{{ s.program_name }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="clockStep = 1">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 3" class="step">
        <h3>{{ clockAction === 'in' ? 'Clock In' : 'Clock Out' }} — Tap Your Name or Enter PIN</h3>
        <p class="hint" style="margin-bottom: 12px;">Scheduled staff shown first. Tap your name or enter your 4-digit PIN.</p>
        <div class="pin-row">
          <label for="kiosk-pin">PIN</label>
          <input
            id="kiosk-pin"
            v-model="clockPin"
            type="password"
            name="kioskPin"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            autocomplete="one-time-code"
            autocorrect="off"
            spellcheck="false"
            placeholder="••••"
            class="pin-input"
            @input="clockPin = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
            @keyup.enter="submitClockPin"
          />
          <button type="button" class="btn btn-primary" :disabled="!clockPinValid || identifyingByPin" @click="submitClockPin">
            {{ identifyingByPin ? 'Checking…' : 'Go' }}
          </button>
        </div>
        <div v-if="loadingStaff" class="loading">Loading staff…</div>
        <div v-else class="grid">
          <button v-for="s in programStaff" :key="s.id" class="pick" :class="{ 'pick-scheduled': s.scheduled_today }" @click="doClock(s)">
            <div style="font-weight: 800;">{{ s.display_name || `${s.first_name} ${s.last_name}` }}</div>
            <div v-if="s.scheduled_today" class="scheduled-badge">Scheduled today</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="clockStep = 2">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 4" class="step">
        <h3>Done</h3>
        <p>{{ clockSuccessMessage }}</p>
        <button class="btn btn-primary" @click="resetClock">Start Over</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-else-if="isEventMode && step === 1" class="step">
        <h3>Step 1: Select Your Appointment</h3>
        <button v-if="programSites.length > 0 && showModeSelector" class="btn btn-secondary" style="margin-bottom: 12px;" @click="selectMode(null)">Back</button>
        <div class="row">
          <div class="field">
            <label>Date</label>
            <input v-model="date" type="date" @change="loadEvents" />
          </div>
        </div>
        <div v-if="loading" class="loading">Loading events…</div>
        <div v-else class="grid">
          <button v-for="e in events" :key="e.id" class="pick" @click="selectEvent(e)">
            <div style="font-weight: 800;">
              {{ formatTime(e.startAt) }} — {{ e.roomName }}
            </div>
            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
              Provider: {{ e.providerInitials || '—' }}
            </div>
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 2" class="step">
        <h3>Step 2: Check In</h3>
        <div class="row">
          <div class="field">
            <label>Room</label>
            <input :value="selectedEvent?.roomName" disabled />
          </div>
          <div class="field">
            <label>Time</label>
            <input :value="selectedEvent ? formatTime(selectedEvent.startAt) : ''" disabled />
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" @click="reset" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="checkIn" :disabled="saving">
            {{ saving ? 'Checking in…' : 'Check In' }}
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 4" class="step">
        <h3>Step 3: Questionnaire</h3>
        <div class="summary">
          <div><strong>Room:</strong> {{ selectedEvent?.roomName }}</div>
          <div><strong>Time:</strong> {{ selectedEvent ? formatTime(selectedEvent.startAt) : '' }}</div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Is this your typical day and time that you see this provider?</label>
          <select v-model="typicalDayTime">
            <option :value="''">Select…</option>
            <option :value="'yes'">Yes</option>
            <option :value="'no'">No</option>
          </select>
        </div>

        <div v-if="questionnaires.length === 0" class="muted" style="margin-top: 12px;">
          No questionnaires are configured for this office yet.
        </div>

        <div v-else class="field" style="margin-top: 12px;">
          <label>Questionnaire</label>
          <select v-model="selectedQuestionnaireKey" @change="loadDefinition">
            <option :value="''">Select…</option>
            <option v-for="q in questionnaires" :key="q.moduleId || q.intakeLinkId || q.title" :value="getQuestionnaireKey(q)">{{ q.title }}</option>
          </select>
        </div>

        <div v-if="definitionLoading" class="loading" style="margin-top: 10px;">Loading form…</div>
        <div v-else-if="selectedQuestionnaireKey && formFields.length === 0" class="muted" style="margin-top: 10px;">
          This questionnaire has no fields configured.
        </div>

        <div v-else-if="formFields.length > 0" class="survey">
          <h4 style="margin: 0 0 10px 0;">Questions</h4>
          <div v-for="field in formFields" :key="field.id" class="q">
            <label>{{ field.field_label }}</label>

            <input
              v-if="['text','email','phone'].includes(field.field_type)"
              v-model="answers[field.id]"
              :type="field.field_type === 'email' ? 'email' : (field.field_type === 'phone' ? 'tel' : 'text')"
              autocomplete="off"
            />

            <input v-else-if="field.field_type === 'number'" v-model="answers[field.id]" type="number" autocomplete="off" />
            <input v-else-if="field.field_type === 'date'" v-model="answers[field.id]" type="date" autocomplete="off" />
            <textarea v-else-if="field.field_type === 'textarea'" v-model="answers[field.id]" rows="4"></textarea>

            <select v-else-if="field.field_type === 'select'" v-model="answers[field.id]">
              <option value="">Select…</option>
              <option v-for="opt in (field.options || [])" :key="String(opt)" :value="String(opt)">{{ opt }}</option>
            </select>

            <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
              <label v-for="opt in (field.options || [])" :key="String(opt)" class="multi-select-option">
                <input
                  type="checkbox"
                  :checked="Array.isArray(answers[field.id]) && answers[field.id].includes(String(opt))"
                  @change="toggleMulti(field.id, String(opt))"
                />
                <span>{{ opt }}</span>
              </label>
            </div>

            <label v-else-if="field.field_type === 'boolean'" class="boolean-row">
              <input type="checkbox" :checked="answers[field.id] === true" @change="answers[field.id] = $event.target.checked" />
              <span>Yes</span>
            </label>

            <input v-else v-model="answers[field.id]" type="text" autocomplete="off" />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="step = 2" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="submit" :disabled="saving || !selectedQuestionnaireKey || typicalDayTime === ''">
            {{ saving ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 5" class="step">
        <h3>Submitted</h3>
        <p>Thank you. Your check-in has been recorded.</p>
        <button class="btn btn-primary" @click="reset(); selectMode(null)">Start Over</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const props = defineProps({
  /** When provided (e.g. from KioskAppView), overrides route param */
  locationId: { type: [String, Number], default: null },
  /** Location-level settings: allowed_modes, default_mode, show_mode_selector, kiosk_type */
  locationSettings: { type: Object, default: null }
});

const route = useRoute();
const locationId = computed(() => {
  const fromProp = props.locationId != null ? String(props.locationId) : null;
  return fromProp || route.params.locationId || null;
});

const defaultSettings = {
  allowed_modes: ['clock', 'guardian', 'event', 'client_check_in'],
  default_mode: 'clock',
  show_mode_selector: true,
  kiosk_type: 'lobby'
};

const effectiveSettings = computed(() => ({ ...defaultSettings, ...props.locationSettings }));

const mode = ref(null);
const modeSelected = computed(() => mode.value != null);

const allowedModes = computed(() => {
  const modes = effectiveSettings.value.allowed_modes;
  return Array.isArray(modes) ? modes : defaultSettings.allowed_modes;
});

const showModeSelector = computed(() => effectiveSettings.value.show_mode_selector !== false);

/** event and client_check_in share the same flow */
const isEventMode = computed(() => mode.value === 'event' || mode.value === 'client_check_in');

const modeTitle = computed(() => {
  if (mode.value === 'clock') return 'Clock In / Out';
  if (mode.value === 'guardian') return 'Guardian Check-in';
  if (mode.value === 'event' || mode.value === 'client_check_in') return 'Check In';
  return 'Welcome';
});
const modeSubtitle = computed(() => {
  if (mode.value === 'clock') return 'Record your shift start or end time.';
  if (mode.value === 'guardian') return 'Check in or out as a guardian for your client.';
  if (mode.value === 'event' || mode.value === 'client_check_in') return 'Select your scheduled office time, check in, and complete the questionnaire.';
  return 'Choose an option below.';
});

const programSites = ref([]);
const programStaff = ref([]);
const selectedClockSite = ref(null);
const clockStep = ref(1);
const clockAction = ref('in');
const loadingStaff = ref(false);
const clockSuccessMessage = ref('');
const clockPin = ref('');
const identifyingByPin = ref(false);
const clockPinValid = computed(() => /^\d{4}$/.test(String(clockPin.value || '').trim()));

const guardians = ref([]);
const guardianClients = ref([]);
const selectedGuardianSite = ref(null);
const selectedGuardian = ref(null);
const selectedGuardianClient = ref(null);
const guardianStep = ref(1);
const guardianCheckIn = ref(true);
const loadingGuardians = ref(false);
const loadingGuardianClients = ref(false);

const step = ref(1);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const date = ref(new Date().toISOString().slice(0, 10));
const events = ref([]);
const selectedEvent = ref(null);

const questionnaires = ref([]);
const selectedQuestionnaireKey = ref('');
const definitionLoading = ref(false);
const formFields = ref([]);
const answers = ref({});
const typicalDayTime = ref('');

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const loadEvents = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/kiosk/${locationId.value}/events`, { params: { date: date.value } });
    events.value = resp.data?.events || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load events';
  } finally {
    loading.value = false;
  }
};

const selectEvent = (e) => {
  selectedEvent.value = e;
  step.value = 2;
};

const checkIn = async () => {
  if (!selectedEvent.value?.id) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/checkin`, { eventId: selectedEvent.value.id });
    await loadQuestionnaires();
    step.value = 4;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to check in';
  } finally {
    saving.value = false;
  }
};

const getQuestionnaireKey = (q) => {
  if (q.intakeLinkId) return `intake:${q.intakeLinkId}`;
  return `module:${q.moduleId}`;
};

const loadQuestionnaires = async () => {
  const params = selectedEvent.value?.id ? { eventId: selectedEvent.value.id } : {};
  const resp = await api.get(`/kiosk/${locationId.value}/questionnaires`, { params });
  questionnaires.value = resp.data || [];
  selectedQuestionnaireKey.value = '';
  formFields.value = [];
  answers.value = {};
  typicalDayTime.value = '';
};

const toggleMulti = (fieldId, opt) => {
  const current = Array.isArray(answers.value[fieldId]) ? answers.value[fieldId] : [];
  const exists = current.includes(opt);
  const next = exists ? current.filter((x) => x !== opt) : [...current, opt];
  answers.value = { ...answers.value, [fieldId]: next };
};

const loadDefinition = async () => {
  if (!selectedQuestionnaireKey.value) {
    formFields.value = [];
    answers.value = {};
    return;
  }
  const [type, id] = selectedQuestionnaireKey.value.split(':');
  if (!type || !id) return;
  try {
    definitionLoading.value = true;
    let resp;
    if (type === 'intake') {
      resp = await api.get(`/kiosk/${locationId.value}/intake-questionnaire/${id}/definition`);
    } else {
      resp = await api.get(`/kiosk/${locationId.value}/questionnaires/${id}/definition`);
    }
    formFields.value = resp.data?.fields || [];
    answers.value = {};
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load questionnaire';
    formFields.value = [];
    answers.value = {};
  } finally {
    definitionLoading.value = false;
  }
};

const submit = async () => {
  const [type, id] = (selectedQuestionnaireKey.value || '').split(':');
  if (!type || !id) return;
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      eventId: selectedEvent.value.id,
      typicalDayTime: typicalDayTime.value === 'yes',
      answers: answers.value
    };
    if (type === 'intake') {
      payload.intakeLinkId = Number(id);
    } else {
      payload.moduleId = Number(id);
    }
    await api.post(`/kiosk/${locationId.value}/questionnaires/submit`, payload);
    step.value = 5;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit';
  } finally {
    saving.value = false;
  }
};

const reset = () => {
  step.value = 1;
  selectedEvent.value = null;
  questionnaires.value = [];
  selectedQuestionnaireKey.value = '';
  formFields.value = [];
  answers.value = {};
  typicalDayTime.value = '';
  loadEvents();
};

const selectMode = (m) => {
  mode.value = m;
  if (m === 'event' || m === 'client_check_in') {
    loadEvents();
  } else if (m === null) {
    clockStep.value = 1;
    selectedClockSite.value = null;
    programStaff.value = [];
  }
};

const selectClockSite = async (site) => {
  selectedClockSite.value = site;
  try {
    loadingStaff.value = true;
    error.value = '';
    const today = new Date().toISOString().slice(0, 10);
    const res = await api.get(`/kiosk/${locationId.value}/program-staff`, {
      params: { siteId: site.id, slotDate: today }
    });
    programStaff.value = res.data || [];
    clockStep.value = 3;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load staff';
  } finally {
    loadingStaff.value = false;
  }
};

const doClock = async (staff) => {
  if (!selectedClockSite.value) return;
  try {
    saving.value = true;
    error.value = '';
    const endpoint = clockAction.value === 'in' ? 'clock-in' : 'clock-out';
    await api.post(`/kiosk/${locationId.value}/${endpoint}`, {
      userId: staff.id,
      programId: selectedClockSite.value.program_id,
      siteId: selectedClockSite.value.id
    });
    clockSuccessMessage.value = clockAction.value === 'in'
      ? 'You have been clocked in successfully.'
      : 'You have been clocked out successfully.';
    clockStep.value = 4;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to clock ' + clockAction.value;
  } finally {
    saving.value = false;
  }
};

const submitClockPin = async () => {
  if (!clockPinValid.value || !selectedClockSite.value || identifyingByPin.value) return;
  try {
    identifyingByPin.value = true;
    error.value = '';
    const res = await api.post(`/kiosk/${locationId.value}/identify-by-pin`, {
      siteId: selectedClockSite.value.id,
      pin: clockPin.value.trim()
    });
    const staff = {
      id: res.data.userId,
      first_name: res.data.first_name,
      last_name: res.data.last_name,
      display_name: res.data.display_name
    };
    clockPin.value = '';
    await doClock(staff);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Invalid PIN or not found at this site';
  } finally {
    identifyingByPin.value = false;
  }
};

const resetClock = () => {
  mode.value = null;
  clockStep.value = 1;
  selectedClockSite.value = null;
  programStaff.value = [];
  clockPin.value = '';
  loadProgramSites();
};

const selectGuardianSite = async (site) => {
  selectedGuardianSite.value = site;
  try {
    loadingGuardians.value = true;
    error.value = '';
    const res = await api.get(`/kiosk/${locationId.value}/guardians`, { params: { siteId: site.id } });
    guardians.value = res.data || [];
    guardianStep.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load guardians';
  } finally {
    loadingGuardians.value = false;
  }
};

const selectGuardian = async (g) => {
  selectedGuardian.value = g;
  try {
    loadingGuardianClients.value = true;
    error.value = '';
    const res = await api.get(`/kiosk/${locationId.value}/guardian-clients`, {
      params: { guardianUserId: g.id, siteId: selectedGuardianSite.value.id }
    });
    guardianClients.value = res.data || [];
    guardianStep.value = 3;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load clients';
  } finally {
    loadingGuardianClients.value = false;
  }
};

const submitGuardianCheckin = async () => {
  if (!selectedGuardian.value || !selectedGuardianClient.value || !selectedGuardianSite.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/guardian-checkin`, {
      guardianUserId: selectedGuardian.value.id,
      clientId: selectedGuardianClient.value.id,
      siteId: selectedGuardianSite.value.id,
      checkIn: guardianCheckIn.value
    });
    guardianStep.value = 6;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to record check-in';
  } finally {
    saving.value = false;
  }
};

const resetGuardian = () => {
  mode.value = null;
  guardianStep.value = 1;
  selectedGuardianSite.value = null;
  selectedGuardian.value = null;
  selectedGuardianClient.value = null;
  guardians.value = [];
  guardianClients.value = [];
  loadProgramSites();
};

const loadProgramSites = async () => {
  try {
    const res = await api.get(`/kiosk/${locationId.value}/program-sites`);
    programSites.value = res.data || [];
  } catch {
    programSites.value = [];
  }
};

onMounted(() => {
  loadProgramSites();
  loadEvents();
  if (!showModeSelector.value && allowedModes.value.includes(effectiveSettings.value.default_mode)) {
    selectMode(effectiveSettings.value.default_mode);
  }
});
</script>

<style scoped>
.kiosk {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-alt);
}
.kiosk-card {
  width: 900px;
  max-width: 100%;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 16px 0; }
.mode-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0;
}
.mode-btn {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  text-align: center;
}
.mode-btn:hover {
  border-color: var(--primary, #2563eb);
  background: var(--bg-alt, #f8fafc);
}
.mode-icon { font-size: 32px; }
.mode-label { font-weight: 700; }
.mode-desc { font-size: 13px; color: var(--text-secondary); }
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.pick {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 14px 12px;
  cursor: pointer;
  font-size: 16px;
}
.pick.pick-scheduled {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, white);
}
.scheduled-badge {
  font-size: 11px;
  color: var(--primary);
  font-weight: 600;
  margin-top: 4px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.field { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
input, select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.survey {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.q {
  display: grid;
  grid-template-columns: 80px 120px;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
.summary { color: var(--text-secondary); font-size: 13px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.pin-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.pin-row label { font-weight: 600; min-width: 36px; }
.pin-input {
  width: 80px;
  padding: 10px 12px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
}
</style>

