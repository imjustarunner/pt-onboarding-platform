<template>
  <div
    class="tmb"
    :class="{ 'tmb--with-side': showWorkspaceSide }"
    data-testid="team-meeting-body"
  >
    <div class="tmb-main">
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

    <aside v-if="showWorkspaceSide" class="tmb-side" aria-label="Agenda, goals, and action items">
      <div v-if="showAgendaDraft" class="tmb-side-section">
        <label class="tmb-label">Agenda</label>
        <p class="muted">Numbered items carry into the live session.</p>
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
        <ol v-if="agendaItems.length" class="tmb-item-list">
          <li v-for="(it, idx) in agendaItems" :key="`ag-${idx}`" class="tmb-item">
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <input
              class="tmb-input tmb-item-input"
              type="text"
              :value="it.title || it"
              :disabled="disabled"
              @input="updateAgendaText(idx, $event.target.value)"
            />
            <div class="tmb-item-actions">
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveAgenda(idx, -1)">↑</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= agendaItems.length - 1" title="Move down" @click="moveAgenda(idx, 1)">↓</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled" title="Remove" @click="removeAgenda(idx)">×</button>
            </div>
          </li>
        </ol>
      </div>

      <div v-if="showGoalsActionsDraft" class="tmb-side-section">
        <label class="tmb-label">Goals</label>
        <p class="muted">Goals carry into the meeting workspace.</p>
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
        <ol v-if="goalDraftItems.length" class="tmb-item-list">
          <li v-for="(it, idx) in goalDraftItems" :key="`gl-${idx}`" class="tmb-item">
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <input
              class="tmb-input tmb-item-input"
              type="text"
              :value="it.text || it"
              :disabled="disabled"
              @input="updateGoalText(idx, $event.target.value)"
            />
            <div class="tmb-item-actions">
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveGoal(idx, -1)">↑</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= goalDraftItems.length - 1" title="Move down" @click="moveGoal(idx, 1)">↓</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled" title="Remove" @click="removeGoal(idx)">×</button>
            </div>
          </li>
        </ol>
      </div>

      <div v-if="showGoalsActionsDraft" class="tmb-side-section">
        <label class="tmb-label">Action items</label>
        <p class="muted">Assign owners now; Admin Meetings can escalate later.</p>
        <div class="tmb-agenda-add tmb-agenda-add--stack">
          <input
            v-model="draftAction"
            class="tmb-input"
            type="text"
            :disabled="disabled"
            placeholder="Add an action item…"
            @keydown.enter.prevent="addAction"
          />
          <div class="tmb-action-add-row">
            <select
              v-if="assigneeOptions.length"
              v-model.number="draftActionAssigneeId"
              class="tmb-input tmb-assignee-select"
              :disabled="disabled"
              aria-label="Assign to"
            >
              <option :value="0">Unassigned</option>
              <option v-for="p in assigneeOptions" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addAction">Add</button>
          </div>
        </div>
        <ol v-if="actionDraftItems.length" class="tmb-item-list">
          <li v-for="(it, idx) in actionDraftItems" :key="`ac-${idx}`" class="tmb-item tmb-item--action">
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <div class="tmb-item-col">
              <input
                class="tmb-input tmb-item-input"
                type="text"
                :value="it.text || it"
                :disabled="disabled"
                @input="updateActionText(idx, $event.target.value)"
              />
              <select
                v-if="assigneeOptions.length"
                class="tmb-input tmb-assignee-select"
                :value="Number(it.assigneeUserId || 0)"
                :disabled="disabled"
                aria-label="Assign action item"
                @change="updateActionAssignee(idx, $event.target.value)"
              >
                <option :value="0">Unassigned</option>
                <option v-for="p in assigneeOptions" :key="`a-${idx}-${p.id}`" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <p v-else class="muted tmb-assign-hint">Select participants above to assign owners.</p>
            </div>
            <div class="tmb-item-actions">
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveAction(idx, -1)">↑</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= actionDraftItems.length - 1" title="Move down" @click="moveAction(idx, 1)">↓</button>
              <button type="button" class="tmb-icon-btn" :disabled="disabled" title="Remove" @click="removeAction(idx)">×</button>
            </div>
          </li>
        </ol>
      </div>
    </aside>
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
  /** [{ id, name }] for action-item assignment while scheduling */
  assigneeOptions: { type: Array, default: () => [] },
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
const draftActionAssigneeId = ref(0);

const showWorkspaceSide = computed(() => !!(props.showAgendaDraft || props.showGoalsActionsDraft));

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

function moveInList(list, idx, delta) {
  const next = [...(list || [])];
  const j = idx + delta;
  if (j < 0 || j >= next.length) return next;
  const tmp = next[idx];
  next[idx] = next[j];
  next[j] = tmp;
  return next;
}

function addAgenda() {
  const t = String(draftAgenda.value || '').trim();
  if (!t) return;
  emit('update:agendaItems', [...(props.agendaItems || []), { title: t }]);
  draftAgenda.value = '';
}

function updateAgendaText(idx, value) {
  const next = [...(props.agendaItems || [])];
  const cur = next[idx];
  next[idx] = typeof cur === 'string' ? { title: value } : { ...cur, title: value };
  emit('update:agendaItems', next);
}

function moveAgenda(idx, delta) {
  emit('update:agendaItems', moveInList(props.agendaItems, idx, delta));
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

function updateGoalText(idx, value) {
  const next = [...(props.goalDraftItems || [])];
  const cur = next[idx];
  next[idx] = typeof cur === 'string' ? { text: value, done: false } : { ...cur, text: value };
  emit('update:goalDraftItems', next);
}

function moveGoal(idx, delta) {
  emit('update:goalDraftItems', moveInList(props.goalDraftItems, idx, delta));
}

function removeGoal(idx) {
  const next = [...(props.goalDraftItems || [])];
  next.splice(idx, 1);
  emit('update:goalDraftItems', next);
}

function addAction() {
  const t = String(draftAction.value || '').trim();
  if (!t) return;
  emit('update:actionDraftItems', [
    ...(props.actionDraftItems || []),
    { text: t, done: false, assigneeUserId: Number(draftActionAssigneeId.value || 0) || 0 }
  ]);
  draftAction.value = '';
  draftActionAssigneeId.value = 0;
}

function updateActionText(idx, value) {
  const next = [...(props.actionDraftItems || [])];
  const cur = next[idx];
  next[idx] = typeof cur === 'string'
    ? { text: value, done: false, assigneeUserId: 0 }
    : { ...cur, text: value };
  emit('update:actionDraftItems', next);
}

function updateActionAssignee(idx, value) {
  const next = [...(props.actionDraftItems || [])];
  const cur = next[idx] || {};
  next[idx] = { ...cur, text: cur.text || '', done: !!cur.done, assigneeUserId: Number(value || 0) || 0 };
  emit('update:actionDraftItems', next);
}

function moveAction(idx, delta) {
  emit('update:actionDraftItems', moveInList(props.actionDraftItems, idx, delta));
}

function removeAction(idx) {
  const next = [...(props.actionDraftItems || [])];
  next.splice(idx, 1);
  emit('update:actionDraftItems', next);
}
</script>

<style scoped>
.tmb { display: flex; flex-direction: column; gap: 12px; }
.tmb--with-side {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
  gap: 16px;
  align-items: start;
}
.tmb-main,
.tmb-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.tmb-side {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  max-height: min(70vh, 640px);
  overflow: auto;
}
.tmb-side-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.tmb-side-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
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
.tmb-agenda-add--stack { flex-direction: column; }
.tmb-action-add-row { display: flex; gap: 8px; }
.tmb-assignee-select { max-width: 100%; font-size: 0.85rem; }
.tmb-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tmb-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: start;
}
.tmb-item--action { align-items: start; }
.tmb-item-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  border-radius: 8px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 700;
}
.tmb-item-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.tmb-item-input { padding: 6px 8px; }
.tmb-item-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tmb-icon-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  width: 28px;
  height: 24px;
  line-height: 1;
  cursor: pointer;
  font-size: 0.85rem;
}
.tmb-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tmb-assign-hint { font-size: 0.78rem; }
.muted { color: #64748b; font-size: 0.84rem; margin: 0; }
@media (max-width: 980px) {
  .tmb--with-side {
    grid-template-columns: 1fr;
  }
  .tmb-side {
    max-height: none;
  }
}
</style>
