<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SecureSessionCommentDialog from './SecureSessionCommentDialog.vue';
import { COMMENT_BUTTON, COMMENT_ICON, activeTodayAppointments, closeSecureSessionComment, commentApi, commentDate, commentRoot, openSecureSessionComment, secureCommentState, setSecureCommentsScope } from './sessionComments';
import { trapDialogKey } from './dialogFocus';
const props = defineProps({ userId: [Number, String], enabled: { type: Boolean, default: true }, family: Boolean, schedulePath: String, scopeKey: [String, Number], scheduleQuery: { type: Object, default: () => ({}) } });
const api = inject('secureSessionCommentsApi', commentApi), route = useRoute(), router = useRouter();
const today = ref(null), now = ref(Date.now()), mode = ref(''), error = ref(''), busy = ref(false), dialog = ref(null);
let generation = 0, timer, priorFocus, openedFor = '', scheduledWake;
const rows = computed(() => activeTodayAppointments(today.value, now.value));
const attentionAvailable = computed(() => rows.value.length && !today.value?.dismissed && !(+new Date(today.value?.snoozedUntil) > now.value));
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
function underlyingSchedule() {
  if (props.schedulePath) return props.schedulePath;
  const prefix = route.params.organizationSlug ? `/${route.params.organizationSlug}` : '';
  if (props.family) return route.path;
  return route.meta?.auricwellPreview ? `${prefix}/appointments` : `${prefix}/my-schedule`;
}
async function showList() {
  const scope = secureCommentState.scopeKey;
  mode.value = '';
  const query = { ...route.query, ...props.scheduleQuery, secureSessionComments: 'today' };
  if (props.family) query.panel = 'appointments';
  await router.replace({ path: underlyingSchedule(), query });
  if (scope !== secureCommentState.scopeKey || !props.enabled) return;
  mode.value = 'list'; await focus();
}
async function focus() { priorFocus ||= document.activeElement; await nextTick(); dialog.value?.focus(); }
async function load(automatic = true) {
  const own = ++generation;
  if (!props.enabled || !props.userId) { today.value = null; mode.value = ''; return; }
  try {
    const { data } = await api.get(`${commentRoot}/today`, { params: { timeZone: browserZone() }, skipGlobalLoading: true });
    if (own !== generation) return;
    today.value = data; now.value = Date.now();
    const key = `${props.userId}:${data.dayKey}:${data.attentionToken || data.watermark || 0}`;
    if (automatic && data.showSplash && attentionAvailable.value && !secureCommentState.selected && openedFor !== key) { mode.value = 'splash'; openedFor = key; focus(); }
    if (!rows.value.length && mode.value === 'splash') mode.value = '';
  } catch { /* Nonblocking: the session button exposes errors on explicit open. */ }
}
async function attention(action) {
  if (busy.value) return;
  const scope = secureCommentState.scopeKey;
  busy.value = true; error.value = '';
  try {
    await api.post(`${commentRoot}/attention`, { timeZone: today.value?.timeZone || browserZone(), action, minutes: 30 }, { skipGlobalLoading: true });
    if (scope !== secureCommentState.scopeKey || !props.enabled || !today.value) return;
    if (action === 'dismiss_today') today.value.dismissed = true;
    else { today.value.snoozedUntil = new Date(Date.now() + 30 * 60000).toISOString(); clearTimeout(scheduledWake); scheduledWake = setTimeout(() => { openedFor = ''; load(); }, 30 * 60000); }
    mode.value = ''; priorFocus?.focus?.(); priorFocus = null;
  } catch (e) { if (scope === secureCommentState.scopeKey) error.value = e.response?.data?.error?.message || 'Your reminder preference was not saved. Please try again.'; }
  finally { if (scope === secureCommentState.scopeKey) busy.value = false; }
}
async function openRow(a) {
  const scope = secureCommentState.scopeKey;
  mode.value = '';
  const query = { ...route.query, ...props.scheduleQuery, scheduleAction: 'appointment', scheduleAppointmentId: String(a.id), secureCommentAppointmentId: String(a.id), secureCommentClientId: String(a.clientId) };
  delete query.secureSessionComments;
  if (props.family) { query.panel = 'appointments'; query.clientId = String(a.clientId); query.childId = String(a.clientId); query.appointmentId = String(a.id); }
  await router.replace({ path: underlyingSchedule(), query });
  if (scope === secureCommentState.scopeKey && props.enabled) openSecureSessionComment(a.id, a.clientId);
}
function closeThread() {
  closeSecureSessionComment();
  const query = { ...route.query }; delete query.secureCommentAppointmentId; delete query.secureCommentClientId;
  router.replace({ query }).catch(() => {});
  load(false);
}
async function consumeLink() {
  if (!props.enabled || !props.userId) return;
  const id = Number(route.query.secureCommentAppointmentId);
  if (id > 0) { mode.value = ''; openSecureSessionComment(id, Number(route.query.secureCommentClientId) || null); }
  else if (route.query.secureSessionComments === 'today') { const scope = secureCommentState.scopeKey; await load(false); if (scope === secureCommentState.scopeKey && props.enabled) { mode.value = 'list'; focus(); } }
}
watch(() => [props.userId, props.enabled, props.scopeKey], () => { generation++; today.value = null; mode.value = ''; openedFor = ''; busy.value = false; error.value = ''; setSecureCommentsScope(`${props.userId || 0}:${props.scopeKey || ''}:${props.enabled}`, !!props.enabled && !!props.userId); if (props.enabled && props.userId) { load(); consumeLink(); } }, { immediate: true });
watch(() => [route.query.secureSessionComments, route.query.secureCommentAppointmentId, route.query.secureCommentClientId], consumeLink);
watch(() => secureCommentState.revision, () => load(false));
watch(rows, () => { if (!rows.value.length && mode.value === 'splash') mode.value = ''; });
const onFocus = () => { now.value = Date.now(); load(); };
onMounted(() => { window.addEventListener('focus', onFocus); timer = setInterval(() => { now.value = Date.now(); load(); }, 60000); });
onBeforeUnmount(() => { generation++; clearInterval(timer); clearTimeout(scheduledWake); window.removeEventListener('focus', onFocus); setSecureCommentsScope('', false); });
</script>
<template>
  <SecureSessionCommentDialog v-if="enabled && userId && secureCommentState.selected" :key="`${scopeKey}:${secureCommentState.selected.appointmentId}:${secureCommentState.selected.clientId || 0}`" v-bind="secureCommentState.selected" :family="family" @close="closeThread" />
  <Teleport to="body"><div v-if="enabled && userId && mode && !secureCommentState.selected" class="aw-secure-overlay" @click.self="attention('snooze')">
    <section ref="dialog" class="aw-secure-dialog aw-secure-today aw-secure-open" :class="{ 'aw-secure-today--splash': mode === 'splash' }" role="dialog" aria-modal="true" aria-labelledby="aw-today-title" tabindex="-1" @keydown="trapDialogKey($event, dialog, () => attention('snooze'))">
      <header><img :src="COMMENT_ICON" alt="" /><div><p class="aw-eyebrow">AuricWell · Secure notification</p><h2 id="aw-today-title">{{ mode === 'splash' ? 'Secure comments for your sessions today' : 'Today’s Secure Session Comments' }}</h2></div><button class="aw-close" type="button" aria-label="Remind me later" :disabled="busy" @click="attention('snooze')">×</button></header>
      <template v-if="mode === 'splash'"><img class="aw-today-envelope" :src="COMMENT_ICON" alt="" /><p>You have unopened secure session comments for today’s appointments.</p><button class="aw-today-image-button" type="button" aria-label="View secure session comments for today" @click="showList"><img :src="COMMENT_BUTTON" alt="" /></button></template>
      <template v-else><p>Updates shared with your account. Open a session to read or add a comment.</p><p v-if="!rows.length">No unread comments remain for today’s upcoming sessions. Past comments stay available on each session and in secure communication history.</p><article v-for="a in rows" :key="`${a.id}:${a.clientId}`" class="aw-today-row"><div><strong>{{ a.clientName || a.providerName || 'Session' }}</strong><p>{{ commentDate(a.startAt, a.timeZone) }} · {{ a.timeZone }}</p><span>{{ a.unreadCount }} unread secure {{ a.unreadCount === 1 ? 'comment' : 'comments' }}</span><p v-if="a.comments?.[0]?.body" class="aw-today-preview">{{ a.comments[0].body }}</p></div><button class="aw-primary" type="button" @click="openRow(a)">View comments →</button></article></template>
      <p v-if="error" role="alert" class="aw-error">{{ error }}</p><footer><button type="button" :disabled="busy" @click="attention('snooze')">Remind me in 30 minutes</button><button type="button" :disabled="busy" @click="attention('dismiss_today')">Dismiss for today</button></footer>
    </section>
  </div></Teleport>
</template>
<style scoped>
.aw-secure-today{width:min(1040px,100%);border-bottom:7px solid #07549f}.aw-secure-today--splash{max-width:680px;text-align:center}.aw-secure-today--splash header{text-align:left}.aw-today-envelope{width:160px;height:160px;object-fit:contain;margin:24px auto 0;display:block}.aw-today-image-button{position:relative;width:560px;aspect-ratio:8/1;overflow:hidden;padding:0;border:0;background:none;max-width:100%;cursor:pointer}.aw-today-image-button img{position:absolute;top:50%;left:0;transform:translateY(-50%);display:block;width:100%;height:auto}.aw-today-row{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:20px;margin:14px 0;border:1px solid #dce6f4;border-radius:18px;box-shadow:0 2px 5px #122b4810}.aw-today-row p{margin:3px 0}.aw-today-row span{font-size:12px;color:#47627e}.aw-today-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;max-width:650px}.aw-secure-today footer{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;border-top:1px solid #dce6f4;padding-top:18px;margin-top:16px}.aw-secure-today footer button{border:1px solid #b6c9df;border-radius:999px;padding:10px 16px;background:#fff;color:#18365b;cursor:pointer}@media(max-width:600px){.aw-today-row{flex-direction:column;align-items:stretch;padding:14px}.aw-today-envelope{width:110px;height:110px}}
</style>
