<template>
  <div class="kiosk">
    <div class="kiosk-card">
      <h2>Check In</h2>
      <p class="subtitle">Select your provider, choose your time slot, enter your 4-digit PIN, and complete the surveys.</p>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-if="step === 1" class="step">
        <h3>Step 1: Select Provider</h3>
        <div v-if="loading" class="loading">Loading providers…</div>
        <div v-else class="grid">
          <button v-for="p in providers" :key="p.id" class="pick" @click="selectProvider(p)">
            {{ p.displayName }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 2" class="step">
        <h3>Step 2: Select Time Slot</h3>
        <div class="row">
          <div class="field">
            <label>Date</label>
            <input v-model="date" type="date" @change="buildSlots" />
          </div>
          <div class="field">
            <label>Provider</label>
            <input :value="selectedProvider?.displayName" disabled />
          </div>
        </div>
        <div class="grid">
          <button v-for="s in slots" :key="s" class="pick" @click="selectSlot(s)">
            {{ s }}
          </button>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" @click="reset">Back</button>
        </div>
      </div>

      <div v-else-if="step === 3" class="step">
        <h3>Step 3: Enter PIN</h3>
        <div class="row">
          <div class="field">
            <label>Provider</label>
            <input :value="selectedProvider?.displayName" disabled />
          </div>
          <div class="field">
            <label>Time Slot</label>
            <input :value="selectedSlot" disabled />
          </div>
        </div>
        <div class="field">
          <label>4-digit PIN</label>
          <input v-model="pin" inputmode="numeric" maxlength="4" placeholder="MMDD" />
        </div>
        <div class="actions">
          <button class="btn btn-secondary" @click="step = 2">Back</button>
          <button class="btn btn-primary" @click="goToSurveys">Continue</button>
        </div>
      </div>

      <div v-else-if="step === 4" class="step">
        <h3>Step 4: Surveys</h3>
        <div class="summary">
          <div><strong>Provider:</strong> {{ selectedProvider?.displayName }}</div>
          <div><strong>Slot:</strong> {{ selectedSlot }}</div>
        </div>

        <div class="survey">
          <h4>PHQ-9</h4>
          <div v-for="i in 9" :key="`phq${i}`" class="q">
            <label>Q{{ i }}</label>
            <select v-model.number="phq9[`q${i}`]">
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </div>
        </div>

        <div class="survey">
          <h4>GAD-7</h4>
          <div v-for="i in 7" :key="`gad${i}`" class="q">
            <label>Q{{ i }}</label>
            <select v-model.number="gad7[`q${i}`]">
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="step = 3" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="submit" :disabled="saving">
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

const providers = ref([]);
const selectedProvider = ref(null);
const date = ref(new Date().toISOString().slice(0, 10));
const slots = ref([]);
const selectedSlot = ref('');
const pin = ref('');

const phq9 = ref(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q${i + 1}`, 0])));
const gad7 = ref(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q${i + 1}`, 0])));

const loadProviders = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/kiosk/${locationId.value}/providers`, { params: { date: date.value } });
    providers.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load providers';
  } finally {
    loading.value = false;
  }
};

const buildSlots = () => {
  // MVP: fixed slots 08:00–18:00 every 30 minutes
  const out = [];
  for (let h = 8; h <= 17; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  out.push('18:00');
  slots.value = out;
};

const selectProvider = (p) => {
  selectedProvider.value = p;
  buildSlots();
  step.value = 2;
};

const selectSlot = (s) => {
  selectedSlot.value = s;
  step.value = 3;
};

const goToSurveys = () => {
  if (!/^\d{4}$/.test(pin.value.trim())) {
    error.value = 'PIN must be 4 digits';
    return;
  }
  error.value = '';
  step.value = 4;
};

const submit = async () => {
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/submit`, {
      providerId: selectedProvider.value.id,
      timeHHMM: selectedSlot.value,
      pin: pin.value.trim(),
      phq9: phq9.value,
      gad7: gad7.value
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
  selectedProvider.value = null;
  selectedSlot.value = '';
  pin.value = '';
  phq9.value = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q${i + 1}`, 0]));
  gad7.value = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q${i + 1}`, 0]));
  loadProviders();
};

onMounted(() => {
  buildSlots();
  loadProviders();
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

