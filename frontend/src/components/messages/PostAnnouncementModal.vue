<script setup>
import { computed, ref, watch } from 'vue';
import api from '@/services/api';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 'team' or 'club' */
  mode: { type: String, default: 'team' },
  clubId: { type: [Number, String], required: true },
  /** required when mode='team' */
  teamId: { type: [Number, String], default: null },
  /** required when mode='team' */
  classId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'posted']);

const router = useRouter();
const route = useRoute();

const titleVal = ref('');
const messageVal = ref('');
const displayType = ref('announcement');
const splashImageUrl = ref('');
const startsAt = ref('');
const endsAt = ref('');

const submitting = ref(false);
const errorMsg = ref('');
const lastResult = ref(null);

const toLocalInput = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

function reset() {
  const now = new Date();
  const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  titleVal.value = '';
  messageVal.value = '';
  displayType.value = 'announcement';
  splashImageUrl.value = '';
  startsAt.value = toLocalInput(now);
  endsAt.value = toLocalInput(in24);
  errorMsg.value = '';
  lastResult.value = null;
}

watch(() => props.open, (open) => {
  if (open) reset();
});

const canSubmit = computed(() => {
  if (!String(messageVal.value || '').trim()) return false;
  if (displayType.value === 'message') return true;
  if (!startsAt.value || !endsAt.value) return false;
  const a = new Date(startsAt.value);
  const b = new Date(endsAt.value);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() > a.getTime();
});

const heading = computed(() => (props.mode === 'club' ? 'Message the club' : 'Message your team'));

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    const payload = {
      title: String(titleVal.value || '').trim() || null,
      message: String(messageVal.value || '').trim(),
      display_type: displayType.value
    };
    if (displayType.value !== 'message') {
      payload.starts_at = new Date(startsAt.value);
      payload.ends_at = new Date(endsAt.value);
      const splash = String(splashImageUrl.value || '').trim();
      if (splash) payload.splash_image_url = splash;
    }

    let resp;
    if (props.mode === 'club') {
      resp = await api.post(`/agencies/${props.clubId}/announcements/with-thread`, payload, { skipGlobalLoading: true });
    } else {
      resp = await api.post(
        `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/teams/${props.teamId}/announcements`,
        payload,
        { skipGlobalLoading: true }
      );
    }
    lastResult.value = resp?.data || null;
    emit('posted', lastResult.value);
  } catch (err) {
    errorMsg.value = err?.response?.data?.error?.message || 'Failed to post';
  } finally {
    submitting.value = false;
  }
}

function close() {
  emit('close');
}

function openInMessages() {
  const threadId = lastResult.value?.chat?.thread_id;
  if (!threadId) return;
  const slug = route.params.organizationSlug;
  const path = slug ? `/${slug}/messages` : '/admin/communications/messages';
  router.push({ path, query: { threadId: String(threadId) } });
  close();
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="close">
    <div class="modal-content modal-wide" @click.stop>
      <h2>{{ heading }}</h2>
      <p class="hint">
        Banner / splash also post to the {{ mode === 'club' ? 'club' : 'team' }} Messages thread
        so people can reply. Choose <strong>Message (thread only)</strong> to skip the banner entirely.
      </p>

      <div v-if="errorMsg" class="error-inline">{{ errorMsg }}</div>

      <div v-if="lastResult" class="success-row">
        <span>Posted!</span>
        <button v-if="lastResult?.chat?.thread_id" type="button" class="btn btn-secondary btn-xs" @click="openInMessages">
          Open in Messages
        </button>
      </div>

      <template v-if="!lastResult">
        <div class="form-row">
          <label>Type</label>
          <select v-model="displayType" class="form-control">
            <option value="announcement">Banner (scrolling line)</option>
            <option value="splash">Splash (pop-up)</option>
            <option value="message">Message (thread only)</option>
          </select>
        </div>
        <div class="form-row">
          <label>Title (optional)</label>
          <input v-model="titleVal" type="text" maxlength="255" class="form-control" />
        </div>
        <div class="form-row">
          <label>Message</label>
          <textarea v-model="messageVal" rows="4" maxlength="1200" class="form-control" />
        </div>
        <div v-if="displayType === 'splash'" class="form-row">
          <label>Splash image URL (optional)</label>
          <input v-model="splashImageUrl" type="url" class="form-control" placeholder="https://…" />
        </div>
        <div v-if="displayType !== 'message'" class="form-row form-row--2">
          <label>Starts<br />
            <input v-model="startsAt" type="datetime-local" class="form-control" />
          </label>
          <label>Ends<br />
            <input v-model="endsAt" type="datetime-local" class="form-control" />
          </label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="submitting || !canSubmit"
            @click="submit"
          >
            {{ submitting ? 'Posting…' : `Post to ${mode}` }}
          </button>
        </div>
      </template>

      <div v-else class="form-actions">
        <button type="button" class="btn btn-primary" @click="close">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1500;
}
.modal-content {
  background: #fff; border-radius: 14px; padding: 20px; width: min(560px, 92vw);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.modal-wide { width: min(640px, 96vw); }
h2 { margin: 0 0 4px; }
.hint { color: #6b7280; font-size: 13px; margin: 0 0 12px; }
.error-inline {
  background: #fee2e2; color: #991b1b; padding: 8px 10px; border-radius: 8px; margin-bottom: 10px; font-size: 13px;
}
.success-row {
  display: flex; align-items: center; gap: 12px;
  background: #ecfdf5; color: #065f46; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px;
}
.form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.form-row > label { font-size: 13px; font-weight: 600; color: #374151; }
.form-row--2 { flex-direction: row; gap: 12px; }
.form-row--2 > label { flex: 1; }
.form-control {
  width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font: inherit;
}
.form-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;
}
.btn { border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #e5e7eb; color: #1f2937; }
.btn-xs { padding: 4px 8px; font-size: 12px; }
</style>
