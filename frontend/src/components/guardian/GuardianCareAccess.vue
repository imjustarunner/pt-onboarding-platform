<template><section class="care-access"><h3>{{ ft(learningOnly ? "Guardians & learning messages" : "Guardians & shared care messages") }}</h3><p v-if="participants.length">{{ ft("Provider messages are a group conversation for") }} {{clientName}}{{ ft(". These people can read and reply:") }}</p><p v-if="!participants.length">{{ ft("Shared messages are available only to people authorized for this profile.") }}</p><p v-if="loading">{{ ft("Loading access…") }}</p><p v-if="error" :role="failure==='load'?'alert':'status'">{{error}}</p><ul><li v-for="p in participants" :key="p.id"><strong>{{p.name}}{{Number(p.id)===Number(userId)?' (you)':''}}</strong><span>{{ ft(p.role==='guardian'?'Guardian':p.role==='client'?'Client':p.role==='provider'?'Provider':team) }}</span></li></ul><p>{{ ft("Access follows the permissions on this client’s record. Contact the") }} {{ft(team)}} {{ ft("if this list needs review.") }}</p><p>{{ ft("Your saved card and billing or technology support requests stay attached to your account. A document shared only with you is not automatically shared with another guardian.") }}</p><button v-if="failure==='load'" type="button" :disabled="loading" @click="load">{{ ft("Try again") }}</button><button v-if="error" type="button" @click="$emit('help')">{{ ft("Contact your team") }}</button><button :disabled="loading || !!error || !participants.length" @click="$emit('messages')">{{ ft(learningOnly ? "Open learning conversation" : "Open shared care conversation") }} →</button></section></template>
<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft}=useFamilyLocale();
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { usePortalCareApi } from '../../composables/usePortalCareApi';
const api = usePortalCareApi();
const props = defineProps({ learningOnly: Boolean, clientId: [Number, String], clientName: String, userId: [Number, String] });
defineEmits(['messages','help']);
const team = computed(() => props.learningOnly ? 'tutoring team' : 'care team');
const participants = ref([]), loading = ref(false), failure = ref('');
let sequence = 0;
const error = computed(() => {
  const values = {team: ft(team.value)};
  if (failure.value === 'provider') return ft(props.learningOnly
    ? 'A tutor must be assigned before shared messaging is available. Contact the {team} to arrange this.'
    : 'A provider must be assigned before shared messaging is available. Contact the {team} to arrange this.', values);
  if (failure.value === 'permission') return ft('Shared messaging is not authorized for your account on this profile. Contact the {team} to review access.', values);
  if (failure.value === 'empty') return ft('No shared messaging participants are available for this profile yet. Contact the {team} to review access.', values);
  return failure.value ? ft('Shared messaging access could not be loaded. Contact the {team} to review it, or try again.', values) : '';
});
async function load() {
  const own = ++sequence;
  participants.value = []; failure.value = ''; loading.value = true;
  try {
    const { data } = await api.get(`/guardian-portal/clients/${props.clientId}/care-access`, { skipGlobalLoading: true });
    if (own !== sequence) return;
    participants.value = data.participants || [];
    if (!participants.value.length) failure.value = 'empty';
  } catch (caught) {
    if (own === sequence) failure.value = caught?.response?.status === 403 ? 'permission'
      : caught?.response?.status === 409 && caught.response.data?.error?.message === 'An active assigned provider is required before secure messaging is available.' ? 'provider' : 'load';
  } finally { if (own === sequence) loading.value = false; }
}
watch(() => props.clientId, load, { immediate: true });
onBeforeUnmount(() => sequence++);
</script>
<style scoped>.care-access{border:1px solid #c9d8e7;border-radius:12px;padding:20px;margin:16px 0;background:#f4f8fc}.care-access ul{list-style:none;padding:0}.care-access li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #d7e3ef}.care-access p{font-size:14px;line-height:1.6}.care-access span{color:#526784}.care-access button{font:inherit;background:white;color:#16457c;border:1px solid #bbcede;border-radius:8px;padding:10px;cursor:pointer}</style>
