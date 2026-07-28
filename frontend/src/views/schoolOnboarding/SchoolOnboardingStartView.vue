<template>
  <div class="so-start" :style="shellVars">
    <div class="so-start-card">
      <div class="so-brand">
        <img v-if="agencyLogo" :src="agencyLogo" alt="" />
        <div v-else class="so-mark">{{ agencyInitial }}</div>
        <div>
          <h1>Start school portal setup</h1>
          <p class="muted">{{ agencyName }}</p>
        </div>
      </div>

      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <form v-else class="so-form" @submit.prevent="start">
        <p class="muted">
          Enter your details and school name to create your draft portal. You’ll choose your login password as the
          last step.
        </p>
        <div class="so-grid">
          <label>
            Your first name
            <input v-model.trim="form.contactFirstName" required autocomplete="given-name" />
          </label>
          <label>
            Your last name
            <input v-model.trim="form.contactLastName" required autocomplete="family-name" />
          </label>
          <label class="span-2">
            Your school email (username)
            <input v-model.trim="form.contactEmail" type="email" required autocomplete="email" />
          </label>
          <label class="span-2">
            School name
            <input v-model.trim="form.schoolName" required />
          </label>
        </div>
        <p v-if="actionError" class="error">{{ actionError }}</p>
        <button type="submit" class="btn primary" :disabled="saving">
          {{ saving ? 'Starting…' : 'Start onboarding →' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();

const token = computed(() => String(route.params.token || '').trim());
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const actionError = ref('');
const meta = ref(null);

const form = reactive({
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  schoolName: ''
});

const agencyName = computed(() => meta.value?.agency?.name || 'School portal');
const agencyLogo = computed(() => meta.value?.agency?.logoUrl || null);
const agencyInitial = computed(() => (agencyName.value || 'S').charAt(0).toUpperCase());
const shellVars = computed(() => {
  const palette = meta.value?.agency?.colorPalette || {};
  return { '--so-primary': palette.primary || palette.primaryColor || '#1d4ed8' };
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/school-onboarding/qr/${token.value}`);
    meta.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This QR onboarding link is not available';
  } finally {
    loading.value = false;
  }
}

async function start() {
  actionError.value = '';
  saving.value = true;
  try {
    const res = await api.post(`/public/school-onboarding/qr/${token.value}/start`, {
      contactFirstName: form.contactFirstName,
      contactLastName: form.contactLastName,
      contactEmail: form.contactEmail,
      schoolName: form.schoolName
    });
    const inviteToken = res.data?.inviteToken;
    router.replace(`/school-onboarding/${inviteToken}/school_information`);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Unable to start onboarding';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.so-start {
  --so-primary: #1d4ed8;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: linear-gradient(160deg, #eff6ff, #f8fafc 45%, #eef2ff);
}
.so-start-card {
  width: min(640px, 100%);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
}
.so-brand {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  margin-bottom: 1rem;
}
.so-brand img, .so-mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: contain;
  background: #f8fafc;
}
.so-mark {
  display: grid;
  place-items: center;
  font-weight: 800;
  color: var(--so-primary);
}
h1 { margin: 0; font-size: 1.35rem; }
.muted { color: #64748b; }
.error { color: #b91c1c; }
.so-form { display: flex; flex-direction: column; gap: 0.85rem; }
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.so-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.span-2 { grid-column: span 2; }
input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.65rem 1rem;
  font: inherit;
  cursor: pointer;
}
.btn.primary { background: var(--so-primary); color: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 640px) {
  .so-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
}
</style>
