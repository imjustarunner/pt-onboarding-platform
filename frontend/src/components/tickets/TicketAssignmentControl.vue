<template>
  <div class="ticket-assignment-control">
    <button
      ref="trigger"
      type="button"
      class="btn btn-secondary btn-sm"
      :aria-expanded="open"
      :disabled="saving"
      @click="toggleOptions"
    >{{ ownerId ? 'Reassign ticket' : 'Assign ticket' }}</button>
    <div v-if="open" class="assignment-options">
      <p v-if="loading" role="status">Loading eligible team members…</p>
      <p v-else-if="!candidates.length && !error">No other eligible team members.</p>
      <template v-else-if="candidates.length">
        <button
          v-if="ownerId && self"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="saving"
          @click="assign(self)"
        >Take over</button>
        <label>
          Assign to
          <select v-model="targetId" :disabled="saving">
            <option :value="null">Select a team member</option>
            <option v-for="person in candidates" :key="person.id" :value="person.id">{{ fullName(person) }}</option>
          </select>
        </label>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!targetId || saving" @click="assign(candidates.find(person => person.id === targetId))">
          {{ saving ? 'Saving…' : 'Confirm assignment' }}
        </button>
      </template>
      <p v-if="error" class="assignment-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  ticketId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  ownerId: { type: [Number, String], default: null },
  ownerName: { type: String, default: '' },
  viewerId: { type: [Number, String], default: null }
});
const emit = defineEmits(['updated', 'refresh']);
const trigger = ref(null);
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const users = ref([]);
const targetId = ref(null);
const candidates = computed(() => users.value.filter(person => Number(person.id) !== Number(props.ownerId)));
const self = computed(() => candidates.value.find(person => Number(person.id) === Number(props.viewerId)));
let request = 0;

function fullName(person) {
  return [person.first_name, person.last_name].filter(Boolean).join(' ') || `User #${person.id}`;
}

watch(() => [props.ticketId, props.agencyId, props.ownerId], () => {
  request += 1;
  open.value = loading.value = saving.value = false;
  error.value = '';
  targetId.value = null;
  users.value = [];
});

async function toggleOptions() {
  open.value = !open.value;
  const id = ++request;
  if (!open.value) return;
  loading.value = true;
  error.value = '';
  targetId.value = null;
  users.value = [];
  try {
    const { data } = await api.get('/support-tickets/assignees', {
      params: { agencyId: props.agencyId, ticketId: props.ticketId },
      skipGlobalLoading: true
    });
    if (id === request) users.value = data.users || [];
  } catch (e) {
    if (id === request) error.value = e?.response?.data?.error?.message || 'Could not load team members. Close and reopen to retry.';
  } finally {
    if (id === request) loading.value = false;
  }
}

function showOptions() {
  trigger.value?.scrollIntoView?.({ block: 'nearest' });
  trigger.value?.focus({ preventScroll: true });
  if (!open.value) void toggleOptions();
}
defineExpose({ showOptions });

async function assign(person) {
  if (!person || saving.value) return;
  const ticketId = props.ticketId;
  const previousOwnerId = Number(props.ownerId) || null;
  const previousOwner = props.ownerName || `User #${previousOwnerId}`;
  const newOwner = Number(person.id) === Number(props.viewerId) ? 'yourself' : fullName(person);
  const prompt = previousOwnerId
    ? `Reassign ticket #${ticketId} from ${previousOwner} to ${newOwner}?`
    : `Assign ticket #${ticketId} to ${newOwner}?`;
  if (!window.confirm(prompt)) return;

  const id = request;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/support-tickets/${ticketId}/assign`, {
      assigneeUserId: Number(person.id),
      expectedAssigneeUserId: previousOwnerId
    }, { skipGlobalLoading: true });
    if (id === request) {
      open.value = false;
      emit('updated', data);
    }
  } catch (e) {
    if (id !== request) return;
    error.value = e?.response?.data?.error?.message || 'Could not change the ticket assignment.';
    if (e?.response?.status === 409) emit('refresh');
  } finally {
    if (id === request) saving.value = false;
  }
}
</script>

<style scoped>
.ticket-assignment-control { position: relative; }
.assignment-options {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 10;
  display: grid; gap: 8px; width: min(270px, 75vw); padding: 12px;
  border: 1px solid var(--border, #cbd5e1); border-radius: 10px;
  color: var(--text-primary, #172b4d); background: var(--bg-card, #fff);
  box-shadow: 0 6px 20px rgb(15 23 42 / 14%);
}
.assignment-options label { display: grid; gap: 4px; }
.assignment-options p { margin: 0; font-size: .85rem; }
.assignment-error { color: var(--error, #b91c1c); }
@media (max-width: 600px) {
  .assignment-options { position: fixed; top: 30%; right: 50%; transform: translateX(50%); }
}
</style>
