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

    <div v-if="showVirtualOptions" class="tmb-row">
      <label class="tmb-label">Virtual</label>
      <div class="tmb-switch-row">
        <div class="tmb-switch-copy">
          <span class="tmb-switch-title">Virtual appointment</span>
          <p class="muted">Schedule with a joinable video room.</p>
        </div>
        <label class="tmb-switch" :class="{ disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="isVirtual"
            :disabled="disabled"
            :aria-checked="String(!!isVirtual)"
            @change="emit('update:isVirtual', !!$event.target.checked)"
          />
          <span class="tmb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>
      <div v-if="isVirtual && videoConfigured" class="tmb-switch-row">
        <div class="tmb-switch-copy">
          <span class="tmb-switch-title">Platform video room</span>
          <p class="muted">Link the in-app video room for this meeting.</p>
        </div>
        <label class="tmb-switch" :class="{ disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="usePlatformVideo"
            :disabled="disabled"
            :aria-checked="String(!!usePlatformVideo)"
            @change="emit('update:usePlatformVideo', !!$event.target.checked)"
          />
          <span class="tmb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>
      <div v-if="isVirtual && (!videoConfigured || !usePlatformVideo)" class="tmb-switch-row">
        <div class="tmb-switch-copy">
          <span class="tmb-switch-title">Google Meet link</span>
          <p class="muted">Create a Meet link when platform video isn’t used.</p>
        </div>
        <label class="tmb-switch" :class="{ disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="createMeetLink"
            :disabled="disabled"
            :aria-checked="String(!!createMeetLink)"
            @change="emit('update:createMeetLink', !!$event.target.checked)"
          />
          <span class="tmb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>
      <div v-if="isVirtual && usePlatformVideo && videoConfigured" class="tmb-switch-row">
        <div class="tmb-switch-copy">
          <span class="tmb-switch-title">Waiting room</span>
          <p class="muted">Participants wait until the host admits them.</p>
        </div>
        <label class="tmb-switch" :class="{ disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="waitingRoomEnabled"
            :disabled="disabled"
            :aria-checked="String(!!waitingRoomEnabled)"
            @change="emit('update:waitingRoomEnabled', !!$event.target.checked)"
          />
          <span class="tmb-switch-slider" aria-hidden="true"></span>
        </label>
      </div>
    </div>

    <div v-if="showParticipants" class="tmb-row">
      <label class="tmb-label">
        Participants <span v-if="participantsRequired" aria-hidden="true">*</span>
      </label>
      <slot name="participants">
        <p class="muted">
          {{ participantsRequired ? 'Select at least one participant.' : 'Optional — huddles can be solo or with others.' }}
        </p>
      </slot>
    </div>

    <div v-if="showMeetingSubtype || showHuddleOption" class="tmb-row">
      <label class="tmb-label">Type</label>
      <select
        class="tmb-input"
        :value="typeSelectValue"
        :disabled="disabled || typeSelectLocked"
        @change="onTypeSelectChange($event.target.value)"
      >
        <option v-if="showHuddleOption || meetingKind === 'huddle'" value="huddle">Huddle</option>
        <option v-if="showMeetingSubtype || meetingKind !== 'huddle'" value="general">General team meeting</option>
        <option
          v-if="showMeetingSubtype && (canSetAdminSubtype || meetingSubtype === 'admin')"
          value="admin"
        >
          Admin Meeting
        </option>
        <option
          v-if="showMeetingSubtype && (canSetAdminSubtype || meetingSubtype === 'town_hall')"
          value="town_hall"
        >
          Town Hall
        </option>
      </select>
      <p v-if="meetingKind === 'huddle'" class="muted">
        Host (CPA / Provider Plus) is paid at the Individual Meeting rate when they have one; attendees use MEETING time.
      </p>
      <p v-else-if="!canSetAdminSubtype && showMeetingSubtype" class="muted">
        Only admin, support, or super admin can create Admin Meetings or Town Halls.
      </p>
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

    <div v-if="showGoalsActionsDraft" class="tmb-row">
      <label class="tmb-label">Goals (optional)</label>
      <p class="muted">Goals carry into the meeting workspace for the host and participants.</p>
      <div class="tmb-agenda-add">
        <input
          v-model="draftGoal"
          class="tmb-input"
          type="text"
          :disabled="disabled"
          placeholder="Add a goal…"
          @keydown.enter.prevent="addGoal"
        />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addGoal">Add</button>
      </div>
      <ul v-if="goalDraftItems.length" class="tmb-agenda-list">
        <li v-for="(it, idx) in goalDraftItems" :key="`gl-${idx}`">
          {{ it.text || it }}
          <button type="button" class="btn btn-ghost btn-xs" :disabled="disabled" @click="removeGoal(idx)">×</button>
        </li>
      </ul>
    </div>

    <div v-if="showGoalsActionsDraft" class="tmb-row">
      <label class="tmb-label">Action items (optional)</label>
      <p class="muted">
        Action items live on the meeting after it’s scheduled. Admin Meetings can attach escalations later.
      </p>
      <div class="tmb-agenda-add">
        <input
          v-model="draftAction"
          class="tmb-input"
          type="text"
          :disabled="disabled"
          placeholder="Add an action item…"
          @keydown.enter.prevent="addAction"
        />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addAction">Add</button>
      </div>
      <ul v-if="actionDraftItems.length" class="tmb-agenda-list">
        <li v-for="(it, idx) in actionDraftItems" :key="`ac-${idx}`">
          {{ it.text || it }}
          <button type="button" class="btn btn-ghost btn-xs" :disabled="disabled" @click="removeAction(idx)">×</button>
        </li>
      </ul>
    </div>

    <div v-if="showTrainingPayOption && meetingKind !== 'huddle'" class="tmb-row">
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
        For paid CPA / Provider Plus huddles, choose Type → Huddle instead.
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
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  usePlatformVideo: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: true },
  createMeetLink: { type: Boolean, default: false },
  videoConfigured: { type: Boolean, default: false },
  /** When false, Virtual / platform / waiting-room switches live next to the join-link panel. */
  showVirtualOptions: { type: Boolean, default: true },
  agendaItems: { type: Array, default: () => [] },
  goalDraftItems: { type: Array, default: () => [] },
  actionDraftItems: { type: Array, default: () => [] },
  notes: { type: String, default: '' },
  /** When false (edit mode), agenda is managed in the live meeting panel instead */
  showAgendaDraft: { type: Boolean, default: true },
  showGoalsActionsDraft: { type: Boolean, default: false },
  /** When false, participants are chosen in the header tray instead */
  showParticipants: { type: Boolean, default: true },
  titleMissing: { type: Boolean, default: false },
  /** CPA / Provider Plus: mark meeting for Admin Time pay approval (not used for Huddle) */
  showTrainingPayOption: { type: Boolean, default: false },
  isTrainingPayEligible: { type: Boolean, default: false },
  showMeetingSubtype: { type: Boolean, default: false },
  meetingSubtype: { type: String, default: 'general' },
  canSetAdminSubtype: { type: Boolean, default: false },
  /** agency_meeting | huddle */
  meetingKind: { type: String, default: 'agency_meeting' },
  showHuddleOption: { type: Boolean, default: false },
  /** Team meetings require participants; huddles may be host-only */
  participantsRequired: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:title',
  'update:isVirtual',
  'update:usePlatformVideo',
  'update:waitingRoomEnabled',
  'update:createMeetLink',
  'update:agendaItems',
  'update:goalDraftItems',
  'update:actionDraftItems',
  'update:notes',
  'update:isTrainingPayEligible',
  'update:meetingSubtype',
  'update:meetingKind'
]);

const draftAgenda = ref('');
const draftGoal = ref('');
const draftAction = ref('');

const typeSelectValue = computed(() => (
  props.meetingKind === 'huddle' ? 'huddle' : String(props.meetingSubtype || 'general')
));
const typeSelectLocked = computed(() => (
  props.meetingKind !== 'huddle'
  && !props.canSetAdminSubtype
  && props.meetingSubtype === 'general'
  && !props.showHuddleOption
));

function onTypeSelectChange(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'huddle') {
    emit('update:meetingKind', 'huddle');
    emit('update:meetingSubtype', 'general');
    emit('update:isTrainingPayEligible', false);
    return;
  }
  emit('update:meetingKind', 'agency_meeting');
  emit('update:meetingSubtype', (v === 'admin' || v === 'town_hall') ? v : 'general');
}

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

function addGoal() {
  const t = String(draftGoal.value || '').trim();
  if (!t) return;
  emit('update:goalDraftItems', [...(props.goalDraftItems || []), { text: t, done: false }]);
  draftGoal.value = '';
}

function removeGoal(idx) {
  const next = [...(props.goalDraftItems || [])];
  next.splice(idx, 1);
  emit('update:goalDraftItems', next);
}

function addAction() {
  const t = String(draftAction.value || '').trim();
  if (!t) return;
  emit('update:actionDraftItems', [...(props.actionDraftItems || []), { text: t, done: false }]);
  draftAction.value = '';
}

function removeAction(idx) {
  const next = [...(props.actionDraftItems || [])];
  next.splice(idx, 1);
  emit('update:actionDraftItems', next);
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
.tmb-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tmb-switch-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tmb-switch-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
}
.tmb-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
  cursor: pointer;
}
.tmb-switch.disabled { opacity: 0.55; cursor: not-allowed; }
.tmb-switch input { opacity: 0; width: 0; height: 0; }
.tmb-switch-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.15s ease;
}
.tmb-switch input:checked + .tmb-switch-slider { background: #7c3aed; }
.tmb-switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
}
.tmb-switch input:checked + .tmb-switch-slider::before { transform: translateX(20px); }
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
