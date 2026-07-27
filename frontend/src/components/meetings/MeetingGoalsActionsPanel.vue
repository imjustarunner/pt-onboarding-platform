<template>
  <div
    class="mgap"
    :class="{ 'mgap--compact': compact, 'mgap--embedded': embedded }"
    data-testid="meeting-goals-actions-panel"
  >
    <p v-if="!eventId" class="muted mgap__hint">
      Save the meeting first, then you can add goals and action items.
    </p>
    <p v-else-if="loading && !hasLoaded" class="muted">Loading goals and action items…</p>
    <p v-else-if="error && !hasLoaded" class="error">{{ error }}</p>

    <template v-if="eventId && (hasLoaded || !loading)">
      <section v-if="section === 'goals' || section === 'both'" class="mgap__section">
        <div class="mgap__head">
          <h3>Goals</h3>
          <button type="button" class="mw-link-btn" :disabled="disabled" @click="addGoal">
            + Add goal
          </button>
        </div>
        <ol class="mgap__list">
          <li
            v-for="(g, idx) in goals"
            :key="g.id"
            :class="{ 'mgap__row--editing': editingGoalId === g.id }"
          >
            <span class="mgap__num" aria-hidden="true">{{ idx + 1 }}</span>
            <label class="mgap__check">
              <input v-model="g.done" type="checkbox" :disabled="disabled" @change="queueSave" />
            </label>
            <div class="mgap__body">
              <input
                v-if="!compact || editingGoalId === g.id"
                v-model="g.text"
                class="mw-field mgap__input"
                type="text"
                placeholder="Goal"
                :disabled="disabled"
                @input="queueSave"
                @keydown.enter.prevent="finishGoalEdit(g)"
                @keydown.escape.prevent="cancelGoalEdit"
              />
              <span v-else class="mgap__text" :class="{ 'mgap__text--done': g.done }">{{ g.text }}</span>
            </div>
            <div class="mgap__actions">
              <template v-if="compact && editingGoalId === g.id">
                <button type="button" class="mgap__action" @click="finishGoalEdit(g)">Save</button>
                <button type="button" class="mgap__action" @click="cancelGoalEdit">Cancel</button>
              </template>
              <template v-else>
                <button
                  v-if="compact"
                  type="button"
                  class="mgap__action"
                  :disabled="disabled"
                  @click="startGoalEdit(g)"
                >
                  Edit
                </button>
                <button type="button" class="mw-icon-btn" :disabled="disabled || idx === 0" title="Move up" aria-label="Move up" @click="moveGoal(idx, -1)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>
                </button>
                <button type="button" class="mw-icon-btn" :disabled="disabled || idx >= goals.length - 1" title="Move down" aria-label="Move down" @click="moveGoal(idx, 1)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <button type="button" class="mw-icon-btn mw-icon-btn--danger" :disabled="disabled" title="Remove" aria-label="Remove" @click="removeGoal(idx)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </template>
            </div>
          </li>
          <li v-if="!goals.length" class="mgap__empty muted">No goals yet.</li>
        </ol>
      </section>

      <section v-if="section === 'actions' || section === 'both'" class="mgap__section">
        <div class="mgap__head">
          <h3>Action items</h3>
          <button type="button" class="mw-link-btn" :disabled="disabled" @click="addAction">
            + Add action
          </button>
        </div>
        <ol class="mgap__list mgap__list--actions">
          <li
            v-for="(a, idx) in actionItems"
            :key="a.id"
            class="mgap__action-row"
            :class="{ 'mgap__row--editing': editingActionId === a.id }"
          >
            <span class="mgap__num" aria-hidden="true">{{ idx + 1 }}</span>
            <label class="mgap__check">
              <input v-model="a.done" type="checkbox" :disabled="disabled" @change="queueSave" />
            </label>
            <div class="mgap__action-body">
              <input
                v-if="!compact || editingActionId === a.id"
                v-model="a.text"
                class="mw-field mgap__input"
                type="text"
                placeholder="Action item"
                :disabled="disabled"
                @input="queueSave"
                @keydown.enter.prevent="finishActionEdit(a)"
                @keydown.escape.prevent="cancelActionEdit"
              />
              <span v-else class="mgap__text" :class="{ 'mgap__text--done': a.done }">{{ a.text }}</span>
              <div
                v-if="(!compact || editingActionId === a.id) && (allowAssignee || isAdminMeeting)"
                class="mgap__action-meta"
              >
                <label v-if="allowAssignee" class="mgap__assignee">
                  <span>Assign</span>
                  <select
                    v-model.number="a.assigneeUserId"
                    class="mw-field mgap__select"
                    :disabled="disabled"
                    @change="queueSave"
                  >
                    <option :value="0">Unassigned</option>
                    <option v-for="p in participants" :key="p.id" :value="p.id">
                      {{ p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || `User ${p.id}` }}
                    </option>
                  </select>
                </label>
                <label v-if="isAdminMeeting" class="mgap__esc-check">
                  <input
                    type="checkbox"
                    :checked="!!a.isEscalation"
                    :disabled="disabled || !!a.escalationTicketId"
                    @change="onEscalationToggle(a, $event)"
                  />
                  <span>Escalation</span>
                </label>
                <span v-if="a.escalationTicketId" class="mgap__esc-chip">
                  Escalation #{{ a.escalationTicketId }}
                </span>
              </div>
              <div v-else-if="compact && a.assigneeUserId" class="mgap__assignee-chip">
                {{ assigneeLabel(a.assigneeUserId) }}
              </div>
            </div>
            <div class="mgap__actions">
              <template v-if="compact && editingActionId === a.id">
                <button type="button" class="mgap__action" @click="finishActionEdit(a)">Save</button>
                <button type="button" class="mgap__action" @click="cancelActionEdit">Cancel</button>
              </template>
              <template v-else>
                <button
                  v-if="compact"
                  type="button"
                  class="mgap__action"
                  :disabled="disabled"
                  @click="startActionEdit(a)"
                >
                  Edit
                </button>
                <button type="button" class="mw-icon-btn" :disabled="disabled || idx === 0" title="Move up" aria-label="Move up" @click="moveAction(idx, -1)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>
                </button>
                <button type="button" class="mw-icon-btn" :disabled="disabled || idx >= actionItems.length - 1" title="Move down" aria-label="Move down" @click="moveAction(idx, 1)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <button type="button" class="mw-icon-btn mw-icon-btn--danger" :disabled="disabled" title="Remove" aria-label="Remove" @click="removeAction(idx)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </template>
            </div>
          </li>
          <li v-if="!actionItems.length" class="mgap__empty muted">No action items yet.</li>
        </ol>
      </section>

      <div v-if="saveStatus || error" class="mgap__status" :class="`mgap__status--${saveStatus || 'error'}`" aria-live="polite">
        <span v-if="saveStatus === 'saving'">Saving…</span>
        <span v-else-if="saveStatus === 'saved'">Saved</span>
        <span v-else-if="saveStatus === 'error' || error">{{ error || "Couldn't save — try again" }}</span>
      </div>
    </template>

    <div v-if="escalateItem" class="mgap-modal" role="dialog" aria-modal="true">
      <div class="mgap-modal__card">
        <h3>Create escalation</h3>
        <p class="muted">This creates a desk escalation tagged to this Admin Meeting.</p>
        <label class="lbl">Issue</label>
        <textarea v-model="escalateForm.issue" class="input" rows="3" />
        <label class="lbl">Root cause</label>
        <textarea v-model="escalateForm.rootCause" class="input" rows="2" />
        <label class="lbl">Recommended resolution</label>
        <textarea v-model="escalateForm.recommendedResolution" class="input" rows="3" />
        <label class="mgap__esc-check" style="margin-top: 8px;">
          <input v-model="escalateForm.immediateActionRequired" type="checkbox" />
          <span>Immediate action required</span>
        </label>
        <p v-if="escalateError" class="error">{{ escalateError }}</p>
        <div class="mgap-modal__actions">
          <button type="button" class="btn btn-secondary" :disabled="escalating" @click="closeEscalate">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="escalating" @click="submitEscalate">
            {{ escalating ? 'Creating…' : 'Create escalation' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false },
  section: { type: String, default: 'both' },
  /** Condensed view with Edit button per row */
  compact: { type: Boolean, default: true },
  /** Borderless sections for side rail */
  embedded: { type: Boolean, default: false },
  /** Force admin meeting UX even before workspace load */
  meetingSubtype: { type: String, default: '' },
  /** Preloaded participants; otherwise loaded from workspace */
  participants: { type: Array, default: () => [] }
});

const emit = defineEmits(['saved', 'escalated']);

const goals = ref([]);
const actionItems = ref([]);
const loadedParticipants = ref([]);
const loadedSubtype = ref('general');
const loading = ref(false);
const hasLoaded = ref(false);
const saving = ref(false);
const pendingSave = ref(false);
const error = ref('');
const saveStatus = ref('');
const editingGoalId = ref(null);
const editingActionId = ref(null);
let saveTimer = null;
let flashTimer = null;
let loadedEventId = 0;
let loadGeneration = 0;

const escalateItem = ref(null);
const escalateForm = ref({
  issue: '',
  rootCause: '',
  recommendedResolution: '',
  immediateActionRequired: false
});
const escalateError = ref('');
const escalating = ref(false);

const participants = computed(() => (
  (props.participants || []).length ? props.participants : loadedParticipants.value
));
const isAdminMeeting = computed(() => {
  const sub = String(props.meetingSubtype || loadedSubtype.value || 'general').toLowerCase();
  return sub === 'admin';
});
const allowAssignee = computed(() => (participants.value || []).length > 0);

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function assigneeLabel(userId) {
  const id = Number(userId || 0);
  const p = (participants.value || []).find((row) => Number(row?.id || 0) === id);
  if (!p) return `User ${id}`;
  return p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || `User ${id}`;
}

function normalizeGoals(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => ({
    id: String(item?.id || uid(`g-${idx}`)),
    text: String(item?.text || ''),
    done: !!item?.done
  }));
}

function normalizeActions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => ({
    id: String(item?.id || uid(`a-${idx}`)),
    text: String(item?.text || ''),
    done: !!item?.done,
    assigneeUserId: Number(item?.assigneeUserId || item?.assignee_user_id || 0) || 0,
    isEscalation: !!(item?.isEscalation || item?.escalationTicketId),
    escalationTicketId: Number(item?.escalationTicketId || item?.escalation_ticket_id || 0) || null
  }));
}

function startGoalEdit(goal) {
  editingGoalId.value = goal?.id || null;
  editingActionId.value = null;
}
function finishGoalEdit() {
  editingGoalId.value = null;
  queueSave();
}
function cancelGoalEdit() {
  editingGoalId.value = null;
  void load();
}

function startActionEdit(action) {
  editingActionId.value = action?.id || null;
  editingGoalId.value = null;
}
function finishActionEdit() {
  editingActionId.value = null;
  queueSave();
}
function cancelActionEdit() {
  editingActionId.value = null;
  void load();
}

async function load() {
  const eid = Number(props.eventId || 0);
  error.value = '';
  if (!eid) {
    goals.value = [];
    actionItems.value = [];
    hasLoaded.value = false;
    loadedEventId = 0;
    return;
  }
  if (eid === loadedEventId && hasLoaded.value && !editingGoalId.value && !editingActionId.value) return;

  const generation = ++loadGeneration;
  const isInitial = eid !== loadedEventId || !hasLoaded.value;
  if (isInitial) loading.value = true;
  try {
    const { data } = await api.get(`/team-meetings/${eid}/workspace`, { skipGlobalLoading: true });
    if (generation !== loadGeneration) return;
    loadedSubtype.value = String(data?.meetingSubtype || 'general').toLowerCase();
    loadedParticipants.value = Array.isArray(data?.participants) ? data.participants : [];
    const workspace = data?.workspace || {};
    goals.value = normalizeGoals(workspace.goals).filter((g) => String(g.text || '').trim());
    actionItems.value = normalizeActions(workspace.actionItems).filter((a) => String(a.text || '').trim());
    loadedEventId = eid;
    hasLoaded.value = true;
  } catch (e) {
    if (generation !== loadGeneration) return;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load goals / action items';
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function saveNow() {
  const eid = Number(props.eventId || 0);
  if (!eid || !hasLoaded.value || eid !== loadedEventId) return;
  if (saving.value) {
    pendingSave.value = true;
    return;
  }
  const payloadGoals = normalizeGoals(goals.value)
    .map((g) => ({ ...g, text: String(g.text || '').trim() }))
    .filter((g) => g.text);
  const payloadActions = normalizeActions(actionItems.value)
    .map((a) => ({
      ...a,
      text: String(a.text || '').trim(),
      assigneeUserId: a.assigneeUserId || null
    }))
    .filter((a) => a.text);

  saving.value = true;
  pendingSave.value = false;
  saveStatus.value = 'saving';
  error.value = '';
  try {
    await api.post(`/team-meetings/${eid}/workspace`, {
      goals: payloadGoals,
      actionItems: payloadActions
    }, { skipGlobalLoading: true });
    emit('saved', { goals: goals.value, actionItems: actionItems.value });
    saveStatus.value = 'saved';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { saveStatus.value = ''; }, 2000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
    saveStatus.value = 'error';
  } finally {
    saving.value = false;
    if (pendingSave.value) {
      pendingSave.value = false;
      queueSave();
    }
  }
}

function queueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveNow(); }, 900);
}

function moveInList(listRef, idx, delta) {
  const j = idx + delta;
  const list = listRef.value || [];
  if (j < 0 || j >= list.length) return;
  const tmp = list[idx];
  list[idx] = list[j];
  list[j] = tmp;
  queueSave();
}
function addGoal() {
  const row = { id: uid('g'), text: '', done: false };
  goals.value.push(row);
  if (props.compact) startGoalEdit(row);
}
function removeGoal(idx) {
  const row = goals.value[idx];
  goals.value.splice(idx, 1);
  if (editingGoalId.value === row?.id) editingGoalId.value = null;
  queueSave();
}
function moveGoal(idx, delta) {
  moveInList(goals, idx, delta);
}
function addAction() {
  const row = {
    id: uid('a'),
    text: '',
    done: false,
    assigneeUserId: 0,
    isEscalation: false,
    escalationTicketId: null
  };
  actionItems.value.push(row);
  if (props.compact) startActionEdit(row);
}
function moveAction(idx, delta) {
  moveInList(actionItems, idx, delta);
}
function removeAction(idx) {
  const row = actionItems.value[idx];
  actionItems.value.splice(idx, 1);
  if (editingActionId.value === row?.id) editingActionId.value = null;
  queueSave();
}

function onEscalationToggle(item, evt) {
  const checked = !!evt?.target?.checked;
  if (!checked) {
    item.isEscalation = !!item.escalationTicketId;
    evt.target.checked = !!item.escalationTicketId;
    return;
  }
  escalateItem.value = item;
  escalateForm.value = {
    issue: String(item.text || '').trim(),
    rootCause: '',
    recommendedResolution: '',
    immediateActionRequired: false
  };
  escalateError.value = '';
}

function closeEscalate() {
  escalateItem.value = null;
  escalateError.value = '';
}

async function submitEscalate() {
  const eid = Number(props.eventId || 0);
  const item = escalateItem.value;
  if (!eid || !item) return;
  escalating.value = true;
  escalateError.value = '';
  try {
    item.text = String(escalateForm.value.issue || item.text || '').trim();
    await saveNow();
    const { data } = await api.post(
      `/team-meetings/${eid}/action-items/${encodeURIComponent(item.id)}/escalate`,
      {
        issue: escalateForm.value.issue,
        rootCause: escalateForm.value.rootCause,
        recommendedResolution: escalateForm.value.recommendedResolution,
        immediateActionRequired: !!escalateForm.value.immediateActionRequired
      },
      { skipGlobalLoading: true }
    );
    const workspace = data?.workspace || {};
    const serverActions = normalizeActions(workspace.actionItems).filter((a) => String(a.text || '').trim());
    const drafts = actionItems.value.filter((a) => !String(a?.text || '').trim());
    actionItems.value = [...serverActions, ...drafts];
    emit('escalated', { ticketId: data?.escalationTicketId, workspace });
    closeEscalate();
  } catch (e) {
    escalateError.value = e?.response?.data?.error?.message || e?.message || 'Failed to create escalation';
  } finally {
    escalating.value = false;
  }
}

watch(() => Number(props.eventId || 0), (eid, prev) => {
  if (Number(eid || 0) !== Number(prev || 0)) {
    hasLoaded.value = false;
    loadedEventId = 0;
    editingGoalId.value = null;
    editingActionId.value = null;
  }
  void load();
}, { immediate: true });
</script>

<style scoped>
.mgap {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.mgap__hint { margin: 0; font-size: 0.82rem; color: #64748b; }
.mgap__section {
  padding: 0;
  background: transparent;
}
.mgap:not(.mgap--embedded) .mgap__section {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  padding: 14px;
  background: #fff;
  margin-bottom: 12px;
}
.mgap--embedded .mgap__section + .mgap__section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}
.mgap__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.mgap__head h3 {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.mw-link-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
}
.mw-link-btn:hover:not(:disabled) { color: #6d28d9; }
.mw-link-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mw-field {
  width: 100%;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  padding: 7px 10px;
  font: inherit;
  font-size: 0.84rem;
  color: #0f172a;
  outline: none;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.mw-field:focus {
  background: #fff;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.22);
}
.mgap__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mgap__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 8px;
  min-height: 34px;
  transition: background 0.12s ease;
}
.mgap__list li:hover {
  background: rgba(148, 163, 184, 0.1);
}
.mgap__row--editing {
  background: rgba(124, 58, 237, 0.06);
}
.mgap__num {
  flex: 0 0 auto;
  width: 1.1rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  text-align: right;
}
.mgap__check {
  display: inline-flex;
  align-items: center;
}
.mgap__check input {
  width: 15px;
  height: 15px;
  accent-color: #7c3aed;
  cursor: pointer;
}
.mgap__body,
.mgap__action-body {
  flex: 1;
  min-width: 0;
}
.mgap__action-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mgap__input,
.mgap__select {
  font-size: 0.84rem;
}
.mgap__select {
  min-width: 0;
  max-width: 100%;
}
.mgap__text {
  display: block;
  font-size: 0.86rem;
  font-weight: 500;
  color: #1e293b;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mgap__text--done {
  text-decoration: line-through;
  color: #94a3b8;
}
.mgap__action-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.mgap__assignee {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
}
.mgap__assignee-chip {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 600;
}
.mgap__esc-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
}
.mgap__esc-chip {
  font-size: 0.68rem;
  font-weight: 700;
  color: #92400e;
  background: rgba(251, 191, 36, 0.2);
  border-radius: 999px;
  padding: 2px 8px;
}
.mgap__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.mgap__list li:hover .mgap__actions,
.mgap__row--editing .mgap__actions {
  opacity: 1;
}
.mgap__action {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 8px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
}
.mgap__action:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.16);
  color: #0f172a;
}
.mw-icon-btn {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  line-height: 0;
  color: #94a3b8;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mw-icon-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}
.mw-icon-btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}
.mw-icon-btn:disabled,
.mgap__action:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.mgap__empty { font-size: 0.82rem; color: #64748b; }
.mgap__status {
  font-size: 0.72rem;
  font-weight: 600;
  margin-top: 6px;
}
.mgap__status--saving { color: #64748b; }
.mgap__status--saved { color: #047857; }
.mgap__status--error { color: #b91c1c; }
.mgap-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10050;
  padding: 16px;
}
.mgap-modal__card {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}
.mgap-modal__card h3 { margin: 0; }
.mgap-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.lbl {
  font-size: 12px;
  font-weight: 800;
  margin-top: 4px;
}
.error { color: #b91c1c; font-size: 13px; }
</style>
