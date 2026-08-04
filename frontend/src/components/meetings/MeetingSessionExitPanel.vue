<template>
  <div class="mse" role="dialog" aria-modal="true" aria-labelledby="mse-title">
    <div
      v-if="showTopBanner"
      class="mse__banner"
      role="status"
      aria-live="polite"
    >
      <p>{{ bannerText }}</p>
      <button
        type="button"
        class="mse__banner-x"
        aria-label="Dismiss and go to schedule"
        @click="$emit('dismiss-banner')"
      >×</button>
    </div>

    <div class="mse__card">
      <h2 id="mse-title">{{ headline }}</h2>
      <p class="mse__body">{{ bodyText }}</p>
      <div v-if="isClosed" class="mse__closure" role="status" aria-live="polite">
        <strong>{{ closureSummary }}</strong>
        <span v-if="formattedClosedAt">{{ formattedClosedAt }}</span>
      </div>
      <div class="mse__actions">
        <button
          v-if="canRejoin"
          type="button"
          class="btn btn-primary"
          @click="$emit('rejoin')"
        >
          Rejoin{{ meetingLabel ? ` ${meetingLabel}` : '' }}
        </button>
        <button
          type="button"
          class="btn"
          :class="canRejoin ? 'btn-secondary' : 'btn-primary'"
          @click="$emit('go-to-schedule')"
        >
          {{ scheduleButtonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  /** left | host-ended | ended-by-you */
  variant: { type: String, default: 'left' },
  canRejoin: { type: Boolean, default: true },
  meetingLabel: { type: String, default: 'meeting' },
  /** team-meeting | supervision */
  sessionKind: { type: String, default: 'team-meeting' },
  bannerDismissed: { type: Boolean, default: false },
  closedByName: { type: String, default: '' },
  closedAt: { type: [String, Date], default: null }
});

defineEmits(['rejoin', 'go-to-schedule', 'dismiss-banner']);

const isSupervision = computed(() => String(props.sessionKind || '').toLowerCase() === 'supervision');
const hostNoun = computed(() => (isSupervision.value ? 'facilitator' : 'host'));
const sessionNoun = computed(() => (isSupervision.value ? 'session' : 'meeting'));
const isClosed = computed(() => ['host-ended', 'ended-by-you'].includes(String(props.variant || '')));

const formattedClosedAt = computed(() => {
  if (!props.closedAt) return '';
  const raw = props.closedAt instanceof Date ? props.closedAt : String(props.closedAt);
  const normalized = typeof raw === 'string'
    && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)
    && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(props.closedAt);
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
});

const closureSummary = computed(() => {
  const who = String(props.closedByName || '').trim() || (isSupervision.value ? 'the facilitator' : 'the host or an administrator');
  return `${isSupervision.value ? 'Session' : 'Team meeting'} was closed by ${who}.`;
});

const showTopBanner = computed(() => (
  props.variant === 'host-ended' && !props.bannerDismissed
));

const bannerText = computed(() => (
  `The ${hostNoun.value} ended the ${sessionNoun.value}.`
));

const headline = computed(() => {
  if (isClosed.value) return isSupervision.value ? 'Session was closed' : 'Team meeting was closed';
  return isSupervision.value ? 'You left the session' : 'You left the meeting';
});

const bodyText = computed(() => {
  if (props.variant === 'host-ended') {
    return `This ${sessionNoun.value} is no longer live. Head back to your schedule, or close this tab.`;
  }
  if (props.variant === 'ended-by-you') {
    return `Everyone has been disconnected. You can return to your schedule when ready.`;
  }
  return `You can rejoin if the ${sessionNoun.value} is still open, or go back to your schedule.`;
});

const scheduleButtonLabel = computed(() => (
  isSupervision.value ? 'Back to my schedule' : 'Back to my schedule'
));

</script>

<style scoped>
.mse {
  flex: 1;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background: var(--bg-primary, #0f1117);
  color: #e2e8f0;
}
.mse__banner {
  width: min(520px, 100%);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #422006;
  border: 1px solid #f59e0b;
  color: #fef3c7;
  font-size: 0.92rem;
}
.mse__banner p { margin: 0; flex: 1; line-height: 1.45; }
.mse__banner-x {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.mse__banner-x:hover { background: rgba(255, 255, 255, 0.08); }
.mse__card {
  width: min(440px, 100%);
  padding: 28px 24px;
  border-radius: 16px;
  background: #1a1f2e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  text-align: center;
}
.mse__card h2 {
  margin: 0 0 10px;
  font-size: 1.35rem;
  font-weight: 700;
  color: #f8fafc;
}
.mse__body {
  margin: 0 0 14px;
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.5;
}
.mse__closure {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0 0 20px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid #f59e0b;
  background: #422006;
  color: #fef3c7;
  text-align: left;
  line-height: 1.4;
}
.mse__closure span { color: #fde68a; font-size: 0.9rem; }
.mse__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mse__actions .btn {
  width: 100%;
  justify-content: center;
}
</style>
