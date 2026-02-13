<template>
  <Teleport to="body">
    <div v-if="isLocked" class="session-lock-overlay" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <div class="session-lock-card" :style="cardStyle">
        <BrandingLogo
          :logo-url="agencyLogoUrl"
          size="large"
          class="session-lock-logo"
        />
        <h1 id="session-lock-title" class="session-lock-title">Session Locked</h1>
        <p class="session-lock-message">Enter your 4-digit PIN to continue</p>
        <form @submit.prevent="submitPin" class="session-lock-form">
          <input
            ref="pinInputRef"
            v-model="pinValue"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            autocomplete="off"
            class="session-lock-pin-input"
            placeholder="••••"
            aria-label="Enter 4-digit PIN"
            @input="onPinInput"
          />
          <p v-if="error" class="session-lock-error">{{ error }}</p>
          <button type="submit" class="btn btn-primary session-lock-submit" :disabled="pinValue.length !== 4 || verifying">
            {{ verifying ? 'Verifying…' : 'Unlock' }}
          </button>
        </form>
        <button type="button" class="session-lock-logout" @click="logoutInstead">
          Log out instead
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useBrandingStore } from '../store/branding';
import BrandingLogo from './BrandingLogo.vue';
import api from '../services/api';
import { toUploadsUrl } from '../utils/uploadsUrl';

const props = defineProps({
  isLocked: { type: Boolean, default: false }
});

const emit = defineEmits(['unlock', 'logout']);

const brandingStore = useBrandingStore();

const pinValue = ref('');
const error = ref('');
const verifying = ref(false);
const pinInputRef = ref(null);

const agencyLogoUrl = computed(() => brandingStore.displayLogoUrl || null);

const cardStyle = computed(() => {
  const primary = brandingStore.effectivePrimaryColor || '#C69A2B';
  return {
    '--lock-accent': primary
  };
});

function onPinInput(e) {
  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
  pinValue.value = v;
  error.value = '';
}

async function submitPin() {
  if (pinValue.value.length !== 4 || verifying.value) return;
  try {
    verifying.value = true;
    error.value = '';
    await api.post('/auth/verify-session-pin', { pin: pinValue.value });
    pinValue.value = '';
    emit('unlock');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Invalid PIN';
    pinValue.value = '';
    pinInputRef.value?.focus();
  } finally {
    verifying.value = false;
  }
}

function logoutInstead() {
  emit('logout');
}

watch(() => props.isLocked, (locked) => {
  if (locked) {
    pinValue.value = '';
    error.value = '';
    setTimeout(() => pinInputRef.value?.focus(), 100);
  }
});
</script>

<style scoped>
.session-lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.session-lock-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.session-lock-logo {
  margin-bottom: 24px;
}

.session-lock-title {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.session-lock-message {
  margin: 0 0 24px;
  color: var(--text-secondary, #666);
  font-size: 0.95rem;
}

.session-lock-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-lock-pin-input {
  font-size: 1.5rem;
  letter-spacing: 0.5em;
  text-align: center;
  padding: 14px 20px;
  border: 2px solid var(--border, #ddd);
  border-radius: 10px;
  width: 100%;
  box-sizing: border-box;
}

.session-lock-pin-input:focus {
  outline: none;
  border-color: var(--lock-accent, var(--primary, #C69A2B));
}

.session-lock-error {
  margin: 0;
  color: var(--danger, #dc3545);
  font-size: 0.9rem;
}

.session-lock-submit {
  padding: 12px 24px;
  font-size: 1rem;
}

.session-lock-logout {
  margin-top: 20px;
  background: none;
  border: none;
  color: var(--text-secondary, #666);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}

.session-lock-logout:hover {
  color: var(--text-primary, #1a1a1a);
}
</style>
