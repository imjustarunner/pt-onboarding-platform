<template>
  <div class="guardian-contact-editor">
    <button v-if="!editing" type="button" class="btn btn-secondary btn-sm" @click="startEditing">
      {{ hasContact ? 'Edit guardian contact' : 'Add guardian contact' }}
    </button>
    <form v-else @submit.prevent="save">
      <p class="hint">Enter the parent or guardian’s contact information from the packet. Email and date of birth are optional.</p>
      <div class="contact-fields">
        <label>First name<input v-model="form.firstName" maxlength="150" autocomplete="off" /></label>
        <label>Last name<input v-model="form.lastName" maxlength="150" autocomplete="off" /></label>
        <label>Email<input v-model="form.email" type="email" maxlength="254" autocomplete="off" /></label>
        <label>Phone<input v-model="form.phone" type="tel" maxlength="60" autocomplete="off" /></label>
        <label>Relationship<input v-model="form.relationship" maxlength="100" placeholder="e.g., Parent" /></label>
        <label>Guardian date of birth<input v-model="form.dateOfBirth" type="date" /></label>
      </div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <div class="contact-actions">
        <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">{{ saving ? 'Saving…' : 'Save guardian contact' }}</button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="editing = false">Cancel</button>
      </div>
    </form>
    <p v-if="saved" role="status">Guardian contact saved.</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ clientId: { type: Number, required: true }, profile: { type: Object, default: null } });
const emit = defineEmits(['saved']);
const editing = ref(false);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const form = ref({});
let generation = 0;
const hasContact = computed(() => !!(props.profile?.fullName || props.profile?.firstName || props.profile?.email || props.profile?.phone));
watch(() => props.clientId, () => { generation++; editing.value = false; saving.value = false; saved.value = false; error.value = ''; form.value = {}; });
const startEditing = () => {
  const profile = props.profile || {};
  const names = String(profile.fullName || '').trim().split(/\s+/);
  form.value = {
    firstName: profile.firstName || (!profile.lastName ? names.shift() || '' : ''),
    lastName: profile.lastName || (!profile.firstName ? names.join(' ') : ''),
    email: profile.email || '', phone: profile.phone || '', relationship: profile.relationship || '', dateOfBirth: profile.dateOfBirth || ''
  };
  error.value = ''; saved.value = false; editing.value = true;
};
const save = async () => {
  if (saving.value) return;
  const requestGeneration = generation;
  const clientId = props.clientId;
  saving.value = true; error.value = '';
  try {
    const { data } = await api.put(`/clients/${clientId}/guardian-contact`, { ...form.value });
    if (generation !== requestGeneration) return;
    editing.value = false; saved.value = true;
    emit('saved', data.guardian_intake_profile);
  } catch (err) {
    if (generation === requestGeneration) error.value = err.response?.data?.error?.message || 'Unable to save guardian contact. Please try again.';
  } finally {
    if (generation === requestGeneration) saving.value = false;
  }
};
</script>

<style scoped>
.guardian-contact-editor { margin-top: 12px; }
.contact-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
label { display: grid; gap: 4px; font-size: 13px; }
input { min-width: 0; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
.contact-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.hint { color: #475569; font-size: 13px; }
.error { color: #b91c1c; }
</style>
