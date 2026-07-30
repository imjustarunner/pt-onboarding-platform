<template>
  <div class="sgap" data-testid="supervision-goals-actions-panel">
    <p v-if="lockPosition === 'top'" class="sgap__lock muted">
      <span aria-hidden="true">🔒</span>
      All supervision data is encrypted and accessible only to you and your supervisee for training and development purposes.
    </p>
    <p v-if="!sessionId" class="muted sgap__hint">
      Save the session first, then you can add goals.
    </p>
    <p v-else-if="loading" class="muted">Loading goals…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-if="sessionId && !loading">
      <section v-if="section === 'goals' || section === 'both'" class="sgap__section">
        <div class="sgap__head">
          <h3>Goals for this session</h3>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addGoal">
            + Add goal
          </button>
        </div>
        <ul class="sgap__list">
          <li v-for="(g, idx) in goals" :key="g.id">
            <label class="sgap__check">
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
            <button type="button" class="sgap__icon" :disabled="disabled" title="Remove" @click="removeGoal(idx)">🗑</button>
          </li>
          <li v-if="!goals.length" class="sgap__empty muted">No goals yet. Add the first goal for this individual session.</li>
        </ul>
        <p class="sgap__foot muted">These appear in the live meeting workspace and My Supervision session details.</p>
      </section>

      <section v-if="section === 'actions' || section === 'both'" class="sgap__section">
        <div class="sgap__head">
          <h3>Action items for this session</h3>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addAction">
            + Add action item
          </button>
        </div>
        <ul class="sgap__list">
          <li v-for="(a, idx) in actionItems" :key="a.id">
            <label class="sgap__check">
              <input v-model="a.done" type="checkbox" :disabled="disabled" @change="queueSave" />
            </label>
            <input
              v-model="a.text"
              class="input"
              type="text"
              placeholder="Action item"
              :disabled="disabled"
              @input="queueSave"
            />
            <button type="button" class="sgap__icon" :disabled="disabled" title="Remove" @click="removeAction(idx)">🗑</button>
          </li>
          <li v-if="!actionItems.length" class="sgap__empty muted">No action items yet.</li>
        </ul>
      </section>

      <div v-if="saveStatus" class="sgap__status" :class="`sgap__status--${saveStatus}`" aria-live="polite">
        <span v-if="saveStatus === 'saving'">Saving…</span>
        <span v-else-if="saveStatus === 'saved'">Saved</span>
        <span v-else-if="saveStatus === 'error'">Couldn't save — try again</span>
      </div>

      <p v-if="lockPosition === 'bottom'" class="sgap__lock muted">
        <span aria-hidden="true">🔒</span>
        All supervision data is encrypted and accessible only to you and your supervisee for training and development purposes.
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false },
  /** 'goals' | 'actions' | 'both' — which section(s) to show */
  section: { type: String, default: 'both' },
  /** 'top' | 'bottom' — privacy notice placement */
  lockPosition: { type: String, default: 'top' }
});

const emit = defineEmits(['saved']);

const goals = ref([]);
const actionItems = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveStatus = ref('');
let saveTimer = null;
let flashTimer = null;

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, idx) => ({
    id: String(item?.id || uid(`item-${idx}`)),
    text: String(item?.text || '').trim(),
    done: !!item?.done
  })).filter((x) => x.text || true);
}

async function load() {
  const sid = Number(props.sessionId || 0);
  goals.value = [];
  actionItems.value = [];
  error.value = '';
  if (!sid) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/supervision/sessions/${sid}/artifacts`, { skipGlobalLoading: true });
    const artifact = data?.artifact || {};
    goals.value = normalizeList(artifact.goals || artifact.goals_json || []).filter((g) => g.text);
    actionItems.value = normalizeList(artifact.actionItems || artifact.action_items_json || []).filter((a) => a.text);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load goals / action items';
  } finally {
    loading.value = false;
  }
}

let pendingSave = false;

async function saveNow() {
  const sid = Number(props.sessionId || 0);
  if (!sid) return;
  if (saving.value) {
    pendingSave = true;
    return;
  }
  const cleanGoals = normalizeList(goals.value)
    .map((g) => ({ ...g, text: String(g.text || '').trim() }))
    .filter((g) => g.text);
  const cleanActions = normalizeList(actionItems.value)
    .map((a) => ({ ...a, text: String(a.text || '').trim() }))
    .filter((a) => a.text);
  const emptyGoalDrafts = goals.value.filter((g) => !String(g?.text || '').trim());
  const emptyActionDrafts = actionItems.value.filter((a) => !String(a?.text || '').trim());
  saving.value = true;
  pendingSave = false;
  saveStatus.value = 'saving';
  error.value = '';
  try {
    const body = { goals: cleanGoals };
    // Only touch action items when that section is visible — supervision planning no longer uses them.
    if (props.section === 'actions' || props.section === 'both') {
      body.actionItems = cleanActions;
    }
    await api.post(`/supervision/sessions/${sid}/artifacts`, body, { skipGlobalLoading: true });
    // Keep empty draft rows the user just added; never wipe in-progress inputs.
    if (!pendingSave) {
      goals.value = [...cleanGoals, ...emptyGoalDrafts];
      if (props.section === 'actions' || props.section === 'both') {
        actionItems.value = [...cleanActions, ...emptyActionDrafts];
      }
    }
    emit('saved', { goals: goals.value, actionItems: actionItems.value });
    saveStatus.value = 'saved';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { saveStatus.value = ''; }, 2000);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
    saveStatus.value = 'error';
  } finally {
    saving.value = false;
    if (pendingSave) {
      pendingSave = false;
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
  actionItems.value.push({ id: uid('a'), text: '', done: false });
}
function removeAction(idx) {
  actionItems.value.splice(idx, 1);
  queueSave();
}

watch(() => Number(props.sessionId || 0), () => { void load(); }, { immediate: true });
</script>

<style scoped>
.sgap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px 12px;
}
.sgap__lock {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.82rem;
  line-height: 1.4;
  margin: 0;
}
.sgap__hint { margin: 0; }
.sgap__section {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-secondary, #f8fafc);
}
.sgap__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sgap__head h3 {
  margin: 0;
  font-size: 0.95rem;
}
.sgap__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.sgap__list li {
  display: grid;
  grid-template-columns: 24px 1fr 28px;
  gap: 8px;
  align-items: center;
}
.sgap__check {
  display: grid;
  place-items: center;
}
.sgap__icon {
  border: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0.7;
}
.sgap__empty {
  grid-template-columns: 1fr !important;
  padding: 6px 2px;
}
.sgap__foot {
  margin: 10px 0 0;
  font-size: 0.78rem;
}
.sgap__status {
  font-size: 0.82rem;
  font-weight: 700;
  min-height: 1.1rem;
}
.sgap__status--saving { color: #64748b; }
.sgap__status--saved { color: #15803d; }
.sgap__status--error { color: #b91c1c; }
</style>
