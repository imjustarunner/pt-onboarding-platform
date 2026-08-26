<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal" role="dialog" aria-labelledby="na-demo-import-title">
      <header class="na-modal-head">
        <h3 id="na-demo-import-title">Import demographics</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>
      <p class="hint">
        Paste chart demographics. Values are encrypted at rest and never sent to AI note generation.
      </p>
      <label class="na-label">
        Paste demographics text
        <textarea v-model="pasteText" class="na-textarea" rows="10" placeholder="Legal Name&#10;…" />
      </label>
      <div class="na-modal-actions" style="justify-content: flex-start;">
        <button type="button" class="na-btn-outline" :disabled="parsing || !pasteText.trim()" @click="parse">
          {{ parsing ? 'Parsing…' : 'Parse into review' }}
        </button>
      </div>

      <template v-if="model">
        <label class="na-label">Legal name<input v-model="model.fullName" class="na-input" /></label>
        <label class="na-label">Date of birth<input v-model="model.dateOfBirth" type="date" class="na-input" /></label>
        <label class="na-label">Street<input v-model="model.addressStreet" class="na-input" /></label>
        <div class="row3">
          <label class="na-label">City<input v-model="model.addressCity" class="na-input" /></label>
          <label class="na-label">State<input v-model="model.addressState" class="na-input" /></label>
          <label class="na-label">ZIP<input v-model="model.addressZip" class="na-input" /></label>
        </div>
        <label class="na-label">Timezone<input v-model="model.timezone" class="na-input" /></label>
        <label class="na-label">Mobile phone<input v-model="model.contactPhone" class="na-input" /></label>
        <label class="na-check"><input v-model="model.textMessagesOk" type="checkbox" /> Text messages OK</label>
        <label class="na-label">Email<input v-model="model.email" class="na-input" /></label>
        <label class="na-label">Appointment reminder type<input v-model="model.appointmentReminderType" class="na-input" /></label>
        <label class="na-label">Administrative sex<input v-model="model.administrativeSex" class="na-input" /></label>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <button type="button" class="na-btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Confirm &amp; encrypt to chart' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  initialText: { type: String, default: '' }
});

const emit = defineEmits(['close', 'saved']);

const pasteText = ref('');
const model = ref(null);
const parsing = ref(false);
const saving = ref(false);
const error = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = String(props.initialText || '');
    model.value = null;
    error.value = '';
  }
);

async function parse() {
  parsing.value = true;
  error.value = '';
  try {
    const res = await api.post(
      `/clients/${props.clientId}/demographics/parse`,
      { text: pasteText.value },
      { skipGlobalLoading: true }
    );
    const p = res?.data?.parsed || {};
    model.value = reactive({
      fullName: p.fullName || '',
      dateOfBirth: p.dateOfBirth || '',
      addressStreet: p.addressStreet || '',
      addressCity: p.addressCity || '',
      addressState: p.addressState || '',
      addressZip: p.addressZip || '',
      timezone: p.timezone || '',
      contactPhone: p.contactPhone || '',
      textMessagesOk: p.textMessagesOk === true,
      email: p.email || '',
      appointmentReminderType: p.appointmentReminderType || '',
      administrativeSex: p.administrativeSex || ''
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Parse failed';
  } finally {
    parsing.value = false;
  }
}

async function save() {
  if (!model.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await api.post(
      `/clients/${props.clientId}/demographics/import`,
      { demographics: { ...model.value } },
      { skipGlobalLoading: true }
    );
    emit('saved', res?.data?.client || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 90;
  padding: 24px 16px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(520px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal-head { display: flex; justify-content: space-between; align-items: center; }
.na-modal-head h3 { margin: 0; }
.hint { color: #64748b; font-size: 0.85rem; margin: 8px 0 12px; }
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.row3 { display: grid; grid-template-columns: 1fr 70px 90px; gap: 8px; }
.na-check { display: flex; align-items: center; gap: 8px; margin: 8px 0 12px; font-size: 0.88rem; }
.na-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.na-btn-primary {
  border: none; background: #0f766e; color: #fff; border-radius: 10px;
  font-weight: 700; padding: 8px 14px; cursor: pointer;
}
.na-btn-outline {
  border: 1px solid #0f766e; background: #fff; color: #0d5f59; border-radius: 10px;
  font-weight: 700; padding: 8px 14px; cursor: pointer;
}
.na-link-btn { border: none; background: transparent; color: #0f766e; cursor: pointer; font-weight: 600; }
.error { color: #b91c1c; font-size: 0.85rem; }
</style>
