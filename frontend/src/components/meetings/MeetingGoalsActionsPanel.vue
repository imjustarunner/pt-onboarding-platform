<template>
  <div class="mgap" data-testid="meeting-goals-actions-panel">
    <p v-if="!eventId" class="muted mgap__hint">
      Save the meeting first, then you can add goals and action items.
    </p>
    <p v-else-if="loading && !hasLoaded" class="muted">Loading goals and action items…</p>
    <p v-else-if="error && !hasLoaded" class="error">{{ error }}</p>

    <template v-if="eventId && (hasLoaded || !loading)">
      <section v-if="section === 'goals' || section === 'both'" class="mgap__section">
        <div class="mgap__head">
          <h3>Goals for this meeting</h3>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addGoal">
            + Add goal
          </button>
        </div>
        <ul class="mgap__list">
          <li v-for="(g, idx) in goals" :key="g.id">
            <label class="mgap__check">
              <input v-model="g.done" type="checkbox" :disabled="disabled" @change="queueSave" />
            </label>
            <input
              v-model="g.text"
              class="input"
              type="text"
              placeholder="Goal"
              :disabled="disabled"
              @input="queueSave"
            />
            <button type="button" class="mgap__icon" :disabled="disabled" title="Remove" @click="removeGoal(idx)">🗑</button>
          </li>
          <li v-if="!goals.length" class="mgap__empty muted">No goals yet.</li>
        </ul>
      </section>

      <section v-if="section === 'actions' || section === 'both'" class="mgap__section">
        <div class="mgap__head">
          <h3>Action items</h3>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addAction">
            + Add action item
          </button>
        </div>
        <ul class="mgap__list mgap__list--actions">
          <li v-for="(a, idx) in actionItems" :key="a.id" class="mgap__action-row">
            <label class="mgap__check">
              <input v-model="a.done" type="checkbox" :disabled="disabled" @change="queueSave" />
            </label>
            <div class="mgap__action-body">
              <input
                v-model="a.text"
                class="input"
                type="text"
                placeholder="Action item"
                :disabled="disabled"
                @input="queueSave"
              />
              <div class="mgap__action-meta">
                <label v-if="allowAssignee" class="mgap__assignee">
                  <span>Assign</span>
                  <select
                    v-model.number="a.assigneeUserId"
                    class="input"
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
            </div>
            <button type="button" class="mgap__icon" :disabled="disabled" title="Remove" @click="removeAction(idx)">🗑</button>
          </li>
          <li v-if="!actionItems.length" class="mgap__empty muted">No action items yet.</li>
        </ul>
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
const allowAssignee = computed(() => (participants.value || []).length > 1);

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  // Same meeting already loaded — do not wipe the form (tab switches / parent re-renders).
  if (eid === loadedEventId && hasLoaded.value) return;

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
  if (!eid) return;
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
    // Keep local rows as source of truth so typing/focus is never reset by the save response.
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

function addGoal() {
  goals.value.push({ id: uid('g'), text: '', done: false });
}
function removeGoal(idx) {
  goals.value.splice(idx, 1);
  queueSave();
}
function addAction() {
  actionItems.value.push({
    id: uid('a'),
    text: '',
    done: false,
    assigneeUserId: 0,
    isEscalation: false,
    escalationTicketId: null
  });
}
function removeAction(idx) {
  actionItems.value.splice(idx, 1);
  queueSave();
}

function onEscalationToggle(item, evt) {
  const checked = !!evt?.target?.checked;
  if (!checked) {
    // Keep linked escalations; unchecking only allowed before ticket exists.
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
    // Persist text first so the item exists server-side.
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
  }
  void load();
}, { immediate: true });
</script>

<style scoped>
.mgap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px 12px;
}
.mgap__hint { margin: 0; }
.mgap__section {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.65);
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
  font-size: 0.95rem;
}
.mgap__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mgap__list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.mgap__check {
  display: inline-flex;
  align-items: center;
  padding-top: 8px;
}
.mgap__action-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mgap__action-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.mgap__assignee {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}
.mgap__assignee select {
  min-width: 140px;
  font-size: 12px;
  padding: 4px 8px;
}
.mgap__esc-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}
.mgap__esc-chip {
  font-size: 11px;
  font-weight: 800;
  color: #92400e;
  background: #fef3c7;
  border-radius: 999px;
  padding: 2px 8px;
}
.mgap__icon {
  border: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0.7;
  padding: 6px 4px;
}
.mgap__empty { font-size: 13px; }
.mgap__status {
  font-size: 12px;
  font-weight: 700;
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
