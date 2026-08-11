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

        <div v-if="affiliationConflict" class="so-conflict">
          <p class="so-conflict-title">We recognize this email</p>
          <p class="muted">
            You’re already a school staff account
            <span v-if="priorSchoolNames"> at {{ priorSchoolNames }}</span>.
            You’re creating a <strong>new</strong> school with us — choose how to handle your prior school(s).
          </p>
          <label class="so-radio">
            <input v-model="priorSchoolDecision" type="radio" value="leave_prior" />
            I’m only at this new school (remove prior school access)
          </label>
          <label class="so-radio">
            <input v-model="priorSchoolDecision" type="radio" value="stay_at_both" />
            I’m at both schools (keep prior access and add this one)
          </label>
          <label class="so-check">
            <input v-model="resetPassword" type="checkbox" />
            Reset my password (recommended if you don’t remember it)
          </label>
          <p v-if="issuedTempPassword" class="so-temp">
            Temporary password (save this now — it won’t be shown again):
            <code>{{ issuedTempPassword }}</code>
          </p>
        </div>

        <p v-if="actionError" class="error">{{ actionError }}</p>
        <button
          v-if="pendingInviteToken"
          type="button"
          class="btn primary"
          @click="continueAfterTempPassword"
        >
          I’ve saved my temporary password — continue →
        </button>
        <button
          v-else
          type="submit"
          class="btn primary"
          :disabled="saving || (affiliationConflict && !priorSchoolDecision)"
        >
          {{ saving ? 'Starting…' : (affiliationConflict ? 'Continue with this choice →' : 'Start onboarding →') }}
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
const affiliationConflict = ref(false);
const priorSchools = ref([]);
const priorSchoolDecision = ref('');
const resetPassword = ref(true);
const issuedTempPassword = ref('');
const pendingInviteToken = ref('');

function continueAfterTempPassword() {
  if (!pendingInviteToken.value) return;
  router.replace(`/school-onboarding/${pendingInviteToken.value}/school_information`);
}

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
const priorSchoolNames = computed(() =>
  (priorSchools.value || []).map((s) => s.name).filter(Boolean).join(', ')
);

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
    const payload = {
      contactFirstName: form.contactFirstName,
      contactLastName: form.contactLastName,
      contactEmail: form.contactEmail,
      schoolName: form.schoolName
    };
    if (affiliationConflict.value) {
      payload.confirmExistingSchoolStaff = true;
      payload.priorSchoolDecision = priorSchoolDecision.value;
      payload.resetPassword = resetPassword.value === true;
    }
    const res = await api.post(`/public/school-onboarding/qr/${token.value}/start`, payload);
    const inviteToken = res.data?.inviteToken;
    if (res.data?.temporaryPassword) {
      issuedTempPassword.value = res.data.temporaryPassword;
      pendingInviteToken.value = inviteToken;
      actionError.value = '';
      return;
    }
    router.replace(`/school-onboarding/${inviteToken}/school_information`);
  } catch (e) {
    const err = e?.response?.data?.error || {};
    if (err.code === 'SCHOOL_STAFF_ALREADY_AFFILIATED') {
      affiliationConflict.value = true;
      priorSchools.value = Array.isArray(err.details?.currentSchools) ? err.details.currentSchools : [];
      if (!priorSchoolDecision.value) priorSchoolDecision.value = 'leave_prior';
      actionError.value = 'Confirm how to handle your prior school(s), then continue.';
    } else {
      actionError.value = err.message || e?.message || 'Unable to start onboarding';
    }
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
  width: min(560px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
}
.so-brand {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}
.so-brand img,
.so-mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: contain;
}
.so-mark {
  display: grid;
  place-items: center;
  background: var(--so-primary);
  color: #fff;
  font-weight: 700;
}
.so-brand h1 {
  margin: 0;
  font-size: 1.25rem;
}
.muted { color: #64748b; font-size: 0.9rem; }
.error { color: #b91c1c; margin: 0.5rem 0; }
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.so-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.so-grid .span-2 { grid-column: span 2; }
.so-grid input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
}
.so-conflict {
  margin-top: 1rem;
  padding: 0.85rem;
  border: 1px solid #fde68a;
  background: #fffbeb;
  border-radius: 10px;
}
.so-conflict-title {
  margin: 0 0 0.35rem;
  font-weight: 700;
}
.so-radio,
.so-check {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0.45rem 0;
  font-size: 0.9rem;
}
.so-temp {
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
.so-temp code {
  background: #fff;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.btn.primary {
  margin-top: 1rem;
  width: 100%;
  border: none;
  border-radius: 10px;
  padding: 0.7rem 1rem;
  background: var(--so-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@media (max-width: 560px) {
  .so-grid { grid-template-columns: 1fr; }
  .so-grid .span-2 { grid-column: span 1; }
}
</style>
