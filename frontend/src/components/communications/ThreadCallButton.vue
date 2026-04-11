<template>
  <div class="call-btn-wrap">
    <button
      type="button"
      class="call-btn"
      :class="{ 'call-btn--active': callState === 'active', 'call-btn--calling': callState === 'calling' }"
      :disabled="!voiceConfigured || !clientPhone || busy"
      :title="buttonTitle"
      @click="handleCall"
    >
      <svg class="call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.9 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      <span class="call-label">{{ callLabel }}</span>
    </button>
    <span v-if="!voiceConfigured" class="call-hint">Voice calling coming soon</span>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId:    { type: [Number, String], required: true },
  clientPhone: { type: String,           default: '' },
  numberId:    { type: [Number, String], default: null }
});

// Voice is not yet configured — flip this to true once Vonage Voice is wired in.
const voiceConfigured = false;

const callState = ref('idle'); // idle | calling | active
const busy = ref(false);

const callLabel = computed(() => {
  if (callState.value === 'calling') return 'Calling…';
  if (callState.value === 'active')  return 'End call';
  return 'Call';
});

const buttonTitle = computed(() => {
  if (!voiceConfigured) return 'Voice calling is not yet configured';
  if (!props.clientPhone) return 'Client has no phone number on file';
  return `Call ${props.clientPhone}`;
});

async function handleCall() {
  if (!voiceConfigured || !props.clientId || busy.value) return;
  busy.value = true;
  callState.value = 'calling';
  try {
    await api.post('/calls/outbound', {
      clientId: props.clientId,
      numberId: props.numberId || undefined
    });
    callState.value = 'active';
  } catch (e) {
    console.warn('[ThreadCallButton] Call failed:', e?.response?.data?.error?.message || e?.message);
    callState.value = 'idle';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.call-btn-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.call-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #d4d8de);
  background: #fff;
  color: var(--text-primary, #1a1a2e);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.call-btn:hover:not(:disabled) {
  background: #f0f7ff;
  border-color: #7aa2ff;
  color: #2563eb;
}

.call-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.call-btn--calling {
  background: #fff8e1;
  border-color: #f59e0b;
  color: #92400e;
}

.call-btn--active {
  background: #fee2e2;
  border-color: #ef4444;
  color: #991b1b;
}

.call-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.call-hint {
  font-size: 0.75rem;
  color: var(--text-secondary, #6c7785);
  white-space: nowrap;
}
</style>
