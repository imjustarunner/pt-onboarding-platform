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
        <div class="client">
          <label class="label-inline" :for="`slot-client-${idx}`">
            <span class="k">Client</span>
            <select :id="`slot-client-${idx}`" v-model="s.client_id" class="input">
              <option :value="null">Open slot</option>
              <option v-for="c in caseloadClients" :key="c.id" :value="Number(c.id)">
                {{ displayClient(c) }}
              </option>
            </select>
          </label>
        </div>

        <div class="time">
          <label class="label-inline" :for="`slot-start-${idx}`">
            <span class="k">Start</span>
            <input :id="`slot-start-${idx}`" v-model="s.start_time" type="time" class="input" />
          </label>
        </div>

        <div class="time">
          <label class="label-inline" :for="`slot-end-${idx}`">
            <span class="k">End</span>
            <input :id="`slot-end-${idx}`" v-model="s.end_time" type="time" class="input" />
          </label>
        </div>

        <div class="note">
          <label class="label-inline" :for="`slot-note-${idx}`">
            <span class="k">Note</span>
            <input
              :id="`slot-note-${idx}`"
              v-model="s.note"
              type="text"
              class="input"
              placeholder="Room / pickup note"
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
const emit = defineEmits(['save']);

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
  gap: 4px;
}
.row {
  display: grid;
  grid-template-columns: minmax(170px, 210px) 180px 180px 1fr;
  gap: 12px;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
}
.label-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  min-width: 0;
}
.label-inline .k {
  font-size: 11px;
  font-weight: 900;
  color: var(--text-secondary);
  flex: 0 0 auto;
}
.input {
  width: 100%;
  margin-top: 0;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  color: var(--text-primary);
}
.client,
.time,
.note {
  min-width: 0;
}
.note .input {
  max-width: 720px;
}
.error {
  color: #c33;
  margin-bottom: 10px;
}
@media (max-width: 1050px) {
  .row {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
  }
  .client,
  .time,
  .note {
    grid-column: 1;
  }
}
</style>

