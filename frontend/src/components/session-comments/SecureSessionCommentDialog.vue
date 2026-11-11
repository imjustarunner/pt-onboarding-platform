<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { COMMENT_ICON, commentApi, commentDate, commentRoot, commentsChanged } from './sessionComments';
import FamilySharingNotice from './FamilySharingNotice.vue';
import { trapDialogKey } from './dialogFocus';
const props = defineProps({ appointmentId: [Number, String], clientId: [Number, String], family: Boolean });
const emit = defineEmits(['close']);
const api = inject('secureSessionCommentsApi', commentApi);
const sharingNotice = ref(null), audienceReviewNeeded = ref(false), audienceReviewed = ref(false), reviewLabel = ref('I reviewed the updated shared audience above.'), editingOwn = ref(false);
const dialog = ref(null), data = ref(null), loading = ref(false), sending = ref(false), error = ref(''), notice = ref(''), body = ref(''), recipients = ref([]), selectedClient = ref(null), clientChoices = ref([]);
let generation = 0, returnFocus, requestId = null, requestFingerprint = '';
const appointment = computed(() => data.value?.appointment || {});
const comments = computed(() => data.value?.comments || []);
const ownComment = computed(() => data.value?.ownComment || comments.value.find(c => c.isOwn));
const visibleComments = computed(() => {
  const mine = ownComment.value;
  if (!mine) return comments.value;
  if (!comments.value.some(c => c.id === mine.id)) return [...comments.value, mine];
  return comments.value.map(c => c.id === mine.id && Number(mine.version) >= Number(c.version) ? mine : c);
});
const characterCount = computed(() => Array.from(body.value).length);
async function editOwn() { if (!ownComment.value) return; editingOwn.value = true; audienceReviewNeeded.value=false; audienceReviewed.value=false; body.value = ownComment.value.body; error.value = ''; notice.value = ''; await nextTick(); dialog.value?.querySelector('textarea')?.focus(); }
function cancelEdit() { editingOwn.value = false; body.value = ''; }
const audience = computed(() => data.value?.recipients || []);
const canSend = computed(() => data.value?.canWrite && body.value.trim() && characterCount.value <= 250 && recipients.value.length && !sending.value && !loading.value && (!audienceReviewNeeded.value || audienceReviewed.value));
function close() { if (!sending.value) emit('close'); }
function message(e, fallback) { return e.response?.data?.error?.message || e.response?.data?.message || fallback; }
async function load(older = false) {
  const own = ++generation; loading.value = true; error.value = '';
  const before = older ? data.value?.nextBefore : undefined;
  if (!older) { data.value = null; body.value = ''; recipients.value = []; requestId = null; audienceReviewNeeded.value = false; audienceReviewed.value = false; editingOwn.value = false; }
  try {
    const { data: result } = await api.get(`${commentRoot}/appointments/${props.appointmentId}`, { params: { clientId: selectedClient.value || props.clientId || undefined, before }, skipGlobalLoading: true });
    if (own !== generation) return;
    if (result.clients) clientChoices.value = result.clients;
    data.value = older ? { ...result, comments: [...result.comments, ...data.value.comments] } : result;
    if (!older) recipients.value = (result.recipients || []).map(r => Number(r.id));
    await nextTick();
    await acknowledge(own);

  } catch (e) { if (own === generation) error.value = message(e, 'Secure comments could not be opened. Your account’s session and sharing permissions still apply.'); }
  finally { if (own === generation) loading.value = false; }
}
// A background response cannot mark a comment read. A visible, explicitly
// opened conversation acknowledges only the actual currently rendered IDs.
async function acknowledge(own = generation) {
  const result = data.value;
  const ids = (result?.comments || []).filter(c => !c.isOwn && !c.readAt).map(c => c.id);
  if (!ids.length || own !== generation || document.visibilityState === 'hidden') return;
  await api.post(`${commentRoot}/appointments/${props.appointmentId}/read`, { clientId: result.appointment.clientId, commentIds: ids, commentVersions: Object.fromEntries(result.comments.filter(c => ids.includes(c.id)).map(c => [c.id, c.version])) }, { skipGlobalLoading: true });
  if (own === generation) { for (const c of result.comments) if (ids.includes(c.id)) c.readAt = new Date().toISOString(); commentsChanged(); }
}
function visibleAgain() { if (document.visibilityState !== 'hidden') acknowledge().catch(() => { error.value = 'Your read confirmation could not be saved. The comment remains available.'; }); }
onMounted(() => document.addEventListener('visibilitychange', visibleAgain));
async function send() {
  if (!canSend.value) return;
  const own = generation, appointmentId = props.appointmentId, clientId = appointment.value.clientId, editedComment = editingOwn.value ? ownComment.value : null;
  sending.value = true; error.value = ''; notice.value = '';
  const fingerprint = JSON.stringify({ appointmentId, clientId, commentId:editedComment?.id, version:editedComment?.version, body: body.value.trim(), recipients: [...recipients.value].sort() });
  if (fingerprint !== requestFingerprint) { requestId = null; requestFingerprint = fingerprint; }
  requestId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    if (!await sharingNotice.value?.ensureAcknowledged() || own !== generation) return;
    const payload = { clientId, body: body.value.trim(), recipientUserIds: [...recipients.value], requestId, ...(editedComment ? { expectedVersion: editedComment.version } : {}) };
    const { data: result } = editedComment
      ? await api.patch(`${commentRoot}/appointments/${appointmentId}/comments/${editedComment.id}`, payload, { skipGlobalLoading: true })
      : await api.post(`${commentRoot}/appointments/${appointmentId}`, payload, { skipGlobalLoading: true });
    if (own !== generation) return;
    data.value.comments = data.value.comments.map(c => Number(c.id) === Number(result.comment.id) ? result.comment : c);
    if (!data.value.comments.some(c => Number(c.id) === Number(result.comment.id))) data.value.comments.push(result.comment);
    data.value.ownComment = result.comment; editingOwn.value = false;
    body.value = ''; requestId = null; notice.value = 'Secure comment saved. Notification delivery is tracked separately.'; commentsChanged();
  } catch (e) {
    if (own === generation) {
      if (['SESSION_COMMENT_AUDIENCE_CHANGED','SESSION_COMMENT_VERSION_CONFLICT','SESSION_COMMENT_EXISTS'].includes(e.response?.data?.error?.code)) {
        try {
          const { data: refreshed } = await api.get(`${commentRoot}/appointments/${appointmentId}`, { params: { clientId }, skipGlobalLoading: true });
          if (own !== generation) return;
          data.value = refreshed; recipients.value = (refreshed.recipients || []).map(r => Number(r.id));
          audienceReviewNeeded.value = true; audienceReviewed.value = false;
          const versionChanged = e.response?.data?.error?.code !== 'SESSION_COMMENT_AUDIENCE_CHANGED';
          if (versionChanged) editingOwn.value = !!refreshed.ownComment;
          reviewLabel.value = versionChanged ? 'I reviewed the latest saved comment and current shared audience.' : 'I reviewed the updated shared audience above.';
          error.value = versionChanged ? 'A comment is already saved or was edited elsewhere. Review the latest saved comment and current audience before applying your preserved text.' : 'The eligible audience changed. Review the updated people below and confirm before sending. Your text is preserved.';
          await nextTick(); await acknowledge(own);
        } catch (refreshError) { if (own === generation) { data.value.comments = []; data.value.canWrite = false; error.value = message(refreshError, 'The updated audience could not be verified. Keep your text and reopen the session before sending.'); } }
      } else error.value = message(e, 'Your comment could not be confirmed. Your text is preserved; check this thread before retrying.');
    }
  }
  finally { if (own === generation) sending.value = false; }
}
watch(() => [props.appointmentId, props.clientId], async () => {
  sending.value = false; selectedClient.value = null; clientChoices.value = []; notice.value = ''; returnFocus ||= document.activeElement;
  load(); await nextTick(); dialog.value?.focus();
}, { immediate: true });
onBeforeUnmount(() => { generation++; document.removeEventListener('visibilitychange', visibleAgain); returnFocus?.focus?.(); });
</script>
<template>
  <Teleport to="body"><div class="aw-secure-overlay" @click.self="close">
    <section ref="dialog" class="aw-secure-dialog aw-secure-open" role="dialog" aria-modal="true" aria-labelledby="aw-secure-title" tabindex="-1" @keydown="trapDialogKey($event, dialog, close)">
      <header><img :src="COMMENT_ICON" alt="" /><div><p class="aw-eyebrow">AuricWell · Secure</p><h2 id="aw-secure-title">Secure Session Comments</h2></div><button class="aw-close" type="button" :disabled="sending" aria-label="Close secure comments" @click="close">×</button></header>
      <p v-if="loading" role="status">Unlocking your authorized session comments…</p>
      <p v-if="error" class="aw-error" role="alert">{{ error }}</p>
      <button v-if="error && !data" class="aw-secondary" type="button" @click="load(false)">Try opening again</button>
      <template v-if="data">
        <div class="aw-session-context"><strong>{{ appointment.clientName }}</strong><p>{{ commentDate(appointment.startAt, appointment.timeZone) }} · {{ appointment.timeZone }}</p><p v-if="appointment.providerName">{{ appointment.providerName }}</p></div>
        <label v-if="clientChoices.length > 1">Choose the client for this session<select v-model="selectedClient" @change="load(false)"><option :value="null" disabled>Select a client</option><option v-for="c in clientChoices" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <p class="aw-privacy">Encrypted session comments are shared only with the people listed on each comment. Email notifications do not include the comment. This is not an emergency service.</p>
        <button v-if="data.hasMore" class="aw-secondary" type="button" :disabled="loading || sending" @click="load(true)">Older secure comments</button>
        <ol class="aw-comment-thread" aria-label="Session comment history"><li v-for="comment in visibleComments" :key="comment.id"><div><strong>{{ comment.author?.name || 'Care team' }}</strong><time>{{ commentDate(comment.createdAt, appointment.timeZone) }}</time></div><p class="aw-comment-body">{{ comment.body }}</p><p v-if="comment.editedAt" class="aw-privacy">Edited · {{ commentDate(comment.editedAt, appointment.timeZone) }}</p><button v-if="comment.isOwn && data.canWrite && !editingOwn" class="aw-secondary" type="button" :disabled="sending" @click="editOwn">Edit my comment</button><small>Shared with {{ (comment.recipients || []).map(r => r.name).join(', ') || 'the recorded authorized audience' }}{{ comment.audienceRedacted ? ' and other authorized recipients' : '' }}</small></li></ol>
        <p v-if="!comments.length && !loading">No comments shared with your account yet. You can add the first update below.</p>
        <form v-if="data.canWrite && (!ownComment || editingOwn)" @submit.prevent="send"><h3>{{ editingOwn ? 'Edit my secure session comment' : 'Add a secure session comment' }}</h3><p class="aw-privacy">Each person can leave one comment of up to 250 characters on this session. You can edit your own comment.</p><FamilySharingNotice ref="sharingNotice" :agency-id="appointment.agencyId" :scope-key="`${appointment.id}:${appointment.clientId}`" /><fieldset :disabled="sending"><legend>Automatically shared with</legend><label v-for="recipient in audience" :key="recipient.id" class="aw-recipient"><span aria-hidden="true">✓</span>{{ recipient.name }}<small>{{ recipient.relationshipType }} · included</small></label></fieldset><label>Your comment<textarea v-model="body" rows="3" maxlength="500" aria-describedby="aw-comment-character-limit" required :disabled="sending" placeholder="Add a brief update or reminder for this session." /></label><p id="aw-comment-character-limit" class="aw-privacy" :class="{'aw-error': characterCount > 250}">{{ characterCount }} / 250 characters</p><label v-if="audienceReviewNeeded" class="aw-recipient"><input v-model="audienceReviewed" type="checkbox" :disabled="sending" /> {{ reviewLabel }}</label><p v-if="!recipients.length" class="aw-privacy">No eligible recipient is available. Contact the care team before sending.</p><button class="aw-primary" type="submit" :disabled="!canSend">{{ sending ? 'Saving securely…' : editingOwn ? 'Save my edit' : 'Send secure comment' }}</button><button v-if="editingOwn" class="aw-secondary" type="button" :disabled="sending" @click="cancelEdit">Cancel edit</button></form><p v-if="notice" role="status">{{ notice }}</p>
        <p v-if="!data.canWrite" class="aw-privacy">Your current access allows viewing only. Contact your care team if you need help with session access.</p>
      </template>
    </section>
  </div></Teleport>
</template>
<style>
.aw-secure-overlay{position:fixed;inset:0;z-index:24000;background:#071b42a6;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px}.aw-secure-dialog{width:min(800px,100%);max-height:calc(100dvh - 40px);overflow:auto;background:#fff;color:#12234a;border:1px solid #d6e2f0;border-radius:24px;padding:26px;box-shadow:0 20px 70px #04133366;font:15px/1.6 system-ui,sans-serif}.aw-secure-dialog header{display:flex;align-items:center;gap:14px;border-bottom:1px solid #dde6f2;padding-bottom:16px}.aw-secure-dialog header img{width:64px;height:64px}.aw-secure-dialog h2{font-size:clamp(21px,4vw,30px);margin:0;line-height:1.25}.aw-eyebrow{margin:0;color:#31547d;font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.aw-close{margin-left:auto;border:0;background:transparent;font-size:28px;color:#10254d;cursor:pointer;padding:4px 12px}.aw-secure-dialog button:focus-visible,.aw-secure-dialog a:focus-visible{outline:3px solid #d9a124;outline-offset:3px}.aw-session-context{padding:14px 18px;background:#edf4fe;border-radius:12px;margin-top:16px}.aw-session-context p{margin:2px 0}.aw-privacy{font-size:13px;color:#4b617b}.aw-error{background:#fff0ee;color:#8c2922;padding:14px;border-radius:8px;white-space:pre-wrap}.aw-comment-thread{list-style:none;padding:0}.aw-comment-thread li{border:1px solid #d9e4f3;border-radius:12px;padding:16px;margin:12px 0;background:#fbfdff}.aw-comment-thread li>div{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.aw-comment-thread time,.aw-comment-thread small{font-size:12px;color:#506783}.aw-comment-body{white-space:pre-wrap;overflow-wrap:anywhere}.aw-secure-dialog form{border-top:1px solid #dde6f2;padding-top:16px}.aw-secure-dialog label{display:grid;gap:6px;margin:12px 0}.aw-secure-dialog textarea,.aw-secure-dialog select{width:100%;box-sizing:border-box;padding:12px;border:1px solid #a9bdd4;border-radius:8px;font:inherit;resize:vertical}.aw-secure-dialog fieldset{border:1px solid #d9e4f3;border-radius:10px;padding:8px 14px}.aw-secure-dialog .aw-recipient{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.aw-recipient small{color:#536881}.aw-primary{border:0;border-radius:999px;background:linear-gradient(135deg,#0050aa,#082352);color:#fff;font:inherit;font-weight:700;padding:12px 24px;cursor:pointer}.aw-primary:disabled{opacity:.55;cursor:default}.aw-secondary{border:1px solid #b7cbe1;border-radius:999px;padding:9px 15px;margin:6px 8px 6px 0;background:#f5f9ff;color:#164577;font:inherit;cursor:pointer}.aw-secure-open{animation:aw-unlock .25s ease-out}@keyframes aw-unlock{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}@media(max-width:540px){.aw-secure-overlay{padding:8px}.aw-secure-dialog{padding:18px;max-height:calc(100dvh - 16px);border-radius:18px}.aw-secure-dialog header img{width:42px;height:42px}.aw-comment-thread li{padding:12px}}@media(prefers-reduced-motion:reduce){.aw-secure-open{animation:none}}
</style>
