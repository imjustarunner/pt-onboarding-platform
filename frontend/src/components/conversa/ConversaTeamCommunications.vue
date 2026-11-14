<script setup>
import { computed, ref, watch, defineAsyncComponent } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { canManageConversaTeam, CONVERSA_ICON_URL } from '../../constants/conversa';
import StaffPollResultsReview from '../admin/StaffPollResultsReview.vue';
import StaffPollDeliveryHistory from './StaffPollDeliveryHistory.vue';
const StaffEventForm = defineAsyncComponent(() => import('../admin/StaffEventForm.vue'));
const eventSetup = ref(null), eventSetupForm = ref(null), followupRequests = new Map();

const props = defineProps({ agencyId: { type: [Number, String], default: null } });
const auth = useAuthStore();
const allowed = computed(() => canManageConversaTeam(auth.user));
const events = ref([]), users = ref([]), loading = ref(false), busy = ref(false);
const error = ref(''), notice = ref(''), reviewing = ref(null), delivery = ref(null);
const smsSender = ref(null), pollPreview = ref(null);
const localDateInput = value => { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const blank = () => ({ kind: 'text', title: '', message: '', userIds: [], question: '', options: ['Yes', 'No'], deliveryMode: 'internal', shareResults: true, resultsVisibility: 'after_close', linkedEventId: '', closesAt: localDateInput(Date.now() + 30 * 86400000), allowOther: false, followupsEnabled: false, followupHours: '24,2' });
const eventLinks = ref([]), linksLoading = ref(false), linksError = ref('');
let linksRequest = 0, linksLoaded = false;
async function loadEventLinks() {
  if (linksLoaded || linksLoading.value || !props.agencyId) return;
  const id = ++linksRequest; linksLoading.value = true; linksError.value = '';
  try { const { data } = await api.get(base(), { params: { pollLinkOptions: 1 } }); if (id === linksRequest) { eventLinks.value = Array.isArray(data) ? data : []; linksLoaded = true; } }
  catch { if (id === linksRequest) linksError.value = 'Could not load internal events. You can save without a link or try again.'; }
  finally { if (id === linksRequest) linksLoading.value = false; }
}
const draft = ref(blank());
const editing = ref(null);
const recipientSearch = ref('');
const visibleRecipients = computed(() => users.value.filter(user => String(user.name || '').toLowerCase().includes(recipientSearch.value.trim().toLowerCase())));
function selectVisibleRecipients() {
  const eligible = visibleRecipients.value.filter(user => !smsOnly.value || canReceiveOutsideApp(user));
  draft.value.userIds = [...new Set([...draft.value.userIds, ...eligible.map(user => user.id)])];
}
function edit(event) {
  editing.value = event;
  draft.value = { ...blank(), kind: event.votingConfig?.enabled ? 'poll' : 'text', title: event.title, message: event.splashContent || event.description || '', userIds: (event.audience?.userIds || []).filter(id => users.value.some(user => user.id === id)), question: event.votingConfig?.question || '', options: event.votingConfig?.options?.map(o => o.label) || ['Yes', 'No'], deliveryMode: event.votingConfig?.deliveryMode || (event.votingConfig?.viaSms ? 'both' : 'internal'), shareResults: event.votingConfig?.shareResults !== false, allowOther: !!event.votingConfig?.allowOther };
  draft.value.closesAt = localDateInput(event.votingConfig?.closesAt || event.endsAt) || blank().closesAt;
  draft.value.resultsVisibility = event.votingConfig?.resultsVisibility || 'after_close';
  draft.value.linkedEventId = event.votingConfig?.linkedEventId || '';
  draft.value.followupsEnabled = !!event.reminderConfig?.enabled;
  draft.value.followupHours = (event.reminderConfig?.offsetsHours || [24,2]).join(',');
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
      api.get(base(), { params: { communicationsOnly: 1 }, skipGlobalLoading: true }), api.get(`${base()}/audience-options`, { params: { communicationsOnly: 1 }, skipGlobalLoading: true })
    ]);
    if (g !== generation) return;
    events.value = Array.isArray(list.data) ? list.data : [];
    users.value = (audience.data?.users || []).filter(u => !['client', 'client_guardian', 'guardian', 'school_staff'].includes(String(u.role).toLowerCase()));
    smsSender.value = audience.data?.smsSender || null;
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not load team communications.'; }
  finally { if (g === generation) loading.value = false; }
}
async function create(reviewDelivery = false) {
  if (!allowed.value || !props.agencyId || busy.value) return;
  if (!draft.value.userIds.length) { error.value = 'Select at least one team member.'; return; }
  const g = generation, url = base(), poll = draft.value.kind === 'poll';
  if (poll && (!draft.value.closesAt || !Number.isFinite(new Date(draft.value.closesAt).getTime()))) { error.value = 'Choose a voting deadline.'; return; }
  const offsets = draft.value.followupHours.split(',').map(v => Number(v.trim()));
  if (poll && draft.value.followupsEnabled && (!offsets.length || offsets.length > 4 || offsets.some(n => !Number.isInteger(n) || n < 1 || n > 168))) { error.value = 'Choose up to four follow-ups, 1–168 hours before closing.'; return; }
  if (poll && draft.value.deliveryMode === 'sms' && draft.value.userIds.some(id => !canReceiveOutsideApp(users.value.find(u => u.id === id)))) { error.value = 'Select recipients with polling SMS opt-in or an SSO work email for the voting invitation.'; return; }
  busy.value = true; error.value = ''; notice.value = '';
  const now = new Date();
  let review = null;
  try {
    const existing = editing.value;
    const save = existing ? api.put : api.post;
    const { data: saved } = await save(existing ? `${url}/${existing.id}` : url, {
      ...(existing || {}),
      title: draft.value.title, description: draft.value.message, splashContent: draft.value.message,
      eventType: existing?.eventType || (poll ? 'team_poll' : 'direct_notice'), timezone: existing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      startsAt: existing?.startsAt || now.toISOString(), endsAt: poll ? new Date(draft.value.closesAt).toISOString() : existing?.endsAt || new Date(now.getTime() + 30 * 86400000).toISOString(),
      audience: { userIds: [...draft.value.userIds], groupIds: existing?.audience?.groupIds || [], roleKeys: existing?.audience?.roleKeys || [] },
      rsvpMode: poll ? 'custom_vote' : 'none',
      votingConfig: { enabled: poll, deliveryMode: draft.value.deliveryMode, viaSms: poll && draft.value.deliveryMode !== 'internal', question: draft.value.question,
        options: draft.value.options.map((label, i) => ({ key: existing?.votingConfig?.options?.[i]?.key || String(i + 1), label: label.trim() })),
        shareResults: draft.value.shareResults, resultsVisibility: draft.value.resultsVisibility, linkedEventId: poll ? Number(draft.value.linkedEventId) || null : null, closesAt: poll ? new Date(draft.value.closesAt).toISOString() : null, allowOther: draft.value.allowOther },
      reminderConfig: poll ? { enabled: draft.value.followupsEnabled, anchor: 'poll_close', offsetsHours: offsets, channels: { inApp: draft.value.deliveryMode !== 'sms', sms: draft.value.deliveryMode !== 'internal' } } : existing?.reminderConfig || { enabled: false, channels: { inApp: true, sms: false } }
    });
    if (g !== generation) return;
    const savedPoll = { ...saved, id: saved.id || existing?.id, title: draft.value.title };
    cancelEdit();
    notice.value = poll ? 'Poll saved. This save has not sent notifications. Review delivery or use Send poll to notify recipients, including newly added team members.' : existing ? 'Team communication updated.' : 'Team message saved. Review it below, then choose Send to team.';
    const refreshGeneration = generation + 1;
    await load();
    if (poll && reviewDelivery && generation === refreshGeneration) review = savedPoll;
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not save team communication.'; }
  finally { busy.value = false; }
  if (review) await action(review, 'poll', { unsentOnly: true });
}
async function action(event, kind, { unsentOnly = false } = {}) {
  if (!allowed.value || busy.value) return;
  const confirmations = { send: `Send “${event.title}” to its selected team members in the app and by SMS where eligible?`, close: `Close “${event.title}” and send any requested final results texts?` };
  if (confirmations[kind] && !window.confirm(confirmations[kind])) return;
  const g = generation, url = `${base()}/${event.id}`;
  busy.value = true; error.value = '';
  if (!unsentOnly) notice.value = '';
  try {
    if (kind === 'poll' || kind === 'followup') {
      const { data } = await api.get(`${url}/poll-delivery-preview`, ...((unsentOnly || kind === 'followup') ? [{ params: { unsentOnly: unsentOnly ? 1 : undefined, followup: kind === 'followup' ? 1 : undefined } }] : []));
      if (g !== generation) return;
      pollPreview.value = { title: event.title, ...data };
      if (!data.canSend) {
        error.value = data.smsSender && !data.smsSender.ready ? data.smsSender.label : 'No new notifications to send: recipients have already answered, were already notified, or are unavailable through the selected delivery methods.';
        return;
      }
      const reasons = (data.reasons || []).map(reason => `${reason.count} ${reason.label.toLowerCase()}`).join('; ');
      if (!window.confirm(`${kind === 'followup' ? 'Send a follow-up to invited people who have not replied' : 'Send poll'}: “${event.title}”?\n${pollPreviewSummary(data)}${reasons ? `\nSMS not sent: ${reasons}.` : ''}\nEligibility is checked again before each text.`)) return;
    }
    if (kind === 'delivery') {
      const { data } = await api.get(`${url}/delivery-logs`);
      if (g === generation) delivery.value = { id: event.id, title: event.title, ...data };
      return;
    }
    const endpoint = { send: 'send-direct-message', poll: 'send-poll', followup: 'send-poll-followup', close: 'close-voting' }[kind];
    if (kind === 'followup' && !followupRequests.has(event.id)) followupRequests.set(event.id, crypto.randomUUID());
    const body = kind === 'followup' ? { requestId: followupRequests.get(event.id) } : kind === 'send' ? { title: event.title, message: event.splashContent || event.description, sendInApp: true, sendSms: true } : unsentOnly ? { unsentOnly: true } : {};
    const { data } = await api.post(`${url}/${endpoint}`, body);
    if (g !== generation) return;
    if (kind === 'followup') followupRequests.delete(event.id);
    notice.value = kind === 'close' ? 'Voting closed. Check delivery history for requested results texts.'
      : kind === 'send' ? `Sent: ${data.inAppCount || 0} in-app notifications, ${data.smsCount || 0} texts. Check delivery history for skipped or failed recipients.`
      : `${kind === 'followup' ? 'Follow-up sent' : 'Poll delivery'}: ${data.inAppCount || 0} internal, ${data.sentCount || 0} SMS, ${data.emailCount || 0} email · ${data.skippedCount || 0} skipped · ${data.failedCount || 0} failed.${data.emailQueuedCount ? ` ${data.emailQueuedCount} emails awaiting delivery.` : ''}${data.emailSkippedCount ? ` ${data.emailSkippedCount} emails skipped.` : ''}${data.sentCount ? '' : ' No text messages were sent.'}${(data.skippedReasons || []).map(reason => ` ${reason.count} ${reason.label.toLowerCase()}.`).join('')} See delivery history for details.`;
    await load();
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Could not complete this action.'; }
  finally { busy.value = false; }
}
async function eventSaved({ eventId }) {
  const setup = eventSetup.value, g = generation, url = base();
  if (!setup?.pollId) { await load(); return; }
  try {
    await api.put(`${url}/${setup.pollId}/presentation`, { linkedEventId: eventId });
    if (g !== generation || eventSetup.value !== setup) return;
    setup.initialEventId = eventId;
    notice.value = 'Event saved and linked to the poll. Add potluck requests below, then use Send Invitations when ready.';
    linksLoaded = false; await load();
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Event saved, but linking failed. Choose it under Sharing & linked event.'; }
}
function closeEventSetup() {
  if (eventSetupForm.value?.requestClose) eventSetupForm.value.requestClose();
  else eventSetup.value = null;
}
function pollPreviewSummary(preview) {
  return `${preview.internalCount || 0} internal messages · ${preview.smsEligibleCount || 0} eligible texts · ${preview.smsSkippedCount || 0} SMS unavailable · ${preview.answeredCount || 0} already answered. ${preview.emailCount || 0} work email voting invitations.${preview.notInvitedCount ? ` ${preview.notInvitedCount} still need an initial invitation; follow-ups skip them.` : ''}${preview.alreadyNotifiedCount ? ` ${preview.alreadyNotifiedCount} already notified.` : ''}`;
}
const selectedSms = computed(() => users.value.filter(user => draft.value.userIds.includes(user.id) && user.pollingSms?.eligible).length);
const selectedEmail = computed(() => users.value.filter(user => draft.value.userIds.includes(user.id) && user.pollingEmail?.eligible).length);
const canReceiveOutsideApp = user => user?.pollingSms?.eligible || user?.pollingEmail?.eligible;
function deliveryLabel(event) {
  const mode = event.votingConfig?.deliveryMode || (event.votingConfig?.viaSms ? 'both' : 'internal');
  return { internal: 'Internal message + SSO email fallback', sms: 'SMS + SSO email fallback', both: 'Internal message + SMS + SSO email fallback' }[mode];
}
const smsOnly = computed(() => draft.value.kind === 'poll' && draft.value.deliveryMode === 'sms');
watch(() => draft.value.kind, kind => { if (kind === 'poll') loadEventLinks(); });
watch(() => draft.value.deliveryMode, () => {
  if (smsOnly.value) draft.value.userIds = draft.value.userIds.filter(id => canReceiveOutsideApp(users.value.find(u => u.id === id)));
});
watch(() => [props.agencyId, allowed.value], () => {
  eventSetup.value = null; followupRequests.clear(); linksRequest++; linksLoaded = false; linksLoading.value = false; linksError.value = ''; eventLinks.value = [];
  events.value = []; users.value = []; smsSender.value = null; pollPreview.value = null; cancelEdit(); reviewing.value = null; delivery.value = null; notice.value = ''; load();
}, { immediate: true });
</script>

<template>
  <section class="conversa-team" aria-labelledby="conversa-team-title">
    <header class="team-header"><div><h2 id="conversa-team-title">Team texts &amp; polls</h2></div><img :src="CONVERSA_ICON_URL" alt="Conversa" width="56" height="56" /></header>
    <p v-if="!allowed" role="alert">Only superadmins, admins, and support can manage team texts and polls.</p>
    <p v-else-if="!agencyId">Select an agency to manage its team communications.</p>
    <template v-else>

      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <details class="team-guide"><summary>Plan an event or potluck with a poll</summary><ol><li>Create a team poll to choose a date. Select the invitees, set the voting deadline, then save and confirm sending. The deadline only controls voting.</li><li>After deciding the date, choose <strong>Create linked event</strong>. Enter the actual event start/end time and location. The poll and event have separate schedules.</li><li>For a potluck, enable <strong>Potluck style</strong>, list what the organizer provides, save, then add items or open category slots under <strong>Need List (Potluck)</strong>.</li><li>Review the invitees and choose <strong>Send Invitations</strong>. Attendees can RSVP and claim what they are bringing. Saving alone does not send invitations.</li></ol><p class="team-note">Already have a scheduled event? Create the poll here and select that event under Linked internal event. Saving makes an in-app poll available to its selected team; confirming Send poll sends the invitations.</p><button type="button" @click="eventSetup = {}">Open company event setup</button></details>
      <div class="team-layout">
      <form class="team-compose" @submit.prevent="create(draft.kind === 'poll')">
        <h3>{{ editing ? 'Edit team communication' : 'Create a team communication' }}</h3>
        <fieldset :disabled="busy || loading"><legend class="sr-only">Team communication details</legend>
          <div class="team-grid"><label>Type<select v-model="draft.kind" :disabled="!!editing"><option value="text">Team text</option><option value="poll">Team poll</option></select></label><label>Title<input v-model.trim="draft.title" required maxlength="180" placeholder="A clear title for your team" /></label></div>
          <label>{{ draft.kind === 'poll' ? 'Context (optional)' : 'Message' }}<textarea v-model.trim="draft.message" :required="draft.kind === 'text'" :maxlength="draft.kind === 'text' ? 280 : 1000" rows="3" placeholder="Share an update with your team" /></label>
          <template v-if="draft.kind === 'poll'">
            <label>Poll question<input v-model.trim="draft.question" required maxlength="255" /></label>
            <div v-for="(_, i) in draft.options" :key="i" class="team-option"><label>Answer {{ i + 1 }}<input v-model="draft.options[i]" required maxlength="64" /></label><button v-if="draft.options.length > 2" type="button" @click="draft.options.splice(i, 1)">Remove</button></div>
            <button type="button" :disabled="draft.options.length >= 12" @click="draft.options.push('')">Add answer</button>
            <label>Poll delivery<select v-model="draft.deliveryMode" aria-label="Poll delivery"><option value="internal">Internal message + SSO email fallback</option><option value="sms">SMS + SSO email fallback</option><option value="both">Both · Internal message + SMS + SSO email fallback</option></select></label>
            <p class="team-note">SMS requires separate polling opt-in. SSO team members without poll text enrollment receive a work email with a voting link and an optional text opt-in button. A reply through either method completes the same poll.</p>
            <p class="team-note">{{ selectedEmail }} selected members will receive a work email voting invitation. Email delivery follows their email preferences.</p>
            <p v-if="draft.deliveryMode !== 'internal' && smsSender" :role="smsSender.ready ? undefined : 'alert'" class="team-note">{{ smsSender.label }}<span v-if="smsSender.ready"> · {{ smsSender.fromNumber }}</span></p>
            <p v-if="draft.deliveryMode !== 'internal'" class="team-note">{{ selectedSms }} selected members currently eligible for SMS; {{ draft.userIds.length - selectedSms }} unavailable for SMS. Poll texts use the staff notifications number. Reply NOPOLLS to stop poll texts only.</p>
            <p class="team-note">Save &amp; review delivery checks for recipients who still need an invitation, including newly added members. You can confirm delivery next. Save without sending only updates the poll.</p>
            <label class="team-check"><input v-model="draft.allowOther" type="checkbox" /> Allow written answers for review</label>
            <label>Voting deadline <input v-model="draft.closesAt" aria-label="Voting deadline" type="datetime-local" required /><small class="team-note">Your local time. This closes voting; it does not schedule an event.</small></label>
            <label class="team-check"><input v-model="draft.followupsEnabled" type="checkbox" /> Schedule follow-ups for invited people who have not replied</label>
            <label v-if="draft.followupsEnabled">Hours before voting closes<input v-model="draft.followupHours" aria-label="Follow-up hours" placeholder="24,2" /><small class="team-note">For example: 24,2 sends reminders one day and two hours before closing. Up to four reminders. Uses this poll’s delivery methods and current opt-in preferences; stops after a reply or closing.</small></label>
            <label class="team-check"><input v-model="draft.shareResults" type="checkbox" /> Share vote totals with participants</label>
            <label v-if="draft.shareResults">When participants can see results<select v-model="draft.resultsVisibility" aria-label="Results visibility"><option value="after_close">After voting closes</option><option value="live">Live totals while voting is open</option></select><small class="team-note">Shares counts only. Individual staff replies stay with the organizer.</small></label>
            <label>Link an internal event <span class="team-note">Optional</span><select v-model="draft.linkedEventId" aria-label="Linked internal event" :disabled="linksLoading"><option value="">No linked event yet</option><option v-for="linked in eventLinks.filter(e => e.id !== editing?.id)" :key="linked.id" :value="linked.id">{{ linked.title }}{{ linked.isActive === false ? ' · Details not yet available' : '' }}</option></select><small class="team-note">Participants get a View event link when that event is available to them. You can add the link later.</small></label>
            <p v-if="linksError" class="team-note">{{ linksError }} <button type="button" @click="loadEventLinks">Retry events</button></p>
            <p class="team-note">Replies are identified to organizers. Participants see their own responses. New polls are available for 30 days. Close voting when you are ready to publish final totals.</p>
          </template>
          <p class="team-note">Active internal staff only. School staff and inactive accounts are excluded. SMS opt-outs stay visible.</p>
          <div class="recipient-toolbar"><input v-model="recipientSearch" type="search" placeholder="Find team members" aria-label="Find team members" /><button type="button" @click="selectVisibleRecipients">Select shown</button><button type="button" @click="draft.userIds = []">Clear</button></div>
          <fieldset class="team-recipients"><legend>Team members · {{ draft.userIds.length }} selected</legend><p v-if="loading">Loading team members…</p><p v-else-if="!users.length">No active internal team members available.</p><label v-for="user in visibleRecipients" :key="user.id" class="team-check"><input v-model="draft.userIds" type="checkbox" :value="user.id" :disabled="smsOnly && !canReceiveOutsideApp(user)" /> <span>{{ user.name }}<small v-if="draft.kind === 'poll'" class="sms-status" :class="{ 'sms-blocked': !user.pollingSms?.eligible }">{{ user.pollingSms?.label || 'SMS consent not confirmed' }}<span v-if="user.pollingEmail?.eligible"> · Work email voting invitation</span><span v-else-if="draft.deliveryMode === 'both' && !user.pollingSms?.eligible"> · Internal only</span></small></span></label></fieldset>
          <button class="team-primary" :disabled="!draft.userIds.length || busy || loading">{{ busy ? 'Saving…' : draft.kind === 'poll' ? 'Save & review delivery' : editing ? 'Save changes' : 'Save team message' }}</button>
          <button v-if="draft.kind === 'poll'" type="button" :disabled="!draft.userIds.length || busy || loading" @click="create(false)">Save without sending</button>
          <button v-if="editing" type="button" @click="cancelEdit">Cancel editing</button>
        </fieldset>
      </form>
      <section class="team-history"><div class="team-header"><h3>Team communications</h3><button type="button" :disabled="busy || loading" @click="load">Refresh</button></div>
      <section v-if="pollPreview" class="team-entry" aria-label="Poll delivery preview"><h3>{{ pollPreview.title }} · delivery preview</h3><p>{{ pollPreviewSummary(pollPreview) }}</p><p v-if="pollPreview.smsSender">{{ pollPreview.smsSender.label }}<span v-if="pollPreview.smsSender.ready"> · {{ pollPreview.smsSender.fromNumber }}</span></p><ul v-if="pollPreview.reasons?.length"><li v-for="reason in pollPreview.reasons" :key="reason.code">{{ reason.count }} · {{ reason.label }}</li></ul><p class="team-note">This preview sends nothing. Opt-outs and eligibility are checked again during delivery.</p></section>
      <p v-if="loading">Loading communications…</p><p v-else-if="!events.length">Your team texts and polls will appear here.</p>
      <article v-for="event in events" :key="event.id" class="team-entry">
        <span class="team-type">{{ event.votingConfig?.enabled ? 'Team poll' : 'Team text' }} · Conversa</span><h3>{{ event.title }}</h3><p>{{ event.votingConfig?.enabled ? event.votingConfig.question : event.splashContent || event.description }}</p>
        <p v-if="event.votingConfig?.enabled" class="team-note">{{ deliveryLabel(event) }}</p>
        <p v-if="event.votingConfig?.enabled" class="team-note">Deadline: {{ new Date(event.votingConfig.closesAt || event.endsAt).toLocaleString() }} · {{ event.votingConfig.shareResults === false ? 'Results private' : event.votingConfig.resultsVisibility === 'live' ? 'Live results shared' : 'Results shared after closing' }}</p>
        <p v-if="event.votingConfig?.enabled" class="team-note">{{ event.reminderConfig?.enabled ? `Follow-ups scheduled ${event.reminderConfig.offsetsHours.join(', ')} hours before voting closes.` : 'No scheduled follow-ups. You can send one manually to invited people who have not replied.' }}</p>
        <p v-if="event.votingClosedAt">Voting closed</p>
        <div class="team-actions">
          <button v-if="['direct_notice', 'team_poll'].includes(event.eventType) && !event.votingClosedAt" type="button" :disabled="busy" @click="edit(event)">Edit</button>
          <button v-if="!event.votingConfig?.enabled" type="button" :disabled="busy" @click="action(event, 'send')">Send to team</button>
          <button v-if="event.votingConfig?.enabled && !event.votingClosedAt" type="button" :disabled="busy" @click="action(event, 'poll')">Send poll</button>
          <button v-if="event.votingConfig?.enabled && !event.votingClosedAt" type="button" :disabled="busy" @click="action(event, 'followup')">Send follow-up · no replies</button>
          <button v-if="event.votingConfig?.enabled" type="button" :disabled="busy" @click="eventSetup = event.eventType === 'team_poll' ? { pollId: event.id, initialEventId: event.votingConfig.linkedEventId || null, initialPoll: event } : { initialEventId: event.id }">{{ event.eventType !== 'team_poll' ? 'Manage event' : event.votingConfig.linkedEventId ? 'Manage linked event' : 'Create linked event' }}</button>
          <button v-if="event.votingConfig?.enabled" type="button" :disabled="busy" @click="reviewing = event">Results &amp; review</button>
          <button v-if="event.votingConfig?.enabled && !event.votingClosedAt" type="button" :disabled="busy" @click="action(event, 'close')">Close voting</button>
          <button type="button" :disabled="busy" @click="action(event, 'delivery')">Delivery history</button>
        </div>
      </article>
      </section></div>
      <StaffPollResultsReview v-if="reviewing" :agency-id="agencyId" :event="reviewing" @changed="reviewing = $event; load()" @close="reviewing = null; load()" />
      <StaffPollDeliveryHistory v-if="delivery" :history="delivery" @close="delivery = null" @refresh="action(delivery, 'delivery')" />
      <div v-if="eventSetup" class="event-setup-backdrop" @keydown.esc="closeEventSetup"><section class="event-setup-dialog" role="dialog" aria-modal="true" aria-label="Company event setup"><button type="button" @click="closeEventSetup">Close event setup</button><StaffEventForm ref="eventSetupForm" :agency-id="Number(agencyId)" :initial-event-id="eventSetup.initialEventId" :initial-poll="eventSetup.initialPoll" @saved="eventSaved" @close="eventSetup = null" /></section></div>
    </template>
  </section>
</template>

<style scoped>
.conversa-team{max-width:1040px;margin:0 auto;color:var(--conversa-navy,#0b2352)}.team-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.team-header h2,.team-header h3{margin:0}.team-header p{margin:8px 0}.team-note{color:#52627a;font-size:.9rem;line-height:1.6}.team-compose,.team-entry{background:var(--conversa-surface,#fff);border:1px solid #dce5f0;border-radius:16px;padding:24px;margin:20px 0}.team-grid{display:grid;grid-template-columns:1fr 2fr;gap:16px}fieldset{border:0;padding:0;min-width:0}label{display:grid;gap:6px;margin:12px 0;font-weight:600}input:not([type=checkbox]),select,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b8c8df;border-radius:8px;background:#fff;color:#0b2352;font:inherit}.sms-status{display:block;font-size:.8rem;color:#16704b;margin-top:3px}.sms-blocked{color:#76521c}.team-check{display:flex;align-items:center;gap:9px;font-weight:400}.team-recipients{max-height:240px;overflow:auto;border:1px solid #dce5f0;border-radius:10px;padding:12px;margin:16px 0}.team-recipients legend{font-weight:600;padding:0 4px}.team-option{display:flex;align-items:center;gap:12px}.team-option label{flex:1}.team-actions{display:flex;flex-wrap:wrap;gap:8px}button{border:1px solid #b8c8df;border-radius:8px;background:#fff;color:#0047b3;padding:10px 14px;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #60b5ff;outline-offset:2px}.team-primary{background:#0047b3;color:#fff}.team-type{font-size:.8rem;color:#0047b3;font-weight:700}.team-entry p{white-space:pre-wrap;overflow-wrap:anywhere}[role=alert]{color:#b91c1c}[role=status]{padding:12px;background:#e5f5f0;color:#165a43;border-radius:8px}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:600px){.team-grid{grid-template-columns:1fr}.team-compose,.team-entry{padding:16px}.team-header{align-items:flex-start}}

.conversa-team{max-width:none;margin:0}.team-header{gap:8px}.team-header h2{font-size:20px}.team-header>img{width:32px;height:32px}.team-note{font-size:12px;line-height:1.4;margin:6px 0}.team-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:14px;margin-top:10px;align-items:start}.team-compose,.team-entry{border-radius:10px;padding:12px;margin:0 0 10px}.team-compose h3{font-size:15px;margin:0 0 8px}.team-grid{gap:10px}label{gap:4px;margin:8px 0;font-size:13px}input:not([type=checkbox]),select,textarea{padding:7px 9px;font-size:13px}button{padding:6px 9px;font-size:12px}.team-recipients{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 10px;max-height:190px;padding:8px;margin:8px 0}.team-recipients .team-check{margin:4px 0;font-size:12px}.team-recipients>p{grid-column:1/-1}.recipient-toolbar{display:flex;gap:6px;align-items:center}.recipient-toolbar input{flex:1;min-width:100px}.recipient-toolbar button{white-space:nowrap}.team-history .team-header{margin-bottom:10px}.team-history h3{font-size:15px}.team-entry p{font-size:13px;line-height:1.4;margin:6px 0}.team-actions{gap:5px}
@media(max-width:1000px){.team-layout{grid-template-columns:1fr}.team-history{border-top:1px solid #dce5f0;padding-top:12px}}
@media(max-width:560px){.team-recipients{grid-template-columns:1fr}.recipient-toolbar{flex-wrap:wrap}}
</style>

<style scoped>
.team-guide{margin-top:16px;padding:16px;background:#f2f6fd;border:1px solid #dce5f0;border-radius:12px}.team-guide summary{cursor:pointer;font-weight:700}.team-guide li{margin:10px 0;line-height:1.6}.event-setup-backdrop{position:fixed;inset:0;z-index:1100;background:#152c5077;display:flex;justify-content:center;padding:20px}.event-setup-dialog{background:white;border-radius:14px;max-width:1100px;width:100%;overflow:auto;padding:20px;box-sizing:border-box}@media(max-width:600px){.event-setup-backdrop{padding:6px}.event-setup-dialog{padding:12px}}

.conversa-team{max-width:none;margin:0}.team-header{gap:8px}.team-header h2{font-size:20px}.team-header>img{width:32px;height:32px}.team-note{font-size:12px;line-height:1.4;margin:6px 0}.team-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:14px;margin-top:10px;align-items:start}.team-compose,.team-entry{border-radius:10px;padding:12px;margin:0 0 10px}.team-compose h3{font-size:15px;margin:0 0 8px}.team-grid{gap:10px}label{gap:4px;margin:8px 0;font-size:13px}input:not([type=checkbox]),select,textarea{padding:7px 9px;font-size:13px}button{padding:6px 9px;font-size:12px}.team-recipients{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 10px;max-height:190px;padding:8px;margin:8px 0}.team-recipients .team-check{margin:4px 0;font-size:12px}.team-recipients>p{grid-column:1/-1}.recipient-toolbar{display:flex;gap:6px;align-items:center}.recipient-toolbar input{flex:1;min-width:100px}.recipient-toolbar button{white-space:nowrap}.team-history .team-header{margin-bottom:10px}.team-history h3{font-size:15px}.team-entry p{font-size:13px;line-height:1.4;margin:6px 0}.team-actions{gap:5px}
@media(max-width:1000px){.team-layout{grid-template-columns:1fr}.team-history{border-top:1px solid #dce5f0;padding-top:12px}}
@media(max-width:560px){.team-recipients{grid-template-columns:1fr}.recipient-toolbar{flex-wrap:wrap}}
</style>
