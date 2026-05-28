<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal post-school-event-modal" @click.stop>
      <div class="modal-header">
        <h2>Post school event</h2>
        <button class="close" type="button" @click="$emit('close')">×</button>
      </div>

      <div class="body">
        <p class="muted intro">
          Share your school's parent event with our team. If ITSCO is invited for an outreach table, staff can sign up from My Schedule.
        </p>

        <label class="field">
          <span class="lbl">Event type</span>
          <select v-model="form.category" class="input" :disabled="!!lockedCategory">
            <option value="back_to_school">Back to School</option>
            <option value="spring">Spring Event</option>
          </select>
        </label>

        <label class="field">
          <span class="lbl">Event name</span>
          <input v-model="form.title" type="text" class="input" maxlength="255" placeholder="e.g., Open House Night" />
        </label>

        <label class="field">
          <span class="lbl">Event details</span>
          <textarea v-model="form.description" rows="4" class="textarea" placeholder="Location, what families should expect, etc." />
        </label>

        <div class="field-row">
          <label class="field">
            <span class="lbl">Date</span>
            <input v-model="form.date" type="date" class="input" />
          </label>
          <label class="field">
            <span class="lbl">Start time</span>
            <input v-model="form.startTime" type="time" class="input" />
          </label>
          <label class="field">
            <span class="lbl">End time</span>
            <input v-model="form.endTime" type="time" class="input" />
          </label>
        </div>

        <label class="field">
          <span class="lbl">Flier (optional)</span>
          <input type="file" accept=".pdf,image/jpeg,image/png,image/jpg" @change="onFileChange" />
          <div v-if="uploading" class="muted small">Uploading…</div>
          <div v-if="form.flierFileUrl || form.eventImageUrl" class="flier-preview">
            <a :href="displayFlierUrl" target="_blank" rel="noopener">View uploaded flier</a>
          </div>
        </label>

        <label class="checkbox-row">
          <input v-model="form.outreachTableInvited" type="checkbox" />
          <span>ITSCO is invited to attend via an outreach table</span>
        </label>

        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="success" class="success">{{ success }}</div>

        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="submitting || uploading" @click="submit">
            {{ submitting ? 'Posting…' : (editEvent ? 'Save changes' : 'Post event') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  initialCategory: { type: String, default: 'back_to_school' },
  lockedCategory: { type: Boolean, default: false },
  postToken: { type: String, default: '' },
  editEvent: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const submitting = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');

const form = reactive({
  category: 'back_to_school',
  title: '',
  description: '',
  date: '',
  startTime: '17:00',
  endTime: '19:00',
  outreachTableInvited: false,
  flierFileUrl: '',
  eventImageUrl: ''
});

const displayFlierUrl = computed(() => {
  const raw = form.flierFileUrl || form.eventImageUrl;
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return toUploadsUrl(raw);
});

const toLocalDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toLocalTimeInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buildIsoRange = () => {
  if (!form.date || !form.startTime || !form.endTime) return null;
  const startsAt = new Date(`${form.date}T${form.startTime}:00`);
  const endsAt = new Date(`${form.date}T${form.endTime}:00`);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
};

const onFileChange = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    uploading.value = true;
    error.value = '';
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(`/school-portal/${props.schoolOrganizationId}/school-events/upload-flier`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    form.flierFileUrl = res.data?.flierFileUrl || res.data?.url || '';
    if (res.data?.eventImageUrl) form.eventImageUrl = res.data.eventImageUrl;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to upload flier';
  } finally {
    uploading.value = false;
  }
};

const submit = async () => {
  try {
    submitting.value = true;
    error.value = '';
    success.value = '';
    const range = buildIsoRange();
    if (!form.title.trim()) {
      error.value = 'Event name is required';
      return;
    }
    if (!range) {
      error.value = 'Date and times are required';
      return;
    }
    const payload = {
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      outreachTableInvited: form.outreachTableInvited,
      flierFileUrl: form.flierFileUrl || null,
      eventImageUrl: form.eventImageUrl || null,
      postToken: props.postToken || undefined
    };
    let res;
    if (props.editEvent?.id) {
      res = await api.put(`/school-portal/${props.schoolOrganizationId}/school-events/${props.editEvent.id}`, payload);
    } else {
      res = await api.post(`/school-portal/${props.schoolOrganizationId}/school-events`, payload);
    }
    success.value = props.editEvent?.id
      ? 'Event updated.'
      : form.outreachTableInvited
        ? 'Event posted. Agency staff can sign up for outreach from My Schedule.'
        : 'Event posted.';
    emit('saved', res.data);
    setTimeout(() => emit('close'), 1200);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save event';
  } finally {
    submitting.value = false;
  }
};

const hydrateFromEdit = () => {
  const e = props.editEvent;
  if (!e) return;
  form.category = e.category || 'back_to_school';
  form.title = e.title || '';
  form.description = e.description || '';
  form.date = toLocalDateInput(e.startsAt);
  form.startTime = toLocalTimeInput(e.startsAt) || '17:00';
  form.endTime = toLocalTimeInput(e.endsAt) || '19:00';
  form.outreachTableInvited = !!e.outreachTableInvited;
  form.flierFileUrl = e.flierFileUrl || '';
  form.eventImageUrl = e.eventImageUrl || '';
};

onMounted(() => {
  form.category = props.initialCategory || 'back_to_school';
  hydrateFromEdit();
});

watch(
  () => props.editEvent,
  () => hydrateFromEdit()
);
</script>

<style scoped>
.post-school-event-modal {
  width: min(560px, 96vw);
  max-height: 92vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}
.close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
}
.body {
  padding: 16px 18px 18px;
}
.intro {
  margin: 0 0 14px;
  font-size: 0.92rem;
}
.field {
  display: block;
  margin-bottom: 12px;
}
.lbl {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 4px;
}
.field-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 10px;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 14px 0;
  font-size: 0.92rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.error {
  color: #b91c1c;
  margin-top: 8px;
}
.success {
  color: #047857;
  margin-top: 8px;
}
.flier-preview {
  margin-top: 6px;
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
