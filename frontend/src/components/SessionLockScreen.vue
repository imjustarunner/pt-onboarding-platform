<template>
  <Teleport to="body">
    <div v-if="isLocked" class="session-lock-overlay" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <video
        v-if="showTenantVideo && !videoFailed"
        :key="tenantKey"
        class="session-lock-background"
        autoplay muted loop playsinline
        :poster="posterUrl"
        aria-hidden="true"
        @error="videoFailed = true"
      ><source :src="videoUrl" type="video/mp4" @error="videoFailed = true" /></video>
      <img v-else class="session-lock-background" :src="showTenantVideo ? posterUrl : mobileBackgroundUrl" alt="" />
      <div class="session-lock-card" :style="cardStyle">
        <BrandingLogo
          :logo-url="agencyLogoUrl"
          size="large"
          class="session-lock-logo"
        />
        <h1 id="session-lock-title" class="session-lock-title">{{ sessionLockStore.lockConfig ? 'Session Locked' : 'Checking sign-in' }}</h1>
        <p class="session-lock-message">{{ !sessionLockStore.lockConfig ? 'Please wait while we verify your connection.' : sessionLockStore.lockConfig.pinRequired ? 'Enter your 6-digit Quick View passcode to continue' : 'Enter your 4-digit session PIN to continue' }}</p>
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
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import BrandingLogo from './BrandingLogo.vue';
import { useSessionLockStore } from '../store/sessionLock';
import { resumeSession } from '../utils/activityTracker';
import { formatCountdownClock, resolveSessionTimeoutTenantKey, getTimedownVideoUrl, getTimedownPosterUrl, getMobileTimedownBgUrl } from '../utils/sessionTimeoutBranding';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect';

const props = defineProps({
  isLocked: { type: Boolean, default: false }
});

const emit = defineEmits(['unlock', 'logout']);

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const sessionLockStore = useSessionLockStore();
const mobileQuery = window.matchMedia?.('(max-width: 640px)');
const isMobile = ref(mobileQuery?.matches ?? false);
const videoFailed = ref(false);
const tenantKey = computed(() => {
  const agency = agencyStore.currentAgency || {};
  return resolveSessionTimeoutTenantKey({ slug: agency.slug || agency.portal_url || getCurrentPortalSlugFromPath(), agencyName: agency.name, hostSlug: getCurrentPortalSlugFromHostCache() });
});
// Initial verification is not an inactivity timeout; use the neutral branded
// background until a real lock policy is known instead of the timeout artwork.
const showTenantVideo = computed(() => !isMobile.value && !!sessionLockStore.lockConfig);
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
  const primary = brandingStore.effectivePrimaryColor || '#C69A2B';
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
  background: #101820;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.session-lock-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, .96);
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
