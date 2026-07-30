<template>
  <div class="supb" data-testid="supervision-body">
    <div class="supb-main">
      <div v-if="showControls" class="supb-card">
        <div v-if="sessionTypeLabel" class="supb-row">
          <label class="supb-label">Session type</label>
          <div class="supb-value">{{ sessionTypeLabel }}</div>
        </div>

        <div v-if="canBookGroup" class="supb-row supb-switch-row">
          <div class="supb-switch-copy">
            <span class="supb-switch-title">Group supervision</span>
            <p class="supb-hint muted">
              Off = your assigned supervisees only (individual or triadic).
              On = agency-wide roster, practice groups, facilitator, and optional co-facilitator.
            </p>
          </div>
          <label class="supb-switch" :class="{ disabled: disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="groupMode"
              :disabled="disabled"
              :aria-checked="String(!!groupMode)"
              @change="emit('update:groupMode', !!$event.target.checked)"
            />
            <span class="supb-switch-slider" aria-hidden="true"></span>
          </label>
        </div>

        <div v-if="groupMode && canBookGroup" class="supb-row supb-switch-row">
          <div class="supb-switch-copy">
            <span class="supb-switch-title">Agency signup session</span>
            <p class="supb-hint muted">
              Open to everyone in the agency. Appears on all schedules with a signup countdown.
              Signup closes 1 hour before start; cancels automatically if no one signs up.
            </p>
          </div>
          <label class="supb-switch" :class="{ disabled: disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="signupOnly"
              :disabled="disabled"
              :aria-checked="String(!!signupOnly)"
              @change="emit('update:signupOnly', !!$event.target.checked)"
            />
            <span class="supb-switch-slider supb-switch-slider--signup" aria-hidden="true"></span>
          </label>
        </div>

        <div class="supb-row supb-switch-row">
          <div class="supb-switch-copy">
            <span class="supb-switch-title">Virtual</span>
            <p class="supb-hint muted">Schedule as a virtual supervision session with video / Meet link support.</p>
          </div>
          <label class="supb-switch" :class="{ disabled: disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="isVirtual"
              :disabled="disabled"
              :aria-checked="String(!!isVirtual)"
              @change="emit('update:isVirtual', !!$event.target.checked)"
            />
            <span class="supb-switch-slider" aria-hidden="true"></span>
          </label>
        </div>

        <div v-if="isVirtual" class="supb-row supb-switch-row">
          <div class="supb-switch-copy">
            <span class="supb-switch-title">Waiting room</span>
            <p class="supb-hint muted">
              On by default. Participants wait until the host admits them. Hosts always enter the main room.
            </p>
          </div>
          <label class="supb-switch" :class="{ disabled: disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="waitingRoomEnabled"
              :disabled="disabled"
              :aria-checked="String(!!waitingRoomEnabled)"
              @change="emit('update:waitingRoomEnabled', !!$event.target.checked)"
            />
            <span class="supb-switch-slider" aria-hidden="true"></span>
          </label>
        </div>

        <div v-if="showNotifyOption" class="supb-row supb-switch-row">
          <div class="supb-switch-copy">
            <span class="supb-switch-title">Email invites &amp; reminders</span>
            <p class="supb-hint muted">
              Send calendar invite emails, in-app schedule emails, and the automatic join reminder (~5 min before).
              Turn off to add silently with no reminder emails.
            </p>
          </div>
          <label class="supb-switch" :class="{ disabled: disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="notifyParticipants"
              :disabled="disabled"
              :aria-checked="String(!!notifyParticipants)"
              @change="emit('update:notifyParticipants', !!$event.target.checked)"
            />
            <span class="supb-switch-slider" aria-hidden="true"></span>
          </label>
        </div>
      </div>

      <template v-if="showDetails">
        <template v-if="groupMode && canBookGroup">
          <div class="supb-row">
            <label class="supb-label">Facilitator</label>
            <select
              class="supb-select"
              :value="facilitatorUserId || 0"
              :disabled="disabled || !facilitatorOptions.length"
              @change="emit('update:facilitatorUserId', Number($event.target.value || 0))"
            >
              <option :value="0">Select facilitator…</option>
              <option v-for="opt in facilitatorOptions" :key="`fac-${opt.id}`" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <p class="supb-hint muted">Group supervisor who facilitates this session (must have group supervision privileges, or be admin/CPA/support).</p>
          </div>

          <div class="supb-row">
            <label class="supb-label">Co-facilitator <span class="supb-optional">optional</span></label>
            <select
              class="supb-select"
              :value="coFacilitatorUserId || 0"
              :disabled="disabled || !coFacilitatorOptions.length"
              @change="emit('update:coFacilitatorUserId', Number($event.target.value || 0))"
            >
              <option :value="0">None</option>
              <option v-for="opt in coFacilitatorOptions" :key="`cofac-${opt.id}`" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <p v-if="signupOnly" class="supb-hint muted">
            Agency signup — open to everyone in the agency. No named supervisees; people sign up from their schedule.
          </p>

          <div v-if="!signupOnly" class="supb-row">
            <label class="supb-label">Open join (in addition to named invites)</label>
            <div class="supb-scope-options">
              <label class="supb-check">
                <input
                  type="checkbox"
                  :checked="inviteAudienceAllSupervised"
                  :disabled="disabled"
                  @change="emit('update:inviteAudienceAllSupervised', !!$event.target.checked)"
                />
                <span>Everyone being supervised in this agency</span>
              </label>
              <label class="supb-check">
                <input
                  type="checkbox"
                  :checked="inviteAudienceGroupSupport"
                  :disabled="disabled"
                  @change="emit('update:inviteAudienceGroupSupport', !!$event.target.checked)"
                />
                <span>Everyone who needs group supervision hours</span>
              </label>
            </div>
          </div>

        </template>

        <div v-if="presenterOptions.length && groupMode && !signupOnly" class="supb-row">
          <label class="supb-label">Presenter(s) <span class="supb-optional">optional</span></label>
          <div class="supb-presenter-picker" role="group" aria-label="Select presenters from invited participants">
            <label
              v-for="opt in presenterOptions"
              :key="`supb-presenter-${opt.id}`"
              class="supb-presenter-option"
              :class="{
                on: presenterIdSet.has(opt.id),
                disabled: disabled || (!presenterIdSet.has(opt.id) && presenterIdSet.size >= 2)
              }"
            >
              <input
                type="checkbox"
                :checked="presenterIdSet.has(opt.id)"
                :disabled="disabled || (!presenterIdSet.has(opt.id) && presenterIdSet.size >= 2)"
                @change="togglePresenter(opt.id, !!$event.target.checked)"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
          <p class="supb-hint muted">
            Choose who is presenting from the invited list (up to 2). Leave unchecked if nobody is presenting —
            invited participants are not presenters unless selected here.
          </p>
        </div>

        <p class="supb-hint muted">
          After booking, use the <strong>Note</strong> tab for short notes, transcript, and summary,
          and the <strong>Participants</strong> / <strong>Supervisee</strong> tab for hour progress.
        </p>
      </template>
    </div>

    <aside v-if="showWorkspaceSide" class="supb-side" aria-label="Agenda, goals, and action items">
      <div v-if="showAgendaDraft" class="supb-side-section">
        <div class="supb-side-head">
          <label class="supb-label">Agenda</label>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showAgendaAdd = true">+ Add item</button>
        </div>
        <div v-if="showAgendaAdd" class="supb-draft-add">
          <input
            v-model="draftAgenda"
            class="supb-input"
            type="text"
            :disabled="disabled"
            placeholder="Agenda item"
            @keydown.enter.prevent="addAgenda"
            @keydown.escape.prevent="showAgendaAdd = false"
          />
          <button type="button" class="supb-link-btn supb-link-btn--strong" :disabled="disabled" @click="addAgenda">Add</button>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showAgendaAdd = false">Cancel</button>
        </div>
        <ol v-if="agendaItems.length" class="supb-item-list">
          <li v-for="(it, idx) in agendaItems" :key="`ag-${idx}`" class="supb-item">
            <span class="supb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="supb-item-text">{{ it.title || it }}</span>
            <button type="button" class="supb-icon-btn" :disabled="disabled" title="Remove" @click="removeAgenda(idx)">×</button>
          </li>
        </ol>
        <p v-else class="muted supb-empty">No agenda items yet.</p>
      </div>

      <div v-if="showGoalsActionsDraft" class="supb-side-section">
        <div class="supb-side-head">
          <label class="supb-label">Goals</label>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showGoalAdd = true">+ Add goal</button>
        </div>
        <div v-if="showGoalAdd" class="supb-draft-add">
          <input
            v-model="draftGoal"
            class="supb-input"
            type="text"
            :disabled="disabled"
            placeholder="Goal"
            @keydown.enter.prevent="addGoal"
            @keydown.escape.prevent="showGoalAdd = false"
          />
          <button type="button" class="supb-link-btn supb-link-btn--strong" :disabled="disabled" @click="addGoal">Add</button>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showGoalAdd = false">Cancel</button>
        </div>
        <ol v-if="goalDraftItems.length" class="supb-item-list">
          <li v-for="(it, idx) in goalDraftItems" :key="`gl-${idx}`" class="supb-item">
            <span class="supb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="supb-item-text">{{ it.text || it }}</span>
            <button type="button" class="supb-icon-btn" :disabled="disabled" title="Remove" @click="removeGoal(idx)">×</button>
          </li>
        </ol>
        <p v-else class="muted supb-empty">No goals yet.</p>
      </div>

      <div v-if="showGoalsActionsDraft && showActionDraft" class="supb-side-section">
        <div class="supb-side-head">
          <label class="supb-label">Action items</label>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showActionAdd = true">+ Add action</button>
        </div>
        <div v-if="showActionAdd" class="supb-draft-add">
          <input
            v-model="draftAction"
            class="supb-input"
            type="text"
            :disabled="disabled"
            placeholder="Action item"
            @keydown.enter.prevent="addAction"
            @keydown.escape.prevent="showActionAdd = false"
          />
          <button type="button" class="supb-link-btn supb-link-btn--strong" :disabled="disabled" @click="addAction">Add</button>
          <button type="button" class="supb-link-btn" :disabled="disabled" @click="showActionAdd = false">Cancel</button>
        </div>
        <ol v-if="actionDraftItems.length" class="supb-item-list">
          <li v-for="(it, idx) in actionDraftItems" :key="`ac-${idx}`" class="supb-item">
            <span class="supb-item-num" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="supb-item-text">{{ it.text || it }}</span>
            <button type="button" class="supb-icon-btn" :disabled="disabled" title="Remove" @click="removeAction(idx)">×</button>
          </li>
        </ol>
        <p v-else class="muted supb-empty">No action items yet.</p>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  isVirtual: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: true },
  /** When false: no calendar invite emails, in-app notify emails, or join reminder emails. */
  notifyParticipants: { type: Boolean, default: true },
  showNotifyOption: { type: Boolean, default: true },
  groupMode: { type: Boolean, default: false },
  signupOnly: { type: Boolean, default: false },
  canBookGroup: { type: Boolean, default: false },
  facilitatorUserId: { type: Number, default: 0 },
  coFacilitatorUserId: { type: Number, default: 0 },
  facilitatorOptions: { type: Array, default: () => [] },
  inviteAudienceAllSupervised: { type: Boolean, default: false },
  inviteAudienceGroupSupport: { type: Boolean, default: false },
  presenterIds: { type: Array, default: () => [] },
  presenterOptions: { type: Array, default: () => [] },
  sessionTypeLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** controls = session type + switches; details = facilitator/open join; all = everything */
  section: { type: String, default: 'all' },
  showAgendaDraft: { type: Boolean, default: false },
  showGoalsActionsDraft: { type: Boolean, default: false },
  /** Action items are not part of individual supervision planning. */
  showActionDraft: { type: Boolean, default: false },
  agendaItems: { type: Array, default: () => [] },
  goalDraftItems: { type: Array, default: () => [] },
  actionDraftItems: { type: Array, default: () => [] }
});

const emit = defineEmits([
  'update:isVirtual',
  'update:waitingRoomEnabled',
  'update:notifyParticipants',
  'update:groupMode',
  'update:signupOnly',
  'update:facilitatorUserId',
  'update:coFacilitatorUserId',
  'update:inviteAudienceAllSupervised',
  'update:inviteAudienceGroupSupport',
  'update:presenterIds',
  'update:agendaItems',
  'update:goalDraftItems',
  'update:actionDraftItems'
]);

const showControls = computed(() => props.section === 'all' || props.section === 'controls');
const showDetails = computed(() => props.section === 'all' || props.section === 'details');
const showWorkspaceSide = computed(() => !!(props.showAgendaDraft || props.showGoalsActionsDraft));

const showAgendaAdd = ref(false);
const showGoalAdd = ref(false);
const showActionAdd = ref(false);
const draftAgenda = ref('');
const draftGoal = ref('');
const draftAction = ref('');

const coFacilitatorOptions = computed(() => {
  const facId = Number(props.facilitatorUserId || 0);
  return (props.facilitatorOptions || []).filter((opt) => Number(opt?.id || 0) !== facId);
});

const presenterIdSet = computed(() => new Set(
  (props.presenterIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)
));

function togglePresenter(userId, checked) {
  const id = Number(userId || 0);
  if (!id) return;
  const next = new Set(presenterIdSet.value);
  if (checked) {
    if (next.size >= 2 && !next.has(id)) return;
    next.add(id);
  } else {
    next.delete(id);
  }
  emit('update:presenterIds', Array.from(next.values()).slice(0, 2));
}

function addAgenda() {
  const title = String(draftAgenda.value || '').trim();
  if (!title) return;
  emit('update:agendaItems', [...(props.agendaItems || []), { title }]);
  draftAgenda.value = '';
  showAgendaAdd.value = false;
}
function removeAgenda(idx) {
  const next = [...(props.agendaItems || [])];
  next.splice(idx, 1);
  emit('update:agendaItems', next);
}
function addGoal() {
  const text = String(draftGoal.value || '').trim();
  if (!text) return;
  emit('update:goalDraftItems', [...(props.goalDraftItems || []), { text, done: false }]);
  draftGoal.value = '';
  showGoalAdd.value = false;
}
function removeGoal(idx) {
  const next = [...(props.goalDraftItems || [])];
  next.splice(idx, 1);
  emit('update:goalDraftItems', next);
}
function addAction() {
  const text = String(draftAction.value || '').trim();
  if (!text) return;
  emit('update:actionDraftItems', [...(props.actionDraftItems || []), { text, done: false }]);
  draftAction.value = '';
  showActionAdd.value = false;
}
function removeAction(idx) {
  const next = [...(props.actionDraftItems || [])];
  next.splice(idx, 1);
  emit('update:actionDraftItems', next);
}
</script>

<style scoped>
.supb {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: 14px;
  align-items: start;
}
.supb:not(:has(.supb-side)) {
  grid-template-columns: 1fr;
}
.supb-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.supb-card {
  border: 1px solid #d7e3f0;
  border-radius: 12px;
  background: #eef4fa;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.supb-row { display: flex; flex-direction: column; gap: 6px; }
.supb-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.supb-value { font-size: 0.9rem; font-weight: 600; color: #0f172a; }
.supb-optional { font-weight: 500; text-transform: none; letter-spacing: 0; color: #94a3b8; }
.supb-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: #0f172a; }
.supb-scope-options { display: flex; flex-direction: column; gap: 6px; }
.supb-switch-row {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.supb-switch-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.supb-switch-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.supb-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}
.supb-switch.disabled { opacity: 0.55; cursor: not-allowed; }
.supb-switch input { opacity: 0; width: 0; height: 0; }
.supb-switch-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.2s;
}
.supb-switch input:checked + .supb-switch-slider { background: #7c3aed; }
.supb-switch input:checked + .supb-switch-slider--signup { background: #0d9488; }
.supb-switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
}
.supb-switch input:checked + .supb-switch-slider::before { transform: translateX(20px); }
.supb-select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.supb-hint { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.muted { color: #64748b; }
.supb-side {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.supb-side-section { display: flex; flex-direction: column; gap: 8px; }
.supb-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.supb-link-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.supb-link-btn--strong { color: #0f766e; }
.supb-link-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.supb-draft-add {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.supb-input {
  flex: 1 1 140px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 7px 9px;
  font: inherit;
}
.supb-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.supb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #f8fafc;
}
.supb-item-num {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.supb-item-text {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  color: #0f172a;
  word-break: break-word;
}
.supb-icon-btn {
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.supb-icon-btn:hover { color: #b91c1c; }
.supb-empty { margin: 0; font-size: 0.8rem; }
.supb-presenter-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
  max-height: 180px;
  overflow: auto;
}
.supb-presenter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #0f172a;
  cursor: pointer;
}
.supb-presenter-option:hover:not(.disabled) { background: #f1f5f9; }
.supb-presenter-option.on { background: #ecfdf5; color: #065f46; font-weight: 600; }
.supb-presenter-option.disabled { opacity: 0.45; cursor: not-allowed; }
.supb-presenter-option input { margin: 0; }
@media (max-width: 720px) {
  .supb { grid-template-columns: 1fr; }
}
</style>
