<template>
  <div class="report-menu-wrap">
    <button
      type="button"
      class="report-menu-trigger"
      :title="triggerTitle"
      :aria-label="triggerTitle"
      @click.stop="toggleOpen"
    >
      <span aria-hidden="true">⋯</span>
    </button>

    <div v-if="open" ref="menuEl" class="report-menu-popover" role="menu" @click.stop>
      <button type="button" class="report-menu-item" role="menuitem" @click="openReportDialog">
        Report this {{ contentLabel }}
      </button>
      <button
        v-if="canBlockOwner"
        type="button"
        class="report-menu-item report-menu-item--danger"
        role="menuitem"
        @click="confirmBlock"
      >
        Block {{ ownerDisplayName || 'this user' }}
      </button>
    </div>

    <div v-if="dialogOpen" class="report-dialog-backdrop" role="dialog" aria-modal="true" @click.self="closeDialog">
      <div class="report-dialog-card">
        <h3 class="report-dialog-title">Report this {{ contentLabel }}</h3>
        <p class="report-dialog-sub">
          Our moderators review every flagged item within 24 hours and take action when our community guidelines are violated.
        </p>

        <label class="report-dialog-label" for="report-reason">Reason</label>
        <select id="report-reason" v-model="reason" class="report-dialog-input">
          <option value="">Choose a reason…</option>
          <option value="spam">Spam or scam</option>
          <option value="harassment">Harassment or bullying</option>
          <option value="hate_speech">Hate speech</option>
          <option value="sexual_content">Sexual or graphic content</option>
          <option value="violence">Violence or threats</option>
          <option value="self_harm">Self-harm</option>
          <option value="impersonation">Impersonation</option>
          <option value="misinformation">Misinformation</option>
          <option value="other">Something else</option>
        </select>

        <label class="report-dialog-label" for="report-details">Add details (optional)</label>
        <textarea
          id="report-details"
          v-model="details"
          class="report-dialog-input"
          rows="3"
          maxlength="2000"
          placeholder="Anything else our team should know?"
        />

        <label v-if="canBlockOwner" class="report-dialog-check">
          <input v-model="alsoBlock" type="checkbox" />
          Also block {{ ownerDisplayName || 'this user' }} so I no longer see their posts
        </label>

        <div v-if="errorMessage" class="report-dialog-error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="report-dialog-success">{{ successMessage }}</div>

        <div class="report-dialog-actions">
          <button type="button" class="report-dialog-btn report-dialog-btn--ghost" :disabled="submitting" @click="closeDialog">
            Cancel
          </button>
          <button
            type="button"
            class="report-dialog-btn report-dialog-btn--primary"
            :disabled="!reason || submitting"
            @click="submitReport"
          >
            {{ submitting ? 'Submitting…' : 'Submit report' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  contentType: { type: String, required: true },
  contentId: { type: [String, Number], required: true },
  ownerUserId: { type: [String, Number], default: null },
  ownerDisplayName: { type: String, default: '' },
  contentLabel: { type: String, default: 'item' }
});

const emit = defineEmits(['reported', 'blocked']);

const authStore = useAuthStore();

const open = ref(false);
const dialogOpen = ref(false);
const reason = ref('');
const details = ref('');
const alsoBlock = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const menuEl = ref(null);

const triggerTitle = computed(() => `Report or block this ${props.contentLabel}`);

const canBlockOwner = computed(() => {
  const owner = Number(props.ownerUserId || 0);
  const me = Number(authStore.user?.id || 0);
  return !!owner && !!me && owner !== me;
});

const toggleOpen = () => {
  open.value = !open.value;
};

const closeMenuOnOutsideClick = (ev) => {
  if (!open.value) return;
  const el = menuEl.value;
  if (el && !el.contains(ev.target)) open.value = false;
};

onMounted(() => {
  document.addEventListener('click', closeMenuOnOutsideClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick);
});

const openReportDialog = () => {
  open.value = false;
  errorMessage.value = '';
  successMessage.value = '';
  reason.value = '';
  details.value = '';
  alsoBlock.value = false;
  dialogOpen.value = true;
};

const closeDialog = () => {
  if (submitting.value) return;
  dialogOpen.value = false;
};

const submitReport = async () => {
  if (!reason.value) return;
  submitting.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { data } = await api.post('/user-safety/reports', {
      contentType: props.contentType,
      contentId: Number(props.contentId),
      reason: reason.value,
      details: details.value || null,
      alsoBlock: alsoBlock.value && canBlockOwner.value
    });
    successMessage.value = data?.message || 'Report submitted. Thank you.';
    emit('reported', { contentType: props.contentType, contentId: props.contentId, reason: reason.value });
    if (data?.blocked) emit('blocked', { userId: Number(props.ownerUserId) });
    setTimeout(() => { dialogOpen.value = false; }, 1400);
  } catch (e) {
    errorMessage.value = e?.response?.data?.error?.message || 'Could not submit report. Please try again.';
  } finally {
    submitting.value = false;
  }
};

const confirmBlock = async () => {
  open.value = false;
  if (!canBlockOwner.value) return;
  const name = props.ownerDisplayName || 'this user';
  if (!window.confirm(`Block ${name}? You will no longer see their posts, comments, or messages anywhere in the app.`)) return;
  try {
    await api.post('/user-safety/blocks', { userId: Number(props.ownerUserId) });
    emit('blocked', { userId: Number(props.ownerUserId) });
    window.alert(`${name} has been blocked.`);
  } catch (e) {
    window.alert(e?.response?.data?.error?.message || 'Could not block user.');
  }
};
</script>

<style scoped>
.report-menu-wrap {
  position: relative;
  display: inline-flex;
}

.report-menu-trigger {
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
}
.report-menu-trigger:hover {
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-primary, #0f172a);
}

.report-menu-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 30;
  min-width: 200px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.report-menu-item {
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary, #0f172a);
  cursor: pointer;
}
.report-menu-item:hover {
  background: rgba(15, 23, 42, 0.06);
}
.report-menu-item--danger {
  color: #b91c1c;
}
.report-menu-item--danger:hover {
  background: rgba(185, 28, 28, 0.08);
}

.report-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.report-dialog-card {
  width: 100%;
  max-width: 460px;
  background: #fff;
  border-radius: 14px;
  padding: 22px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.35);
}

.report-dialog-title {
  margin: 0 0 6px 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}

.report-dialog-sub {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-secondary, #475569);
  line-height: 1.45;
}

.report-dialog-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  margin-bottom: 4px;
  margin-top: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.report-dialog-input {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: var(--text-primary, #0f172a);
}
.report-dialog-input:focus {
  outline: 2px solid rgba(30, 58, 138, 0.4);
  outline-offset: 1px;
  border-color: transparent;
}

.report-dialog-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
}

.report-dialog-error {
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.report-dialog-success {
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #065f46;
  font-size: 13px;
}

.report-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.report-dialog-btn {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.report-dialog-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.report-dialog-btn--ghost {
  background: transparent;
  color: var(--text-secondary, #475569);
  border-color: rgba(15, 23, 42, 0.18);
}
.report-dialog-btn--primary {
  background: var(--primary, #1e3a8a);
  color: #fff;
  border-color: var(--primary, #1e3a8a);
}
.report-dialog-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}
</style>
