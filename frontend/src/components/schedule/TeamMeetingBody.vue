<template>
  <div class="tmb" data-testid="team-meeting-body">
    <div class="tmb-row">
      <label class="tmb-label" :class="{ 'tmb-label--missing': titleMissing }">
        Title <span aria-hidden="true">*</span>
      </label>
      <input
        class="tmb-input"
        :class="{ 'tmb-input--missing': titleMissing }"
        type="text"
        :value="title"
        :disabled="disabled"
        required
        placeholder="e.g. Weekly clinical huddle"
        @input="emit('update:title', $event.target.value)"
      />
      <p v-if="titleMissing" class="tmb-required">Add a title to schedule this meeting.</p>
    </div>

    <div class="tmb-row">
      <label class="tmb-label">Virtual</label>
      <label class="tmb-check">
        <input
          type="checkbox"
          :checked="isVirtual"
          :disabled="disabled"
          @change="emit('update:isVirtual', !!$event.target.checked)"
        />
        <span>Make this a virtual appointment</span>
      </label>
      <label v-if="isVirtual && videoConfigured" class="tmb-check">
        <input
          type="checkbox"
          :checked="usePlatformVideo"
          :disabled="disabled"
          @change="emit('update:usePlatformVideo', !!$event.target.checked)"
        />
        <span>Link platform video room</span>
      </label>
      <label v-if="isVirtual && (!videoConfigured || !usePlatformVideo)" class="tmb-check">
        <input
          type="checkbox"
          :checked="createMeetLink"
          :disabled="disabled"
          @change="emit('update:createMeetLink', !!$event.target.checked)"
        />
        <span>Create Google Meet link</span>
      </label>
    </div>

    <div v-if="showParticipants" class="tmb-row">
      <label class="tmb-label">Participants <span aria-hidden="true">*</span></label>
      <slot name="participants">
        <p class="muted">Select at least one participant.</p>
      </slot>
    </div>

    <div v-if="showAgendaDraft" class="tmb-row">
      <label class="tmb-label">Agenda (optional)</label>
      <p class="muted">Items carry into the live video session — everyone can update them there.</p>
      <div class="tmb-agenda-add">
        <input
          v-model="draftAgenda"
          class="tmb-input"
          type="text"
          :disabled="disabled"
          placeholder="Add agenda item…"
          @keydown.enter.prevent="addAgenda"
        />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addAgenda">Add</button>
      </div>
      <ul v-if="agendaItems.length" class="tmb-agenda-list">
        <li v-for="(it, idx) in agendaItems" :key="`ag-${idx}`">
          {{ it.title || it }}
          <button type="button" class="btn btn-ghost btn-xs" :disabled="disabled" @click="removeAgenda(idx)">×</button>
        </li>
      </ul>
    </div>

    <div v-if="showTrainingPayOption" class="tmb-row">
      <label class="tmb-label">Pay</label>
      <label class="tmb-check">
        <input
          type="checkbox"
          :checked="isTrainingPayEligible"
          :disabled="disabled"
          @change="emit('update:isTrainingPayEligible', !!$event.target.checked)"
        />
        <span>Training / Mentorship / Onboarding</span>
      </label>
      <p class="muted">
        Submits an Admin Time pay claim for approval at this host’s Admin Time rate.
      </p>
    </div>

    <div class="tmb-row">
      <label class="tmb-label">Notes</label>
      <textarea
        class="tmb-input"
        rows="2"
        :value="notes"
        :disabled="disabled"
        placeholder="Optional notes…"
        @input="emit('update:notes', $event.target.value)"
      />
    </div>

    <slot />
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  usePlatformVideo: { type: Boolean, default: true },
  createMeetLink: { type: Boolean, default: false },
  videoConfigured: { type: Boolean, default: false },
  agendaItems: { type: Array, default: () => [] },
  notes: { type: String, default: '' },
  /** When false (edit mode), agenda is managed in the live meeting panel instead */
  showAgendaDraft: { type: Boolean, default: true },
  /** When false, participants are chosen in the header tray instead */
  showParticipants: { type: Boolean, default: true },
  titleMissing: { type: Boolean, default: false },
  /** CPA / Provider Plus: mark meeting for Admin Time pay approval */
  showTrainingPayOption: { type: Boolean, default: false },
  isTrainingPayEligible: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:title',
  'update:isVirtual',
  'update:usePlatformVideo',
  'update:createMeetLink',
  'update:agendaItems',
  'update:notes',
  'update:isTrainingPayEligible'
]);

const draftAgenda = ref('');

function addAgenda() {
  const t = String(draftAgenda.value || '').trim();
  if (!t) return;
  emit('update:agendaItems', [...(props.agendaItems || []), { title: t }]);
  draftAgenda.value = '';
}

function removeAgenda(idx) {
  const next = [...(props.agendaItems || [])];
  next.splice(idx, 1);
  emit('update:agendaItems', next);
}
</script>

<style scoped>
.tmb { display: flex; flex-direction: column; gap: 12px; }
.tmb-row { display: flex; flex-direction: column; gap: 6px; }
.tmb-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.tmb-label--missing { color: #b91c1c; }
.tmb-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.tmb-input--missing {
  border-color: #f87171;
  box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.2);
}
.tmb-required {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #b91c1c;
}
.tmb-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
}
.tmb-agenda-add { display: flex; gap: 8px; }
.tmb-agenda-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.88rem;
}
.tmb-agenda-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.muted { color: #64748b; font-size: 0.84rem; margin: 0; }
.btn-ghost {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #64748b;
}
</style>
