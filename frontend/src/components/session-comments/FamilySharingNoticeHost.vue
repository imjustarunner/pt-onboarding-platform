<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import FamilySharingNotice from './FamilySharingNotice.vue';
import { FAMILY_SHARING_REQUIRED_EVENT } from '../../utils/familySharingNotice';
const props = defineProps({ userId: [Number, String], enabled: { type: Boolean, default: true }, scopeKey: [Number, String] });
const notice = ref(null), agencyId = ref(null), result = ref(''); let generation = 0, pending = false;
async function required(event) {
  if (!props.userId || !props.enabled || pending || !Number(event.detail?.agencyId)) return;
  const own = generation; pending = true; agencyId.value = Number(event.detail.agencyId); result.value = '';
  await nextTick();
  try {
    const acknowledged = await notice.value?.ensureAcknowledged();
    if (own === generation && !acknowledged && notice.value?.error) result.value = `${notice.value.error} Your original message was not sent. Your draft is preserved.`;
    if (own === generation && acknowledged) result.value = 'Sharing notice acknowledged. Your original message was not sent. Return to your preserved draft, review its recipients, and select Send again.';
  } finally { if (own === generation) pending = false; }
}
watch(() => [props.userId, props.enabled, props.scopeKey], () => { generation++; pending = false; agencyId.value = null; result.value = ''; });
onMounted(() => window.addEventListener(FAMILY_SHARING_REQUIRED_EVENT, required));
onBeforeUnmount(() => { generation++; window.removeEventListener(FAMILY_SHARING_REQUIRED_EVENT, required); });
</script>
<template><FamilySharingNotice v-if="enabled && userId && agencyId" ref="notice" :inline="false" :agency-id="agencyId" :scope-key="`${userId}:${scopeKey}:${agencyId}`" /><div v-if="result" class="aw-sharing-result" role="status"><p>{{ result }}</p><button type="button" aria-label="Dismiss sharing notice confirmation" @click="result = ''">×</button></div></template>
<style scoped>.aw-sharing-result{position:fixed;z-index:25001;bottom:24px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;max-width:min(650px,calc(100vw - 32px));box-sizing:border-box;padding:12px 18px;background:#edf6ff;color:#16395f;border:1px solid #b5cce6;border-radius:12px;box-shadow:0 8px 30px #1234;font:14px/1.6 system-ui,sans-serif}.aw-sharing-result p{margin:0}.aw-sharing-result button{background:transparent;border:0;font-size:23px;color:inherit;cursor:pointer}</style>
