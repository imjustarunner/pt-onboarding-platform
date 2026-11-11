<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { FAMILY_COMMUNICATION_NOTICE } from '../../navigation/familyCommunicationPolicy';
import { commentApi } from './sessionComments';
import { trapDialogKey } from './dialogFocus';
const props = defineProps({ agencyId: [Number, String], scopeKey: [Number, String], inline: { type: Boolean, default: true } });
const api = inject('secureSessionCommentsApi', commentApi);
const notice = ref(null), open = ref(false), reviewOnly = ref(false), checked = ref(false), busy = ref(false), error = ref(''), dialog = ref(null);
let generation = 0, resolvePending = null, pending = null, returnFocus;
const version = computed(() => notice.value?.version);
const noticeTitle = computed(() => notice.value?.notice?.title || 'Before your first shared message or comment');
const statements = computed(() => typeof notice.value?.notice === 'string' ? [notice.value.notice] : Array.isArray(notice.value?.notice?.statements) ? notice.value.notice.statements : [explanation]);
const explanation = FAMILY_COMMUNICATION_NOTICE.statements[0];
function finish(value) { open.value = false; checked.value = false; resolvePending?.(value); resolvePending = null; pending = null; returnFocus?.focus?.(); }
async function ensureAcknowledged(review = false) {
  if (pending) return pending;
  const own = generation; error.value = ''; busy.value = true;
  try {
    if (!Number(props.agencyId)) throw new Error('Choose the care service before sending.');
    const { data } = await api.get('/secure-family-sharing-notice', { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading: true });
    if (own !== generation) return false;
    notice.value = data;
    if (!data.version) throw new Error('The sharing notice could not be verified. Please try again.');
    if (data.acknowledged && !review) return true;
    reviewOnly.value = !!data.acknowledged && review;
    returnFocus = document.activeElement; open.value = true; checked.value = false;
    pending = new Promise(resolve => { resolvePending = resolve; });
    await nextTick(); dialog.value?.focus(); return pending;
  } catch (e) { if (own === generation) error.value = e.response?.data?.error?.message || e.message || 'The sharing notice could not be verified. Your text is preserved.'; return false; }
  finally { if (own === generation) busy.value = false; }
}
async function acknowledge() {
  if (!checked.value || busy.value || !version.value) return;
  const own = generation; busy.value = true; error.value = '';
  try {
    const { data } = await api.post('/secure-family-sharing-notice/ack', { agencyId: Number(props.agencyId), version: version.value, acknowledged: true }, { skipGlobalLoading: true });
    if (own !== generation) return;
    if (!data.acknowledged || data.version !== version.value) throw new Error('Your acknowledgement was not confirmed. Please try again.');
    notice.value = data; finish(true);
  } catch(e) { if (own === generation) error.value = e.response?.data?.error?.message || e.message || 'Your acknowledgement was not saved. Your message has not been sent.'; }
  finally { if (own === generation) busy.value = false; }
}
watch(() => [props.agencyId, props.scopeKey], () => { generation++; finish(false); notice.value = null; busy.value = false; error.value = ''; });
onBeforeUnmount(() => { generation++; finish(false); });
defineExpose({ ensureAcknowledged, error });
</script>
<template>
  <aside v-if="inline" class="aw-family-sharing-banner" aria-label="Shared family communications"><strong>Shared family communications</strong><p>{{ FAMILY_COMMUNICATION_NOTICE.statements[0] }} Messages and comments are not therapy and do not replace a therapy session.</p><button type="button" :disabled="busy" @click="ensureAcknowledged(true)">Review sharing policy</button><p v-if="error && !open" role="alert">{{ error }}</p></aside>
  <Teleport to="body"><div v-if="open" class="aw-family-sharing-overlay"><section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="aw-family-sharing-title" tabindex="-1" class="aw-family-sharing-dialog" @keydown="trapDialogKey($event, dialog, () => !busy && finish(false))"><h2 id="aw-family-sharing-title">{{ noticeTitle }}</h2><p v-for="(statement, index) in statements" :key="index">{{ statement }}</p><label v-if="!reviewOnly"><input v-model="checked" type="checkbox" :disabled="busy" /> {{ notice?.notice?.acknowledgment || FAMILY_COMMUNICATION_NOTICE.acknowledgment }}</label><p v-if="error" role="alert">{{ error }}</p><div><button v-if="reviewOnly" type="button" @click="finish(true)">Close policy</button><template v-else><button type="button" :disabled="busy" @click="finish(false)">Go back without sending</button><button type="button" :disabled="busy || !checked" @click="acknowledge">{{ busy ? 'Saving…' : 'I understand — continue' }}</button></template></div></section></div></Teleport>
</template>
<style scoped>
.aw-family-sharing-banner{padding:12px 16px;border:1px solid #b8cfe8;background:#f0f6ff;color:#17365d;border-radius:10px;margin:14px 0;font:13px/1.6 system-ui,sans-serif}.aw-family-sharing-banner p{margin:6px 0}.aw-family-sharing-banner>button{padding:2px 0;border:0;background:transparent;color:#07529a;text-decoration:underline;font:inherit;cursor:pointer}.aw-family-sharing-overlay{position:fixed;inset:0;z-index:25000;display:flex;justify-content:center;align-items:center;background:#071b42b3;padding:16px}.aw-family-sharing-dialog{width:min(620px,100%);max-height:calc(100dvh - 32px);overflow:auto;border-radius:20px;padding:26px;background:white;color:#10294e;box-shadow:0 20px 80px #071b4266;font:15px/1.7 system-ui,sans-serif}.aw-family-sharing-dialog h2{margin:0;font-size:23px;line-height:1.3}.aw-family-sharing-dialog label{display:flex;align-items:center;gap:10px;margin:22px 0;font-weight:700}.aw-family-sharing-dialog input{width:20px;height:20px;flex-shrink:0}.aw-family-sharing-dialog>div{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}.aw-family-sharing-dialog button{padding:10px 16px;border:1px solid #a9bfd8;border-radius:999px;background:#f1f6ff;color:#123e72;font:inherit;cursor:pointer}.aw-family-sharing-dialog button:last-child{background:#074f9d;color:white}.aw-family-sharing-dialog button:disabled{opacity:.5}.aw-family-sharing-dialog :focus-visible{outline:3px solid #d9a124;outline-offset:3px}
</style>
