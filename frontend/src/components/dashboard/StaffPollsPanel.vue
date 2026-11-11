<template>
  <details class="staff-polls" :class="{ 'needs-vote': pendingCount > 0, 'staff-polls--event': variant === 'event' }" :open="variant === 'event' || opened" @toggle="opened = $event.target.open">
    <summary class="poll-heading">
      <span class="poll-brand"><img :src="CONVERSA_LOGO_URL" alt="Conversa" width="132" height="35" /><span class="poll-heading-title">Team polls</span></span>
      <span class="poll-overview"><span class="poll-count" :class="{ 'poll-count--attention': pendingCount }">{{ headingStatus }}</span><span v-if="nextDeadline" class="poll-next-deadline">Next deadline · {{ moment(nextDeadline.closesAt, nextDeadline) }}</span></span>
      <span class="poll-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="poll-content">
      <p v-if="error" class="poll-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="poll-notice" role="status">{{ notice }}</p>
      <p v-if="loading && !polls.length" class="poll-empty">Loading team polls…</p>
      <template v-else>
        <div v-if="!pollId && polls.length" class="poll-tabs" role="group" aria-label="Poll list">
          <button type="button" :aria-pressed="!showHistory" @click="showHistory = false">Active <span>{{ activePolls.length }}</span></button>
          <button type="button" :aria-pressed="showHistory" @click="showHistory = true">Past polls <span>{{ pastPolls.length }}</span></button>
        </div>
        <p v-if="!visiblePolls.length" class="poll-empty">{{ pollId ? 'This poll is unavailable for your account.' : showHistory ? 'No past polls yet.' : 'No active team polls. New polls will appear here automatically.' }}</p>
        <article v-for="poll in visiblePolls" :key="poll.id" class="poll-card" :aria-labelledby="`${panelId}-title-${poll.id}`">
          <header :ref="el => trackPollHeader(el, poll)" class="poll-card-header"><div><span class="poll-eyebrow">{{ isClosed(poll) ? 'Past poll' : 'Team decision' }}</span><h3 :id="`${panelId}-title-${poll.id}`">{{ poll.title }}</h3></div><span class="poll-status" :class="{ 'poll-status--voted': poll.myResponse, 'poll-status--closed': isClosed(poll) }">{{ isClosed(poll) ? 'Closed' : poll.myResponse ? 'You voted' : poll.canVote === false ? 'Open' : 'Awaiting your vote' }}</span></header>
          <div v-if="poll.closesAt || poll.closedAt" class="poll-deadline" :class="{ 'poll-deadline--soon': dueSoon(poll) }"><span aria-hidden="true">◷</span><span>{{ isClosed(poll) ? 'Voting closed' : 'Vote by' }} <time :datetime="poll.closedAt || poll.closesAt">{{ moment(poll.closedAt || poll.closesAt, poll) }}</time><strong v-if="!isClosed(poll)"> · {{ remaining(poll) }}</strong></span></div>
          <p class="poll-question">{{ poll.question }}</p>
          <button v-if="variant === 'event'" class="poll-event-toggle" type="button" :aria-expanded="!!expandedPolls[poll.id]" :aria-controls="`${panelId}-body-${poll.id}`" @click="expandedPolls[poll.id] = !expandedPolls[poll.id]">{{ expandedPolls[poll.id] ? 'Hide poll' : isClosed(poll) ? 'View results' : poll.myResponse ? 'View your vote' : 'Vote now' }} <span aria-hidden="true">{{ expandedPolls[poll.id] ? '⌃' : '→' }}</span></button>
          <div v-show="variant !== 'event' || expandedPolls[poll.id]" :id="`${panelId}-body-${poll.id}`">
          <div v-if="poll.myResponse" class="poll-receipt">
            <span class="poll-receipt-check" aria-hidden="true">✓</span><div><span class="poll-eyebrow">Your vote</span><strong class="poll-answer">{{ answer(poll) }}</strong><span class="poll-vote-meta">{{ sourceLabel(poll.myResponse.source) }}<template v-if="poll.myResponse.receivedAt"> · {{ moment(poll.myResponse.receivedAt, poll) }}</template></span><p v-if="poll.myResponse.excluded" class="poll-review-note">The organizer excluded this response from the totals.</p><p v-else-if="poll.myResponse.bucketKey" class="poll-review-note">Counted as {{ optionLabel(poll, poll.myResponse.bucketKey) }} after organizer review.</p></div>
          </div>
          <button v-if="poll.myResponse && !isClosed(poll) && poll.canVote !== false && !changing[poll.id]" class="poll-text-button" type="button" :disabled="busy" @click="startChange(poll)">Change my vote</button>
          <form v-if="!isClosed(poll) && poll.canVote !== false && (!poll.myResponse || changing[poll.id])" class="poll-vote-form" @submit.prevent="vote(poll)">
            <fieldset :disabled="busy"><legend>{{ poll.myResponse ? 'Update your answer' : 'Choose your answer' }}</legend><label v-for="(option, index) in poll.options" :key="option.key" class="poll-option" :class="{ 'poll-option--selected': choices[poll.id] === option.key }"><input v-model="choices[poll.id]" type="radio" :name="`${panelId}-choice-${poll.id}`" :value="option.key" /><span class="poll-option-number" aria-hidden="true">{{ index + 1 }}</span><span>{{ option.label }}</span></label><label v-if="poll.allowOther" class="poll-option" :class="{ 'poll-option--selected': choices[poll.id] === '__other' }"><input v-model="choices[poll.id]" type="radio" :name="`${panelId}-choice-${poll.id}`" value="__other" /><span>Another answer</span></label><label v-if="choices[poll.id] === '__other'" class="poll-written">Your answer<textarea v-model="otherReplies[poll.id]" maxlength="2000" rows="2" required /></label></fieldset>
            <div class="poll-form-actions"><button class="poll-primary" type="submit" :disabled="busy || !selectedAnswer(poll).trim()">{{ busy === poll.id ? 'Saving…' : poll.myResponse ? 'Update vote' : 'Submit vote' }}</button><button v-if="changing[poll.id]" class="poll-secondary" type="button" :disabled="busy" @click="changing[poll.id] = false">Cancel</button><span>Your answer is saved when you submit.</span></div>
          </form>
          <section class="poll-results" :aria-label="`Results for ${poll.title}`">
            <template v-if="(poll.canManage || (poll.shareResults !== false && (isClosed(poll) || poll.resultsVisibility === 'live'))) && Array.isArray(poll.results)">
              <div class="poll-results-heading"><h4>{{ organizerOnlyResults(poll) ? 'Organizer totals' : isClosed(poll) ? 'Final results' : 'Live results' }}</h4><span>{{ voteTotal(poll) }} {{ voteTotal(poll) === 1 ? 'vote' : 'votes' }} counted</span></div>
              <ul class="poll-bars"><li v-for="result in poll.results" :key="result.key" :class="{ 'poll-bar--mine': isMine(poll, result.key) }"><div class="poll-bar-label"><span>{{ result.label }} <small v-if="isMine(poll, result.key)">Your vote</small></span><strong>{{ result.total }} <span>· {{ percent(poll, result.total) }}%</span></strong></div><div class="poll-bar-track" aria-hidden="true"><div class="poll-bar-fill" :style="{ width: `${percent(poll, result.total)}%` }" /></div></li></ul>
              <p v-if="!voteTotal(poll)" class="poll-hint">No counted votes yet.</p><p class="poll-hint">{{ organizerOnlyResults(poll) ? 'Only organizers can see these totals right now.' : isClosed(poll) ? 'Final totals shared by the organizer.' : 'Running totals shared by the organizer. Results can change until voting closes.' }}</p>
            </template>
            <p v-else class="poll-hint">{{ poll.shareResults === false ? 'The organizer has kept totals private. Your own vote is always visible here.' : 'The organizer will share totals after voting closes.' }}</p>
          </section>
          <div v-if="poll.linkedEvent && variant !== 'event'" class="poll-linked-event"><template v-if="poll.linkedEvent.available"><span class="poll-event-symbol" aria-hidden="true">▦</span><div><span class="poll-eyebrow">Linked event</span><strong>{{ poll.linkedEvent.title }}</strong><span>{{ moment(poll.linkedEvent.startsAt, poll.linkedEvent) }}</span></div><a :href="poll.linkedEvent.staffPageUrl || `/staff-events/${poll.linkedEvent.id}?agencyId=${poll.agencyId || agencyId}`">View event <span aria-hidden="true">↗</span></a></template><p v-else>Event details will appear here when available to you.</p></div>
          <div v-if="!isClosed(poll) && poll.shareResults !== false" class="poll-text-preference"><label><input type="checkbox" :checked="poll.resultsText" :disabled="busy" @change="setPreference(poll, $event)" /><span>Text me the final results</span></label><p class="poll-hint">Optional · Requires poll-text opt-in. Reply NOPOLLS to stop poll texts only.</p></div>
          <section v-if="poll.canManage" class="poll-owner-controls" aria-label="Poll owner controls">
            <span class="poll-eyebrow">Owner controls</span>
            <template v-if="!isClosed(poll)"><form @submit.prevent="scheduleClosing(poll)"><label>Close automatically<input type="datetime-local" :value="closingTimes[poll.id] ?? localInput(poll.closesAt)" :disabled="busy" required @input="closingTimes[poll.id] = $event.target.value" /></label><span class="poll-hint">Your local time. You can change the schedule while voting is open.</span><button class="poll-secondary" type="submit" :disabled="busy">{{ poll.scheduledClosing ? 'Update closing time' : 'Schedule closing' }}</button></form><button class="poll-close-now" type="button" :disabled="busy" @click="closeNow(poll)">Close poll now</button></template>
            <p v-else class="poll-hint">Voting is closed. Saved responses and results remain available.</p>
          </section>
          </div>
        </article>
      </template>
      <footer class="poll-footer"><span>Updates automatically</span><button class="poll-text-button" type="button" :disabled="busy || loading" @click="load()">{{ loading ? 'Refreshing…' : 'Refresh polls' }}</button></footer>
    </div>
  </details>
</template>
<script setup>
import { CONVERSA_LOGO_URL } from '../../constants/conversa';
import { ref, watch, computed, onMounted, onBeforeUnmount, getCurrentInstance, nextTick } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number, String], default: null }, pollId: { type: [Number, String], default: null }, linkedEventId: { type: [Number, String], default: null }, variant: { type: String, default: 'dashboard' } });
const panelId = `staff-polls-${getCurrentInstance().uid}`;
const polls = ref([]), opened = ref(!!props.pollId), loading = ref(false), busy = ref(null), error = ref(''), notice = ref('');
const showHistory = ref(false), choices = ref({}), otherReplies = ref({}), changing = ref({}), now = ref(Date.now());
const closingTimes = ref({}), expandedPolls = ref({});
let context = 0, request = 0, pendingRequest = 0, timer, viewObserver;
const pollHeaders = new Map(), viewedRecently = new Map();
function trackPollHeader(element, poll) {
  const prior = pollHeaders.get(poll.id);
  if (prior?.element === element) return;
  if (prior) viewObserver?.unobserve(prior.element);
  if (element) { pollHeaders.set(poll.id, { element, poll }); viewObserver?.observe(element); }
  else pollHeaders.delete(poll.id);
}
function recordVisiblePolls() {
  if (!opened.value || document.visibilityState === 'hidden') return;
  for (const [id, { element, poll }] of pollHeaders) {
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight || Date.now() - (viewedRecently.get(id) || 0) < 60000) continue;
    const scope = context; viewedRecently.set(id, Date.now());
    api.post(`/me/staff-polls/${id}/viewed`, {}, { params: params(poll), skipGlobalLoading: true }).catch(() => { if (scope === context) viewedRecently.delete(id); });
  }
}
watch(opened, async () => { await nextTick(); recordVisiblePolls(); });
const isClosed = poll => !!poll.closedAt || (!!poll.closesAt && new Date(poll.closesAt).getTime() <= now.value);
const relevantPolls = computed(() => props.pollId ? polls.value.filter(p => Number(p.id) === Number(props.pollId)) : polls.value);
const activePolls = computed(() => relevantPolls.value.filter(p => !isClosed(p)));
const pastPolls = computed(() => relevantPolls.value.filter(isClosed));
const pendingCount = computed(() => activePolls.value.filter(p => !p.myResponse && p.canVote !== false).length);
const headingStatus = computed(() => loading.value && !polls.value.length ? 'Checking polls…' : error.value && !polls.value.length ? 'Polls unavailable' : pendingCount.value ? `${pendingCount.value} need${pendingCount.value === 1 ? 's' : ''} your vote` : activePolls.value.length ? `${activePolls.value.length} open` : 'All caught up');
const deadlineOrder = (a, b) => (new Date(a.closesAt).getTime() || Infinity) - (new Date(b.closesAt).getTime() || Infinity);
const nextDeadline = computed(() => [...activePolls.value].filter(p => p.closesAt).sort(deadlineOrder)[0]);
const visiblePolls = computed(() => props.pollId ? polls.value.filter(p => Number(p.id) === Number(props.pollId)) : [...(showHistory.value ? pastPolls.value : activePolls.value)].sort(showHistory.value ? (a, b) => -deadlineOrder(a, b) : deadlineOrder));
const params = poll => ({ agencyId: poll?.agencyId || props.agencyId || undefined });
const moment = (value, poll) => { if (!value || !Number.isFinite(new Date(value).getTime())) return 'Date to be confirmed'; try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: poll.timezone || undefined }).format(new Date(value)); } catch { return new Date(value).toLocaleString(); } };
const dueSoon = poll => !isClosed(poll) && new Date(poll.closesAt).getTime() - now.value <= 86400000;
function remaining(poll) { const minutes = Math.max(1, Math.ceil((new Date(poll.closesAt).getTime() - now.value) / 60000)); return minutes < 60 ? `${minutes}m left` : minutes < 1440 ? `${Math.ceil(minutes / 60)}h left` : `${Math.ceil(minutes / 1440)} days left`; }
const optionLabel = (poll, key) => poll.options.find(o => o.key === key)?.label || key;
const answer = poll => poll.myResponse.label || optionLabel(poll, poll.myResponse.key || poll.myResponse.original) || poll.myResponse.original;
const sourceLabel = source => ({ sms: 'Voted by text', in_app: 'Voted in the app', email: 'Voted from email', public_link: 'Voted from a link' }[source] || 'Vote recorded');
const voteTotal = poll => (poll.results || []).reduce((total, r) => total + Number(r.total || 0), 0);
const percent = (poll, count) => voteTotal(poll) ? Math.round(100 * Number(count || 0) / voteTotal(poll)) : 0;
const isMine = (poll, key) => poll.myResponse && !poll.myResponse.excluded && (poll.myResponse.bucketKey || poll.myResponse.key || poll.myResponse.original) === key;
const organizerOnlyResults = poll => poll.canManage && (poll.shareResults === false || (!isClosed(poll) && poll.resultsVisibility !== 'live'));
function localInput(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; }
const selectedAnswer = poll => choices.value[poll.id] === '__other' ? String(otherReplies.value[poll.id] || '').trim() : String(choices.value[poll.id] || '');
function startChange(poll) { changing.value[poll.id] = true; const key = poll.myResponse.key || poll.myResponse.original; choices.value[poll.id] = poll.options.some(o => o.key === key) ? key : poll.allowOther ? '__other' : ''; otherReplies.value[poll.id] = poll.myResponse.original; }
async function load(quiet = false) {
  const id = ++request, scope = context; pendingRequest = id; if (!quiet) loading.value = true;
  try {
    const { data } = await api.get('/me/staff-polls', { params: params(), skipGlobalLoading: true });
    if (scope !== context || id !== request) return;
    const previous = new Set(activePolls.value.map(p => p.id));
    polls.value = (Array.isArray(data) ? data : []).filter(p => !props.linkedEventId || Number(p.linkedEventId || p.linkedEvent?.id) === Number(props.linkedEventId)); now.value = Date.now(); error.value = '';
    if (props.pollId || activePolls.value.some(p => !previous.has(p.id))) opened.value = true;
    await nextTick(); if (scope === context) recordVisiblePolls();
  } catch (e) { if (scope === context && id === request) { error.value = e.response?.data?.error?.message || 'Unable to load staff polls.'; if (!polls.value.length) opened.value = true; } }
  finally { if (scope === context && id === request) loading.value = false; if (id === pendingRequest) pendingRequest = 0; }
}
async function vote(poll) {
  const key = selectedAnswer(poll); if (!key || busy.value || isClosed(poll)) return;
  const scope = context; busy.value = poll.id; error.value = ''; notice.value = '';
  try {
    await api.post(`/me/company-events/${poll.id}/respond`, { responseKey: key, agencyId: poll.agencyId || props.agencyId }, { params: params(poll) });
    if (scope !== context) return;
    changing.value[poll.id] = false; notice.value = `Your vote for “${poll.title}” was saved: ${optionLabel(poll, key)}.`; await load(true);
  } catch (e) { if (scope === context) error.value = e.response?.data?.error?.message || 'Unable to record your vote.'; }
  finally { if (scope === context) busy.value = null; }
}
async function setPreference(poll, event) {
  const value = event.target.checked, scope = context; busy.value = poll.id; error.value = '';
  try { const { data } = await api.put(`/me/staff-polls/${poll.id}/results-preference`, { resultsText: value }, { params: params(poll) }); if (scope === context) poll.resultsText = data.resultsText; }
  catch (e) { if (scope === context) { event.target.checked = poll.resultsText; error.value = e.response?.data?.error?.message || 'Unable to save your preference.'; } }
  finally { if (scope === context) busy.value = null; }
}
function refresh() { now.value = Date.now(); if (!busy.value && !pendingRequest && document.visibilityState !== 'hidden') load(true); }
async function scheduleClosing(poll) {
  const value = closingTimes.value[poll.id] ?? localInput(poll.closesAt), date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { error.value = 'Choose a future closing date and time.'; return; }
  const scope = context; busy.value = poll.id; error.value = '';
  try { await api.put(`/me/staff-polls/${poll.id}/closing`, { closesAt: date.toISOString() }, { params: params(poll) }); if (scope === context) { delete closingTimes.value[poll.id]; notice.value = `Closing time saved for “${poll.title}”.`; await load(true); } }
  catch (e) { if (scope === context) error.value = e.response?.data?.error?.message || 'Unable to schedule closing.'; }
  finally { if (scope === context) busy.value = null; }
}
async function closeNow(poll) {
  if (!window.confirm(`Close “${poll.title}” now? Responses can no longer be changed. Requested final-results texts will be sent.`)) return;
  const scope = context; busy.value = poll.id; error.value = '';
  try { await api.post(`/me/staff-polls/${poll.id}/close`, {}, { params: params(poll) }); if (scope === context) { notice.value = `“${poll.title}” is closed.`; showHistory.value = true; await load(true); } }
  catch (e) { if (scope === context) error.value = e.response?.data?.error?.message || 'Unable to close the poll.'; }
  finally { if (scope === context) busy.value = null; }
}
watch(() => [props.agencyId, props.pollId, props.linkedEventId], () => { context++; request++; viewedRecently.clear(); pollHeaders.clear(); polls.value = []; opened.value = !!props.pollId; showHistory.value = false; choices.value = {}; closingTimes.value = {}; changing.value = {}; otherReplies.value = {}; busy.value = null; notice.value = ''; error.value = ''; load(); }, { immediate: true });
onMounted(() => { if (typeof IntersectionObserver !== 'undefined') { viewObserver = new IntersectionObserver(recordVisiblePolls, { threshold: 0.5 }); for (const { element } of pollHeaders.values()) viewObserver.observe(element); } timer = setInterval(refresh, 30000); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh); });
onBeforeUnmount(() => { context++; request++; clearInterval(timer); viewObserver?.disconnect(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); });
</script>
<style scoped>
.staff-polls{--poll-ink:#152c50;--poll-muted:#53647c;--poll-blue:#245ccb;margin-top:18px;border:1px solid #dce5f2;border-radius:16px;background:#f7f9fe;color:var(--poll-ink);font-size:14px;line-height:1.5;overflow:hidden}.staff-polls *{box-sizing:border-box}.poll-heading{display:flex;align-items:center;gap:12px;padding:18px;cursor:pointer;list-style:none;background:#fff}.poll-heading::-webkit-details-marker{display:none}.poll-brand{display:grid;gap:6px;flex-shrink:0}.poll-brand img{object-fit:contain;object-position:left}.poll-heading-title{font-size:18px;font-weight:750;letter-spacing:-.02em;color:var(--poll-ink)}.poll-overview{display:grid;justify-items:end;gap:6px;margin-left:auto;text-align:right}.poll-count,.poll-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;background:#edf2fa;color:#455873}.poll-count--attention{background:#eaf0ff;color:#214fa9}.needs-vote .poll-count--attention{animation:poll-breathe 3s ease-in-out infinite}.poll-next-deadline{font-size:11px;color:var(--poll-muted);max-width:220px}.poll-chevron{font-size:20px;color:#53647c;transition:transform .2s}.staff-polls[open] .poll-chevron{transform:rotate(180deg)}.poll-content{padding:0 16px 8px;border-top:1px solid #e3e9f4}.poll-tabs{display:flex;gap:8px;padding:16px 0}.poll-tabs button{border:1px solid transparent;border-radius:8px;background:transparent;color:var(--poll-muted);padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}.poll-tabs button[aria-pressed=true]{background:#fff;border-color:#cddaf0;color:var(--poll-blue);box-shadow:0 1px 3px #183b6e0a}.poll-tabs span{margin-left:5px;font-size:12px}.poll-card{border:1px solid #dce5f2;background:#fff;border-radius:12px;padding:20px;margin:0 0 14px;color:var(--poll-ink)}.poll-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.poll-eyebrow{display:block;text-transform:uppercase;font-size:10px;font-weight:750;letter-spacing:.09em;color:var(--poll-muted);margin-bottom:4px}.poll-card h3{font-size:17px;line-height:1.35;margin:0;color:var(--poll-ink);font-weight:750;overflow-wrap:anywhere}.poll-status{white-space:nowrap;font-size:10px;background:#fff3db;color:#8b570c}.poll-status--voted{background:#e5f4ed;color:#176447}.poll-status--closed{background:#edf1f7;color:#53647c}.poll-deadline{display:flex;gap:7px;margin-top:12px;font-size:11px;color:var(--poll-muted)}.poll-deadline--soon{color:#935907}.poll-question{font-size:15px;line-height:1.6;color:#293e5f;margin:16px 0}.poll-vote-form fieldset{padding:0;margin:0;border:0;min-width:0}.poll-vote-form legend{font-size:12px;font-weight:650;margin-bottom:10px;color:var(--poll-muted)}.poll-option{display:flex;align-items:center;gap:10px;border:1px solid #dae3f0;border-radius:9px;padding:12px;margin-bottom:8px;cursor:pointer;line-height:1.45;font-weight:500;background:#fff;color:#263c60}.poll-option:hover{border-color:#98b2e3;background:#f8faff}.poll-option--selected{border-color:#4575d3;background:#eef3ff;box-shadow:0 0 0 1px #4575d3}.poll-option input,.poll-text-preference input{accent-color:var(--poll-blue);width:16px;height:16px;flex-shrink:0;margin:0}.poll-option-number{color:#718199;font-size:11px;font-weight:700}.poll-form-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px}.poll-form-actions>span{font-size:11px;color:var(--poll-muted)}.poll-primary,.poll-secondary{padding:9px 16px;border:1px solid var(--poll-blue);border-radius:8px;background:var(--poll-blue);color:#fff;font:inherit;font-weight:650;cursor:pointer}.poll-secondary{background:white;color:var(--poll-blue)}.poll-written{display:grid;gap:6px;font-size:12px;margin-top:10px}.poll-written textarea{resize:vertical;padding:10px;border:1px solid #adbed8;border-radius:8px;font:inherit;color:var(--poll-ink);background:#fff;width:100%}.poll-receipt{display:flex;gap:12px;padding:14px;background:#edf7f3;border:1px solid #cde8db;border-radius:10px}.poll-receipt-check{display:grid;place-items:center;flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#d0eadc;color:#126244;font-weight:750}.poll-receipt .poll-eyebrow{color:#22654f}.poll-answer{display:block;font-size:15px;line-height:1.5;color:#174b3b;overflow-wrap:anywhere}.poll-vote-meta{display:block;font-size:11px;color:#496b60;margin-top:4px}.poll-review-note{font-size:12px;color:#57657a;margin:8px 0 0}.poll-text-button{background:none;border:0;padding:9px 0;font:inherit;font-size:12px;font-weight:650;color:var(--poll-blue);cursor:pointer}.poll-results{border-top:1px solid #e9edf5;margin-top:18px;padding-top:14px}.poll-results-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.poll-results h4{font-size:13px;color:var(--poll-ink);margin:0}.poll-results-heading>span{font-size:11px;color:var(--poll-muted)}.poll-bars{padding:0;margin:14px 0;list-style:none;display:grid;gap:14px}.poll-bar-label{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12px;line-height:1.45;margin-bottom:6px}.poll-bar-label>span{overflow-wrap:anywhere}.poll-bar-label>strong{white-space:nowrap;font-size:12px}.poll-bar-label>strong>span{color:var(--poll-muted);font-weight:400}.poll-bar-label small{display:inline-block;margin-left:5px;color:#176447;font-size:9px;font-weight:750;background:#e5f4ed;border-radius:4px;padding:2px 5px}.poll-bar-track{background:#edf1f8;border-radius:5px;height:9px;overflow:hidden}.poll-bar-fill{height:100%;background:#7396db;border-radius:5px;transition:width .35s ease}.poll-bar--mine .poll-bar-fill{background:#218364}.poll-hint{font-size:11px;line-height:1.6;color:var(--poll-muted);margin:7px 0}.poll-linked-event{display:flex;gap:10px;align-items:center;background:#f3f5fc;border-radius:9px;margin-top:16px;padding:12px}.poll-linked-event>div{min-width:0;flex:1}.poll-linked-event strong,.poll-linked-event>div>span:last-child{display:block}.poll-linked-event strong{font-size:12px;overflow-wrap:anywhere}.poll-linked-event>div>span:last-child{font-size:11px;color:var(--poll-muted);margin-top:3px}.poll-event-symbol{font-size:23px;color:#697fb1}.poll-linked-event a{font-size:12px;font-weight:650;white-space:nowrap;color:var(--poll-blue);text-decoration:none}.poll-linked-event>p{font-size:12px;color:var(--poll-muted);margin:0}.poll-text-preference{border-top:1px solid #e9edf5;margin-top:16px;padding-top:14px}.poll-text-preference label{display:flex;align-items:center;gap:9px;font-size:12px;color:#344a6a;font-weight:550}.poll-footer{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--poll-muted)}.poll-empty{color:var(--poll-muted);padding:10px 0;font-size:13px}.poll-error,.poll-notice{border-radius:8px;padding:12px;font-size:13px;margin:14px 0}.poll-error{color:#a11d32;background:#fff0f2}.poll-notice{color:#165c42;background:#e8f5ed}.staff-polls button:disabled{opacity:.55;cursor:default}.staff-polls :is(button,a,input,textarea,summary):focus-visible{outline:3px solid #83b5ff;outline-offset:3px}@keyframes poll-breathe{0%,100%{box-shadow:0 0 0 0 #376de226}50%{box-shadow:0 0 0 5px #376de200}}@media(prefers-reduced-motion:reduce){.needs-vote .poll-count--attention{animation:none}.poll-chevron,.poll-bar-fill{transition:none}}@media(max-width:540px){.poll-heading{padding:14px;gap:8px;flex-wrap:wrap}.poll-brand img{width:112px;height:29px}.poll-heading-title{font-size:17px}.poll-next-deadline{max-width:150px;font-size:10px}.poll-count{font-size:10px;padding:4px 8px}.poll-content{padding:0 10px 6px}.poll-card{padding:14px}.poll-card-header{flex-wrap:wrap}.poll-card h3{font-size:16px}.poll-question{font-size:14px}.poll-linked-event{flex-wrap:wrap}.poll-linked-event a{margin-left:auto}.poll-form-actions>span{width:100%}.poll-option{font-size:13px}}
</style>
<style scoped>
.poll-owner-controls{border-top:1px solid #e0e7f1;padding-top:16px;margin-top:16px}.poll-owner-controls form{display:grid;gap:8px}.poll-owner-controls label{display:grid;gap:6px;font-size:12px;font-weight:600;color:#344a6a}.poll-owner-controls input{width:100%;min-width:0;padding:9px;border:1px solid #b8c8df;border-radius:7px;background:#fff;color:#152c50;font:inherit}.poll-owner-controls .poll-secondary{justify-self:start;font-size:12px}.poll-close-now{margin-top:14px;padding:8px 12px;border:1px solid #e5bec5;border-radius:7px;background:#fff;color:#a02b3e;font:inherit;font-size:12px;font-weight:650;cursor:pointer}
</style>

<style scoped>
.staff-polls--event{border:0;border-radius:0;box-shadow:none;background:transparent}.staff-polls--event>.poll-heading{display:none}.staff-polls--event .poll-content{border:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.staff-polls--event .poll-content>:not(.poll-card){grid-column:1/-1}.staff-polls--event .poll-tabs{padding:0}.staff-polls--event .poll-card{margin:0;background:linear-gradient(120deg,#fff,#fbfcff);padding:19px;border-color:#e0e6f0}.staff-polls--event .poll-card h3{font-size:14px}.staff-polls--event .poll-question{font-size:13px;margin:14px 0}.staff-polls--event .poll-status{font-size:9px;white-space:normal}.staff-polls--event .poll-card-header{gap:12px}.staff-polls--event .poll-event-toggle{display:flex;gap:12px;align-items:center;justify-content:center;margin:12px 0 0 auto;padding:9px 14px;font:inherit;font-size:12px;font-weight:650;border:0;border-radius:9px;background:#ecf5ef;color:#1a5a47;cursor:pointer}.staff-polls--event .poll-event-toggle+div{margin-top:18px}.staff-polls--event .poll-primary{background:#1e5a4c;border-color:#1e5a4c}.staff-polls--event .poll-footer{margin-top:0}.staff-polls--event .poll-option{font-size:12px}.staff-polls--event .poll-deadline{font-size:10px;flex-wrap:wrap}.staff-polls--event .poll-empty{margin:0;padding:5px 0 10px}@media(max-width:760px){.staff-polls--event .poll-content{grid-template-columns:minmax(0,1fr)}.staff-polls--event .poll-card{padding:17px}}
</style>
