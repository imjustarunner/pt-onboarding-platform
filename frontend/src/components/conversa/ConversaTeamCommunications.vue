<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { canManageConversaTeam, CONVERSA_ICON_URL } from '../../constants/conversa';
import StaffPollResultsReview from '../admin/StaffPollResultsReview.vue';

const props = defineProps({ agencyId: { type: [Number, String], default: null } });
const auth = useAuthStore();
const allowed = computed(() => canManageConversaTeam(auth.user));
const events = ref([]), users = ref([]), loading = ref(false), busy = ref(false);
const error = ref(''), notice = ref(''), reviewing = ref(null), delivery = ref(null);
const blank = () => ({ kind: 'text', title: '', message: '', userIds: [], question: '', options: ['Yes', 'No'], viaSms: false, shareResults: true, allowOther: false });
const draft = ref(blank());
const editing = ref(null);
function edit(event) {
  editing.value = event;
  draft.value = { ...blank(), kind: event.votingConfig?.enabled ? 'poll' : 'text', title: event.title, message: event.splashContent || event.description || '', userIds: [...(event.audience?.userIds || [])], question: event.votingConfig?.question || '', options: event.votingConfig?.options?.map(o => o.label) || ['Yes', 'No'], viaSms: !!event.votingConfig?.viaSms, shareResults: event.votingConfig?.shareResults !== false, allowOther: !!event.votingConfig?.allowOther };
}
function cancelEdit() { editing.value = null; draft.value = blank(); }
let generation = 0;
const base = (agencyId = props.agencyId) => `/agencies/${agencyId}/company-events`;
async function load() {
  const g = ++generation;
  if (!props.agencyId || !allowed.value) { events.value = []; users.value = []; loading.value = false; return; }
  loading.value = true;
  error.value = '';
  try {
    const [list, audience] = await Promise.all([
      api.get(base(), { params: { communicationsOnly: 1 } }), api.get(`${base()}/audience-options`)
    ]);
    if (g !== generation) return;
    events.value = Array.isArray(list.data) ? list.data : [];
    users.value = (audience.data?.users || []).filter(u => !['client', 'client_guardian'].includes(String(u.role).toLowerCase()));
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not load team communications.'; }
  finally { if (g === generation) loading.value = false; }
}
async function create() {
  if (!allowed.value || !props.agencyId || busy.value) return;
  if (!draft.value.userIds.length) { error.value = 'Select at least one team member.'; return; }
  const g = generation, url = base(), poll = draft.value.kind === 'poll';
  busy.value = true; error.value = ''; notice.value = '';
  const now = new Date();
  try {
    const existing = editing.value;
    const save = existing ? api.put : api.post;
    await save(existing ? `${url}/${existing.id}` : url, {
      ...(existing || {}),
      title: draft.value.title, description: draft.value.message, splashContent: draft.value.message,
      eventType: existing?.eventType || (poll ? 'team_poll' : 'direct_notice'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      startsAt: existing?.startsAt || now.toISOString(), endsAt: existing?.endsAt || new Date(now.getTime() + 30 * 86400000).toISOString(),
      audience: { userIds: [...draft.value.userIds], groupIds: existing?.audience?.groupIds || [], roleKeys: existing?.audience?.roleKeys || [] },
      rsvpMode: poll ? 'custom_vote' : 'none',
      votingConfig: { enabled: poll, viaSms: poll && draft.value.viaSms, question: draft.value.question,
        options: draft.value.options.map((label, i) => ({ key: existing?.votingConfig?.options?.[i]?.key || String(i + 1), label: label.trim() })),
        shareResults: draft.value.shareResults, allowOther: draft.value.allowOther },
      reminderConfig: existing?.reminderConfig || { enabled: false, channels: { inApp: true, sms: false } }
    });
    if (g !== generation) return;
    cancelEdit();
    notice.value = existing ? 'Team communication updated.' : poll ? 'Poll created. Selected team members can respond from their dashboard. Use Send poll text to invite them by SMS.' : 'Team message saved. Review it below, then choose Send to team.';
    await load();
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not save team communication.'; }
  finally { busy.value = false; }
}
async function action(event, kind) {
  if (!allowed.value || busy.value) return;
  const confirmations = { send: `Send “${event.title}” to its selected team members in the app and by SMS where eligible?`, poll: `Send the “${event.title}” poll by SMS to eligible team members?`, close: `Close “${event.title}” and send any requested final results texts?` };
  if (confirmations[kind] && !window.confirm(confirmations[kind])) return;
  const g = generation, url = `${base()}/${event.id}`;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    if (kind === 'delivery') {
      const { data } = await api.get(`${url}/delivery-logs`);
      if (g === generation) delivery.value = { title: event.title, ...data };
      return;
    }
    const endpoint = { send: 'send-direct-message', poll: 'send-sms-vote', close: 'close-voting' }[kind];
    const body = kind === 'send' ? { title: event.title, message: event.splashContent || event.description, sendInApp: true, sendSms: true } : {};
    const { data } = await api.post(`${url}/${endpoint}`, body);
    if (g !== generation) return;
    notice.value = kind === 'close' ? 'Voting closed. Check delivery history for requested results texts.'
      : kind === 'send' ? `Sent: ${data.inAppCount || 0} in-app notifications, ${data.smsCount || 0} texts. Check delivery history for skipped or failed recipients.`
      : `Poll texts sent: ${data.sentCount || 0}. Check delivery history for skipped or failed recipients.`;
    await load();
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not complete this action.'; }
  finally { busy.value = false; }
}
watch(() => [props.agencyId, allowed.value], () => {
  events.value = []; users.value = []; cancelEdit(); reviewing.value = null; delivery.value = null; notice.value = ''; load();
}, { immediate: true });
</script>

<template>
  <section class="conversa-team" aria-labelledby="conversa-team-title">
    <header class="team-header"><div><h2 id="conversa-team-title">Team texts &amp; polls</h2><p>Conversa brings team broadcasts, replies, and delivery history together.</p></div><img :src="CONVERSA_ICON_URL" alt="Conversa" width="56" height="56" /></header>
    <p v-if="!allowed" role="alert">Only superadmins, admins, and support can manage team texts and polls.</p>
    <p v-else-if="!agencyId">Select an agency to manage its team communications.</p>
    <template v-else>
      <p class="team-note">Managed by superadmins, admins, and support. Selected team members can receive texts and answer polls. Text delivery follows their consent and notification preferences.</p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <form class="team-compose" @submit.prevent="create">
        <h3>{{ editing ? 'Edit team communication' : 'Create a team communication' }}</h3>
        <fieldset :disabled="busy || loading"><legend class="sr-only">Team communication details</legend>
          <div class="team-grid"><label>Type<select v-model="draft.kind" :disabled="!!editing"><option value="text">Team text</option><option value="poll">Team poll</option></select></label><label>Title<input v-model.trim="draft.title" required maxlength="180" placeholder="A clear title for your team" /></label></div>
          <label>{{ draft.kind === 'poll' ? 'Context (optional)' : 'Message' }}<textarea v-model.trim="draft.message" :required="draft.kind === 'text'" :maxlength="draft.kind === 'text' ? 280 : 1000" rows="3" placeholder="Share an update with your team" /></label>
          <template v-if="draft.kind === 'poll'">
            <label>Poll question<input v-model.trim="draft.question" required maxlength="255" /></label>
            <div v-for="(_, i) in draft.options" :key="i" class="team-option"><label>Answer {{ i + 1 }}<input v-model="draft.options[i]" required maxlength="64" /></label><button v-if="draft.options.length > 2" type="button" @click="draft.options.splice(i, 1)">Remove</button></div>
            <button type="button" :disabled="draft.options.length >= 12" @click="draft.options.push('')">Add answer</button>
            <label class="team-check"><input v-model="draft.viaSms" type="checkbox" /> Allow SMS voting</label>
            <label class="team-check"><input v-model="draft.allowOther" type="checkbox" /> Allow written answers for review</label>
            <label class="team-check"><input v-model="draft.shareResults" type="checkbox" /> Share final totals with participants</label>
            <p class="team-note">Replies are identified to organizers. Participants see their own responses. New polls are available for 30 days. Close voting when you are ready to publish final totals.</p>
          </template>
          <fieldset class="team-recipients"><legend>Team members · {{ draft.userIds.length }} selected</legend><p v-if="loading">Loading team members…</p><p v-else-if="!users.length">No team members available.</p><label v-for="user in users" :key="user.id" class="team-check"><input v-model="draft.userIds" type="checkbox" :value="user.id" /> {{ user.name }}</label></fieldset>
          <button class="team-primary" :disabled="!draft.userIds.length || busy || loading">{{ busy ? 'Saving…' : editing ? 'Save changes' : draft.kind === 'poll' ? 'Create poll' : 'Save team message' }}</button>
          <button v-if="editing" type="button" @click="cancelEdit">Cancel editing</button>
        </fieldset>
      </form>
      <div class="team-header"><h3>Team communications</h3><button type="button" :disabled="busy || loading" @click="load">Refresh</button></div>
      <p v-if="loading">Loading communications…</p><p v-else-if="!events.length">Your team texts and polls will appear here.</p>
      <article v-for="event in events" :key="event.id" class="team-entry">
        <span class="team-type">{{ event.votingConfig?.enabled ? 'Team poll' : 'Team text' }} · Conversa</span><h3>{{ event.title }}</h3><p>{{ event.votingConfig?.enabled ? event.votingConfig.question : event.splashContent || event.description }}</p>
        <p v-if="event.votingClosedAt">Voting closed</p>
        <div class="team-actions">
          <button v-if="['direct_notice', 'team_poll'].includes(event.eventType) && !event.votingClosedAt" type="button" :disabled="busy" @click="edit(event)">Edit</button>
          <button v-if="!event.votingConfig?.enabled" type="button" :disabled="busy" @click="action(event, 'send')">Send to team</button>
          <button v-if="event.votingConfig?.viaSms && !event.votingClosedAt" type="button" :disabled="busy" @click="action(event, 'poll')">Send poll text</button>
          <button v-if="event.votingConfig?.enabled" type="button" :disabled="busy" @click="reviewing = event">Results &amp; review</button>
          <button v-if="event.votingConfig?.enabled && !event.votingClosedAt" type="button" :disabled="busy" @click="action(event, 'close')">Close voting</button>
          <button type="button" :disabled="busy" @click="action(event, 'delivery')">Delivery history</button>
        </div>
      </article>
      <StaffPollResultsReview v-if="reviewing" :agency-id="agencyId" :event="reviewing" @close="reviewing = null; load()" />
      <section v-if="delivery" class="team-entry" aria-label="Team delivery history"><div class="team-header"><h3>{{ delivery.title }} · delivery history</h3><button type="button" @click="delivery = null">Close history</button></div><p v-if="!delivery.logs?.length">No deliveries yet.</p><ul><li v-for="log in delivery.logs" :key="log.id">{{ log.name }} · {{ log.channel }} · {{ log.status }}<span v-if="log.statusReason"> · {{ log.statusReason }}</span></li></ul></section>
    </template>
  </section>
</template>

<style scoped>
.conversa-team{max-width:1040px;margin:0 auto;color:var(--conversa-navy,#0b2352)}.team-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.team-header h2,.team-header h3{margin:0}.team-header p{margin:8px 0}.team-note{color:#52627a;font-size:.9rem;line-height:1.6}.team-compose,.team-entry{background:var(--conversa-surface,#fff);border:1px solid #dce5f0;border-radius:16px;padding:24px;margin:20px 0}.team-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px}fieldset{border:0;padding:0;min-width:0}label{display:grid;gap:6px;margin:12px 0;font-weight:600}input:not([type=checkbox]),select,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b8c8df;border-radius:8px;background:#fff;color:#0b2352;font:inherit}.team-check{display:flex;align-items:center;gap:9px;font-weight:400}.team-recipients{max-height:240px;overflow:auto;border:1px solid #dce5f0;border-radius:10px;padding:12px;margin:16px 0}.team-recipients legend{font-weight:600;padding:0 4px}.team-option{display:flex;align-items:center;gap:12px}.team-option label{flex:1}.team-actions{display:flex;flex-wrap:wrap;gap:8px}button{border:1px solid #b8c8df;border-radius:8px;background:#fff;color:#0047b3;padding:10px 14px;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #60b5ff;outline-offset:2px}.team-primary{background:#0047b3;color:#fff}.team-type{font-size:.8rem;color:#0047b3;font-weight:700}.team-entry p{white-space:pre-wrap;overflow-wrap:anywhere}[role=alert]{color:#b91c1c}[role=status]{padding:12px;background:#e5f5f0;color:#165a43;border-radius:8px}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:600px){.team-grid{grid-template-columns:1fr}.team-compose,.team-entry{padding:16px}.team-header{align-items:flex-start}}
</style>
