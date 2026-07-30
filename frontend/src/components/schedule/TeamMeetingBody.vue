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

      <div v-if="showNotifyOption" class="tmb-row">
        <label class="tmb-label">Notifications</label>
        <div class="tmb-switch-row">
          <div class="tmb-switch-copy">
            <span class="tmb-switch-title">Email invites &amp; reminders</span>
            <p class="muted">
              Send calendar invite emails, in-app schedule emails, and the automatic join reminder (~5 min before).
              Turn off to add silently with no reminder emails.
            </p>
          </div>
          <label class="tmb-switch" :class="{ disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="notifyParticipants"
              :disabled="disabled"
              :aria-checked="String(!!notifyParticipants)"
              @change="emit('update:notifyParticipants', !!$event.target.checked)"
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
          Agency-internal huddle — agenda only (no goals or action items). Solo or with invited participants.
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
        <div class="tmb-side-head">
          <label class="tmb-label">Agenda</label>
          <button type="button" class="tmb-link-btn" :disabled="disabled" @click="focusAgendaAdd">+ Add item</button>
        </div>
        <div v-if="showAgendaAdd" class="tmb-agenda-add">
          <input
            ref="agendaAddRef"
            v-model="draftAgenda"
            class="tmb-input tmb-input--compact"
            type="text"
            :disabled="disabled"
            placeholder="Agenda item"
            @keydown.enter.prevent="addAgenda"
            @keydown.escape.prevent="showAgendaAdd = false"
          />
          <button type="button" class="tmb-link-btn tmb-link-btn--strong" :disabled="disabled" @click="addAgenda">Add</button>
          <button type="button" class="tmb-link-btn tmb-link-btn--muted" :disabled="disabled" @click="showAgendaAdd = false">Cancel</button>
        </div>
        <ol v-if="agendaItems.length" class="tmb-item-list">
          <li
            v-for="(it, idx) in agendaItems"
            :key="`ag-${idx}`"
            class="tmb-item"
            :class="{ 'tmb-item--editing': editingAgendaIdx === idx }"
          >
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <input
              v-if="editingAgendaIdx === idx"
              ref="agendaEditRef"
              class="tmb-input tmb-input--compact tmb-item-input"
              type="text"
              :value="editDraft"
              :disabled="disabled"
              @input="editDraft = $event.target.value"
              @keydown.enter.prevent="saveAgendaEdit(idx)"
              @keydown.escape.prevent="cancelAgendaEdit"
            />
            <span v-else class="tmb-item-text">{{ it.title || it }}</span>
            <div class="tmb-item-actions">
              <template v-if="editingAgendaIdx === idx">
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="saveAgendaEdit(idx)">Save</button>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="cancelAgendaEdit">Cancel</button>
              </template>
              <template v-else>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="startAgendaEdit(idx, it)">Edit</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveAgenda(idx, -1)">↑</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= agendaItems.length - 1" title="Move down" @click="moveAgenda(idx, 1)">↓</button>
                <button type="button" class="tmb-icon-btn tmb-icon-btn--danger" :disabled="disabled" title="Remove" @click="removeAgenda(idx)">×</button>
              </template>
            </div>
          </li>
        </ol>
        <p v-else class="muted tmb-empty">No agenda items yet.</p>
      </div>

      <div v-if="showGoalsActionsDraft" class="tmb-side-section">
        <div class="tmb-side-head">
          <label class="tmb-label">Goals</label>
          <button type="button" class="tmb-link-btn" :disabled="disabled" @click="focusGoalAdd">+ Add goal</button>
        </div>
        <div v-if="showGoalAdd" class="tmb-agenda-add">
          <input
            ref="goalAddRef"
            v-model="draftGoal"
            class="tmb-input tmb-input--compact"
            type="text"
            :disabled="disabled"
            placeholder="Goal"
            @keydown.enter.prevent="addGoal"
            @keydown.escape.prevent="showGoalAdd = false"
          />
          <button type="button" class="tmb-link-btn tmb-link-btn--strong" :disabled="disabled" @click="addGoal">Add</button>
          <button type="button" class="tmb-link-btn tmb-link-btn--muted" :disabled="disabled" @click="showGoalAdd = false">Cancel</button>
        </div>
        <ol v-if="goalDraftItems.length" class="tmb-item-list">
          <li
            v-for="(it, idx) in goalDraftItems"
            :key="`gl-${idx}`"
            class="tmb-item"
            :class="{ 'tmb-item--editing': editingGoalIdx === idx }"
          >
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <input
              v-if="editingGoalIdx === idx"
              class="tmb-input tmb-input--compact tmb-item-input"
              type="text"
              :value="editDraft"
              :disabled="disabled"
              @input="editDraft = $event.target.value"
              @keydown.enter.prevent="saveGoalEdit(idx)"
              @keydown.escape.prevent="cancelGoalEdit"
            />
            <span v-else class="tmb-item-text">{{ it.text || it }}</span>
            <div class="tmb-item-actions">
              <template v-if="editingGoalIdx === idx">
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="saveGoalEdit(idx)">Save</button>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="cancelGoalEdit">Cancel</button>
              </template>
              <template v-else>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="startGoalEdit(idx, it)">Edit</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveGoal(idx, -1)">↑</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= goalDraftItems.length - 1" title="Move down" @click="moveGoal(idx, 1)">↓</button>
                <button type="button" class="tmb-icon-btn tmb-icon-btn--danger" :disabled="disabled" title="Remove" @click="removeGoal(idx)">×</button>
              </template>
            </div>
          </li>
        </ol>
        <p v-else class="muted tmb-empty">No goals yet.</p>
      </div>

      <div v-if="showGoalsActionsDraft" class="tmb-side-section">
        <div class="tmb-side-head">
          <label class="tmb-label">Action items</label>
          <button type="button" class="tmb-link-btn" :disabled="disabled" @click="focusActionAdd">+ Add action</button>
        </div>
        <div v-if="showActionAdd" class="tmb-agenda-add tmb-agenda-add--stack">
          <input
            ref="actionAddRef"
            v-model="draftAction"
            class="tmb-input tmb-input--compact"
            type="text"
            :disabled="disabled"
            placeholder="Action item"
            @keydown.enter.prevent="addAction"
            @keydown.escape.prevent="showActionAdd = false"
          />
          <div class="tmb-action-add-row">
            <select
              v-if="assigneeOptions.length"
              v-model.number="draftActionAssigneeId"
              class="tmb-input tmb-input--compact tmb-assignee-select"
              :disabled="disabled"
              aria-label="Assign to"
            >
              <option :value="0">Unassigned</option>
              <option v-for="p in assigneeOptions" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
            <button type="button" class="tmb-link-btn tmb-link-btn--strong" :disabled="disabled" @click="addAction">Add</button>
            <button type="button" class="tmb-link-btn tmb-link-btn--muted" :disabled="disabled" @click="showActionAdd = false">Cancel</button>
          </div>
        </div>
        <ol v-if="actionDraftItems.length" class="tmb-item-list">
          <li
            v-for="(it, idx) in actionDraftItems"
            :key="`ac-${idx}`"
            class="tmb-item tmb-item--action"
            :class="{ 'tmb-item--editing': editingActionIdx === idx }"
          >
            <span class="tmb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <div class="tmb-item-col">
              <input
                v-if="editingActionIdx === idx"
                class="tmb-input tmb-input--compact tmb-item-input"
                type="text"
                :value="editDraft"
                :disabled="disabled"
                @input="editDraft = $event.target.value"
                @keydown.enter.prevent="saveActionEdit(idx)"
                @keydown.escape.prevent="cancelActionEdit"
              />
              <span v-else class="tmb-item-text">{{ it.text || it }}</span>
              <select
                v-if="editingActionIdx === idx && assigneeOptions.length"
                class="tmb-input tmb-input--compact tmb-assignee-select"
                :value="Number(editAssigneeId || 0)"
                :disabled="disabled"
                aria-label="Assign action item"
                @change="editAssigneeId = Number($event.target.value || 0)"
              >
                <option :value="0">Unassigned</option>
                <option v-for="p in assigneeOptions" :key="`a-edit-${idx}-${p.id}`" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <span
                v-else-if="editingActionIdx !== idx && Number(it.assigneeUserId || 0) > 0"
                class="tmb-assignee-chip"
              >
                {{ assigneeName(it.assigneeUserId) }}
              </span>
            </div>
            <div class="tmb-item-actions">
              <template v-if="editingActionIdx === idx">
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="saveActionEdit(idx)">Save</button>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="cancelActionEdit">Cancel</button>
              </template>
              <template v-else>
                <button type="button" class="tmb-text-btn" :disabled="disabled" @click="startActionEdit(idx, it)">Edit</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx === 0" title="Move up" @click="moveAction(idx, -1)">↑</button>
                <button type="button" class="tmb-icon-btn" :disabled="disabled || idx >= actionDraftItems.length - 1" title="Move down" @click="moveAction(idx, 1)">↓</button>
                <button type="button" class="tmb-icon-btn tmb-icon-btn--danger" :disabled="disabled" title="Remove" @click="removeAction(idx)">×</button>
              </template>
            </div>
          </li>
        </ol>
        <p v-else class="muted tmb-empty">No action items yet.</p>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  usePlatformVideo: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: true },
  createMeetLink: { type: Boolean, default: false },
  videoConfigured: { type: Boolean, default: false },
  /** When false, calendar/Google still sync but invite emails are suppressed. */
  notifyParticipants: { type: Boolean, default: true },
  showNotifyOption: { type: Boolean, default: true },
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
  'update:notifyParticipants',
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
const showAgendaAdd = ref(false);
const showGoalAdd = ref(false);
const showActionAdd = ref(false);
const editingAgendaIdx = ref(-1);
const editingGoalIdx = ref(-1);
const editingActionIdx = ref(-1);
const editDraft = ref('');
const editAssigneeId = ref(0);
const agendaAddRef = ref(null);
const goalAddRef = ref(null);
const actionAddRef = ref(null);

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

function clearEdits() {
  editingAgendaIdx.value = -1;
  editingGoalIdx.value = -1;
  editingActionIdx.value = -1;
  editDraft.value = '';
  editAssigneeId.value = 0;
}

function assigneeName(userId) {
  const id = Number(userId || 0);
  const p = (props.assigneeOptions || []).find((row) => Number(row?.id || 0) === id);
  return p?.name || `User ${id}`;
}

async function focusAgendaAdd() {
  clearEdits();
  showAgendaAdd.value = true;
  await nextTick();
  agendaAddRef.value?.focus?.();
}
async function focusGoalAdd() {
  clearEdits();
  showGoalAdd.value = true;
  await nextTick();
  goalAddRef.value?.focus?.();
}
async function focusActionAdd() {
  clearEdits();
  showActionAdd.value = true;
  await nextTick();
  actionAddRef.value?.focus?.();
}

function addAgenda() {
  const t = String(draftAgenda.value || '').trim();
  if (!t) return;
  const next = [...(props.agendaItems || []), { title: t }];
  emit('update:agendaItems', next);
  draftAgenda.value = '';
  showAgendaAdd.value = false;
}

function startAgendaEdit(idx, it) {
  clearEdits();
  editingAgendaIdx.value = idx;
  editDraft.value = String(it?.title || it || '');
}

function saveAgendaEdit(idx) {
  const nextText = String(editDraft.value || '').trim();
  if (!nextText) return;
  const next = [...(props.agendaItems || [])];
  const cur = next[idx];
  next[idx] = typeof cur === 'string' ? { title: nextText } : { ...cur, title: nextText };
  emit('update:agendaItems', next);
  cancelAgendaEdit();
}

function cancelAgendaEdit() {
  editingAgendaIdx.value = -1;
  editDraft.value = '';
}

function moveAgenda(idx, delta) {
  clearEdits();
  emit('update:agendaItems', moveInList(props.agendaItems, idx, delta));
}

function removeAgenda(idx) {
  clearEdits();
  const next = [...(props.agendaItems || [])];
  next.splice(idx, 1);
  emit('update:agendaItems', next);
}

function addGoal() {
  const t = String(draftGoal.value || '').trim();
  if (!t) return;
  const next = [...(props.goalDraftItems || []), { text: t, done: false }];
  emit('update:goalDraftItems', next);
  draftGoal.value = '';
  showGoalAdd.value = false;
}

function startGoalEdit(idx, it) {
  clearEdits();
  editingGoalIdx.value = idx;
  editDraft.value = String(it?.text || it || '');
}

function saveGoalEdit(idx) {
  const nextText = String(editDraft.value || '').trim();
  if (!nextText) return;
  const next = [...(props.goalDraftItems || [])];
  const cur = next[idx];
  next[idx] = typeof cur === 'string' ? { text: nextText, done: false } : { ...cur, text: nextText };
  emit('update:goalDraftItems', next);
  cancelGoalEdit();
}

function cancelGoalEdit() {
  editingGoalIdx.value = -1;
  editDraft.value = '';
}

function moveGoal(idx, delta) {
  clearEdits();
  emit('update:goalDraftItems', moveInList(props.goalDraftItems, idx, delta));
}

function removeGoal(idx) {
  clearEdits();
  const next = [...(props.goalDraftItems || [])];
  next.splice(idx, 1);
  emit('update:goalDraftItems', next);
}

function addAction() {
  const t = String(draftAction.value || '').trim();
  if (!t) return;
  const row = {
    text: t,
    done: false,
    assigneeUserId: Number(draftActionAssigneeId.value || 0) || 0
  };
  const next = [...(props.actionDraftItems || []), row];
  emit('update:actionDraftItems', next);
  draftAction.value = '';
  draftActionAssigneeId.value = 0;
  showActionAdd.value = false;
}

function startActionEdit(idx, it) {
  clearEdits();
  editingActionIdx.value = idx;
  editDraft.value = String(it?.text || it || '');
  editAssigneeId.value = Number(it?.assigneeUserId || 0) || 0;
}

function saveActionEdit(idx) {
  const nextText = String(editDraft.value || '').trim();
  if (!nextText) return;
  const next = [...(props.actionDraftItems || [])];
  const cur = next[idx] || {};
  next[idx] = {
    ...cur,
    text: nextText,
    done: !!cur.done,
    assigneeUserId: Number(editAssigneeId.value || 0) || 0
  };
  emit('update:actionDraftItems', next);
  cancelActionEdit();
}

function cancelActionEdit() {
  editingActionIdx.value = -1;
  editDraft.value = '';
  editAssigneeId.value = 0;
}

function moveAction(idx, delta) {
  clearEdits();
  emit('update:actionDraftItems', moveInList(props.actionDraftItems, idx, delta));
}

function removeAction(idx) {
  clearEdits();
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
  background: linear-gradient(180deg, #fafbfc 0%, #f4f6f8 100%);
  border: none;
  border-radius: 14px;
  padding: 14px 12px;
  max-height: min(70vh, 640px);
  overflow: auto;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.2);
}
.tmb-side-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}
.tmb-side-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.tmb-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tmb-side-head .tmb-label {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
}
.tmb-link-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
}
.tmb-link-btn:hover:not(:disabled) { color: #6d28d9; }
.tmb-link-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.tmb-link-btn--strong { font-weight: 700; }
.tmb-link-btn--muted { color: #94a3b8; font-weight: 500; }
.tmb-link-btn--muted:hover:not(:disabled) { color: #64748b; }
.tmb-empty {
  margin: 0;
  font-size: 0.82rem;
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
.tmb-input--compact {
  padding: 7px 10px;
  font-size: 0.84rem;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
}
.tmb-input--compact:focus {
  outline: none;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.22);
}
.tmb-agenda-add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tmb-agenda-add--stack { flex-direction: column; align-items: stretch; }
.tmb-action-add-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tmb-assignee-select { max-width: 100%; font-size: 0.82rem; }
.tmb-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tmb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  min-height: 30px;
}
.tmb-item:hover { background: #f8fafc; }
.tmb-item--editing { background: #f1f5f9; }
.tmb-item--action { align-items: flex-start; }
.tmb-item-num {
  flex: 0 0 auto;
  width: 1.1rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  text-align: right;
}
.tmb-item-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.tmb-item-text {
  flex: 1;
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 500;
  color: #0f172a;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tmb-item-input { flex: 1; min-width: 0; }
.tmb-assignee-chip {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
}
.tmb-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.tmb-item:hover .tmb-item-actions,
.tmb-item--editing .tmb-item-actions {
  opacity: 1;
}
.tmb-text-btn {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 4px;
}
.tmb-text-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #0f172a;
}
.tmb-icon-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  border-radius: 4px;
  width: auto;
  height: auto;
  padding: 2px 4px;
  line-height: 1;
  cursor: pointer;
  font-size: 0.78rem;
}
.tmb-icon-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #334155;
}
.tmb-icon-btn--danger:hover:not(:disabled) {
  background: #fee2e2;
  color: #b91c1c;
}
.tmb-icon-btn:disabled,
.tmb-text-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.btn-ghost {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
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
