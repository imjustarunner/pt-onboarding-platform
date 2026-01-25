<template>
  <div class="kiosk">
    <div class="kiosk-card">
      <h2>Check In</h2>
      <p class="subtitle">Select your scheduled office time, check in, and complete the questionnaire.</p>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-if="step === 1" class="step">
        <h3>Step 1: Select Your Appointment</h3>
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

      <div v-else-if="step === 2" class="step">
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

      <div v-else-if="step === 4" class="step">
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
          <select v-model="selectedModuleId" @change="loadDefinition">
            <option :value="''">Select…</option>
            <option v-for="q in questionnaires" :key="q.moduleId" :value="String(q.moduleId)">{{ q.title }}</option>
          </select>
        </div>

        <div v-if="definitionLoading" class="loading" style="margin-top: 10px;">Loading form…</div>
        <div v-else-if="selectedModuleId && formFields.length === 0" class="muted" style="margin-top: 10px;">
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
            />

            <input v-else-if="field.field_type === 'number'" v-model="answers[field.id]" type="number" />
            <input v-else-if="field.field_type === 'date'" v-model="answers[field.id]" type="date" />
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

            <input v-else v-model="answers[field.id]" type="text" />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="step = 2" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="submit" :disabled="saving || !selectedModuleId || typicalDayTime === ''">
            {{ saving ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 5" class="step">
        <h3>Submitted</h3>
        <p>Thank you. Your check-in has been recorded.</p>
        <button class="btn btn-primary" @click="reset">Start Over</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const locationId = computed(() => route.params.locationId);

const step = ref(1);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const date = ref(new Date().toISOString().slice(0, 10));
const events = ref([]);
const selectedEvent = ref(null);

const questionnaires = ref([]);
const selectedModuleId = ref('');
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

const loadQuestionnaires = async () => {
  const resp = await api.get(`/kiosk/${locationId.value}/questionnaires`);
  questionnaires.value = resp.data || [];
  selectedModuleId.value = '';
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
  if (!selectedModuleId.value) {
    formFields.value = [];
    answers.value = {};
    return;
  }
  try {
    definitionLoading.value = true;
    const resp = await api.get(`/kiosk/${locationId.value}/questionnaires/${selectedModuleId.value}/definition`);
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
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/questionnaires/submit`, {
      eventId: selectedEvent.value.id,
      moduleId: Number(selectedModuleId.value),
      typicalDayTime: typicalDayTime.value === 'yes',
      answers: answers.value
    });
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
  selectedModuleId.value = '';
  formFields.value = [];
  answers.value = {};
  typicalDayTime.value = '';
  loadEvents();
};

onMounted(() => {
  loadEvents();
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
</style>

