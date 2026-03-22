<template>
  <div class="sbe-kiosk-entry">
    <div class="sbe-kiosk-card">
      <h1 class="sbe-kiosk-title">Skill Builders station</h1>
      <p class="sbe-kiosk-lead muted">
        Enter the 6-digit station PIN for today’s program. Staff still use their personal 4-digit kiosk PIN on the next
        screen after the station unlocks.
      </p>
      <div v-if="error" class="error-box sbe-kiosk-err">{{ error }}</div>
      <form class="sbe-kiosk-form" @submit.prevent="submit">
        <label class="sbe-kiosk-lbl" for="sbe-pin">Station PIN</label>
        <input
          id="sbe-pin"
          v-model="pinDigits"
          class="input sbe-kiosk-pin"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="••••••"
          :disabled="busy"
        />
        <button type="submit" class="btn btn-primary sbe-kiosk-btn" :disabled="busy || pinDigits.length !== 6">
          {{ busy ? 'Checking…' : 'Continue' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.organizationSlug || '').trim());
const pinDigits = ref('');
const busy = ref(false);
const error = ref('');

function storageKey() {
  return `skillBuildersEventKiosk:${slug.value}`;
}

async function submit() {
  error.value = '';
  const pin = pinDigits.value.replace(/\D/g, '').slice(0, 6);
  if (pin.length !== 6) {
    error.value = 'Enter all 6 digits.';
    return;
  }
  busy.value = true;
  try {
    const res = await api.post(
      `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/unlock`,
      { pin },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const token = res.data?.token;
    const eventId = Number(res.data?.eventId);
    if (!token || !eventId) {
      error.value = 'Unexpected response from server.';
      return;
    }
    sessionStorage.setItem(
      storageKey(),
      JSON.stringify({ token, eventId, savedAt: Date.now() })
    );
    await router.push({
      name: 'OrganizationSkillBuildersEventKioskStation',
      params: { organizationSlug: slug.value, eventId: String(eventId) }
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not unlock';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.sbe-kiosk-entry {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.sbe-kiosk-card {
  width: min(420px, 100%);
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 28px 24px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
}
.sbe-kiosk-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbe-kiosk-lead {
  margin: 0 0 20px;
  font-size: 0.92rem;
  line-height: 1.45;
}
.sbe-kiosk-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sbe-kiosk-lbl {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary, #475569);
}
.sbe-kiosk-pin {
  font-size: 1.35rem;
  letter-spacing: 0.2em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sbe-kiosk-btn {
  margin-top: 8px;
}
.sbe-kiosk-err {
  margin-bottom: 12px;
}
.muted {
  color: #64748b;
}
</style>
