<template>
  <Teleport to="body">
    <div
      v-if="isLocked"
      :class="{ 'session-checking': isChecking }"
      class="session-lock-overlay"
      :style="cardStyle"
      :role="isChecking && !showRecovery ? 'status' : 'dialog'"
      :aria-modal="!isChecking || showRecovery ? 'true' : undefined"
      :aria-busy="isChecking && !showRecovery ? 'true' : undefined"
      aria-labelledby="session-lock-title"
    >
      <div v-if="isChecking" class="session-arrival" :class="{ 'session-arrival--recovery': showRecovery }">
        <BrandingLogo :logo-url="agencyLogoUrl" size="large" class="session-arrival-logo" />
        <template v-if="!showRecovery">
          <span class="session-arrival-spinner" aria-hidden="true" />
          <h1 id="session-lock-title" class="session-arrival-title">Opening your workspace</h1>
          <p class="session-arrival-message">{{ takingLonger ? 'This is taking a little longer. We’re still getting things ready.' : 'Getting everything ready for you…' }}</p>
        </template>
        <template v-else>
          <h1 id="session-lock-title" class="session-arrival-title">We’re having trouble connecting</h1>
          <p class="session-arrival-message">Your information is protected. We’ll keep trying to open your workspace.</p>
          <p v-if="error" class="session-lock-error" role="alert">{{ error }}</p>
          <div class="session-recovery-actions">
            <button type="button" class="btn btn-primary" :disabled="verifying" @click="retryVerification">{{ verifying ? 'Trying again…' : 'Try again' }}</button>
            <button type="button" class="session-lock-logout" @click="logoutInstead">Sign out</button>
          </div>
        </template>
      </div>
      <template v-else>
      <video
        v-if="sessionLockStore.lockConfig && showTenantVideo && !videoFailed"
        :key="tenantKey"
        class="session-lock-background"
        autoplay muted loop playsinline
        :poster="posterUrl"
        aria-hidden="true"
        @error="videoFailed = true"
      ><source :src="videoUrl" type="video/mp4" @error="videoFailed = true" /></video>
      <img v-else-if="sessionLockStore.lockConfig && !isPlatformBrand" class="session-lock-background" :src="showTenantVideo ? posterUrl : mobileBackgroundUrl" alt="" />
      <div class="session-lock-card" :style="cardStyle">
        <BrandingLogo
          :logo-url="agencyLogoUrl"
          size="large"
          class="session-lock-logo"
        />
        <h1 id="session-lock-title" class="session-lock-title">Session Locked</h1>
        <p class="session-lock-message">{{ sessionLockStore.lockConfig.pinRequired ? 'Enter your 6-digit Quick View passcode to continue' : 'Enter your 4-digit session PIN to continue' }}</p>
        <p v-if="sessionLockStore.warningActive && sessionLockStore.warningSecondsLeft > 0" class="session-lock-message" role="status">Automatic logout in {{ countdown }}.</p>
        <form v-if="sessionLockStore.lockConfig?.useLockScreen" @submit.prevent="submitPin" class="session-lock-form">
          <input
            ref="pinInputRef"
            v-model="pinValue"
            type="password"
            name="sessionLockPin"
            inputmode="numeric"
            pattern="[0-9]*"
            :maxlength="pinLength"
            autocomplete="one-time-code"
            autocorrect="off"
            spellcheck="false"
            class="session-lock-pin-input"
            :placeholder="'•'.repeat(pinLength)"
            :aria-label="`Enter ${pinLength}-digit code`"
            @input="onPinInput"
          />
          <p v-if="error" class="session-lock-error">{{ error }}</p>
          <button type="submit" class="btn btn-primary session-lock-submit" :disabled="pinValue.length !== pinLength || verifying">
            {{ verifying ? 'Verifying…' : 'Unlock' }}
          </button>
        </form>
        <button type="button" class="session-lock-logout" @click="logoutInstead">
          Log out instead
        </button>
      </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import BrandingLogo from './BrandingLogo.vue';
import { useSessionLockStore } from '../store/sessionLock';
import { resumeSession, refetchSessionLockConfig } from '../utils/activityTracker';
import { formatCountdownClock, resolveSessionTimeoutTenantKey, getTimedownVideoUrl, getTimedownPosterUrl, getMobileTimedownBgUrl } from '../utils/sessionTimeoutBranding';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect';

const props = defineProps({
  isLocked: { type: Boolean, default: false }
});

const emit = defineEmits(['unlock', 'logout']);

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const sessionLockStore = useSessionLockStore();
const isChecking = computed(() => !sessionLockStore.lockConfig);
const takingLonger = ref(false);
const recoveryDelayElapsed = ref(false);
const showRecovery = computed(() => isChecking.value && sessionLockStore.verificationFailed && recoveryDelayElapsed.value);
let slowLoadingTimer;
let recoveryTimer;
function clearLoadingTimers() {
  clearTimeout(slowLoadingTimer);
  clearTimeout(recoveryTimer);
}
watch(() => props.isLocked && isChecking.value, (checking) => {
  clearLoadingTimers();
  takingLonger.value = false;
  recoveryDelayElapsed.value = false;
  if (checking) {
    slowLoadingTimer = setTimeout(() => { takingLonger.value = true; }, 8000);
    recoveryTimer = setTimeout(() => { recoveryDelayElapsed.value = true; }, 15000);
  }
}, { immediate: true });
onUnmounted(clearLoadingTimers);

const mobileQuery = window.matchMedia?.('(max-width: 640px)');
const isMobile = ref(mobileQuery?.matches ?? false);
const videoFailed = ref(false);
const tenantKey = computed(() => {
  const agency = agencyStore.currentAgency || {};
  return resolveSessionTimeoutTenantKey({ slug: agency.slug || agency.portal_url || getCurrentPortalSlugFromPath(), agencyName: agency.name, hostSlug: getCurrentPortalSlugFromHostCache() });
});
// Initial verification is not an inactivity timeout; use the neutral branded
// background until a real lock policy is known instead of the timeout artwork.
const isPlatformBrand = computed(() => !agencyStore.currentAgency && (!brandingStore.activeRouteSlug || agencyStore.platformMode));
const showTenantVideo = computed(() => !isPlatformBrand.value && !isMobile.value && !!sessionLockStore.lockConfig);
const posterUrl = computed(() => getTimedownPosterUrl(tenantKey.value));
const videoUrl = computed(() => getTimedownVideoUrl(tenantKey.value));
const mobileBackgroundUrl = getMobileTimedownBgUrl();
function onMobileChange(event) { isMobile.value = event.matches; }
onMounted(() => mobileQuery?.addEventListener('change', onMobileChange));
onUnmounted(() => mobileQuery?.removeEventListener('change', onMobileChange));
watch(tenantKey, () => { videoFailed.value = false; });
const pinLength = computed(() => sessionLockStore.lockConfig?.pinLength || 4);
const countdown = computed(() => formatCountdownClock(sessionLockStore.warningSecondsLeft));

const pinValue = ref('');
const error = ref('');
const verifying = ref(false);
const pinInputRef = ref(null);

const agencyLogoUrl = computed(() => brandingStore.displayLogoUrl || null);

const cardStyle = computed(() => {
  const primary = brandingStore.effectivePrimaryColor || '#B80016';
  return {
    '--lock-accent': primary
  };
});

function onPinInput(e) {
  const v = e.target.value.replace(/\D/g, '').slice(0, pinLength.value);
  pinValue.value = v;
  error.value = '';
}

async function submitPin() {
  if (pinValue.value.length !== pinLength.value || verifying.value) return;
  try {
    verifying.value = true;
    error.value = '';
    if (!await resumeSession(pinValue.value)) return;
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

async function retryVerification() {
  if (verifying.value) return;
  verifying.value = true;
  error.value = '';
  try {
    await refetchSessionLockConfig();
  } catch {
    error.value = 'We still can’t connect. Please check your internet connection and try again.';
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
  z-index: 2147483000;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.session-lock-card {
  position: relative;
  z-index: 1;
  background: var(--bg-card);
  color: var(--text-primary);
  border-radius: 16px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.session-lock-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

@media (min-width: 641px) {
  .session-lock-overlay { justify-content: flex-end; padding: clamp(24px, 5vw, 80px); }
}

.session-lock-overlay.session-checking {
  background: var(--bg, #f4f8f7);
  justify-content: center;
  padding: 24px;
}
.session-arrival {
  width: min(100%, 420px);
  text-align: center;
  color: var(--text-primary, #1a1a1a);
  animation: arrival-reveal 180ms ease-out 150ms both;
}
.session-arrival-logo { margin: 0 auto 28px; }
.session-arrival-spinner {
  display: block;
  width: 24px;
  height: 24px;
  margin: 0 auto 20px;
  border: 2px solid var(--border, #dae5df);
  border-top-color: var(--lock-accent);
  border-radius: 50%;
  animation: arrival-spin 900ms linear infinite;
}
.session-arrival-title { font-size: 1.35rem; font-weight: 600; line-height: 1.4; margin: 0 0 10px; }
.session-arrival-message { color: var(--text-secondary, #666); line-height: 1.6; margin: 0; text-wrap: balance; }
.session-recovery-actions { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 28px; }
.session-recovery-actions .btn { min-width: 160px; min-height: 44px; }
.session-recovery-actions .session-lock-logout { margin: 0; min-height: 44px; }
.session-arrival--recovery .session-lock-error { margin-top: 16px; }
@keyframes arrival-spin { to { transform: rotate(360deg); } }
@keyframes arrival-reveal { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .session-arrival, .session-arrival-spinner { animation: none; }
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
  border-color: var(--lock-accent, var(--primary, #B80016));
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
