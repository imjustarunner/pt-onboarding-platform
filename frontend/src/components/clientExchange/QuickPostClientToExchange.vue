<template>
  <span v-if="eligible || posted" class="quick-exchange">
    <button v-if="!posted" type="button" class="btn btn-secondary btn-xs" :disabled="posting" @click.stop="post">{{ posting ? 'Posting…' : 'Post to exchange' }}</button>
    <span v-else>Posted to exchange</span>
    <span v-if="error" role="alert" class="error">{{ error }}</span>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
const props = defineProps({ client: { type: Object, required: true } });
const emit = defineEmits(['posted']);
const auth = useAuthStore();
const posting = ref(false);
const posted = ref(false);
const error = ref('');
const eligible = computed(() => {
  const c = props.client;
  return ['super_admin', 'admin', 'support', 'staff'].includes(auth.user?.role)
    && c.id && (c.agency_id || c.agencyId)
    && !c.provider_id && !c.providerId && !c.providers?.length && !String(c.provider_ids || '').trim()
    && !['ARCHIVED', 'DECLINED'].includes(String(c.status || '').toUpperCase());
});
watch(() => props.client.id, () => { posted.value = false; error.value = ''; });
async function post() {
  if (posting.value || posted.value || !eligible.value) return;
  posting.value = true; error.value = '';
  try {
    const { data } = await api.post('/client-exchange/listings', {
      agencyId: Number(props.client.agency_id || props.client.agencyId), clientId: Number(props.client.id), quickPost: true
    });
    posted.value = true;
    if (data.listing?.notifications?.failed) error.value = 'Posted, but some notification emails could not be sent.';
    emit('posted', data.listing);
  } catch (e) { error.value = e.response?.data?.error?.message || 'Unable to post. Please try again.'; }
  finally { posting.value = false; }
}
</script>
<style scoped>
.quick-exchange { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.error { display: block; max-width: 260px; white-space: normal; }
</style>
