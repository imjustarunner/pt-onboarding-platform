<template>
  <section v-if="invitations.length || error" class="pending-enrollment" aria-label="Your pending enrollment">
    <h3>Your enrollment forms</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-for="invite in invitations" :key="invite.id">
      <strong>{{ invite.children.map(child => child.name).join(' · ') }}</strong>
      <p>Complete your own answers and signatures for the children listed here.</p>
      <p v-if="invite.expired">This invitation has expired. Ask your care team for a new invitation.</p>
      <button v-else type="button" :disabled="opening !== null" @click="open(invite)">{{ opening === invite.id ? 'Opening…' : 'Complete your enrollment' }}</button>
    </article>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: Number, clientId: Number });
const emit = defineEmits(['state']);
const invitations = ref([]), error = ref(''), opening = ref(null);
let generation = 0;
watch(() => [props.agencyId, props.clientId], async () => {
  const version = ++generation;
  invitations.value = []; error.value = ''; opening.value = null;
  emit('state', { loaded: false, pending: false });
  if (!props.agencyId) return;
  try {
    const { data } = await api.get('/guardian-portal/pending-enrollments', { params: { agencyId: props.agencyId, clientId: props.clientId || undefined } });
    if (version !== generation) return;
    invitations.value = data.invitations || [];
    emit('state', { loaded: true, pending: invitations.value.length > 0 });
  } catch {
    if (version === generation) error.value = 'We could not check your enrollment forms. Please reload or contact your care team.';
  }
}, { immediate: true });
async function open(invite) {
  const version = generation;
  opening.value = invite.id; error.value = '';
  try {
    const { data } = await api.post(`/guardian-portal/pending-enrollments/${invite.id}/open`, { agencyId: props.agencyId });
    if (version === generation && data.url) window.location.assign(data.url);
  } catch (e) {
    if (version === generation) error.value = e?.response?.data?.error?.message || 'Your invitation could not be opened. Please contact your care team.';
  } finally { if (version === generation) opening.value = null; }
}
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.pending-enrollment { grid-column: 1 / -1; padding: 16px; margin-bottom: 16px; border: 1px solid #cfe7db; border-radius: 12px; background: #f4faf7; }
article + article { margin-top: 16px; }
button { padding: 10px 16px; cursor: pointer; }
</style>
