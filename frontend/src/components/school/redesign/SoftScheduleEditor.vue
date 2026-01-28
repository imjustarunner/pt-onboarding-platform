<template>
  <div class="editor">
    <div class="header">
      <div>
        <div class="title">Soft schedule</div>
        <div class="subtitle">Order, times, and pickup/location notes (no PHI).</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="rows">
      <div v-for="(s, idx) in draftSlots" :key="slotKey(s, idx)" class="row">
        <div class="order">
          <button class="btn btn-secondary btn-sm" type="button" @click="move(idx, 'up')" :disabled="idx === 0 || saving">↑</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="move(idx, 'down')" :disabled="idx === draftSlots.length - 1 || saving">↓</button>
        </div>

        <div class="client">
          <label>
            Client
            <select v-model="s.client_id" class="input">
              <option :value="null">Open slot</option>
              <option v-for="c in caseloadClients" :key="c.id" :value="Number(c.id)">
                {{ displayClient(c) }}
              </option>
            </select>
          </label>
        </div>

        <div class="time">
          <label>
            Start
            <input v-model="s.start_time" type="time" class="input" />
          </label>
        </div>

        <div class="time">
          <label>
            End
            <input v-model="s.end_time" type="time" class="input" />
          </label>
        </div>

        <div class="note">
          <label>
            Note
            <input
              v-model="s.note"
              type="text"
              class="input"
              placeholder="Ms. Campbell Room 3 | 3rd grade hall"
            />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  slots: { type: Array, default: () => [] },
  caseloadClients: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  // 'codes' | 'initials'
  clientLabelMode: { type: String, default: 'codes' }
});
const emit = defineEmits(['save', 'move']);

const draftSlots = ref([]);

const normalize = (s) => ({
  id: s?.id || null,
  client_id: s?.client_id === undefined || s?.client_id === null || s?.client_id === '' ? null : Number(s.client_id),
  start_time: s?.start_time ? String(s.start_time).slice(0, 5) : '',
  end_time: s?.end_time ? String(s.end_time).slice(0, 5) : '',
  note: s?.note ? String(s.note) : ''
});

watch(
  () => props.slots,
  (next) => {
    draftSlots.value = (Array.isArray(next) ? next : []).map(normalize);
  },
  { immediate: true }
);

const slotKey = (s, idx) => String(s?.id || `draft-${idx}`);

const displayClient = (c) => {
  const mode = String(props.clientLabelMode || 'codes');
  const src = mode === 'initials' ? (c?.initials || c?.identifier_code) : (c?.identifier_code || c?.initials);
  const raw = String(src || '').replace(/\s+/g, '').toUpperCase();
  if (!raw) return `Client ${c?.id || ''}`.trim();
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const save = () => {
  const out = draftSlots.value.map((s) => ({
    id: s.id || null,
    client_id: s.client_id === null ? null : Number(s.client_id),
    start_time: s.start_time ? String(s.start_time) : null,
    end_time: s.end_time ? String(s.end_time) : null,
    note: s.note ? String(s.note) : null
  }));
  emit('save', out);
};

const move = (idx, direction) => {
  const slot = draftSlots.value[idx];
  if (slot?.id) {
    emit('move', { slotId: slot.id, direction });
    return;
  }
  const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= draftSlots.value.length) return;
  const copy = draftSlots.value.slice();
  const tmp = copy[idx];
  copy[idx] = copy[nextIdx];
  copy[nextIdx] = tmp;
  draftSlots.value = copy;
  save();
};
</script>

<style scoped>
.editor {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 10px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.title {
  font-weight: 900;
  color: var(--text-primary);
}
.subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.rows {
  display: grid;
  gap: 8px;
}
.row {
  display: grid;
  grid-template-columns: 70px 1.2fr 120px 120px 1.8fr;
  gap: 8px;
  align-items: end;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}
.order {
  display: flex;
  gap: 6px;
}
label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
}
.input {
  width: 100%;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  color: var(--text-primary);
}
.error {
  color: #c33;
  margin-bottom: 10px;
}
@media (max-width: 1050px) {
  .row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>

