<template><button type="button" class="family-launch" @click="launch" :disabled="busy" :title="error || 'Open your family dashboard in a new window'">⌂ {{ error || 'Family' }}</button></template>
<script setup>
import { ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String] });
const busy = ref(false), error = ref('');
async function launch() {
  const target = window.open('about:blank', '_blank');
  if (target) target.opener = null;
  busy.value = true; error.value = '';
  try { const { data } = await api.post('/family/launch', { agencyId: props.agencyId }); if (target) target.location = data.url; else window.location.assign(data.url); }
  catch (e) { target?.close(); error.value = e.response?.data?.error?.message || 'Could not open family dashboard'; }
  finally { busy.value = false; }
}
</script>
<style scoped>.family-launch{border:1px solid #a9a5d2;background:#f5f3ff;color:#5c5792;border-radius:18px;padding:7px 13px;font:inherit;font-size:13px;cursor:pointer}</style>
