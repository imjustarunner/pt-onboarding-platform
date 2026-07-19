<template>
  <div class="pub">
    <header class="pub-head">
      <h1>{{ agency?.name || 'Book a session' }}</h1>
      <p class="sub">Request a time with this organization. Staff will confirm when needed.</p>
    </header>

    <div v-if="loading" class="state">Loading booking options…</div>
    <div v-else-if="error" class="state err">{{ error }}</div>

    <form v-else class="card" @submit.prevent="submit">
      <label>
        Service
        <select v-model.number="tenantServiceId" required @change="onServiceChange">
          <option :value="0" disabled>Select a service…</option>
          <option v-for="s in services" :key="s.id" :value="s.id">
            {{ s.name }} ({{ s.defaultDurationMinutes }}m)
          </option>
        </select>
      </label>

      <label>
        Provider (optional)
        <select v-model.number="providerUserId">
          <option :value="0">Any available</option>
          <option v-for="p in providers" :key="p.userId" :value="p.userId">
            {{ providerLabel(p) }}
          </option>
        </select>
      </label>

      <label>
        Start
        <input v-model="startAt" type="datetime-local" required />
      </label>

      <label>
        End
        <input v-model="endAt" type="datetime-local" required />
      </label>

      <label>
        Notes
        <textarea v-model="notes" rows="3" placeholder="Anything we should know?" />
      </label>

      <p v-if="submitError" class="err">{{ submitError }}</p>
      <p v-if="success" class="ok">{{ success }}</p>

      <button type="submit" class="primary" :disabled="submitting || !canSubmit">
        {{ submitting ? 'Submitting…' : 'Request appointment' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const route = useRoute();

const loading = ref(true);
const error = ref('');
const submitError = ref('');
const success = ref('');
const submitting = ref(false);

const agency = ref(null);
const services = ref([]);
const providers = ref([]);
const tenantServiceId = ref(0);
const providerUserId = ref(0);
const startAt = ref('');
const endAt = ref('');
const notes = ref('');

const slug = computed(() => String(route.params.organizationSlug || '').trim());

const canSubmit = computed(() =>
  Number(tenantServiceId.value) > 0 && !!startAt.value && !!endAt.value
);

const providerLabel = (p) => {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || p.email || `Provider #${p.userId}`;
};

const toWallTime = (localValue) => {
  // datetime-local → "YYYY-MM-DD HH:mm:00"
  const s = String(localValue || '').trim();
  if (!s) return '';
  return `${s.replace('T', ' ')}:00`.replace(/:00:00$/, ':00:00').slice(0, 19);
};

const loadOptions = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (tenantServiceId.value) params.serviceId = tenantServiceId.value;
    if (providerUserId.value) params.providerId = providerUserId.value;
    const r = await axios.get(`${apiBase}/public/unified-booking/${encodeURIComponent(slug.value)}/booking-options`, { params });
    agency.value = r.data?.agency || null;
    services.value = r.data?.services || [];
    providers.value = r.data?.providers || [];
    if (!services.value.length) {
      error.value = 'No publicly bookable services are configured for this organization yet.';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load booking options';
  } finally {
    loading.value = false;
  }
};

const onServiceChange = () => {
  void loadOptions();
};

const submit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = '';
  success.value = '';
  try {
    const r = await axios.post(
      `${apiBase}/public/unified-booking/${encodeURIComponent(slug.value)}/appointments`,
      {
        tenantServiceId: Number(tenantServiceId.value),
        providerUserId: Number(providerUserId.value || 0) || undefined,
        startAt: toWallTime(startAt.value),
        endAt: toWallTime(endAt.value),
        notes: notes.value || null,
        requireStaffApproval: true
      }
    );
    const id = r.data?.appointment?.id || r.data?.appointment?.appointment?.id;
    success.value = id
      ? `Request submitted (#${id}). The organization will confirm your time.`
      : 'Request submitted. The organization will confirm your time.';
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Booking failed';
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  void loadOptions();
});
</script>

<style scoped>
.pub {
  max-width: 480px;
  margin: 0 auto;
  padding: 28px 16px 48px;
  font-family: Georgia, 'Times New Roman', serif;
  color: #1c1917;
  background:
    radial-gradient(ellipse 80% 50% at 10% 0%, #ecfdf5 0%, transparent 55%),
    linear-gradient(180deg, #fafaf9 0%, #f5f5f4 100%);
  min-height: 100vh;
}
.pub-head h1 { margin: 0 0 6px; font-size: 1.75rem; font-weight: 700; }
.sub { margin: 0 0 20px; color: #57534e; font-size: 0.95rem; }
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background: #fff;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #44403c;
  font-family: system-ui, sans-serif;
}
select, input, textarea {
  font: inherit;
  font-family: system-ui, sans-serif;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid #d6d3d1;
  border-radius: 8px;
}
.primary {
  margin-top: 4px;
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  font-family: system-ui, sans-serif;
  cursor: pointer;
}
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.state { padding: 16px; color: #57534e; }
.err { color: #b91c1c; font-size: 0.9rem; font-family: system-ui, sans-serif; }
.ok { color: #047857; font-size: 0.9rem; font-family: system-ui, sans-serif; }
</style>
