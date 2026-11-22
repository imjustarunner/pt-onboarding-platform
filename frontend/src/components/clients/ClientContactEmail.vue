<template>
  <form class="client-contact-email" @submit.prevent="save">
    <label>Client email
      <input v-if="editing" ref="field" type="email" v-model="draft" maxlength="254" autocomplete="off" :disabled="busy" />
      <span v-else>{{ email || 'Not on file' }}</span>
    </label>
    <template v-if="editable">
      <template v-if="editing">
        <small>Use the client’s own contact address. Their portal sign-in is managed separately.</small>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="busy || draft.trim() === original">{{ busy ? 'Saving…' : 'Save email' }}</button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="cancel">Cancel</button>
      </template>
      <button v-else type="button" class="btn btn-secondary btn-sm" @click="edit">{{ email ? 'Edit email' : 'Add client email' }}</button>
    </template>
    <span v-if="error" role="alert">{{ error }}</span>
    <span v-if="notice" role="status">{{ notice }}</span>
  </form>
</template>
<script setup>
import { ref, nextTick, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({clientId:Number,agencyId:Number,email:String,editable:Boolean,startEditing:Boolean});
const emit = defineEmits(['saved','cancel']);
const draft = ref(''), original = ref(''), editing = ref(false), busy = ref(false), field = ref(null), error = ref(''), notice = ref('');
let generation = 0;
async function edit() {
  if (!props.editable) return;
  original.value = props.email || ''; draft.value = original.value; editing.value = true; error.value = ''; notice.value = '';
  await nextTick(); field.value?.focus();
}
function cancel() {editing.value = false; error.value = ''; emit('cancel');}
watch(() => [props.clientId,props.agencyId,props.startEditing,props.editable], () => {
  generation++; busy.value = false; editing.value = false; error.value = ''; notice.value = '';
  if (props.startEditing) edit();
}, {immediate:true});
onBeforeUnmount(() => generation++);
async function save() {
  if (!props.editable || busy.value || !editing.value || draft.value.trim() === original.value) return;
  const run = generation;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const {data} = await api.put(`/clients/${props.clientId}/contact-email`, {email:draft.value.trim(),previousEmail:original.value},
      {params:{agencyId:props.agencyId},headers:{'X-Agency-Id':String(props.agencyId)},skipGlobalLoading:true});
    if (run !== generation) return;
    editing.value = false; notice.value = 'Client email saved.'; emit('saved',data);
  } catch (e) {
    if (run === generation) error.value = e.response?.data?.error?.message || 'Could not save client email.';
  } finally { if (run === generation) busy.value = false; }
}
defineExpose({edit});
</script>
<style scoped>
.client-contact-email {display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:10px 0}
label {display:flex;align-items:center;gap:12px;font-weight:600}
label span,small {font-weight:400;overflow-wrap:anywhere}
input {font:inherit;min-width:0;max-width:100%;padding:6px;border:1px solid var(--border,#adbcc9);border-radius:5px}
[role=alert] {color:var(--danger,#a12c26)}
</style>
